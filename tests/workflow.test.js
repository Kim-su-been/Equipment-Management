import test from "node:test";
import assert from "node:assert/strict";
import {
  seed,
  taskStatus,
  isPrepared,
  progress,
  assignSeat,
  canManage,
  moveSeat,
} from "../src/data.js";
test("initial 10 people and preparation status match the scenario", () => {
  const d = seed();
  assert.equal(d.people.length, 10);
  assert.equal(d.people.filter((p) => p.project === "SFA").length, 5);
  assert.deepEqual(
    d.people.filter((p) => isPrepared(p, d.seats)).map((p) => p.id),
    ["SFA-1", "GW-1", "GW-5"],
  );
  assert.equal(progress(d.people[0], d.seats), 100);
});
test("both account confirmations are required to unlock a member task", () => {
  const d = seed(),
    p = d.people.find((p) => p.id === "SFA-4");
  assert.equal(taskStatus(p, "O06", d.seats), "waiting");
  p.tasks.O03 = "done";
  assert.equal(taskStatus(p, "O06", d.seats), "waiting");
  p.tasks.O05 = "done";
  assert.equal(taskStatus(p, "O06", d.seats), "ready");
});
test("submitted and AI-reviewed documents do not unlock access until both approvals", () => {
  const d = seed(),
    p = d.people.find((p) => p.id === "SFA-2");
  assert.equal(taskStatus(p, "O13", d.seats), "waiting");
  p.tasks.O10 = "done";
  p.tasks.O11 = "review";
  assert.equal(taskStatus(p, "O13", d.seats), "waiting");
  p.tasks.O11 = "done";
  assert.equal(taskStatus(p, "O13", d.seats), "ready");
});
test("seat assignment enforces project, occupancy and valid period, and preserves snapshots", () => {
  const d = seed();
  const base = {
    personId: "SFA-3",
    seatId: "A-02",
    scope: "SFA",
    start: "2026-11-16",
    end: "2027-02-26",
    reason: "test",
  };
  assert.throws(() => assignSeat(d, { ...base, scope: "그룹웨어" }));
  assert.throws(() => assignSeat(d, { ...base, seatId: "B-01" }));
  assert.throws(() => assignSeat(d, { ...base, start: "2026-11-01" }));
  const next = assignSeat(d, base);
  assert.equal(next.versions.at(-1).version, 5);
  assert.equal(next.seats["A-02"].personId, "SFA-3");
  assert.equal(d.seats["A-02"], null);
  assert.equal(next.versions[3].seats["A-02"], null);
  assert.equal(
    taskStatus(
      next.people.find((p) => p.id === "SFA-3"),
      "O14",
      next.seats,
    ),
    "done",
  );
});
test("moving a person clears their previous seat and adds one shared version", () => {
  const d = seed();
  const next = assignSeat(d, {
    personId: "SFA-1",
    seatId: "A-03",
    scope: "PMO",
    start: "2026-11-09",
    end: "2027-02-26",
  });
  assert.equal(next.seats["A-01"], null);
  assert.equal(next.seats["A-03"].personId, "SFA-1");
  assert.equal(next.versions.length, 5);
});
test("project managers are limited while PMO spans both projects", () => {
  const d = seed();
  assert.equal(canManage("SFA", d.people[5]), false);
  assert.equal(canManage("PMO", d.people[5]), true);
});

test("drag move preserves the assignment period, frees the source and records one version", () => {
  const data = seed();
  data.seats["A-01"].end = "2026-12-31";
  const next = moveSeat(data, {
    fromSeatId: "A-01",
    toSeatId: "A-04",
    personId: "SFA-1",
    scope: "SFA",
    baseVersion: 4,
  });
  assert.equal(next.seats["A-01"], null);
  assert.equal(next.seats["A-04"].personId, "SFA-1");
  assert.equal(next.seats["A-04"].end, "2026-12-31");
  assert.equal(next.versions.length, 5);
  assert.match(next.versions.at(-1).reason, /A-01 → A-04 드래그 이동/);
  assert.equal(next.versions[3].seats["A-04"], null);
  assert.equal(data.seats["A-01"].personId, "SFA-1");
});
test("drag rejects another project, occupied destination, stale version and changed source", () => {
  const data = seed();
  const args = {
    fromSeatId: "A-01",
    toSeatId: "A-04",
    personId: "SFA-1",
    scope: "SFA",
    baseVersion: 4,
  };
  assert.throws(() => moveSeat(data, { ...args, scope: "그룹웨어" }), /권한/);
  assert.throws(
    () => moveSeat(data, { ...args, toSeatId: "B-01" }),
    /이미 배정/,
  );
  assert.throws(
    () => moveSeat(data, { ...args, baseVersion: 3 }),
    /배치도가 변경/,
  );
  assert.throws(
    () => moveSeat(data, { ...args, personId: "SFA-2" }),
    /원래 좌석/,
  );
  assert.equal(moveSeat(data, { ...args, toSeatId: "A-01" }), data);
});
