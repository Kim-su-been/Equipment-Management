import {
  openDemoSettings,
  closeDemoSettings,
  chooseDemoRole,
} from "./demo-controls.mjs";
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import ExcelJS from "exceljs";
import { statePatch } from "../src/state-patch.js";
const html = await readFile("preview/readyboard-review.html");
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
  }),
  unexpected = [],
  errors = [];
await context.route("**/*", (route) => {
  const req = route.request();
  if (
    req.isNavigationRequest() &&
    req.url().startsWith("http://localhost:5199/readyboard.html")
  )
    return route.fulfill({
      status: 200,
      body: html,
      contentType: "text/html; charset=utf-8",
    });
  if (!req.url().startsWith("data:") && !req.url().startsWith("blob:"))
    unexpected.push(req.url());
  return route.abort();
});
const page = await context.newPage();
page.setDefaultTimeout(12000);
page.on("pageerror", (e) => errors.push(e.message));
const call = async (path, body, method = body ? "POST" : "GET") =>
  page.evaluate(
    async ({ path, body, method }) => {
      const response = await fetch(path, {
        method,
        headers: body ? { "Content-Type": "application/json" } : {},
        body: body ? JSON.stringify(body) : undefined,
      });
      return { status: response.status, data: await response.json() };
    },
    { path, body, method },
  );
const state = async () => {
  const r = await call("/api/state");
  assert.equal(r.status, 200);
  return r.data.state;
};
const role = async (value, pid) => {
  await chooseDemoRole(page, value, pid);
  await expect(page.locator(".sidebar")).toBeVisible();
};
const roster = async () => {
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "인원 명단", exact: true })
    .click();
};
const close = () =>
  page.getByRole("dialog").getByLabel("닫기", { exact: true }).click();
