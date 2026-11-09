import test from "node:test";
import assert from "node:assert/strict";
import {
  seed,
  taskStatus,
  isPrepared,
  progress,
  canManage,
} from "../src/data.js";
import {
  createSeatDraft,
  stageSeatAssignment,
  stageSeatMove,
  stageSeatRelease,
  stageSeatOffboarding,
  getSeatChanges,
  commitSeatDraft,
} from "../src/seat-workspace.js";
const assignment = {
  personId: "SFA-3",
  seatId: "A-02",
  scope: "SFA",
  start: "2026-11-16",
  end: "2027-02-26",
};
const move = {
  fromSeatId: "A-01",
  toSeatId: "A-04",
  personId: "SFA-1",
  scope: "SFA",
};
test("initial ten people and preparation match the scenario", () => {
  const d = seed();
  assert.equal(d.people.length, 10);
  assert.equal(d.people.filter((p) => p.project === "SFA").length, 5);
  assert.deepEqual(
    d.people.filter((p) => isPrepared(p, d.seats)).map((p) => p.id),
    ["SFA-1", "GW-1", "GW-5"],
  );
  assert.equal(progress(d.people[0], d.seats), 100);
});
test("both account confirmations unlock the member task", () => {
  const d = seed(),
    p = d.people.find((p) => p.id === "SFA-4");
  assert.equal(taskStatus(p, "O06", d.seats), "waiting");
  p.tasks.O03 = "done";
  assert.equal(taskStatus(p, "O06", d.seats), "waiting");
  p.tasks.O05 = "done";
  assert.equal(taskStatus(p, "O06", d.seats), "ready");
});
test("both document approvals unlock access", () => {
  const d = seed(),
    p = d.people.find((p) => p.id === "SFA-2");
  p.tasks.O10 = "done";
  p.tasks.O11 = "review";
  assert.equal(taskStatus(p, "O13", d.seats), "waiting");
  p.tasks.O11 = "done";
  assert.equal(taskStatus(p, "O13", d.seats), "ready");
});
test("assignment is staged without updating shared seats, readiness or versions", () => {
  const d = seed(),
    draft = stageSeatAssignment(d, createSeatDraft(d, "SFA"), assignment);
  assert.equal(draft.seats["A-02"].personId, "SFA-3");
  assert.equal(d.seats["A-02"], null);
  assert.equal(d.versions.length, 4);
  assert.equal(
    taskStatus(
      d.people.find((p) => p.id === "SFA-3"),
      "O14",
      d.seats,
    ),
    "ready",
  );
  assert.equal(getSeatChanges(draft).length, 1);
});
test("assignment rejects other projects, occupied seats and invalid dates", () => {
  const d = seed(),
    draft = createSeatDraft(d, "SFA");
  assert.throws(() =>
    stageSeatAssignment(d, draft, { ...assignment, personId: "GW-4" }),
  );
  assert.throws(() =>
    stageSeatAssignment(d, draft, { ...assignment, seatId: "B-01" }),
  );
  assert.throws(() =>
    stageSeatAssignment(d, draft, { ...assignment, start: "2026-11-01" }),
  );
});
test("several moves and an assignment produce exactly one version on save", () => {
  const d = seed();
  d.seats["A-01"].end = "2026-12-31";
  const initial = structuredClone(d);
  let draft = createSeatDraft(d, "SFA");
  draft = stageSeatMove(d, draft, move);
  draft = stageSeatMove(d, draft, {
    ...move,
    fromSeatId: "A-04",
    toSeatId: "A-03",
  });
  draft = stageSeatAssignment(d, draft, assignment);
  assert.equal(d.versions.length, 4);
  const next = commitSeatDraft(d, draft, "SFA");
  assert.equal(next.versions.length, 5);
  assert.equal(next.seats["A-03"].personId, "SFA-1");
  assert.equal(next.seats["A-03"].end, "2026-12-31");
  assert.equal(next.seats["A-01"], null);
  assert.equal(next.seats["A-02"].personId, "SFA-3");
  assert.equal(next.versions.at(-1).changes.length, 2);
  assert.deepEqual(d, initial);
  assert.equal(next.versions[3].seats["A-02"], null);
});
test("empty saves and moves returned to their original positions create no version", () => {
  const d = seed();
  let draft = createSeatDraft(d, "SFA");
  assert.equal(commitSeatDraft(d, draft, "SFA"), d);
  draft = stageSeatMove(d, draft, move);
  draft = stageSeatMove(d, draft, {
    ...move,
    fromSeatId: "A-04",
    toSeatId: "A-01",
  });
  assert.equal(getSeatChanges(draft).length, 0);
  assert.equal(commitSeatDraft(d, draft, "SFA"), d);
});
test("release is staged and saved with the batch", () => {
  const d = seed(),
    draft = stageSeatRelease(d, createSeatDraft(d, "SFA"), {
      seatId: "A-01",
      scope: "SFA",
    });
  assert.equal(d.seats["A-01"].personId, "SFA-1");
  assert.equal(draft.seats["A-01"], null);
  const next = commitSeatDraft(d, draft, "SFA");
  assert.equal(next.seats["A-01"], null);
  assert.equal(next.versions.length, 5);
  assert.equal(next.versions.at(-1).changes[0].kind, "해제");
});
test("concurrent save is rejected without losing the draft or overwriting shared seats", () => {
  const d = seed();
  const stale = stageSeatMove(d, createSeatDraft(d, "SFA"), move);
  const other = stageSeatMove(d, createSeatDraft(d, "그룹웨어"), {
    fromSeatId: "B-01",
    toSeatId: "B-03",
    personId: "GW-1",
    scope: "그룹웨어",
  });
  const latest = commitSeatDraft(d, other, "그룹웨어");
  assert.throws(() => commitSeatDraft(latest, stale, "SFA"), /다른 관리자가/);
  assert.equal(stale.seats["A-04"].personId, "SFA-1");
  assert.equal(latest.seats["B-03"].personId, "GW-1");
  assert.equal(latest.seats["A-01"].personId, "SFA-1");
  assert.equal(latest.versions.length, 5);
});
test("save rechecks project permission and duplicate occupants", () => {
  const d = seed(),
    draft = createSeatDraft(d, "SFA");
  draft.seats["B-01"] = null;
  assert.throws(() => commitSeatDraft(d, draft, "SFA"), /다른 프로젝트/);
  const duplicate = createSeatDraft(d, "PMO");
  duplicate.seats["A-02"] = structuredClone(d.seats["A-01"]);
  assert.throws(() => commitSeatDraft(d, duplicate, "PMO"), /여러 좌석/);
  assert.equal(canManage("SFA", d.people[5]), false);
  assert.equal(canManage("PMO", d.people[5]), true);
});
test("offboarding and seat release are committed together only on explicit save", () => {
  const d = seed(),
    draft = stageSeatOffboarding(d, createSeatDraft(d, "SFA"), {
      personId: "SFA-1",
      scope: "SFA",
    });
  assert.equal(d.people[0].lifecycle, "투입 중");
  assert.equal(d.seats["A-01"].personId, "SFA-1");
  const next = commitSeatDraft(d, draft, "SFA");
  assert.equal(next.people[0].lifecycle, "철수 완료");
  assert.equal(next.seats["A-01"], null);
  assert.equal(next.versions.length, 5);
});
