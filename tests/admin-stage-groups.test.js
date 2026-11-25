import test from "node:test";
import assert from "node:assert/strict";
import { seed, requiredTasks } from "../src/data.js";
import { normalizeLegacyState } from "../src/migration.js";
import { adminStageGroups } from "../src/admin-stage-groups.js";
import { DRAFT_TASK_IDS } from "../src/work-procedures.js";

function fixture() {
  const data = normalizeLegacyState(seed());
  const person = data.people[0];
  Object.assign(person, {
    registrationStatus: "registered",
    selfRegistered: true,
    tasks: { O01: "done" },
    files: {},
    certChecks: {},
    drafting: {},
    lifecycle: "투입 예정",
  });
  return { data, person };
}
const phase = (groups, id) => groups.find((g) => g.id === id);
const step = (groups, id) =>
  groups.flatMap((g) => g.steps).find((s) => s.id === id);

test("procedure phases deduplicate people while parallel subtasks retain their own targets", () => {
  const { data, person } = fixture(),
    before = structuredClone(data);
  const groups = adminStageGroups([person, person], data, "PMO", "2026-11-23");
  assert.deepEqual(
    groups.map((g) => g.id),
    ["entry", "execution", "exit"],
  );
  assert.equal(phase(groups, "entry").people.length, 1);
  assert.equal(step(groups, "O02").people.length, 1);
  assert.equal(step(groups, "P-DBUSER").people.length, 1);
  assert.equal(step(groups, "O08").people[0].identity.name, person.name);
  assert.equal(phase(groups, "exit").people.length, 0);
  assert.deepEqual(data, before);
});
test("registration, separate draft records and final confirmation gate entry completion", () => {
  const { data, person } = fixture();
  person.registrationStatus = "pending_registration";
  let groups = adminStageGroups([person], data);
  assert.equal(step(groups, "O01").people.length, 1);
  assert.equal(phase(groups, "entry").completed, 0);
  person.registrationStatus = "registered";
  for (const task of requiredTasks(person, data.customTasks))
    person.tasks[task.id] = "done";
  person.tasks.O16 = "done";
  groups = adminStageGroups([person], data);
  assert.equal(phase(groups, "entry").completed, 0);
  assert.equal(step(groups, "O02").people[0].draftPending, true);
  for (const id of DRAFT_TASK_IDS) person.drafting[id] = { done: true };
  person.tasks.O16 = "ready";
  assert.equal(phase(adminStageGroups([person], data), "entry").completed, 0);
  person.tasks.O16 = "done";
  groups = adminStageGroups([person], data);
  assert.equal(phase(groups, "entry").percent, 100);
  assert.equal(step(groups, "O02").people.length, 0);
});
test("document review and correction stay under the same entry procedure step", () => {
  const { data, person } = fixture();
  person.tasks.O08 = "done";
  person.tasks.O10 = "review";
  let groups = adminStageGroups([person], data);
  assert.equal(step(groups, "O10").people[0].next.status, "review");
  person.tasks.O10 = "fix";
  groups = adminStageGroups([person], data);
  assert.equal(step(groups, "O10").people[0].needsFix, true);
  assert.equal(phase(groups, "entry").completed, 0);
});
test("project scope and explicit withdrawal targeting preserve lifecycle and isolate foreign people", () => {
  const { data, person } = fixture();
  const foreign = data.people.find((p) => p.project !== person.project);
  person.lifecycle = "투입 중";
  person.end = "2026-11-25";
  person.onboardingHold = { active: true };
  const before = structuredClone(person);
  const groups = adminStageGroups(
    [person, foreign],
    data,
    person.project,
    "2026-11-23",
  );
  assert.ok(
    groups.flatMap((g) => g.people).every((e) => e.person.id === person.id),
  );
  assert.equal(phase(groups, "entry").people[0].held, true);
  assert.equal(phase(groups, "exit").people.length, 1);
  assert.equal(step(groups, "P-WITHDRAW").people.length, 1);
  assert.deepEqual(person, before);
  person.end = "2026-12-31";
  assert.equal(
    phase(adminStageGroups([person], data, "PMO", "2026-11-23"), "exit").people
      .length,
    0,
  );
  person.lifecycle = "철수 예정";
  assert.equal(
    phase(adminStageGroups([person], data, "PMO", "2026-11-23"), "exit").people
      .length,
    1,
  );
});