try {
  await page.goto("http://localhost:5199/readyboard.html");
  await expect(page.locator(".sidebar")).toBeVisible();
  // Work offline for the whole exercise; only the HTML navigation is fulfilled by the test harness.
  await context.setOffline(true);
  console.log("offline: initial screen");
  const before = await state();
  assert.equal(before.people.length, 11);
  await roster();
  await page
    .getByRole("button", { name: "인력계획서 불러오기", exact: true })
    .click();
  let modal = page.getByRole("dialog");
  await modal
    .getByLabel("인력계획서 파일")
    .setInputFiles("public/examples/인력계획서_A.xlsx");
  await expect(modal).toContainText("AI 미연결");
  await modal
    .getByRole("button", { name: "매핑 적용 · 미리보기", exact: true })
    .click();
  await expect(modal.getByLabel("2행 이름")).toHaveValue("김하늘");
  await modal
    .getByLabel("시트·헤더·열 매핑과 선택한 행을 확인했습니다.")
    .check();
  await modal
    .getByRole("button", { name: "2행 확정 · 저장", exact: true })
    .click();
  await expect(modal).not.toBeVisible();
  let current = await state();
  const imported = current.people.find((p) => p.name === "김하늘");
  assert.equal(imported.registrationStatus, "pending_registration");
  assert.equal(current.people.length, 13);
  console.log("offline: A import");
  // Same XLSX returns the original source registration instead of creating duplicate people.
  await page
    .getByRole("button", { name: "인력계획서 불러오기", exact: true })
    .click();
  modal = page.getByRole("dialog");
  await modal
    .getByLabel("인력계획서 파일")
    .setInputFiles("public/examples/인력계획서_A.xlsx");
  await expect(modal).toContainText("이전 확정 파일");
  await modal
    .getByRole("button", { name: "매핑 적용 · 미리보기", exact: true })
    .click();
  await expect(modal).toContainText("이미 확정됨");
  await modal
    .getByLabel("시트·헤더·열 매핑과 선택한 행을 확인했습니다.")
    .check();
  await modal
    .getByRole("button", { name: "2행 확정 · 저장", exact: true })
    .click();
  assert.equal((await state()).people.length, 13);
  console.log("offline: idempotent reupload");
  // Issue and reissue from the same visible UI.
  await roster();
  await page.locator("tbody tr").filter({ hasText: "김하늘" }).first().click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "초대 링크 생성·복사", exact: true })
    .click();
  modal = page.getByRole("dialog");
  await modal
    .getByRole("button", { name: "초대 링크 생성", exact: true })
    .click();
  const old = await modal.getByLabel("김하늘 초대 링크").inputValue();
  await modal.getByRole("button", { name: "재발급", exact: true }).click();
  await expect(modal.getByLabel("김하늘 초대 링크")).not.toHaveValue(old);
  const link = await modal.getByLabel("김하늘 초대 링크").inputValue();
  assert.notEqual(link, old);
  const oldToken = new URLSearchParams(new URL(old).hash.slice(1)).get(
    "invite",
  );
  assert.equal((await call(`/api/invites/${oldToken}`)).status, 410);
  await close();
  await openDemoSettings(page);
  await page
    .getByRole("button", { name: "초대 링크 열기", exact: true })
    .click();
  await page.getByLabel("개인 초대 링크", { exact: true }).fill(link);
  await page
    .locator(".access-continue")
    .getByRole("button", { name: "초대 링크 열기", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "내 등록 이어하기", exact: true }),
  ).toBeVisible();
  await page.getByLabel("연락처", { exact: true }).fill("01012345678");
  await page
    .getByLabel("투입 예정 시작일 *", { exact: true })
    .fill("2026-11-23");
  await page
    .getByLabel("투입 예정 종료일 *", { exact: true })
    .fill("2027-06-30");
  await page.getByLabel("위 기본 정보가 본인의 정보임을 확인했습니다.").check();
  await page
    .getByRole("button", { name: "등록 완료하고 준비 시작", exact: true })
    .click();
  await expect(page.locator(".sidebar")).toBeVisible();
  assert.equal((await state()).people[0].id, imported.id);
  assert.equal((await state()).people[0].registrationStatus, "registered");
  const usedToken = new URLSearchParams(new URL(link).hash.slice(1)).get(
    "invite",
  );
  assert.equal((await call(`/api/invites/${usedToken}`)).status, 410);
  await page.reload();
  await expect(page.locator(".sidebar")).toBeVisible();
  assert.equal((await state()).people[0].id, imported.id);
  console.log("offline: personal registration");
  // Administrator account tasks unlock only after their actual prerequisites.
  await role("pmo");
  for (const task of ["O02", "O03", "O04", "O05"]) {
    const s = await state(),
      next = structuredClone(s);
    next.people.find((p) => p.id === imported.id).tasks[task] = "done";
    const r = await call(
      "/api/state",
      { operations: statePatch(s, next) },
      "PATCH",
    );
    assert.equal(r.status, 200, JSON.stringify(r.data));
  }
  await role("member", imported.id);
  let s = await state(),
    next = structuredClone(s);
  next.people[0].tasks.O06 = "done";
  assert.equal(
    (await call("/api/state", { operations: statePatch(s, next) }, "PATCH"))
      .status,
    200,
  );
  await page.reload();
  await expect(page.locator(".sidebar")).toBeVisible();
  console.log("offline: prerequisite tasks");
  // Original document + right-hand guide + missing-field blocking + draft persistence + actual local original.
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "서류", exact: true })
    .click();
  await page.locator(".document-tile").first().getByRole("button").click();
  modal = page.getByRole("dialog");
  await expect(modal).toContainText("AI 작성 가이드");
  await expect(
    modal.getByRole("button", { name: "서류 제출", exact: true }),
  ).toBeDisabled();
  await modal
    .getByLabel("위 중요 조항을 모두 읽었습니다. *", { exact: true })
    .check();
  await modal
    .getByLabel("작성 내용과 확인 항목을 검토했습니다. *", { exact: true })
    .check();
  await modal.getByLabel("본인 입력 서명 *", { exact: true }).fill("김하늘");
  await modal
    .getByRole("button", { name: "시연 확인번호 요청", exact: true })
    .click();
  await modal.getByLabel("시연 확인번호", { exact: true }).fill("135790");
  await modal
    .getByRole("button", { name: "시연 본인확인", exact: true })
    .click();
  await modal.getByRole("button", { name: "서류 제출", exact: true }).click();
  await expect(modal).toContainText("담당자 확인 요청");
  await close();
  current = await state();
  const originalId = current.people[0].files.O10.storageId;
  assert.ok(originalId);
  const original = await page.evaluate(async (id) => {
    const r = await fetch(`/api/files/${id}`);
    return { status: r.status, body: await r.text() };
  }, originalId);
  assert.equal(original.status, 200);
  assert.ok(original.body.includes("김하늘"));
  console.log("offline: document submitted");
  // Upload a real certificate and retain its original bytes across reload and backup.
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "교육", exact: true })
    .click();
  await page
    .locator(".education-card")
    .first()
    .getByRole("button", { name: "수료증 등록", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .locator("input[type=file]")
    .setInputFiles({
      name: "offline-certificate.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 offline certificate"),
    });
  await expect(page.getByRole("dialog")).toContainText("완료");
  await close();
  current = await state();
  assert.equal(current.people[0].tasks.O08, "done");
  const certificateId = current.people[0].files.O08.storageId;
  assert.ok(certificateId);
  await role("pmo");
  await roster();
  await page.locator("tbody tr").filter({ hasText: "김하늘" }).first().click();
  await page
    .getByRole("dialog")
    .locator(".task-row")
    .filter({ hasText: "보안서약서" })
    .getByRole("button", { name: "상세 보기", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "승인", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await state()).people.find((p) => p.id === imported.id).tasks.O10,
    )
    .toBe("done");
  console.log("offline: certificate and approval");
  // Existing ZIP and task-specific Excel exports operate on the browser originals.
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "교육·서류 검토", exact: true })
    .click();
  await page.getByLabel("다운로드 가능한 원본 전체 선택").check();
  let downloadPromise = page.waitForEvent("download");
  await page
    .locator(".evidence-manager")
    .getByRole("button", { name: /선택 다운로드/ })
    .click();
  let downloaded = await downloadPromise;
  await mkdir("artifacts", { recursive: true });
  await downloaded.saveAs("artifacts/offline-originals.zip");
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "준비 작업", exact: true })
    .click();
  await page
    .getByRole("button", { name: "작업 양식 다운로드", exact: true })
    .click();
  downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "양식 다운로드", exact: true })
    .click();
  downloaded = await downloadPromise;
  await downloaded.saveAs("artifacts/offline-task-export.xlsx");
  await close();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile("artifacts/offline-task-export.xlsx");
  assert.ok(
    JSON.stringify(wb.worksheets[0].getSheetValues()).includes("김하늘"),
  );
  console.log("offline: file exports");
  // Project-specific task creation uses the same permissions and applies to this project only.
  await role("sfa");
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "준비 작업", exact: true })
    .click();
  await page.getByRole("button", { name: "작업 추가", exact: true }).click();
  modal = page.getByRole("dialog");
  await modal
    .getByLabel("작업명 *", { exact: true })
    .fill("오프라인 추가 점검");
  await modal
    .getByLabel("작업 안내 *", { exact: true })
    .fill("작업 내용을 확인하고 완료합니다.");
  await modal
    .getByRole("button", { name: "작업 추가하기", exact: true })
    .click();
  await expect(modal).not.toBeVisible();
  await expect
    .poll(async () =>
      (await state()).customTasks.some((t) => t.title === "오프라인 추가 점검"),
    )
    .toBeTruthy();
  assert.ok((await state()).people.every((p) => p.project === "SFA"));
  const forbidden = await call("/api/people", {
    requestId: crypto.randomUUID(),
    rows: [{ name: "범위외", company: "테스트", project: "그룹웨어" }],
  });
  assert.equal(forbidden.status, 403);
  await role("gw");
  assert.ok((await state()).people.every((p) => p.project === "그룹웨어"));
  assert.ok(
    !(await state()).customTasks.some((t) => t.title === "오프라인 추가 점검"),
  );
  console.log("offline: project task and scopes");
  // Backup includes uploaded binary originals. Reset and restore from the actual downloaded JSON.
  await role("pmo");
  downloadPromise = page.waitForEvent("download");
  await openDemoSettings(page);
  await page.getByRole("button", { name: "시연 백업", exact: true }).click();
  downloaded = await downloadPromise;
  await downloaded.saveAs("artifacts/offline-backup.json");
  const backup = JSON.parse(
    await readFile("artifacts/offline-backup.json", "utf8"),
  );
  assert.equal(
    backup.workspace.files[certificateId].blob.__readyboardType,
    "blob",
  );
  await page.getByRole("button", { name: "시연 초기화", exact: true }).click();
  await page.getByRole("button", { name: "초기화 실행", exact: true }).click();
  await expect(page.locator(".sidebar")).toBeVisible();
  await expect.poll(async () => (await state()).people.length).toBe(11);
  await openDemoSettings(page);
  await page
    .getByLabel("시연 백업 불러오기")
    .setInputFiles("artifacts/offline-backup.json");
  await expect(page.locator(".demo-notice")).toContainText(
    "백업을 불러왔습니다.",
  );
  assert.equal((await state()).people.length, 13);
  const cert = await page.evaluate(async (id) => {
    const r = await fetch(`/api/files/${id}`);
    return await r.text();
  }, certificateId);
  assert.equal(cert, "%PDF-1.4 offline certificate");
  await closeDemoSettings(page);
  await page.reload();
  await expect(page.locator(".sidebar")).toBeVisible();
  assert.equal((await state()).people.length, 13);
  // A second Excel structure retains year-only births and distinct same-name records.
  await roster();
  await page
    .getByRole("button", { name: "인력계획서 불러오기", exact: true })
    .click();
  modal = page.getByRole("dialog");
  await modal.getByLabel("불러오기 프로젝트").selectOption("그룹웨어");
  await modal
    .getByLabel("인력계획서 파일")
    .setInputFiles("public/examples/인력계획서_B.xlsx");
  await expect(modal.getByLabel("헤더 행")).toHaveValue("3");
  await modal
    .getByRole("button", { name: "매핑 적용 · 미리보기", exact: true })
    .click();
  await expect(modal).toContainText("생년만 있음 · 월/일 확인 필요");
  await modal.getByLabel("4행 등록 방식").selectOption("new");
  await modal.getByLabel("5행 등록 방식").selectOption("new");
  await modal.getByLabel("확인 필요 사항 검토함").nth(0).check();
  await modal.getByLabel("확인 필요 사항 검토함").nth(1).check();
  await modal
    .getByLabel("시트·헤더·열 매핑과 선택한 행을 확인했습니다.")
    .check();
  await modal
    .getByRole("button", { name: "2행 확정 · 저장", exact: true })
    .click();
  await expect(modal).not.toBeVisible();
  const sameNames = (await state()).people.filter((p) => p.name === "박서연");
  assert.equal(sameNames.length, 2);
  assert.notEqual(sameNames[0].id, sameNames[1].id);
  assert.equal(sameNames[0].birthDate, null);
  assert.equal(sameNames[0].birthYear, 1996);
  const manual = {
    requestId: crypto.randomUUID(),
    rows: [
      { name: "오프라인 추가인원", company: "테스트 수행사", project: "SFA" },
    ],
  };
  const added = await call("/api/people", manual);
  assert.equal(added.status, 200);
  assert.equal(
    (await call("/api/people", manual)).data.created[0],
    added.data.created[0],
  );
  const manualId = added.data.created[0],
    issued = await call(`/api/people/${manualId}/invitation`, {}),
    inviteToken = new URLSearchParams(
      new URL(issued.data.url).hash.slice(1),
    ).get("invite");
  const systemNow = Date.now();
  await page.clock.install({ time: systemNow });
  await page.clock.setSystemTime(systemNow + 73 * 3600000);
  assert.equal((await call(`/api/invites/${inviteToken}`)).status, 410);
  const refreshed = await call(`/api/people/${manualId}/invitation`, {
    reissue: true,
  });
  assert.equal(refreshed.status, 200);
  assert.notEqual(refreshed.data.url, issued.data.url);
  await page.clock.setSystemTime(systemNow);
  // Inquiry and reply use the same local record and survive switching roles.
  await role("member", imported.id);
  s = await state();
  next = structuredClone(s);
  const mid = crypto.randomUUID();
  next.messages.unshift({
    id: mid,
    personId: imported.id,
    project: "SFA",
    task: "O02",
    title: "계정 문의",
    body: "진행 확인 부탁드립니다.",
    reply: "",
    status: "접수",
    date: "시연",
  });
  assert.equal(
    (await call("/api/state", { operations: statePatch(s, next) }, "PATCH"))
      .status,
    200,
  );
  await role("pmo");
  s = await state();
  next = structuredClone(s);
  Object.assign(
    next.messages.find((m) => m.id === mid),
    { reply: "신청 진행 중입니다.", status: "답변완료" },
  );
  assert.equal(
    (await call("/api/state", { operations: statePatch(s, next) }, "PATCH"))
      .status,
    200,
  );
  await role("member", imported.id);
  assert.equal(
    (await state()).messages.find((m) => m.id === mid).reply,
    "신청 진행 중입니다.",
  );
  await role("pmo");
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "시연 화면을 종료했습니다.",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "PMO로 시작", exact: true }).click();
  await expect(page.locator(".sidebar")).toBeVisible();
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: "artifacts/offline-full-desktop.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpected, []);
  console.log(
    "Full offline HTML: XLSX import/reupload, same-record invite/reissue/registration, role scope, account prerequisites, document signature/submission/approval, certificate original, ZIP/Excel downloads, custom task, reload, backup/reset/restore, B year-only/same-name import, expired invite, inquiry reply, logout/re-entry all passed with network disabled.",
  );
} catch (e) {
  await page.screenshot({
    path: "artifacts/offline-failure.png",
    fullPage: true,
  });
  console.error("Browser errors:", errors, "Unexpected network:", unexpected);
  throw e;
} finally {
  await browser.close();
}
