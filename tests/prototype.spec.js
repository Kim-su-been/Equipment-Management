import { test, expect } from "@playwright/test";
const pdf = {
  name: "시연용_수료증.pdf",
  mimeType: "application/pdf",
  buffer: Buffer.from("%PDF-1.4\n% demo fixture\n%%EOF"),
};
test.beforeEach(async ({ page }) => {
  await page.goto("/");
});
test("all administrator and member pages render; role scopes are respected", async ({
  page,
}) => {
  for (const name of [
    "인원 명단",
    "준비 작업",
    "교육·서류 검토",
    "좌석 관리",
    "문의·알림",
    "운영 기준",
  ]) {
    await page
      .locator(".sidebar")
      .getByRole("button", { name, exact: true })
      .click();
    await expect(page.locator("h1")).toBeVisible();
  }
  await page.getByLabel("주관사 역할 선택").selectOption("SFA");
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "인원 명단", exact: true })
    .click();
  await expect(page.locator("tbody tr")).toHaveCount(5);
  await expect(page.locator("tbody")).not.toContainText("GW-");
  await page.getByLabel("주관사 역할 선택").selectOption("그룹웨어");
  await expect(page.locator("tbody tr")).toHaveCount(5);
  await expect(page.locator("tbody")).not.toContainText("SFA-");
  await page
    .locator(".mode-switch")
    .getByRole("button", { name: "수행사", exact: true })
    .click();
  for (const name of [
    "나의 작업",
    "교육",
    "서류",
    "내 좌석",
    "문의·변경 요청",
  ]) {
    await page
      .locator(".sidebar")
      .getByRole("button", { name, exact: true })
      .click();
    await expect(page.locator("h1")).toBeVisible();
  }
  await expect(page.locator(".sidebar")).not.toContainText("좌석 관리");
});
test("administrator completion unlocks member account confirmation", async ({
  page,
}) => {
  await page.getByLabel("주관사 역할 선택").selectOption("SFA");
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "인원 명단", exact: true })
    .click();
  await page.locator("tbody tr").filter({ hasText: "SFA-4" }).click();
  for (const title of [
    "eGIS 발급·사용 가능 확인",
    "두레이 발급·사용 가능 확인",
  ]) {
    const row = page.locator(".task-row").filter({ hasText: title });
    await row.getByRole("button", { name: "완료 확인", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "완료 확인", exact: true })
      .click();
    await page.locator("tbody tr").filter({ hasText: "SFA-4" }).click();
  }
  await page.getByRole("dialog").getByLabel("닫기", { exact: true }).click();
  await page
    .locator(".mode-switch")
    .getByRole("button", { name: "수행사", exact: true })
    .click();
  await page.getByLabel("수행사 인원 선택").selectOption("SFA-4");
  await expect(
    page.locator(".next-row").filter({ hasText: "계정 최초 접속" }),
  ).toContainText("실행 가능");
});
test("certificate registration marks education complete and persists after reload", async ({
  page,
}) => {
  await page
    .locator(".mode-switch")
    .getByRole("button", { name: "수행사", exact: true })
    .click();
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "교육", exact: true })
    .click();
  await page
    .locator(".education-card")
    .first()
    .getByRole("button", { name: "수료증 등록", exact: true })
    .click();
  await page.getByRole("dialog").locator("input[type=file]").setInputFiles(pdf);
  await expect(page.getByRole("dialog")).toContainText("시연용_수료증.pdf");
  await page.getByRole("dialog").getByLabel("닫기", { exact: true }).click();
  await expect(page.locator(".education-card").first()).toContainText(
    "완료 · 수료증 등록",
  );
  await page.reload();
  await page
    .locator(".mode-switch")
    .getByRole("button", { name: "수행사", exact: true })
    .click();
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "교육", exact: true })
    .click();
  await expect(page.locator(".education-card").first()).toContainText(
    "완료 · 수료증 등록",
  );
});
test("AI mock hands a document to the correct manager and supports rework", async ({
  page,
}) => {
  await page
    .locator(".mode-switch")
    .getByRole("button", { name: "수행사", exact: true })
    .click();
  await page.getByLabel("수행사 인원 선택").selectOption("SFA-2");
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "서류", exact: true })
    .click();
  await page.locator(".document-tile").first().getByRole("button").click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "시연 결과 보기", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("확인 요청");
  await page.getByRole("dialog").getByLabel("닫기", { exact: true }).click();
  await page
    .locator(".mode-switch")
    .getByRole("button", { name: "주관사", exact: true })
    .click();
  await page.getByLabel("주관사 역할 선택").selectOption("SFA");
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "교육·서류 검토", exact: true })
    .click();
  await page
    .locator("tbody tr")
    .filter({ hasText: "보안서약서" })
    .filter({ hasText: "SFA-2" })
    .click();
  await page
    .getByRole("dialog")
    .getByPlaceholder("확인 결과 또는 보완할 내용을 입력해 주세요.")
    .fill("본인 서명을 추가해 주세요.");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "보완 요청", exact: true })
    .click();
  await page
    .locator(".mode-switch")
    .getByRole("button", { name: "수행사", exact: true })
    .click();
  await page.getByLabel("수행사 인원 선택").selectOption("SFA-2");
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "서류", exact: true })
    .click();
  await expect(page.locator(".document-tile").first()).toContainText(
    "본인 서명을 추가해 주세요.",
  );
});
test("shared seat layout adds versions, syncs other tabs and preserves history", async ({
  page,
  context,
}) => {
  await page.getByLabel("주관사 역할 선택").selectOption("SFA");
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "좌석 관리", exact: true })
    .click();
  const other = await context.newPage();
  await other.goto("/");
  await other.getByLabel("주관사 역할 선택").selectOption("그룹웨어");
  await other
    .locator(".sidebar")
    .getByRole("button", { name: "좌석 관리", exact: true })
    .click();
  await page.getByRole("button", { name: "A-02 미배정", exact: true }).click();
  await page.getByRole("button", { name: "인원 배정", exact: true }).click();
  await page
    .getByRole("dialog")
    .locator("select")
    .first()
    .selectOption("SFA-3");
  await page
    .getByRole("dialog")
    .getByPlaceholder("예: 신규 투입으로 좌석 배정")
    .fill("시연 신규 배정");
  await page.getByRole("button", { name: "배정 확정", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "A-02 SFA-3", exact: true }),
  ).toBeVisible();
  await expect(
    other.getByRole("button", { name: "A-02 미배정", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".seat-status-bar")).toContainText("최신 v4");
  await page
    .locator(".seat-save-bar")
    .getByRole("button", { name: "변경 저장", exact: true })
    .click();
  await expect(
    other.getByRole("button", { name: "A-02 SFA-3", exact: true }),
  ).toBeVisible();
  await expect(other.locator(".seat-status-bar")).toContainText("최신 v5");
  await other.getByRole("button", { name: "A-02 SFA-3", exact: true }).click();
  await expect(other.getByRole("dialog")).toContainText(
    "다른 프로젝트 인원의 배정은 PMO만",
  );
  await expect(
    other.getByRole("button", { name: "배정 해제", exact: true }),
  ).toHaveCount(0);
  await other.getByRole("dialog").getByLabel("닫기", { exact: true }).click();
  await page.locator(".version-item").filter({ hasText: "v4" }).click();
  await expect(
    page.getByRole("button", { name: "A-02 미배정", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".historical-banner")).toContainText(
    "변경할 수 없습니다.",
  );
  await other.close();
});
test("inquiry, answer and AI demo panel work across roles", async ({
  page,
}) => {
  await page
    .locator(".mode-switch")
    .getByRole("button", { name: "수행사", exact: true })
    .click();
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "문의·변경 요청", exact: true })
    .click();
  await page.getByRole("button", { name: "새 문의", exact: true }).click();
  await page
    .getByPlaceholder("문의 내용을 짧게 적어주세요")
    .fill("교육 일정 문의");
  await page
    .getByPlaceholder("담당자가 확인할 내용을 입력해 주세요.")
    .fill("수료증을 언제까지 등록해야 하나요?");
  await page.getByRole("button", { name: "문의 접수", exact: true }).click();
  await expect(page.locator(".message-list")).toContainText("교육 일정 문의");
  await page
    .locator(".mode-switch")
    .getByRole("button", { name: "주관사", exact: true })
    .click();
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "문의·알림", exact: true })
    .click();
  await page
    .locator(".message-row")
    .filter({ hasText: "교육 일정 문의" })
    .click();
  await page
    .getByPlaceholder("문의에 대한 답변을 입력하세요.")
    .fill("투입 시작 전 등록해 주세요.");
  await page.getByRole("button", { name: "답변 저장", exact: true }).click();
  await page.getByRole("button", { name: "AI 도우미", exact: true }).click();
  await page
    .getByRole("button", {
      name: "현재 준비 미완료 현황을 요약해 줘",
      exact: true,
    })
    .click();
  await expect(page.locator(".chat-message.assistant")).toContainText(
    "현재 조회 범위",
  );
  await expect(page.locator(".ai-demo-label")).toContainText(
    "실제 AI 모델 미연동",
  );
});
test("mobile menus and layout have no document overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("메뉴 열기").click();
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "좌석 관리", exact: true })
    .click();
  await expect(page.locator("h1")).toHaveText("좌석 관리");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({ path: "artifacts/mobile-seats.png", fullPage: true });
});

