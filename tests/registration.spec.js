import ExcelJS from "exceljs";
import { mkdir } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import path from "node:path";
async function login(page, scope = "PMO") {
  await page.goto("/");
  await page.getByLabel("로그인 역할").selectOption(scope);
  await page
    .getByLabel("관리자 비밀번호")
    .fill(
      scope === "PMO"
        ? "browser-admin"
        : scope === "SFA"
          ? "browser-sfa"
          : "browser-gw",
    );
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page.locator(".sidebar")).toBeVisible();
}
async function roster(page) {
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "인원 명단", exact: true })
    .click();
}
async function importFile(page, kind, project = "SFA") {
  await roster(page);
  await page
    .getByRole("button", { name: "인력계획서 불러오기", exact: true })
    .click();
  const modal = page.getByRole("dialog");
  await modal.getByLabel("불러오기 프로젝트").selectOption(project);
  await modal
    .getByLabel("인력계획서 파일")
    .setInputFiles(path.resolve(`public/examples/인력계획서_${kind}.xlsx`));
  await expect(modal).toContainText("AI 미연결");
  await modal.getByRole("button", { name: "매핑 적용 · 미리보기" }).click();
  await expect(modal).toContainText("등록 미리보기");
  return modal;
}
async function confirm(modal, count) {
  await modal
    .getByLabel("시트·헤더·열 매핑과 선택한 행을 확인했습니다.")
    .check();
  await modal
    .getByRole("button", { name: `${count}행 확정 · 서버 저장` })
    .click();
  await expect(modal).not.toBeVisible();
}
async function issue(page, name) {
  await roster(page);
  await page.locator("tbody tr").filter({ hasText: name }).first().click();
  let modal = page.getByRole("dialog");
  await expect(modal).toContainText("본인 등록 대기");
  await modal.getByRole("button", { name: "초대 링크 생성·복사" }).click();
  modal = page.getByRole("dialog");
  await modal
    .getByRole("button", { name: "초대 링크 생성", exact: true })
    .click();
  const input = modal.getByLabel(`${name} 초대 링크`);
  await expect(input).toBeVisible();
  return input.inputValue();
}
test("A import → invitation in independent browser → same record registered → document/education share server originals", async ({
  page,
  browser,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page);
  await expect(page.locator(".sidebar")).not.toContainText("좌석");
  await expect(
    page.getByRole("button", { name: "수행사 본인 등록", exact: true }),
  ).toHaveCount(0);
  let modal = await importFile(page, "A");
  await expect(modal.getByLabel("2행 이름")).toHaveValue("김하늘");
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({
    path: "artifacts/import-review.png",
    fullPage: true,
  });
  await expect(modal.getByLabel("2행 생년월일")).toHaveValue("1994-03-14");
  await confirm(modal, 2);
  const before = await (await page.request.get("/api/state")).json();
  const id = before.state.people.find((p) => p.name === "김하늘").id;
  const link = await issue(page, "김하늘");
  await page.getByRole("dialog").getByLabel("닫기", { exact: true }).click();
  const memberContext = await browser.newContext(),
    member = await memberContext.newPage();
  member.on("pageerror", (e) => errors.push(e.message));
  await member.goto(link);
  await expect(
    member.getByRole("heading", { name: "내 등록 이어하기", exact: true }),
  ).toBeVisible();
  await member.screenshot({
    path: "artifacts/invite-registration.png",
    fullPage: true,
  });
  await expect(member.getByLabel("생년월일", { exact: true })).toHaveValue(
    "1994-03-14",
  );
  await member.getByLabel("연락처", { exact: true }).fill("01012345678");
  await member
    .getByLabel("투입 예정 시작일 *", { exact: true })
    .fill("2026-11-17");
  await member
    .getByLabel("투입 예정 종료일 *", { exact: true })
    .fill("2027-06-30");
  await member
    .getByLabel("위 기본 정보가 본인의 정보임을 확인했습니다.")
    .check();
  await member.getByRole("button", { name: "등록 완료하고 준비 시작" }).click();
  await expect(member.locator(".sidebar")).toBeVisible();
  await expect(member.locator(".sidebar")).not.toContainText("좌석");
  await member.reload();
  await expect(member.locator(".sidebar")).toBeVisible();
  await page.reload();
  await roster(page);
  await expect(
    page.locator("tbody tr").filter({ hasText: "김하늘" }),
  ).toContainText("등록 완료");
  const after = await (await page.request.get("/api/state")).json();
  expect(after.state.people.find((p) => p.name === "김하늘").id).toBe(id);
  expect(after.state.people).toHaveLength(2);
  // Existing document UI and approval now use the shared server DB.
  await member
    .locator(".sidebar")
    .getByRole("button", { name: "서류", exact: true })
    .click();
  await member.locator(".document-tile").first().getByRole("button").click();
  modal = member.getByRole("dialog");
  await expect(modal).toContainText("AI 작성 가이드");
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
  await modal.getByLabel("닫기", { exact: true }).click();
  const shared = await (await page.request.get("/api/state")).json();
  const record = shared.state.people.find((p) => p.id === id);
  expect(record.files.O10.storageId).toBeTruthy();
  expect(record.tasks.O10).toBe("review");
  const original = await page.request.get(
    `/api/files/${record.files.O10.storageId}`,
  );
  expect(original.ok()).toBeTruthy();
  expect(await original.text()).toContain("김하늘");
  await roster(page);
  await page.locator("tbody tr").filter({ hasText: "김하늘" }).click();
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
    .poll(async () => {
      const result = await (await page.request.get("/api/state")).json();
      return result.state.people.find((p) => p.id === id).tasks.O10;
    })
    .toBe("done");

  await member
    .locator(".sidebar")
    .getByRole("button", { name: "교육", exact: true })
    .click();
  await member
    .locator(".education-card")
    .first()
    .getByRole("button", { name: "수료증 등록", exact: true })
    .click();
  await member
    .getByRole("dialog")
    .locator("input[type=file]")
    .setInputFiles({
      name: "certificate.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 browser certificate"),
    });
  await expect(member.getByRole("dialog")).toContainText("완료");
  await member.getByRole("dialog").getByLabel("닫기", { exact: true }).click();
  await expect
    .poll(async () => {
      const education = await (await page.request.get("/api/state")).json();
      return education.state.people.find((p) => p.id === id).tasks.O08;
    })
    .toBe("done");
  // Reopening consumed link in a third browser is rejected.
  const other = await browser.newContext(),
    otherPage = await other.newPage();
  await otherPage.goto(link);
  await expect(otherPage.getByRole("alert")).toContainText(
    /등록을 마친|이미 등록/,
  );
  await other.close();
  await memberContext.close();
  expect(errors).toEqual([]);
});
test("B title/header mapping, same-name decisions, year review, exclusion/edit and reupload do not duplicate", async ({
  page,
  browser,
}) => {
  await login(page);
  let modal = await importFile(page, "B", "그룹웨어");
  await expect(modal.getByLabel("헤더 행")).toHaveValue("3");
  await expect(modal).toContainText("생년만 있음 · 월/일 확인 필요");
  await modal.getByLabel("4행 등록 방식").selectOption("new");
  await modal.getByLabel("5행 등록 방식").selectOption("new");
  await modal.getByLabel("확인 필요 사항 검토함").nth(0).check();
  await modal.getByLabel("확인 필요 사항 검토함").nth(1).check();
  await confirm(modal, 2);
  let state = await (await page.request.get("/api/state")).json();
  const people = state.state.people.filter((p) => p.project === "그룹웨어");
  expect(people).toHaveLength(2);
  expect(people[0].birthDate).toBeNull();
  expect(people[0].birthYear).toBe(1996);
  expect(people[0].id).not.toBe(people[1].id);
  modal = await importFile(page, "B", "그룹웨어");
  await expect(modal).toContainText("이미 확정됨 · 재사용");
  await confirm(modal, 2);
  state = await (await page.request.get("/api/state")).json();
  expect(
    state.state.people.filter((p) => p.project === "그룹웨어"),
  ).toHaveLength(2);
  const link = await issue(page, "박서연");
  modal = page.getByRole("dialog");
  await modal.getByRole("button", { name: "재발급", exact: true }).click();
  await expect(modal.getByLabel("박서연 초대 링크")).not.toHaveValue(link);
  const newLink = await modal.getByLabel("박서연 초대 링크").inputValue();
  const context = await browser.newContext(),
    member = await context.newPage();
  await member.goto(link);
  await expect(member.getByRole("alert")).toContainText("재발급으로 종료");
  await member.goto(newLink);
  await expect(member.getByLabel("생년월일", { exact: true })).toHaveValue("");
  await member.getByLabel("생년월일", { exact: true }).fill("1996-04-12");
  await member.getByLabel("연락처", { exact: true }).fill("01099887766");
  await member
    .getByLabel("투입 예정 종료일 *", { exact: true })
    .fill("2027-06-30");
  await member
    .getByLabel("위 기본 정보가 본인의 정보임을 확인했습니다.")
    .check();
  await member.getByRole("button", { name: "등록 완료하고 준비 시작" }).click();
  await expect(member.locator(".sidebar")).toBeVisible();
  await context.close();
});
test("project manager permissions, all pages and link-only start render without errors", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page, "SFA");
  await expect(page.getByLabel("주관사 역할 선택")).toBeDisabled();
  await roster(page);
  await expect(
    page.getByRole("button", { name: "인력계획서 불러오기", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator("tbody")).not.toContainText("그룹웨어");
  await page.getByRole("button", { name: "인원 등록", exact: true }).click();
  const manual = page.getByRole("dialog");
  await manual.getByLabel("성명 *", { exact: true }).fill("수동 대기");
  await manual
    .getByLabel("소속 수행사 *", { exact: true })
    .fill("직접등록 회사");
  await manual
    .getByRole("button", { name: "본인 등록 대기로 저장", exact: true })
    .click();
  await expect(manual).not.toBeVisible();
  await expect(
    page.locator("tbody tr").filter({ hasText: "수동 대기" }),
  ).toContainText("본인 등록 대기");

  for (const name of [
    "준비 작업",
    "교육·서류 검토",
    "문의·알림",
    "운영 기준",
  ]) {
    await page
      .locator(".sidebar")
      .getByRole("button", { name, exact: true })
      .click();
    await expect(page.locator("h1")).toBeVisible();
  }
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await page
    .getByRole("button", { name: "내 등록 이어하기", exact: true })
    .click();
  await expect(page.getByLabel("개인 초대 링크")).toBeVisible();
  expect(errors).toEqual([]);
});

