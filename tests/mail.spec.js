import { test, expect } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import { defaultDocument } from "../src/onboarding.js";
import { statePatch } from "../src/state-patch.js";
async function login(page, scope = "PMO") {
  await page.goto("/");
  await page.getByLabel("로그인 역할").selectOption(scope);
  await page
    .getByLabel("관리자 비밀번호")
    .fill(scope === "PMO" ? "browser-admin" : "browser-sfa");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page.locator(".sidebar")).toBeVisible();
}
async function mailPage(page) {
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "받은편지함", exact: true })
    .click();
  await expect(page.locator(".inbox-layout")).toBeVisible();
  await expect(page.locator(".mail-source-settings")).toHaveCount(0);
}
async function state(page) {
  return (await (await page.request.get("/api/state")).json()).state;
}
async function openRow(page, name) {
  await page
    .locator(".mail-inbox tbody tr")
    .filter({
      has: page.locator("td:first-child strong", {
        hasText: new RegExp(`^${name}$`),
      }),
    })
    .first()
    .getByRole("button", { name: "검토하기", exact: true })
    .click();
  await expect(page.locator(".mail-review-detail")).toBeVisible();
}
async function prepareKim(page, request) {
  const uploaded = await (
      await page.request.post("/api/imports?project=SFA", {
        headers: { "X-File-Name": "mail-phase1.xlsx" },
        data: await readFile("public/examples/메일검토_기준인력.xlsx"),
      })
    ).json(),
    mapping = {
      sheet: 0,
      headerRow: 1,
      columns: { company: 1, name: 2, birth: 3 },
    },
    preview = await (
      await page.request.post(`/api/imports/${uploaded.id}/preview`, {
        data: { mapping },
      })
    ).json(),
    commit = await (
      await page.request.post(`/api/imports/${uploaded.id}/commit`, {
        data: {
          mapping,
          mappingConfirmed: true,
          rows: preview.rows.map((r) => ({ ...r, decision: "new" })),
        },
      })
    ).json(),
    id = commit.created[0],
    invite = await (
      await page.request.post(`/api/people/${id}/invitation`, { data: {} })
    ).json(),
    token = invite.url.split("/").pop();
  const member = await request.newContext({ baseURL: "http://127.0.0.1:5181" });
  const registered = await member.post(`/api/invites/${token}`, {
    data: {
      birthDate: "1990-01-01",
      phone: "01012345678",
      start: "2026-11-23",
      end: "2027-06-30",
      confirmed: true,
    },
  });
  expect(registered.ok()).toBeTruthy();
  const resource = await registered.json(),
    file = await (
      await member.post(`/api/files?personId=${id}&taskId=O08`, {
        data: Buffer.from("%PDF-1.4 prior certificate"),
        headers: {
          "Content-Type": "application/pdf",
          "X-File-Name": "certificate.pdf",
        },
      })
    ).json(),
    next = structuredClone(resource.state);
  next.people[0].documentDrafts = {
    O10: {
      values: {
        ...defaultDocument(next.people[0], "O10"),
        read: true,
        acknowledged: true,
        signature: "김민수",
      },
      savedAt: new Date().toISOString(),
    },
  };
  next.people[0].tasks.O08 = "done";
  next.people[0].certChecks.O08 = "ai";
  next.people[0].files.O08 = {
    name: "certificate.pdf",
    storageId: file.id,
    digest: file.digest,
  };
  expect(
    (
      await member.patch("/api/state", {
        data: { operations: statePatch(resource.state, next) },
      })
    ).ok(),
  ).toBeTruthy();
  const memberStorage = await member.storageState();
  await member.dispose();
  return { id, memberStorage };
}
test("mail popup → per-person review → stale-value recheck → Kim date update / Lee-only development account / invite", async ({
  page,
  playwright,
  browser,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page);
  const { id, memberStorage } = await prepareKim(page, playwright.request);
  await mailPage(page);
  let release;
  const gate = new Promise((r) => (release = r));
  await page.route("**/api/mail/sync", async (route) => {
    if (route.request().postDataJSON()?.analyzeIds) await gate;
    await route.continue();
  });
  await page
    .locator(".mail-workspace>.page-heading")
    .getByRole("button", { name: "새 메일 확인", exact: true })
    .click();
  await expect(page.locator("[data-inbox-message]")).toHaveCount(5);
  await expect(page.locator(".inbox-toolbar")).toContainText("새 메일 분석 중");
  expect(
    (await (await page.request.get("/api/mail/inbox")).json()).requests,
  ).toHaveLength(0);
  release();
  const popup = page.getByRole("dialog", {
    name: "수행사 투입 요청 2건",
    exact: true,
  });
  await expect(popup).toBeVisible();
  await expect(popup).toContainText(
    "새 메일 5통 중 수행사 투입 관련 메일 2통을 찾았습니다.",
  );
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({
    path: "artifacts/mail-new-drafts.png",
    fullPage: true,
  });
  await popup.getByRole("button", { name: "나중에 검토", exact: true }).click();
  await expect(popup).not.toBeVisible();
  expect((await state(page)).people.find((p) => p.id === id).start).toBe(
    "2026-11-23",
  );
  await expect(page.locator("[data-inbox-message]")).toHaveCount(5);
  await page
    .locator(".inbox-item")
    .filter({ hasText: "수행사 투입 현황 공유 회의 안내" })
    .click();
  await expect(page.locator(".inbox-body")).toContainText("금요일 회의");
  await expect(
    page.locator(".inbox-body").getByRole("button", { name: "AI 검토 열기" }),
  ).toHaveCount(0);
  await page.locator(".inbox-item").filter({ hasText: "사내 식당" }).click();
  await expect(page.locator(".inbox-body")).toContainText("11시 30분");
  await page
    .getByRole("button", { name: "검토 대기 2건", exact: true })
    .click();
  await expect(page.locator(".mail-inbox tbody tr")).toHaveCount(2);
  await openRow(page, "김민수");
  await page.getByLabel("메일 반영 인원 선택").selectOption(id);
  await expect(page.getByLabel("메일 제안 투입일")).toHaveValue("2026-11-25");
  await expect(page.locator(".mail-deadline-preview")).toContainText(
    "2026-11-24",
  );
  await expect(page.locator(".mail-deadline-preview")).not.toContainText(
    "정보보안 교육",
  );
  // Simulate another PMO changing the same record while this review stays open.
  const before = await state(page),
    next = structuredClone(before);
  next.people.find((p) => p.id === id).start = "2026-11-24";
  expect(
    (
      await page.request.patch("/api/state", {
        data: { operations: statePatch(before, next) },
      })
    ).ok(),
  ).toBeTruthy();
  await page.getByLabel("메일 원문 검토 확인").check();
  await page.getByRole("button", { name: "승인 후 반영", exact: true }).click();
  await expect(page.locator(".mail-current-values")).toContainText(
    "검토 중 기존값이 변경",
  );
  await expect(page.locator(".mail-current-values")).toContainText(
    "2026-11-24",
  );
  await page
    .getByRole("button", { name: "최신 값 확인 · 다시 검토", exact: true })
    .click();
  await expect(page.locator(".mail-current-values")).not.toContainText(
    "검토 중 기존값이 변경",
  );
  await page.getByLabel("메일 원문 검토 확인").check();
  await page.getByRole("button", { name: "승인 후 반영", exact: true }).click();
  await expect(page.locator(".mail-applied-result")).toContainText("김민수");
  await expect(page.locator(".mail-current-values")).not.toContainText(
    "검토 중 기존값이 변경",
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "artifacts/mail-reviewed-change.png",
    fullPage: true,
  });
  let current = await state(page);
  expect(current.people.find((p) => p.id === id).start).toBe("2026-11-25");
  expect(current.people.find((p) => p.id === id).tasks.O08).toBe("done");
  expect(current.people.find((p) => p.id === id).registrationStatus).toBe(
    "registered",
  );
  expect(current.people.some((p) => p.name === "이서연")).toBeFalsy();
  await expect(
    page.getByRole("button", { name: "검토 대기 1건", exact: true }),
  ).toBeVisible();
  const memberContext = await browser.newContext({
      storageState: memberStorage,
    }),
    memberPage = await memberContext.newPage();
  await memberPage.goto("http://127.0.0.1:5181/");
  await memberPage
    .locator(".sidebar")
    .getByRole("button", { name: "서류", exact: true })
    .click();
  await memberPage
    .locator(".document-tile")
    .first()
    .getByRole("button")
    .click();
  await expect(memberPage.getByRole("dialog")).toContainText(
    "투입 기간이 변경되어",
  );
  await expect(
    memberPage.getByRole("dialog").locator('[data-field="start"]'),
  ).toHaveText("2026-11-25");
  await expect(
    memberPage
      .getByRole("dialog")
      .getByLabel("본인 입력 서명 *", { exact: true }),
  ).toHaveValue("");
  await memberContext.close();
  await page.getByRole("button", { name: "검토함으로", exact: true }).click();
  await openRow(page, "이서연");
  await expect(page.getByLabel("1번 요청 작업명")).toHaveValue(
    "개발망 계정 신청",
  );
  await page.getByLabel("메일 원문 검토 확인").check();
  await page.getByLabel("메일 별도 신규 기록 확인").check();
  await page.getByRole("button", { name: "승인 후 반영", exact: true }).click();
  await expect(page.locator(".mail-applied-result")).toContainText("이서연");
  await page
    .locator(".mail-applied-result")
    .getByRole("button", { name: "초대 링크 생성·복사", exact: true })
    .click();
  const modal = page.getByRole("dialog");
  await modal
    .getByRole("button", { name: "초대 링크 생성", exact: true })
    .click();
  await expect(modal.getByLabel("이서연 초대 링크")).toHaveValue(/\/invite\//);
  await modal.getByLabel("닫기", { exact: true }).click();
  current = await state(page);
  const lee = current.people.find((p) => p.name === "이서연");
  expect(lee.registrationStatus).toBe("pending_registration");
  expect(lee.start).toBe("2026-11-23");
  const dev = current.customTasks.find((t) => /개발망/.test(t.title));
  expect(dev.personIds).toEqual([lee.id]);
  expect(dev.personIds).not.toContain(id);
  await page
    .locator(".mail-workspace>.page-heading")
    .getByRole("button", { name: "새 메일 확인", exact: true })
    .click();
  await expect(page.locator(".mail-workspace")).toContainText("새 초안 0건");
  await expect(
    page.getByRole("dialog", { name: /수행사 투입 요청/ }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});
test("date-undecided draft can be edited and held without changing the personnel list", async ({
  page,
}) => {
  await login(page);
  await mailPage(page);
  await page.getByRole("button", { name: "설정", exact: true }).click();
  await page.getByLabel("메일 수집 폴더").fill("PMO/날짜미정검증");
  await page.getByRole("button", { name: "범위 저장", exact: true }).click();
  await page
    .locator(".mail-workspace>.page-heading")
    .getByRole("button", { name: "새 메일 확인", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "수행사 투입 요청 1건", exact: true })
    .getByRole("button", { name: "검토하기", exact: true })
    .click();
  await openRow(page, "박보류");
  await expect(page.getByLabel("메일 제안 투입일")).toHaveValue("");
  await expect(page.locator(".mail-checks")).toContainText("미정");
  await page.getByLabel("메일 검토 메모").fill("담당자에게 날짜 확정 확인 중");
  await page.getByRole("button", { name: "보류", exact: true }).click();
  await expect(page.locator(".mail-detail-heading .mail-status")).toHaveText(
    "검토 보류",
  );
  expect((await state(page)).people).toHaveLength(2);
});
test("latest reply shows quoted history, extracts one hold request and preserves Kim registration/completion", async ({
  page,
}) => {
  await login(page);
  await mailPage(page);
  await page.getByRole("button", { name: "설정", exact: true }).click();
  await page.getByLabel("메일 수집 폴더").fill("PMO/회신검증");
  await page.getByRole("button", { name: "범위 저장", exact: true }).click();
  await page
    .locator(".mail-workspace>.page-heading")
    .getByRole("button", { name: "새 메일 확인", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "수행사 투입 요청 1건", exact: true })
    .getByRole("button", { name: "검토하기", exact: true })
    .click();
  await page
    .locator(".mail-inbox tbody tr")
    .filter({ hasText: "일정 변경 요청 정정" })
    .getByRole("button", { name: "검토하기", exact: true })
    .click();
  await expect(page.locator(".mail-original>pre")).not.toContainText("이서연");
  await expect(page.locator(".mail-original")).toContainText(
    "이전 인용문 · 분석 제외",
  );
  await expect(page.locator(".mail-thread")).toContainText("2026-11-25");
  await expect(page.getByLabel("메일 요청 유형")).toHaveValue("hold");
  const before = await state(page),
    kim = before.people.find((p) => p.name === "김민수");
  await page.getByLabel("메일 반영 인원 선택").selectOption(kim.id);
  await page.getByLabel("메일 원문 검토 확인").check();
  await page.getByRole("button", { name: "승인 후 반영", exact: true }).click();
  await expect(page.locator(".mail-applied-result")).toContainText("김민수");
  const current = (await state(page)).people.find((p) => p.id === kim.id);
  expect(current.lifecycle).toBe("투입 보류");
  expect(current.registrationStatus).toBe("registered");
  expect(current.tasks.O08).toBe("done");
  expect(current.start).toBe("2026-11-25");
});
test("project manager cannot see mail review or sync controls", async ({
  page,
}) => {
  await login(page, "SFA");
  await expect(page.locator(".sidebar")).not.toContainText("받은편지함");
  await expect(
    page
      .locator(".topbar")
      .getByRole("button", { name: "새 메일 확인", exact: true }),
  ).toHaveCount(0);
  expect(
    (await page.request.post("/api/mail/sync", { data: {} })).status(),
  ).toBe(403);
});
