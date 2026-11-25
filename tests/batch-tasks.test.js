import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { seed, taskStatus, progress, isPrepared } from "../src/data.js";
import { normalizeLegacyState } from "../src/migration.js";
import { batchEligibility } from "../src/batch-tasks.js";
import {
  exportTaskWorkbook,
  taskExportRows,
  TASK_EXPORTS,
} from "../src/task-exports.js";
import { PROCEDURE_TASKS } from "../src/work-procedures.js";

function fixture() {
  const data = normalizeLegacyState(seed());
  const person = data.people[0];
  person.registrationStatus = "registered";
  person.lifecycle = "투입 중";
  return { data, person };
}
test("six account templates use selected real people and system-specific fields", () => {
  const { data, person } = fixture();
  for (const taskId of [
    "O02",
    ...PROCEDURE_TASKS.filter((t) => t.procedurePhase === "entry").map(
      (t) => t.id,
    ),
  ]) {
    const result = taskExportRows(data, "PMO", {
      project: "전체",
      taskId,
      personIds: [person.id, person.id],
    });
    assert.equal(result.rows.length, 1);
    assert.ok(Object.values(result.rows[0]).includes(person.name));
    assert.ok(TASK_EXPORTS[taskId]);
  }
  const result = taskExportRows(data, "PMO", {
    project: "전체",
    taskId: "P-DBUSER",
    personIds: [person.id],
    pendingOnly: true,
    commonFields: {
      database: "SFA_DB",
      schema: "APP",
      permission: "READ",
      requestReason: "업무 수행",
    },
  });
  assert.equal(result.rows[0]["DB명"], "SFA_DB");
  assert.equal(result.rows[0]["스키마"], "APP");
  assert.equal(result.rows[0]["신청 권한"], "READ");
  assert.throws(() =>
    taskExportRows(data, "PMO", {
      project: "전체",
      taskId: "P-DBUSER",
      personIds: [person.id],
      commonFields: { password: "never-accepted" },
    }),
  );
});
test("batch export rejects stale completed, held, pending and out-of-scope people", () => {
  const { data, person } = fixture();
  const selection = {
    project: "SFA",
    taskId: "P-DBUSER",
    personIds: [person.id],
    pendingOnly: true,
  };
  assert.throws(() => taskExportRows(data, "그룹웨어", selection));
  person.registrationStatus = "pending_registration";
  assert.throws(() => taskExportRows(data, "SFA", selection), /본인 등록/);
  person.registrationStatus = "registered";
  person.onboardingHold = { active: true };
  assert.throws(() => taskExportRows(data, "SFA", selection), /보류/);
  person.onboardingHold.active = false;
  person.tasks[selection.taskId] = "done";
  assert.throws(() => taskExportRows(data, "SFA", selection), /완료/);
});
test("new procedure tasks keep existing required readiness and education precedes a new pledge", () => {
  const { person } = fixture();
  assert.equal(progress(person), 100);
  assert.equal(isPrepared(person), true);
  person.tasks.O10 = "ready";
  delete person.tasks.O08;
  assert.equal(taskStatus(person, "O10"), "waiting");
  person.tasks.O08 = "done";
  assert.equal(taskStatus(person, "O10"), "ready");
  person.tasks.O10 = "review";
  delete person.tasks.O08;
  assert.equal(
    taskStatus(person, "O10"),
    "review",
    "existing submitted document is preserved",
  );
});
test("withdrawal collection workbook is a register and export does not complete work", async () => {
  const { data, person } = fixture();
  const task = PROCEDURE_TASKS.find((t) => t.id === "P-WITHDRAW");
  person.lifecycle = "투입 예정";
  assert.equal(taskStatus(person, task.id), "waiting");
  assert.ok(batchEligibility(person, task));
  person.lifecycle = "투입 중";
  assert.equal(taskStatus(person, task.id), "ready");
  assert.equal(batchEligibility(person, task), "");
  const before = structuredClone(data);
  const file = await exportTaskWorkbook(data, "SFA", {
    project: "SFA",
    taskId: task.id,
    personIds: [person.id],
    pendingOnly: true,
  });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.blob.arrayBuffer());
  assert.equal(workbook.worksheets[0].name, "징구 현황");
  assert.equal(workbook.worksheets[0].rowCount, 2);
  assert.ok(
    JSON.stringify(workbook.worksheets[0].getSheetValues()).includes("미완료"),
  );
  assert.ok(
    JSON.stringify(
      workbook.getWorksheet("양식 안내").getSheetValues(),
    ).includes("예시"),
  );
  assert.deepEqual(data, before);
});
