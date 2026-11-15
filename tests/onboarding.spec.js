import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import ExcelJS from "exceljs";
import JSZip from "jszip";
const profile = {
  name: "홍길동",
  company: "테스트 수행사",
  phone: "01012345678",
  email: "hong@demo.example",
};
async function register(page, project = "SFA") {
  await page.goto("/");
  await page
    .getByRole("button", { name: "수행사 본인 등록", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  for (const [label, key] of [
    ["이름 *", "name"],
    ["소속 수행사 *", "company"],
    ["연락처 *", "phone"],
    ["업무용 이메일 *", "email"],
  ])
    await dialog.getByLabel(label, { exact: true }).fill(profile[key]);
  await dialog.getByLabel("등록 프로젝트").selectOption(project);
  await dialog
    .getByRole("button", { name: "등록하고 준비 시작", exact: true })
    .click();
  await expect(page.locator("h1")).toContainText(profile.name);
}
async function navigate(page, name) {
  await page
    .locator(".sidebar")
    .getByRole("button", { name, exact: true })
    .click();
}
async function openDocument(page, id = "O10") {
  await navigate(page, "서류");
  await page
    .locator(".document-tile")
    .nth(id === "O10" ? 0 : 1)
    .getByRole("button")
    .click();
  await expect(page.getByRole("dialog")).toContainText("AI 작성 가이드");
}
async function fillAndVerify(page, consent) {
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("위 중요 조항을 모두 읽었습니다. *", { exact: true })
    .check();
  if (consent) await dialog.getByLabel(consent, { exact: true }).check();
  await dialog
    .getByLabel("작성 내용과 확인 항목을 검토했습니다. *", { exact: true })
    .check();
  await dialog
    .getByLabel("본인 입력 서명 *", { exact: true })
    .fill(profile.name);
  await dialog
    .getByRole("button", { name: "시연 확인번호 요청", exact: true })
    .click();
  await dialog.getByLabel("시연 확인번호", { exact: true }).fill("135790");
  await dialog
    .getByRole("button", { name: "시연 본인확인", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "서류 제출", exact: true }),
  ).toBeEnabled();
}
async function submit(page) {
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "서류 제출", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("담당자 확인 요청");
}
async function close(page) {
  await page.getByRole("dialog").getByLabel("닫기", { exact: true }).click();
}
async function admin(page, scope = "SFA") {
  await page
    .locator(".mode-switch")
    .getByRole("button", { name: "주관사", exact: true })
    .click();
  await page.getByLabel("주관사 역할 선택").selectOption(scope);
}

test("self registration immediately assigns education/documents and is visible to the correct manager", async ({
  page,
}) => {
  await register(page);
  await navigate(page, "내 정보");
  await expect(page.locator(".member-profile")).toContainText(profile.phone);
  await navigate(page, "교육");
  await expect(page.locator(".education-card")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "수료증 등록", exact: true }).first(),
  ).toBeEnabled();
  await navigate(page, "서류");
  await expect(page.locator(".document-tile")).toHaveCount(2);
  await admin(page);
  await navigate(page, "인원 명단");
  await expect(page.locator("tbody")).toContainText("SFA-6");
  await page.getByLabel("주관사 역할 선택").selectOption("그룹웨어");
  await expect(page.locator("tbody")).not.toContainText("SFA-6");
});

test("online form blocks missing fields, saves draft, binds demo verification and hands off to manager", async ({
  page,
}) => {
  await register(page);
  await openDocument(page);
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("button", { name: "서류 제출", exact: true }),
  ).toBeDisabled();
  await dialog
    .getByLabel("본인 입력 서명 *", { exact: true })
    .fill(profile.name);
  await dialog.getByRole("button", { name: "임시 저장", exact: true }).click();
  await close(page);
  await openDocument(page);
  await expect(
    page.getByRole("dialog").getByLabel("본인 입력 서명 *", { exact: true }),
  ).toHaveValue(profile.name);
  await fillAndVerify(page);
  await dialog
    .getByLabel("위 중요 조항을 모두 읽었습니다. *", { exact: true })
    .uncheck();
  await expect(
    dialog.getByRole("button", { name: "서류 제출", exact: true }),
  ).toBeDisabled();
  await fillAndVerify(page);
  await submit(page);
  await close(page);
  await admin(page);
  await navigate(page, "교육·서류 검토");
  await page.locator("tbody tr").filter({ hasText: "SFA-6" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "시연 확인 · 실제 인증 아님",
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "승인", exact: true })
    .click();
  await expect(
    page.locator("tbody tr").filter({ hasText: "SFA-6" }),
  ).toContainText("완료");
});

