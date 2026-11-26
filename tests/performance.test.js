import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
import { seed } from "../src/data.js";
import { normalizeLegacyState } from "../src/migration.js";
import {
  makePerformanceDemo,
  PERFORMANCE_AS_OF,
} from "../src/performance-data.js";
import {
  selectRequests,
  performanceMetrics,
  stageDurations,
  requestAt,
  weeklyTrend,
  validDay,
  assignmentMetrics,
  assignmentDate,
} from "../src/performance-metrics.js";
import { getPerformance, syncPerformance } from "../src/performance-service.js";
import { viewState } from "../src/actor-scope.js";
import { exportPerformance } from "../src/performance-export.js";
import { createApplication } from "../server/app.js";
const fixture = () => normalizeLegacyState(seed());
const pmo = { kind: "admin", scope: "PMO" };
function storeFixture() {
  let data = fixture();
  return {
    load: () => structuredClone(data),
    save: (s) => {
      data = structuredClone(s);
    },
    audit: () => {},
  };
}
test("synthetic source has stable IDs, valid event chronology, AO and existing person links, without modifying personnel", () => {
  const data = fixture(),
    before = structuredClone(data),
    source = makePerformanceDemo(data.people);
  assert.deepEqual(data, before);
  assert.equal(
    source.participants.filter((p) => p.project === "AO 개발팀").length,
    4,
  );
  assert.equal(
    new Set(source.requests.map((r) => r.id)).size,
    source.requests.length,
  );
  assert.equal(
    new Set(source.requests.map((r) => r.externalId)).size,
    source.requests.length,
  );
  assert.ok(
    source.participants
      .filter((p) => p.personId)
      .every((p) => data.people.some((person) => person.id === p.personId)),
  );
  for (const r of source.requests) {
    assert.ok(validDay(r.createdAt));
    assert.ok(
      r.events.every(
        (e, i) =>
          validDay(e.at) &&
          e.at <= source.asOf &&
          (!i || e.at >= r.events[i - 1].at),
      ),
    );
  }
  const assignedRows = selectRequests(source);
  const rates = source.participants.map(
    (p) =>
      assignmentMetrics(
        assignedRows.filter((r) => r.participantId === p.id),
        "2026-11-01",
        source.asOf,
      ).completionRate,
  );
  assert.ok(
    new Set(rates).size > 1,
    "demo completion rates must vary between people",
  );
  const reordered = makePerformanceDemo([...data.people].reverse());
  assert.deepEqual(
    [...source.requests].sort((a, b) => a.id.localeCompare(b.id)),
    [...reordered.requests].sort((a, b) => a.id.localeCompare(b.id)),
  );
});
test("metric denominators separate late completion, active overdue, missing due and cancellation", () => {
  const common = {
    participantId: "p",
    project: "SFA",
    createdAt: "2026-11-01",
    events: [{ stage: "request", at: "2026-11-01" }],
  };
  const source = {
    asOf: PERFORMANCE_AS_OF,
    requests: [
      { ...common, id: "on", dueDate: "2026-11-10", completedAt: "2026-11-09" },
      {
        ...common,
        id: "late",
        dueDate: "2026-11-10",
        completedAt: "2026-11-12",
      },
      { ...common, id: "missing", dueDate: null, completedAt: "2026-11-14" },
      { ...common, id: "active", dueDate: "2026-11-25" },
      { ...common, id: "today", dueDate: "2026-11-26" },
      {
        ...common,
        id: "cancel",
        dueDate: "2026-11-10",
        cancelledAt: "2026-11-02",
      },
    ],
  };
  const m = performanceMetrics(selectRequests(source), source.asOf);
  assert.equal(m.completed, 3);
  assert.equal(m.eligible, 2);
  assert.equal(m.onTimeRate, 50);
  assert.equal(m.missingDue, 1);
  assert.equal(m.late, 1);
  assert.equal(m.ongoing, 2);
  assert.equal(m.overdue, 1);
  assert.equal(m.medianCycle, 11);
  assert.equal(m.cancelled, 1);
  const empty = performanceMetrics([], source.asOf);
  assert.equal(empty.onTimeRate, null);
  assert.equal(empty.medianCycle, null);
  assert.equal(empty.reworkRate, null);
});
test("historical snapshots hide future completions, cancellation and transitions; filters include open carry-over work", () => {
  const source = makePerformanceDemo(fixture().people);
  const rows = selectRequests(source, {
    from: "2026-11-20",
    to: "2026-11-22",
    project: "SFA",
  });
  assert.ok(
    rows.every(
      (r) => r.project === "SFA" && r.events.every((e) => e.at <= "2026-11-22"),
    ),
  );
  assert.ok(rows.some((r) => !r.done && r.createdAt < "2026-11-20"));
  assert.ok(!rows.some((r) => r.done));
  const r = source.requests.find((r) => r.completedAt);
  const old = requestAt(r, r.createdAt);
  assert.equal(old.done, false);
  assert.equal(old.stage, "request");
  const person = source.participants[0];
  assert.ok(
    selectRequests(source, { person: person.id }).every(
      (r) => r.participantId === person.id,
    ),
  );
});
test("repeated development visits are summed per request and trend totals reconcile with completion totals", () => {
  const r = requestAt(
    {
      createdAt: "2026-11-01",
      completedAt: "2026-11-12",
      dueDate: "2026-11-15",
      events: [
        { stage: "request", at: "2026-11-01" },
        { stage: "development", at: "2026-11-02" },
        { stage: "verification", at: "2026-11-05" },
        { stage: "development", at: "2026-11-07" },
        { stage: "verification", at: "2026-11-09" },
        { stage: "completed", at: "2026-11-12" },
      ],
    },
    PERFORMANCE_AS_OF,
  );
  assert.equal(r.reworked, true);
  assert.equal(
    stageDurations([r]).find((s) => s.id === "development").median,
    5,
  );
  assert.equal(
    stageDurations([r]).find((s) => s.id === "verification").median,
    5,
  );
  assert.equal(performanceMetrics([r], PERFORMANCE_AS_OF).reworkRate, 100);
  const rows = selectRequests(makePerformanceDemo(fixture().people));
  assert.equal(
    weeklyTrend(rows, PERFORMANCE_AS_OF).reduce((n, w) => n + w.completed, 0),
    performanceMetrics(rows, PERFORMANCE_AS_OF).completed,
  );
});
test("sync upserts identical requests, preserves personnel and respects staff/member read scope in every state response", () => {
  const store = storeFixture(),
    before = store.load();
  assert.equal(getPerformance(store, pmo).preview, true);
  const first = syncPerformance(store, pmo),
    second = syncPerformance(store, pmo);
  assert.equal(first.sync.added, first.requests.length);
  assert.equal(second.sync.added, 0);
  assert.equal(second.sync.updated, 0);
  assert.equal(second.sync.unchanged, first.requests.length);
  assert.deepEqual(store.load().people, before.people);
  const sfa = { kind: "admin", scope: "SFA" },
    p = before.people[0],
    member = { kind: "member", personId: p.id, project: p.project };
  assert.ok(
    getPerformance(store, sfa).requests.every((r) => r.project === "SFA"),
  );
  assert.equal(getPerformance(store, member).participants.length, 1);
  assert.ok(
    viewState(store, member).performance.participants.every(
      (x) => x.personId === p.id,
    ),
  );
  assert.ok(
    viewState(store, sfa).performance.requests.every(
      (r) => r.project === "SFA",
    ),
  );
  assert.throws(
    () => syncPerformance(store, member),
    (e) => e.status === 403,
  );
  const previous = store
    .load()
    .performance.requests.filter((r) => r.project !== "SFA");
  syncPerformance(store, sfa);
  assert.deepEqual(
    store.load().performance.requests.filter((r) => r.project !== "SFA"),
    previous,
  );
});
test("Excel export includes only filtered request evidence, people and real metric definitions", async () => {
  const payload = makePerformanceDemo(fixture().people),
    filter = {
      project: "AO 개발팀",
      from: "2026-11-01",
      to: PERFORMANCE_AS_OF,
    };
  const rows = selectRequests(payload, filter),
    blob = await exportPerformance(payload, rows, payload.asOf, filter),
    book = new ExcelJS.Workbook();
  await book.xlsx.load(await blob.arrayBuffer());
  assert.equal(book.worksheets.length, 5);
  assert.equal(book.getWorksheet("업무 근거").rowCount, rows.length + 1);
  assert.ok(
    book
      .getWorksheet("업무 근거")
      .getColumn(2)
      .values.slice(2)
      .every((p) => p === "AO 개발팀"),
  );
  assert.equal(book.getWorksheet("인원별 지표").rowCount, 5);
  const matrix = book.getWorksheet("배정 기준 비교");
  assert.equal(matrix.rowCount, 5);
  const firstPerson = payload.participants.find(
    (p) => p.project === "AO 개발팀",
  );
  const expected = assignmentMetrics(
    rows.filter((r) => r.participantId === firstPerson.id),
    filter.from,
    payload.asOf,
  );
  assert.equal(matrix.getCell("D2").value, expected.assigned);
  assert.equal(matrix.getCell("E2").value, expected.completed);
  assert.equal(matrix.getCell("F2").value, expected.completionRate);
});
test("server endpoint persists synthetic data across sessions and never exposes another project or allows member sync", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "readyboard-performance-"));
  const app = createApplication({
    dbPath: path.join(dir, "db.sqlite"),
    staticRoot: path.resolve("dist"),
    passwords: { PMO: "test-pmo", SFA: "test-sfa" },
    seedDemo: true,
    inviteTtlMs: 3600000,
    aiKey: "",
    testMode: true,
  });
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  t.after(async () => {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const login = async (scope, password) => {
    const r = await fetch(base + "/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope, password }),
    });
    assert.equal(r.status, 200);
    return r.headers.get("set-cookie").split(";")[0];
  };
  const pc = await login("PMO", "test-pmo"),
    sc = await login("SFA", "test-sfa");
  assert.equal((await fetch(base + "/api/performance")).status, 401);
  const sync = await fetch(base + "/api/performance/sync", {
    method: "POST",
    headers: { Cookie: pc },
  });
  assert.equal(sync.status, 200);
  const payload = await sync.json();
  assert.equal(payload.preview, false);
  const second = await (
    await fetch(base + "/api/performance/sync", {
      method: "POST",
      headers: { Cookie: pc },
    })
  ).json();
  assert.equal(second.sync.added, 0);
  const scoped = await (
    await fetch(base + "/api/performance", { headers: { Cookie: sc } })
  ).json();
  assert.ok(scoped.requests.every((r) => r.project === "SFA"));
  assert.equal(
    getPerformance(app.store, pmo).requests.length,
    payload.requests.length,
  );
  const state = await (
    await fetch(base + "/api/state", { headers: { Cookie: sc } })
  ).json();
  assert.ok(
    state.state.performance.participants.every((p) => p.project === "SFA"),
  );
});