test("Excel template, validation, import and export are functional", async ({
  page,
}) => {
  await page.getByRole("button", { name: "인원 등록", exact: true }).click();
  const event = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "템플릿 다운로드", exact: true })
    .click();
  const downloaded = await event;
  const { readFile } = await import("node:fs/promises");
  const buffer = await readFile(await downloaded.path());
  await page.getByRole("dialog").locator("input[type=file]").setInputFiles({
    name: "인원등록.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer,
  });
  await expect(page.getByRole("dialog")).toContainText("검증 완료");
  await page
    .getByRole("button", { name: "등록 확정 · 1명", exact: true })
    .click();
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "인원 명단", exact: true })
    .click();
  await expect(page.locator("tbody tr")).toHaveCount(11);
  await expect(page.locator("tbody")).toContainText("샘플-1");
  const exportEvent = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "엑셀 내보내기", exact: true })
    .click();
  const exported = await exportEvent;
  expect(exported.suggestedFilename()).toContain("인원현황.xlsx");
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await readFile(await exported.path()));
  expect(wb.worksheets[0].rowCount).toBe(12);
});
test("search retains keyboard focus and filters without losing typed text", async ({
  page,
}) => {
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "인원 명단", exact: true })
    .click();
  const search = page.getByLabel("이름, 소속, 역할 검색");
  await search.click();
  await search.pressSequentially("SFA-3", { delay: 80 });
  await expect(search).toHaveValue("SFA-3");
  await expect(search).toBeFocused();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody")).toContainText("SFA-3");
});
test("certificate rework resets completion and reaches the member", async ({
  page,
}) => {
  await page.getByLabel("주관사 역할 선택").selectOption("SFA");
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "교육·서류 검토", exact: true })
    .click();
  await page
    .locator("tbody tr")
    .filter({ hasText: "정보보안 교육" })
    .filter({ hasText: "SFA-2" })
    .click();
  await page
    .getByRole("dialog")
    .getByPlaceholder("확인 결과 또는 보완할 내용을 입력해 주세요.")
    .fill("교육명이 다른 수료증입니다. 다시 등록해 주세요.");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "보완 요청", exact: true })
    .click();
  await page
    .locator(".mode-switch")
    .getByRole("button", { name: "수행사", exact: true })
    .click();
  await page.getByLabel("수행사 인원 선택").selectOption("SFA-2");
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "교육", exact: true })
    .click();
  await expect(page.locator(".education-card").first()).toContainText("미완료");
});