test("manual sheet/header/column mapping, editable values and row exclusion work in UI", async ({
  page,
}) => {
  await login(page);
  await roster(page);
  await page
    .getByRole("button", { name: "인력계획서 불러오기", exact: true })
    .click();
  const modal = page.getByRole("dialog"),
    wb = new ExcelJS.Workbook();
  wb.addWorksheet("요약").addRow(["요약만"]);
  const sheet = wb.addWorksheet("원본");
  sheet.addRow(["계약 원본"]);
  sheet.addRow(["인력 정보", "출생 정보", "파트너"]);
  sheet.addRow(["수정전", "1997-02-18", "예시회사"]);
  sheet.addRow(["제외인원", "1991-01-01", "제외회사"]);
  await modal.getByLabel("인력계획서 파일").setInputFiles({
    name: "manual.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from(await wb.xlsx.writeBuffer()),
  });
  await expect(modal).toContainText("AI 미연결");
  await modal.getByLabel("데이터 시트").selectOption("1");
  await modal.getByLabel("헤더 행").fill("2");
  await modal.getByLabel("소속회사 열").selectOption("3");
  await modal.getByLabel("이름 열").selectOption("1");
  await modal.getByLabel("생년월일 열").selectOption("2");
  await modal.getByRole("button", { name: "매핑 적용 · 미리보기" }).click();
  await modal.getByLabel("3행 이름").fill("김하늘");
  await expect(
    modal.getByLabel("3행 등록 방식").locator('option[value="existing"]'),
  ).toHaveCount(1);
  await modal.getByLabel("3행 이름").fill("수정후");
  await modal.getByLabel("3행 등록 방식").selectOption("new");
  await modal.getByLabel("4행 등록", { exact: true }).uncheck();
  await confirm(modal, 1);
  await expect(page.locator("tbody")).toContainText("수정후");
  await expect(page.locator("tbody")).not.toContainText("제외인원");
});
