import test from "node:test";
import assert from "node:assert/strict";
import { seed, requiredTasks, taskStatus } from "../src/data.js";
import { normalizeLegacyState } from "../src/migration.js";
import {
  personIdentity,
  personState,
  summaryCounts,
  matchesPerson,
  attentionRows,
  taskRows,
  horizonDays,
} from "../src/work-summary.js";
const today = "2026-11-23";
function data() {
  return normalizeLegacyState(seed());
}
test("UUID lookup returns real identity, suppresses duplicate codes, and gives an explicit orphan recovery state", () => {
  const d = data(),
    p = d.people[0],
    old = p.id;
  p.id = "12345678-1234-4234-8234-123456789012";
  p.displayId = old;
  const result = personIdentity(d, p.id);
  assert.equal(result.name, "SFA-1");
  assert.equal(result.company, "SFA 수행사");
  assert.equal(result.code, "");
  assert.equal(result.missing, false);
  assert.equal(personIdentity(d, "missing-id").name, "인원 정보 확인 필요");
  assert.equal(personIdentity(d, "missing-id").missing, true);
});
test("registration, required readiness, final confirmation and actual lifecycle remain separate", () => {
  const d = data(),
    p = d.people[0];
  p.start = "2026-11-22";
  p.lifecycle = "투입 예정";
  delete p.tasks.O16;
  let s = personState(p, d, today);
  assert.equal(s.pct, 100);
  assert.equal(s.ready, true);
  assert.equal(s.final, false);
  assert.equal(s.preparation, "필수 항목 완료 · 최종 확인 대기");
  assert.equal(s.overdue, true);
  assert.equal(p.lifecycle, "투입 예정");
  p.tasks.O16 = "done";
  s = personState(p, d, today);
  assert.equal(s.final, true);
  assert.equal(s.lifecycle, "투입 예정");
  p.registrationStatus = "pending_registration";
  assert.equal(personState(p, d, today).registered, false);
  assert.equal(taskStatus(p, "O02"), "waiting");
});
test("summary counts and roster predicates use the same scoped imminent and overdue definitions", () => {
  const d = data();
  d.settings.imminentDays = 7;
  const p = d.people[2];
  p.start = "2026-11-25";
  p.lifecycle = "투입 예정";
  const later = d.people[3];
  later.start = "2026-12-03";
  later.lifecycle = "투입 예정";
  const overdue = d.people[4];
  overdue.start = "2026-11-22";
  overdue.lifecycle = "투입 예정";
  const scope = d.people.filter((p) => p.project === "SFA");
  const count = summaryCounts(
    scope,
    d,
    [
      { status: "pending", payload: { project: "SFA" } },
      { status: "pending", payload: { project: "그룹웨어" } },
    ],
    today,
  );
  assert.equal(
    count.imminent,
    scope.filter((p) => matchesPerson(p, d, { preparation: "imminent" }, today))
      .length,
  );
  assert.equal(
    count.overdue,
    scope.filter((p) => matchesPerson(p, d, { preparation: "overdue" }, today))
      .length,
  );
  assert.equal(count.mail, 1);
  assert.equal(horizonDays(d.settings), 7);
  d.settings.imminentDays = 1;
  assert.equal(personState(p, d, today).imminent, false);
  assert.equal(
    matchesPerson(p, d, { project: "그룹웨어", search: p.name }, today),
    false,
  );
});
test("overdue attention precedes upcoming work and task deadlines preserve completed evidence", () => {
  const d = data(),
    late = d.people[2],
    soon = d.people[3];
  late.start = "2026-11-20";
  soon.start = "2026-11-25";
  const ordered = attentionRows([soon, late], d, today);
  assert.equal(ordered[0].personId, late.id);
  const rows = taskRows([late], d, today);
  const completed = rows.filter((r) => r.done);
  assert.ok(completed.length);
  assert.ok(rows.every((r) => r.person.name && r.contact));
  assert.equal(late.files.O08, undefined);
  assert.ok(rows.some((r) => r.blockedBy.length));
});
test("a newly added required task invalidates old final readiness without automatically changing actual lifecycle", () => {
  const d = data(),
    p = d.people[0];
  d.customTasks.push({
    id: "C-extra",
    title: "추가 필수 준비",
    project: p.project,
    group: "계정 준비",
    required: true,
    owner: "admin",
    deps: ["O01"],
    custom: true,
  });
  assert.equal(personState(p, d, today).ready, false);
  assert.equal(taskStatus(p, "O16", undefined, d.customTasks), "waiting");
  assert.equal(p.lifecycle, "투입 중");
});

test("completed education with a correction request returns to the member action list", () => {
  const d = data(),
    p = d.people[0];
  p.tasks.O08 = "done";
  p.certChecks.O08 = "fix";
  const row = taskRows([p], d, today).find((r) => r.task.id === "O08");
  assert.equal(row.status, "fix");
  assert.equal(row.owner, "member");
  assert.equal(row.done, false);
});