test("ZIP download contains the actual online original and manifest after reload, with project restrictions", async ({
  page,
}) => {
  await register(page);
  await openDocument(page);
  await fillAndVerify(page);
  await submit(page);
  await close(page);
  await page.reload();
  await page.getByLabel("주관사 역할 선택").selectOption("SFA");
  await navigate(page, "교육·서류 검토");
  const manager = page.locator(".evidence-manager");
  await manager
    .getByLabel("SFA-6 O10 v1 원본 선택", {
      exact: true,
    })
    .check();
  const downloadEvent = page.waitForEvent("download");
  await manager
    .getByRole("button", { name: "선택 다운로드 (1)", exact: true })
    .click();
  const download = await downloadEvent;
  const zip = await JSZip.loadAsync(await readFile(await download.path()));
  const manifest = JSON.parse(await zip.file("제출현황.json").async("text"));
  expect(manifest.files).toHaveLength(1);
  expect(manifest.files[0].personId).toBe("SFA-6");
  const html = await zip.file(manifest.files[0].file).async("text");
  expect(html).toContain(profile.name);
  expect(html).toContain("실제 본인인증/전자서명 서비스 미연동");
  await page.getByLabel("주관사 역할 선택").selectOption("그룹웨어");
  await expect(page.locator(".evidence-manager")).not.toContainText("SFA-6");
});

test("consent refusal remains explicit and reviewed rather than being auto-approved", async ({
  page,
}) => {
  await register(page);
  await openDocument(page, "O11");
  await fillAndVerify(page, "동의하지 않음");
  await submit(page);
  await expect(page.getByRole("dialog")).toContainText(
    "동의하지 않음 · 담당자 확인 필요",
  );
  await close(page);
  await admin(page);
  await navigate(page, "교육·서류 검토");
  await expect(
    page.locator("tbody tr").filter({ hasText: "SFA-6" }),
  ).toContainText("확인 요청");
});

test("task-specific Excel templates contain registered fields and lock the project scope", async ({
  page,
}) => {
  await register(page);
  await admin(page);
  await navigate(page, "준비 작업");
  await page
    .getByRole("button", { name: "작업 양식 다운로드", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("양식 프로젝트")).toBeDisabled();
  await dialog.getByRole("button", { name: "전체 해제", exact: true }).click();
  await dialog.getByLabel("SFA-6 양식 대상", { exact: true }).check();
  const event = page.waitForEvent("download");
  await dialog
    .getByRole("button", { name: "양식 다운로드", exact: true })
    .click();
  const download = await event;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await readFile(await download.path()));
  const sheet = workbook.getWorksheet("신청 정보");
  expect(sheet.rowCount).toBe(2);
  expect(sheet.getCell("A2").value).toBe(profile.name);
  expect(sheet.getCell("F2").value).toBe(profile.phone);
});

