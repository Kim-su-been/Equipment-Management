import test from "node:test";
import assert from "node:assert/strict";
import { seed } from "../src/data.js";
import { normalizeLegacyState } from "../src/migration.js";
import {
  completionMetrics,
  personCompletion,
} from "../src/completion-metrics.js";
import { recordDraftCompletion, validDrafting } from "../src/drafting.js";
import { DRAFT_TASK_IDS } from "../src/work-procedures.js";
import { statePatch } from "../src/state-patch.js";
import { applyStatePatch } from "../src/state-permissions.js";

function fixture() {
  const data = normalizeLegacyState(seed()),
    person = data.people[0];
  person.registrationStatus = "registered";
  return { data, person };
}
test("completion cards count people, not completed tasks, deduplicate IDs and expose an empty denominator", () => {
  const { data, person } = fixture(),
    other = data.people[1];
  other.drafting = {};
  other.tasks.O09 = "ready";
  other.tasks.O11 = "review";
  const counts = completionMetrics([person, other, person], data);
  for (const metric of counts) {
    assert.equal(metric.total, 2);
    assert.equal(metric.completed, 1, metric.id);
    assert.equal(metric.percent, 50, metric.id);
  }
  assert.ok(
    completionMetrics([], data).every(
      (m) => m.total === 0 && m.percent === null,
    ),
  );
  person.registrationStatus = "pending_registration";
  assert.ok(completionMetrics([person], data).every((m) => m.completed === 0));
});
test("all six explicit drafting records are required independently of account processing; final confirmation remains separate", () => {
  const { data, person } = fixture();
  assert.equal(DRAFT_TASK_IDS.length, 6);
  assert.equal(personCompletion(person, data, "overall"), true);
  delete person.drafting["P-DBUSER"];
  assert.equal(personCompletion(person, data, "drafting"), false);
  assert.equal(personCompletion(person, data, "overall"), false);
  assert.equal(person.tasks["P-DBUSER"], "done");
  recordDraftCompletion(data, "PMO", {
    taskId: "P-DBUSER",
    personIds: [person.id],
    done: true,
  });
  assert.equal(personCompletion(person, data, "drafting"), true);
  person.tasks.O16 = "ready";
  assert.equal(personCompletion(person, data, "overall"), false);
});
test("course evidence review is separate from course completion, corrections invalidate it; entry documents exclude withdrawal", () => {
  const { data, person } = fixture();
  person.certChecks.O08 = "review";
  assert.equal(personCompletion(person, data, "education"), true);
  person.certChecks.O08 = "fix";
  assert.equal(personCompletion(person, data, "education"), false);
  person.certChecks.O08 = "done";
  for (const id of ["P-NDA", "P-DESTROY", "P-WITHDRAW"])
    person.tasks[id] = "ready";
  assert.equal(personCompletion(person, data, "documents"), true);
  person.tasks.O10 = "review";
  assert.equal(personCompletion(person, data, "documents"), false);
});
test("manual recording is idempotent, reversible and does not mutate account tasks", () => {
  const { data, person } = fixture(),
    tasks = structuredClone(person.tasks);
  person.drafting = {};
  const selection = {
    taskId: "O02",
    personIds: [person.id, person.id],
    done: true,
  };
  assert.equal(recordDraftCompletion(data, "SFA", selection), 1);
  assert.ok(validDrafting(person.drafting));
  const snapshot = structuredClone(data);
  assert.equal(recordDraftCompletion(data, "SFA", selection), 0);
  assert.deepEqual(data, snapshot);
  assert.equal(
    recordDraftCompletion(data, "SFA", { ...selection, done: false }),
    1,
  );
  assert.deepEqual(person.tasks, tasks);
  assert.throws(() => recordDraftCompletion(data, "그룹웨어", selection));
  assert.throws(() =>
    recordDraftCompletion(data, "PMO", { ...selection, taskId: "O08" }),
  );
  person.registrationStatus = "pending_registration";
  assert.throws(
    () => recordDraftCompletion(data, "PMO", selection),
    /본인 등록/,
  );
});
test("shared persistence enforces member/project permissions and validates drafting records before saving", () => {
  const { data, person } = fixture();
  const next = structuredClone(data);
  recordDraftCompletion(next, "PMO", {
    taskId: "O02",
    personIds: [person.id],
    done: false,
  });
  const ops = statePatch(data, next);
  let saved;
  const store = {
    load: () => structuredClone(data),
    save: (v) => (saved = v),
    audit: () => {},
  };
  assert.throws(
    () =>
      applyStatePatch(
        store,
        { kind: "member", personId: person.id, scope: "SFA" },
        ops,
      ),
    (e) => e.status === 403,
  );
  assert.throws(
    () => applyStatePatch(store, { kind: "admin", scope: "그룹웨어" }, ops),
    (e) => e.status === 403,
  );
  applyStatePatch(store, { kind: "admin", scope: "SFA" }, ops);
  assert.equal(
    saved.people.find((p) => p.id === person.id).drafting.O02.done,
    false,
  );
  const invalid = structuredClone(next);
  invalid.people[0].drafting.O02.done = "yes";
  assert.throws(
    () =>
      applyStatePatch(
        store,
        { kind: "admin", scope: "PMO" },
        statePatch(data, invalid),
      ),
    (e) => e.status === 400,
  );
});