test("dragging a seat moves the person and updates shared version history", async ({
  page,
  context,
}) => {
  await page.getByLabel("주관사 역할 선택").selectOption("SFA");
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "좌석 관리", exact: true })
    .click();
  const other = await context.newPage();
  await other.goto("/");
  await other.getByLabel("주관사 역할 선택").selectOption("그룹웨어");
  await other
    .locator(".sidebar")
    .getByRole("button", { name: "좌석 관리", exact: true })
    .click();
  const source = page.getByRole("button", { name: "A-01 SFA-1", exact: true });
  await expect(source).toHaveAttribute("draggable", "true");
  await source.dragTo(
    page.getByRole("button", { name: "A-04 미배정", exact: true }),
  );
  await expect(
    page.getByRole("button", { name: "A-04 SFA-1", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "A-01 미배정", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".seat-status-bar")).toContainText("최신 v4");
  await expect(
    other.getByRole("button", { name: "A-01 SFA-1", exact: true }),
  ).toBeVisible();
  await page
    .locator(".seat-save-bar")
    .getByRole("button", { name: "변경 저장", exact: true })
    .click();
  await expect(page.locator(".versions-card")).toContainText("1건 변경 저장");
  await expect(page.locator(".seat-status-bar")).toContainText("최신 v5");
  await expect(
    other.getByRole("button", { name: "A-04 SFA-1", exact: true }),
  ).toBeVisible();
  await expect(
    other.getByRole("button", { name: "A-04 SFA-1", exact: true }),
  ).toHaveAttribute("draggable", "false");
  await page.locator(".version-item").filter({ hasText: "v4" }).click();
  await expect(
    page.getByRole("button", { name: "A-01 SFA-1", exact: true }),
  ).toHaveAttribute("draggable", "false");
  await expect(
    page.getByRole("button", { name: "A-04 미배정", exact: true }),
  ).toBeVisible();
  await other.close();
});
test("occupied destinations cannot be replaced by a drag", async ({ page }) => {
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "좌석 관리", exact: true })
    .click();
  await page
    .getByRole("button", { name: "A-01 SFA-1", exact: true })
    .dragTo(page.getByRole("button", { name: "B-01 GW-1", exact: true }));
  await expect(
    page.getByRole("button", { name: "A-01 SFA-1", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "B-01 GW-1", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".seat-status-bar")).toContainText("최신 v4");
});