test("assignment comparison uses one cohort, excludes carry-over/cancellation/unknown dates and measures assignment-to-completion", () => {
  const common = {
    participantId: "p",
    project: "SFA",
    createdAt: "2026-10-28",
    events: [{ stage: "request", at: "2026-10-28" }],
  };
  const requests = [
    {
      ...common,
      id: "done",
      assignedAt: "2026-11-01",
      completedAt: "2026-11-04",
      dueDate: "2026-11-05",
    },
    { ...common, id: "open", assignedAt: "2026-11-03", dueDate: "2026-11-09" },
    {
      ...common,
      id: "carry",
      assignedAt: "2026-10-31",
      completedAt: "2026-11-03",
      dueDate: "2026-11-05",
    },
    {
      ...common,
      id: "cancelled",
      assignedAt: "2026-11-02",
      cancelledAt: "2026-11-03",
    },
    { ...common, id: "future", assignedAt: "2026-11-15" },
    { ...common, id: "unknown", createdAt: "2026-11-01", demo: false },
    {
      ...common,
      id: "legacy-mock",
      createdAt: "2026-11-02",
      completedAt: "2026-11-03",
      dueDate: "2026-11-04",
      demo: true,
    },
  ].map((r) => requestAt(r, "2026-11-10"));
  const m = assignmentMetrics(requests, "2026-11-01", "2026-11-10");
  assert.equal(m.assigned, 3);
  assert.equal(m.completed, 2);
  assert.equal(m.completionRate, 66.7);
  assert.equal(m.medianAssignedCycle, 2);
  assert.equal(m.ongoing, 1);
  assert.equal(m.overdue, 1);
  assert.equal(m.cancelled, 1);
  assert.equal(m.assignmentUnknown, 1);
  assert.equal(m.onTimeRate, 100);
  assert.equal(assignmentDate(requests.find((r) => r.id === "unknown")), null);
  assert.equal(
    assignmentDate(requests.find((r) => r.id === "legacy-mock")),
    "2026-11-02",
  );
  const early = assignmentMetrics(requests, "2026-11-11", "2026-11-14");
  assert.equal(early.assigned, 0);
  assert.equal(early.completionRate, null);
  assert.equal(early.medianAssignedCycle, null);
});
