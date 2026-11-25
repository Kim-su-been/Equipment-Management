import test from "node:test";
import assert from "node:assert/strict";
import { seed, requiredTasks } from "../src/data.js";
import { normalizeLegacyState } from "../src/migration.js";
import { memberRoadmap } from "../src/member-roadmap.js";

function fixture() {
  const data = normalizeLegacyState(seed());
  const person = data.people[0];
  person.registrationStatus = "registered";
  person.selfRegistered = true;
  person.certChecks = {};
  person.files = {};
  person.tasks = { O01: "done" };
  return { data, person };
}
test("pending registration does not unlock tasks even when legacy task values exist", () => {
  const { data, person } = fixture();
  person.registrationStatus = "pending_registration";
  person.tasks.O06 = "done";
  const roadmap = memberRoadmap(person, data);
  assert.equal(roadmap.current.id, "registration");
  assert.equal(roadmap.stages[0].done, false);
  assert.equal(roadmap.mine.length, 0);
  assert.equal(roadmap.final, false);
});
test("parallel document and education work is current while host accounts remain incomplete", () => {
  const { data, person } = fixture();
  const before = structuredClone(data);
  const roadmap = memberRoadmap(person, data);
  assert.equal(roadmap.stages[0].done, true);
  assert.equal(roadmap.stages[1].done, false);
  assert.equal(roadmap.current.id, "submission");
  assert.ok(roadmap.mine.some((r) => r.task.id === "O11"));
  assert.ok(
    roadmap.waiting.some(
      (r) => r.task.id === "O10" && r.blockedBy.includes("O08"),
    ),
  );
  assert.ok(roadmap.waiting.some((r) => r.task.id === "O06"));
  assert.deepEqual(data, before);
});
test("submitted evidence completes submission but still waits for host review", () => {
  const { data, person } = fixture();
  for (const id of ["O02", "O03", "O04", "O05", "O06"])
    person.tasks[id] = "done";
  for (const id of ["O08", "O09", "O10", "O11"]) person.tasks[id] = "review";
  person.certChecks = { O08: "review", O09: "review" };
  const roadmap = memberRoadmap(person, data);
  assert.equal(roadmap.current.id, "review");
  assert.equal(roadmap.stages[2].done, true);
  assert.equal(roadmap.stages[2].completed, 4);
  assert.equal(roadmap.stages[3].done, false);
  assert.equal(roadmap.stages[3].completed, 0);
  assert.equal(roadmap.reviewing.length, 4);
  assert.equal(roadmap.mine.length, 0);
});
test("100% still needs final confirmation; certificate correction returns to submission", () => {
  const { data, person } = fixture();
  for (const t of requiredTasks(person, data.customTasks))
    person.tasks[t.id] = "done";
  person.certChecks = { O08: "done", O09: "done" };
  let roadmap = memberRoadmap(person, data);
  assert.equal(roadmap.progress, 100);
  assert.equal(roadmap.current.id, "final");
  assert.equal(roadmap.final, false);
  person.tasks.O16 = "done";
  assert.equal(memberRoadmap(person, data).final, true);
  person.certChecks.O08 = "fix";
  roadmap = memberRoadmap(person, data);
  assert.equal(roadmap.current.id, "submission");
  assert.equal(roadmap.final, false);
  assert.ok(roadmap.progress < 100);
  assert.ok(!roadmap.completed.some((r) => r.task.id === "O08"));
  assert.equal(
    roadmap.stages[4].items.find((r) => r.task.id === "O16").done,
    false,
  );
});
test("individual additional work is included and active hold removes execution actions", () => {
  const { data, person } = fixture();
  data.customTasks.push({
    id: "C-personal",
    title: "추가 확인",
    project: person.project,
    personIds: [person.id],
    owner: "member",
    group: "기타",
    deps: [],
    required: false,
    custom: true,
  });
  let roadmap = memberRoadmap(person, data);
  assert.ok(roadmap.mine.some((r) => r.task.id === "C-personal"));
  assert.ok(roadmap.stages[2].items.some((r) => r.task.id === "C-personal"));
  person.onboardingHold = { active: true };
  roadmap = memberRoadmap(person, data);
  assert.equal(roadmap.mine.length, 0);
  assert.equal(roadmap.held, true);
  assert.equal(roadmap.final, false);
});
