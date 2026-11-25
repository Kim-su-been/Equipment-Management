import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import ExcelJS from "exceljs";
import { chooseDemoRole } from "./demo-controls.mjs";
import { statePatch } from "../src/state-patch.js";
const html = await readFile("preview/readyboard-offline.html");
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  acceptDownloads: true,
});
const page = await context.newPage(),
  errors = [],
  network = [];
page.on("pageerror", (e) => errors.push(e.message));
page.setDefaultTimeout(12000);
await context.route("**/*", (route) => {
  if (
    route.request().isNavigationRequest() &&
    route.request().url().startsWith("http://localhost:5194/")
  )
    return route.fulfill({ status: 200, contentType: "text/html", body: html });
  if (!/^(data|blob):/.test(route.request().url()))
    network.push(route.request().url());
  return route.abort();
});
const state = () =>
  page.evaluate(async () => (await (await fetch("/api/state")).json()).state);
const navTasks = () =>
  page
    .locator(".sidebar")
    .getByRole("button", { name: "준비 작업", exact: true })
    .click();
const group = (id) => page.locator(`[data-procedure-task="${id}"]`);
async function openGroup(id) {
  const g = group(id);
  if (!(await g.evaluate((e) => e.open)))
    await g.locator(":scope > summary").click();
  return g;
}
async function download(name) {
  const waiting = page.waitForEvent("download");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "양식 다운로드", exact: true })
    .click();
  const file = await waiting;
  await file.saveAs(`artifacts/${name}.xlsx`);
  const book = new ExcelJS.Workbook();
  await book.xlsx.readFile(`artifacts/${name}.xlsx`);
  await page.getByRole("dialog").getByLabel("닫기", { exact: true }).click();
  return book;
}
try {
  await mkdir("artifacts", { recursive: true });
  await page.goto("http://localhost:5194/");
  await expect(page.locator(".dashboard-work")).toBeVisible();
  await context.setOffline(true);
  await navTasks();
  await expect(page.getByLabel("작업 보기 방식")).toHaveValue("procedure");
  await expect(page.locator(".procedure-phase")).toHaveCount(3);
  await expect(
    page.locator('[data-procedure-task="P-WITHDRAW"]'),
  ).toBeVisible();
  let g = await openGroup("O02");
  const eligible = g.locator('input[type="checkbox"]:not(:disabled)');
  assert.ok((await eligible.count()) >= 2);
  const names = [];
  for (let i = 0; i < 2; i++) {
    names.push(
      (
        await eligible.nth(i).locator("..").locator(".person-name").innerText()
      ).trim(),
    );
    await eligible.nth(i).check();
  }
  const before = await state();
  await g
    .getByRole("button", { name: "선택 인원 기안 첨부 엑셀", exact: true })
    .click();
  await expect(page.getByLabel("작업 양식")).toHaveValue("O02");
  await expect(page.getByLabel("작업 양식")).toBeDisabled();
  await expect(page.locator(".task-recipient-list input")).toHaveCount(2);
  const egis = await download("batch-egis");
  assert.equal(egis.worksheets[0].rowCount, 3);
  assert.deepEqual(egis.worksheets[0].getColumn(1).values.slice(2), names);
  assert.deepEqual(
    (await state()).people,
    before.people,
    "download must not complete tasks",
  );
  // Draft completion is explicit and independent of the exported workbook/account status.
  await g
    .getByRole("button", { name: "선택 인원 기안 작성 완료 기록", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await state()).people.filter(
          (p) => names.includes(p.name) && p.drafting?.O02?.done,
        ).length,
    )
    .toBe(2);
  for (const p of (await state()).people)
    assert.deepEqual(
      p.tasks,
      before.people.find((old) => old.id === p.id).tasks,
    );
  await g
    .getByRole("button", {
      name: `${names[0]} · 기안 완료 기록 취소`,
      exact: true,
    })
    .click();
  await expect
    .poll(
      async () =>
        (await state()).people.find((p) => p.name === names[0]).drafting?.O02
          ?.done,
    )
    .toBe(false);
  await g
    .getByRole("button", {
      name: `${names[0]} · 기안 작성 완료 기록`,
      exact: true,
    })
    .click();
  await expect
    .poll(
      async () =>
        (await state()).people.find((p) => p.name === names[0]).drafting?.O02
          ?.done,
    )
    .toBe(true);
  g = await openGroup("P-DBUSER");
  await g.locator('input[type="checkbox"]:not(:disabled)').first().check();
  await g
    .getByRole("button", { name: "선택 인원 기안 첨부 엑셀", exact: true })
    .click();
  for (const [label, value] of [
    ["DB명", "SFA_DEMO"],
    ["스키마", "APP"],
    ["신청 권한", "READ"],
    ["신청 사유", "업무 수행"],
  ])
    await page.getByLabel(`양식 ${label}`, { exact: true }).fill(value);
  await expect(page.locator(".export-preview")).toContainText("SFA_DEMO");
  const db = await download("batch-dbuser");
  assert.equal(db.worksheets[0].rowCount, 2);
  assert.ok(
    JSON.stringify(db.worksheets[0].getSheetValues()).includes("SFA_DEMO"),
  );
  // A selected row completing in another session is pruned, never replaced by others.
  g = group("O02");
  const current = await state(),
    next = structuredClone(current);
  const target = next.people.find((p) => p.name === names[0]);
  target.tasks.O02 = "done";
  const result = await page.evaluate(
    async (operations) => {
      const r = await fetch("/api/state", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operations }),
      });
      return r.status;
    },
    statePatch(current, next),
  );
  assert.equal(result, 200);
  await expect
    .poll(
      async () =>
        (await state()).people.find((p) => p.id === target.id).tasks.O02,
    )
    .toBe("done");
  await expect(g.locator('input[type="checkbox"]:checked')).toHaveCount(1);
  await g
    .getByRole("button", { name: "선택 인원 기안 첨부 엑셀", exact: true })
    .click();
  await expect(page.locator(".task-recipient-list input")).toHaveCount(1);
  const refreshed = await download("batch-stale-selection");
  assert.equal(refreshed.worksheets[0].getCell("A2").value, names[1]);
  g = await openGroup("P-WITHDRAW");
  assert.ok((await g.locator('input[type="checkbox"]:disabled').count()) > 0);
  await g.locator('input[type="checkbox"]:not(:disabled)').first().check();
  await g
    .getByRole("button", { name: "선택 인원 기안 첨부 엑셀", exact: true })
    .click();
  const exit = await download("batch-withdrawal");
  assert.equal(exit.worksheets[0].name, "징구 현황");
  assert.equal(exit.worksheets[0].rowCount, 2);
  await chooseDemoRole(page, "sfa");
  await navTasks();
  g = await openGroup("P-PASSWORD");
  assert.ok(
    (await g.locator(".procedure-person-info small").allTextContents()).every(
      (text) => !text.includes("그룹웨어"),
    ),
  );
  await g
    .getByRole("button", { name: "선택 가능 인원 전체 선택", exact: true })
    .click();
  const count = await g.locator('input[type="checkbox"]:checked').count();
  await g
    .getByRole("button", { name: "선택 인원 기안 첨부 엑셀", exact: true })
    .click();
  await expect(page.getByLabel("양식 프로젝트")).toHaveValue("SFA");
  const scoped = await download("batch-sfa-password");
  assert.equal(scoped.worksheets[0].rowCount, count + 1);
  assert.ok(
    scoped.worksheets[0]
      .getColumn(3)
      .values.slice(2)
      .every((v) => v === "SFA"),
  );
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(350);
  await page.screenshot({ path: "artifacts/batch-tasks-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.mouse.move(380, 90);
  await page.waitForTimeout(350);
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  await page.screenshot({ path: "artifacts/batch-tasks-mobile.png" });
  await page.reload();
  await expect(page.locator(".sidebar")).toBeVisible();
  assert.ok(
    (await state()).people
      .filter((p) => names.includes(p.name))
      .every((p) => p.drafting?.O02?.done === true),
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(network, []);
  console.log(
    "Batch drafting: three phases, selected-only eGIS workbook, DB fields, stale selection pruning, withdrawal register, SFA scope, mobile and zero external API requests passed.",
  );
} finally {
  await browser.close();
}
