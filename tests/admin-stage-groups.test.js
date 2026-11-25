import test from "node:test";
import assert from "node:assert/strict";
import { seed, requiredTasks } from "../src/data.js";
import { normalizeLegacyState } from "../src/migration.js";
import { adminStageGroups } from "../src/admin-stage-groups.js";

function fixture() {
  const data = normalizeLegacyState(seed());
  const person = data.people[0];
  person.registrationStatus = "registered";
  person.selfRegistered = true;
  person.tasks = { O01: "done" };
  person.files = {};
  person.certChecks = {};
  return { data, person };
}
const group = (groups, id) => groups.find((g) => g.id === id).people;

test("parallel account and submission work is grouped by stage without creating future review targets", () => {
  const { data, person } = fixture();
  const before = structuredClone(data);
  const groups = adminStageGroups([person, person], data);
  assert.equal(group(groups, "accounts").length, 1);
  assert.equal(group(groups, "submission").length, 1);
  assert.equal(group(groups, "review").length, 0);
  assert.equal(group(groups, "final").length, 0);
  assert.equal(group(groups, "accounts")[0].next.owner, "admin");
  assert.equal(group(groups, "accounts")[0].identity.name, person.name);
  assert.deepEqual(data, before);
});
test("registration wait and final confirmation each remain in the appropriate stage", () => {
  const { data, person } = fixture();
  person.registrationStatus = "pending_registration";
  let groups = adminStageGroups([person], data);
  assert.equal(group(groups, "registration").length, 1);
  assert.equal(
    groups.reduce((sum, g) => sum + g.people.length, 0),
    1,
  );
  person.registrationStatus = "registered";
  for (const task of requiredTasks(person, data.customTasks))
    person.tasks[task.id] = "done";
  groups = adminStageGroups([person], data);
  assert.equal(group(groups, "final")[0].final, false);
  assert.equal(group(groups, "final")[0].next.task.id, "O16");
  person.tasks.O16 = "done";
  groups = adminStageGroups([person], data);
  assert.equal(group(groups, "final")[0].final, true);
  assert.equal(
    groups.reduce((sum, g) => sum + g.people.length, 0),
    1,
  );
});
test("review targets disappear on correction and return to the submission group", () => {
  const { data, person } = fixture();
  for (const task of requiredTasks(person, data.customTasks))
    person.tasks[task.id] = "done";
  person.tasks.O16 = "done";
  person.tasks.O10 = "review";
  let groups = adminStageGroups([person], data);
  assert.equal(group(groups, "review").length, 1);
  assert.equal(group(groups, "review")[0].next.task.id, "O10");
  assert.equal(group(groups, "submission").length, 0);
  person.tasks.O10 = "fix";
  groups = adminStageGroups([person], data);
  assert.equal(group(groups, "review").length, 0);
  assert.equal(group(groups, "submission")[0].needsFix, true);
  assert.equal(group(groups, "final").length, 0);
});
test("project scope never includes another project's people and held work is not duplicated", () => {
  const { data, person } = fixture();
  const foreign = data.people.find((p) => p.project !== person.project);
  let groups = adminStageGroups([person, foreign], data, person.project);
  assert.ok(
    groups
      .flatMap((g) => g.people)
      .every((entry) => entry.person.project === person.project),
  );
  person.onboardingHold = { active: true };
  groups = adminStageGroups([person], data);
  const entries = groups.flatMap((g) => g.people);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].held, true);
  assert.equal(entries[0].final, false);
});