test("multiple drag edits are saved as one version and cancel preserves the original", async ({
  page,
}) => {
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "좌석 관리", exact: true })
    .click();
  await page
    .getByRole("button", { name: "A-01 SFA-1", exact: true })
    .dragTo(page.getByRole("button", { name: "A-04 미배정", exact: true }));
  await page
    .getByRole("button", { name: "B-01 GW-1", exact: true })
    .dragTo(page.getByRole("button", { name: "B-03 미배정", exact: true }));
  await expect(page.locator(".version-item")).toHaveCount(4);
  await expect(page.locator(".seat-draft-banner")).toContainText(
    "2건의 변경사항",
  );
  await page.getByRole("button", { name: "변경 취소", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "임시 변경 취소", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "A-01 SFA-1", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".version-item")).toHaveCount(4);
  await expect(
    page
      .locator(".seat-save-bar")
      .getByRole("button", { name: "변경 저장", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "A-01 SFA-1", exact: true })
    .dragTo(page.getByRole("button", { name: "A-04 미배정", exact: true }));
  await page
    .getByRole("button", { name: "B-01 GW-1", exact: true })
    .dragTo(page.getByRole("button", { name: "B-03 미배정", exact: true }));
  await page
    .locator(".seat-save-bar")
    .getByRole("button", { name: "변경 저장", exact: true })
    .click();
  await expect(page.locator(".version-item")).toHaveCount(5);
  await expect(page.locator(".versions-card")).toContainText("2건 변경 저장");
  await page.locator(".version-item").filter({ hasText: "v4" }).click();
  await expect(
    page.getByRole("button", { name: "A-01 SFA-1", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "B-01 GW-1", exact: true }),
  ).toBeVisible();
});
test("concurrent save retains the local draft and prevents a stale overwrite", async ({
  page,
  context,
}) => {
  await page.getByLabel("주관사 역할 선택").selectOption("SFA");
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "좌석 관리", exact: true })
    .click();
  await page
    .getByRole("button", { name: "A-01 SFA-1", exact: true })
    .dragTo(page.getByRole("button", { name: "A-04 미배정", exact: true }));
  const other = await context.newPage();
  await other.goto("/");
  await other.getByLabel("주관사 역할 선택").selectOption("그룹웨어");
  await other
    .locator(".sidebar")
    .getByRole("button", { name: "좌석 관리", exact: true })
    .click();
  await other
    .getByRole("button", { name: "B-01 GW-1", exact: true })
    .dragTo(other.getByRole("button", { name: "B-03 미배정", exact: true }));
  await other
    .locator(".seat-save-bar")
    .getByRole("button", { name: "변경 저장", exact: true })
    .click();
  await expect(page.locator(".seat-draft-banner")).toContainText(
    "다른 관리자가",
  );
  await page
    .locator(".seat-save-bar")
    .getByRole("button", { name: "변경 저장", exact: true })
    .click();
  await expect(page.locator(".version-item")).toHaveCount(5);
  await expect(
    page.getByRole("button", { name: "A-04 SFA-1", exact: true }),
  ).toBeVisible();
  await expect(
    other.getByRole("button", { name: "A-01 SFA-1", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "변경 취소", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "임시 변경 취소", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "A-01 SFA-1", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "B-03 GW-1", exact: true }),
  ).toBeVisible();
  await other.close();
});