test("task-specific contact routes populate inquiry recipient and Dooray draft without external delivery", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("주관사 역할 선택").selectOption("SFA");
  await navigate(page, "운영 기준");
  await page.getByLabel("문의 담당 작업").selectOption("O10");
  await page.getByLabel("문의 담당자명").fill("보안 서류 담당자");
  await page.getByLabel("Dooray 수신자 ID").fill("demo-recipient");
  await page.getByRole("button", { name: "담당자 저장", exact: true }).click();
  await page
    .locator(".mode-switch")
    .getByRole("button", { name: "수행사", exact: true })
    .click();
  await navigate(page, "나의 작업");
  await page
    .getByRole("button", { name: "보안서약서 문의", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("보안 서류 담당자");
  await expect(dialog).toContainText("demo-recipient");
  await dialog
    .getByPlaceholder("문의 내용을 짧게 적어주세요")
    .fill("온라인 서명 문의");
  await dialog
    .getByPlaceholder("담당자가 확인할 내용을 입력해 주세요.")
    .fill("서명 입력 방법을 확인하고 싶습니다.");
  await expect(dialog.locator(".dooray-preview")).toContainText("보안서약서");
  await expect(dialog).toContainText("외부 메시지는 전송되지 않습니다");
  await dialog.getByRole("button", { name: "문의 접수", exact: true }).click();
  const messages = await page.evaluate(
    () => JSON.parse(localStorage.getItem("tuip-on-demo-v1")).messages,
  );
  expect(messages[0].delivery).toBe("not_connected");
  expect(messages[0].dooray.recipient).toBe("demo-recipient");
});

test("new uploaded certificate original remains available after browser reload", async ({
  page,
}) => {
  await register(page);
  await navigate(page, "교육");
  await page
    .getByRole("button", { name: "수료증 등록", exact: true })
    .first()
    .click();
  const bytes = Buffer.from("%PDF-1.4\n% original certificate\n%%EOF");
  await page.getByRole("dialog").locator("input[type=file]").setInputFiles({
    name: "원본수료증.pdf",
    mimeType: "application/pdf",
    buffer: bytes,
  });
  await expect(page.getByRole("dialog")).toContainText("원본수료증.pdf");
  await close(page);
  await page.reload();
  await page
    .locator(".mode-switch")
    .getByRole("button", { name: "수행사", exact: true })
    .click();
  await page.getByLabel("수행사 인원 선택").selectOption("SFA-6");
  await navigate(page, "교육");
  await page.getByRole("button", { name: "수료증 보기", exact: true }).click();
  const event = page.waitForEvent("download");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "원본 다운로드", exact: true })
    .click();
  const downloaded = await event;
  expect(await readFile(await downloaded.path())).toEqual(bytes);
});

test("resubmission keeps both immutable original versions available in the ZIP archive", async ({
  page,
}) => {
  await register(page);
  await openDocument(page);
  await fillAndVerify(page);
  await submit(page);
  await close(page);
  await admin(page);
  await navigate(page, "교육·서류 검토");
  await page.locator("tbody tr").filter({ hasText: "SFA-6" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "승인", exact: true })
    .click();
  await page
    .locator(".mode-switch")
    .getByRole("button", { name: "수행사", exact: true })
    .click();
  await page.getByLabel("수행사 인원 선택").selectOption("SFA-6");
  await openDocument(page);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "새 버전 작성", exact: true })
    .click();
  await fillAndVerify(page);
  await submit(page);
  await expect(page.getByRole("dialog")).toContainText("최근 제출 v2");
  await close(page);
  await admin(page);
  await navigate(page, "교육·서류 검토");
  const manager = page.locator(".evidence-manager");
  await manager.getByLabel("이전 제출 버전 포함", { exact: true }).check();
  await manager.getByLabel("SFA-6 O10 v1 원본 선택", { exact: true }).check();
  await manager.getByLabel("SFA-6 O10 v2 원본 선택", { exact: true }).check();
  const event = page.waitForEvent("download");
  await manager
    .getByRole("button", { name: "선택 다운로드 (2)", exact: true })
    .click();
  const zip = await JSZip.loadAsync(await readFile(await (await event).path()));
  const manifest = JSON.parse(await zip.file("제출현황.json").async("text"));
  expect(manifest.files.map((file) => file.version)).toEqual([1, 2]);
  expect(await zip.file(manifest.files[0].file).async("text")).toContain(
    "제출 v1",
  );
  expect(await zip.file(manifest.files[1].file).async("text")).toContain(
    "제출 v2",
  );
});

test("registration and online document remain usable at mobile width with visible submit controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await register(page);
  await page.getByLabel("메뉴 열기", { exact: true }).click();
  await navigate(page, "서류");
  await page.locator(".document-tile").first().getByRole("button").click();
  const dialog = page.getByRole("dialog");
  expect(
    await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBeTruthy();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  const submitBox = await dialog
    .getByRole("button", { name: "서류 제출", exact: true })
    .boundingBox();
  expect(submitBox.y + submitBox.height).toBeLessThanOrEqual(844);
  await fillAndVerify(page);
  await submit(page);
  await expect(dialog).toContainText("제출한 내용을 확인하세요");
});