test("release and offboarding stay staged until the seat Save action", async ({
  page,
}) => {
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "좌석 관리", exact: true })
    .click();
  await page.getByRole("button", { name: "A-01 SFA-1", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "배정 해제", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "A-01 미배정", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".version-item")).toHaveCount(4);
  await page.getByRole("button", { name: "변경 취소", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "임시 변경 취소", exact: true })
    .click();
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "인원 명단", exact: true })
    .click();
  await page.locator("tbody tr").filter({ hasText: "SFA-1" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "기본 정보", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "철수 처리", exact: true })
    .click();
  for (const box of await page.getByRole("dialog").getByRole("checkbox").all())
    await box.check();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "철수 완료", exact: true })
    .click();
  await expect(page.locator("h1")).toHaveText("좌석 관리");
  await expect(page.locator(".version-item")).toHaveCount(4);
  await page
    .locator(".seat-save-bar")
    .getByRole("button", { name: "변경 저장", exact: true })
    .click();
  await expect(page.locator(".version-item")).toHaveCount(5);
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "인원 명단", exact: true })
    .click();
  await expect(
    page.locator("tbody tr").filter({ hasText: "SFA-1" }),
  ).toContainText("철수 완료");
});

test("white Woori palette and local characters render without overlapping mobile progress", async ({
  page,
}) => {
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await expect(page.locator(".dashboard-welcome")).toContainText(
    "한눈에 보는 투입 현황",
  );
  await expect(page.locator(".dashboard-welcome > .btn")).toHaveCSS(
    "background-color",
    "rgb(0, 103, 172)",
  );
  const cast = page.locator(".welcome-visual img");
  await expect(cast).toBeVisible();
  expect(
    await cast.evaluate((image) => image.complete && image.naturalWidth > 0),
  ).toBeTruthy();
  await page
    .locator(".mode-switch")
    .getByRole("button", { name: "수행사", exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const progress = await page.locator(".hero-progress").boundingBox(),
    characters = await page.locator(".member-cast").boundingBox();
  expect(characters.y).toBeGreaterThanOrEqual(progress.y + progress.height);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
});
