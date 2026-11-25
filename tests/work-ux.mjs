import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { statePatch } from "../src/state-patch.js";
import {
  chooseDemoRole,
  openDemoSettings,
  closeDemoSettings,
} from "./demo-controls.mjs";
import { summaryCounts } from "../src/work-summary.js";
const html = await readFile("preview/readyboard-offline.html");
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
  }),
  page = await context.newPage(),
  errors = [],
  network = [];
page.setDefaultTimeout(12000);
page.on("pageerror", (e) => errors.push(e.message));
await context.route("**/*", (route) => {
  if (
    route.request().isNavigationRequest() &&
    route.request().url().startsWith("http://localhost:5198/")
  )
    return route.fulfill({ status: 200, body: html, contentType: "text/html" });
  if (!/^(data|blob):/.test(route.request().url()))
    network.push(route.request().url());
  return route.abort();
});
const call = (path, body, method = body ? "POST" : "GET") =>
  page.evaluate(
    async ({ path, body, method }) => {
      const r = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      return { status: r.status, data: await r.json() };
    },
    { path, body, method },
  );
const state = async () => {
  const r = await call("/api/state");
  assert.equal(r.status, 200);
  return r.data.state;
};
const patch = async (next) => {
  const current = await state(),
    copy = structuredClone(current);
  next(copy);
  const r = await call(
    "/api/state",
    { operations: statePatch(current, copy) },
    "PATCH",
  );
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data.state;
};
const nav = async (name) => {
  if (
    (await page.evaluate(() => innerWidth < 751)) &&
    !(await page
      .locator(".sidebar")
      .evaluate((e) => e.classList.contains("open")))
  )
    await page.getByRole("button", { name: "메뉴 열기", exact: true }).click();
  await page
    .locator(".sidebar")
    .getByRole("button", { name, exact: true })
    .click();
};
async function submitDocument(signature) {
  const modal = page.getByRole("dialog");
  await modal
    .getByLabel("위 중요 조항을 모두 읽었습니다. *", { exact: true })
    .check();
  await modal
    .getByLabel("작성 내용과 확인 항목을 검토했습니다. *", { exact: true })
    .check();
  await modal.getByLabel("본인 입력 서명 *", { exact: true }).fill(signature);
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
}
try {
  await page.clock.install({ time: new Date("2026-11-23T01:00:00Z") });
  await page.goto("http://localhost:5198/");
  await expect(page.locator(".dashboard-work")).toBeVisible();
  await context.setOffline(true);
  await mkdir("artifacts", { recursive: true });
  const contrasts = await page.evaluate(() => {
    const rgba = (value) => value.match(/\d+(?:\.\d+)?/g).map(Number);
    const blend = (foreground, background) => {
      const alpha = foreground[3] ?? 1;
      return foreground
        .slice(0, 3)
        .map((n, i) => n * alpha + background[i] * (1 - alpha));
    };
    const luminance = (rgb) => {
      const nums = rgb.slice(0, 3).map((n) => {
        n /= 255;
        return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * nums[0] + 0.7152 * nums[1] + 0.0722 * nums[2];
    };
    return [
      ".brand-wordmark",
      ".sidebar .nav-item:not(.active)",
      ".topbar .breadcrumb strong",
      ".work-title p",
      ".work-stat",
    ].map((selector) => {
      const element = document.querySelector(selector),
        ancestors = [];
      for (let node = element; node; node = node.parentElement)
        ancestors.unshift(node);
      const background = ancestors.reduce(
        (rgb, node) => blend(rgba(getComputedStyle(node).backgroundColor), rgb),
        [255, 255, 255],
      );
      const c = getComputedStyle(element);
      const foreground = blend(
        rgba(c.webkitTextFillColor || c.color),
        background,
      );
      const values = [luminance(foreground), luminance(background)].sort(
        (a, b) => b - a,
      );
      return { selector, ratio: (values[0] + 0.05) / (values[1] + 0.05) };
    });
  });
  for (const c of contrasts)
    assert.ok(c.ratio >= 4.5, `${c.selector} contrast ${c.ratio}`);
  assert.equal(
    await page
      .locator(".sidebar")
      .evaluate((e) => getComputedStyle(e).backgroundColor),
    "rgb(7, 85, 138)",
  );
  assert.equal(
    await page
      .locator(".topbar")
      .evaluate((e) => getComputedStyle(e).backgroundColor),
    "rgb(0, 103, 172)",
  );
  await expect(
    page.locator(".dashboard-work .work-mascot.cast-group img"),
  ).toBeVisible();
  await expect(page.locator(".assistant-entry .cast-guide img")).toBeVisible();
  assert.ok(
    await page
      .locator(".dashboard-work .work-mascot img")
      .evaluate((e) => e.complete && e.naturalWidth > 0),
  );
  const initial = await state(),
    count = summaryCounts(initial.people, initial, [], "2026-11-23");
  for (const p of initial.people)
    assert.ok(
      !(await page.locator(".admin-stage-board").innerText()).includes(p.id),
    );
  await expect(page.locator(".admin-stage-column")).toHaveCount(5);
  await expect(page.locator(".dashboard-work")).toContainText(
    "단계별 준비 인원",
  );
  const visibleNames = await page
    .locator(".stage-person-profile > strong")
    .allTextContents();
  assert.equal(new Set(visibleNames).size, initial.people.length);
  await page
    .locator(".admin-stage-column.accounts .stage-person-profile")
    .first()
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("dialog").getByLabel("닫기", { exact: true }).click();
  await page
    .locator(".admin-stage-column.accounts .stage-person-action")
    .first()
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("dialog").getByLabel("닫기", { exact: true }).click();
  for (const [role, project] of [
    ["sfa", "SFA"],
    ["gw", "그룹웨어"],
  ]) {
    await chooseDemoRole(page, role);
    await expect(page.locator(".admin-stage-column")).toHaveCount(5);
    const projects = await page
      .locator(".stage-person-profile > small")
      .allTextContents();
    assert.ok(
      projects.length > 0 &&
        projects.every((text) => text.startsWith(project + " ·")),
    );
  }
  await chooseDemoRole(page, "pmo");
  await expect(page.locator(".review-toolbar")).toHaveText(
    /시연 모드.*시연 설정/,
  );
  assert.equal(await page.getByLabel("검토 화면 역할").count(), 0);
  await expect(page.locator(".sidebar-ai")).toHaveCount(0);
  await expect(page.locator(".floating-ai")).toHaveCount(0);
  await expect(page.locator(".work-stats")).toContainText(
    "투입 임박·준비 미완료",
  );
  await page.screenshot({
    path: "artifacts/work-dashboard-after.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: /^투입 임박·준비 미완료/ }).click();
  await expect(page.getByLabel("준비 상태 필터")).toHaveValue("imminent");
  await expect(page.locator(".work-table tbody tr")).toHaveCount(
    count.imminent,
  );
  await nav("전체 현황");
  await page.getByRole("button", { name: /^전체 인원/ }).click();
  await expect(page.locator(".work-table tbody tr")).toHaveCount(
    initial.people.length,
  );
  await expect(
    page
      .locator(".work-table tbody tr")
      .filter({ has: page.getByRole("button", { name: "SFA-1", exact: true }) })
      .getByText("SFA-1", { exact: true }),
  ).toHaveCount(1);
  await nav("준비 작업");
  await expect(
    page.getByRole("button", { name: "내 작업", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("작업 상태 필터")).toHaveValue("actionable");
  await expect(page.locator(".completed-work")).not.toHaveAttribute("open", "");
  assert.ok((await page.locator(".work-task-row").count()) > 0);
  await page.getByLabel("작업 상태 필터").selectOption("waiting");
  await expect(page.locator(".dependency-reason").first()).toBeVisible();
  await page.locator(".dependency-reason .text-link").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("dialog").getByLabel("닫기", { exact: true }).click();
  await page.getByLabel("작업 보기 방식").selectOption("person");
  assert.ok((await page.locator(".person-task-summary").count()) > 0);
  await expect(
    page.locator(".person-task-summary").first(),
  ).not.toHaveAttribute("open", "");
  // Existing 100% records have an independent final confirmation and actual lifecycle.
  const full = initial.people.find((p) => p.displayId === "SFA-1");
  await patch((s) => {
    const p = s.people.find((p) => p.id === full.id);
    p.tasks.O16 = "ready";
    p.lifecycle = "투입 예정";
    p.start = "2026-11-24";
  });
  await nav("인원 명단");
  await expect(
    page.locator("tbody tr").filter({
      has: page.getByRole("button", { name: "SFA-1", exact: true }),
    }),
  ).toContainText("필수 항목 완료 · 최종 확인 대기");
  await page.getByLabel("준비 상태 필터").selectOption("final_pending");
  await page
    .locator("tbody tr")
    .filter({ has: page.getByRole("button", { name: "SFA-1", exact: true }) })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "최종 준비 확인", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "완료 확인", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await state()).people.find((p) => p.id === full.id).tasks.O16,
    )
    .toBe("done");
  assert.equal(
    (await state()).people.find((p) => p.id === full.id).lifecycle,
    "투입 예정",
  );
  await nav("받은편지함");
  await expect(
    page
      .locator(".topbar")
      .getByRole("button", { name: "새 메일 확인", exact: true }),
  ).toHaveCount(0);
  await page
    .locator(".inbox-toolbar")
    .getByRole("button", { name: "새 메일 확인", exact: true })
    .click();
  const alert = page.getByRole("dialog", {
    name: "수행사 투입 요청 2건",
    exact: true,
  });
  await expect(alert).toBeVisible();
  await alert.getByRole("button", { name: "검토하기", exact: true }).click();
  await page
    .locator(".mail-inbox tbody tr")
    .filter({ hasText: "김민수" })
    .getByRole("button", { name: "검토하기", exact: true })
    .click();
  await expect(page.locator(".mail-change-overview")).toContainText(
    "2026.11.23",
  );
  await expect(page.locator(".mail-change-overview")).toContainText(
    "2026.11.25",
  );
  await expect(page.locator(".mail-evidence-fold")).not.toHaveAttribute(
    "open",
    "",
  );
  await expect(page.locator(".mail-original mark")).not.toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "승인 후 반영", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "이 인원으로 확인", exact: true })
    .click();
  await page.getByLabel("메일 원문 검토 확인").check();
  const kim = (await state()).people.find((p) => p.name === "김민수");
  await page.getByRole("button", { name: "승인 후 반영", exact: true }).click();
  await expect(page.locator(".mail-applied-result")).toBeVisible();
  let s = await state();
  assert.equal(s.people.find((p) => p.id === kim.id).start, "2026-11-25");
  assert.ok(!s.people.some((p) => p.name === "이서연"));
  await page.screenshot({
    path: "artifacts/work-mail-after.png",
    fullPage: true,
  });
  // Real document submit -> PMO correction -> member correction -> PMO re-review.
  await chooseDemoRole(page, "member", kim.id);
  await expect(page.locator(".member-work")).toContainText("지금 내가 할 일");
  await expect(
    page.getByRole("button", { name: "내 정보 조회·수정", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "내 등록 이어하기", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".member-roadmap")).toBeVisible();
  await expect(page.locator(".roadmap-steps > li")).toHaveCount(5);
  await expect(page.locator(".roadmap-stage-detail")).not.toHaveAttribute(
    "open",
    "",
  );
  await page.screenshot({
    path: "artifacts/member-roadmap-initial.png",
    fullPage: true,
  });
  await expect(page.locator('[aria-current="step"]')).toContainText(
    "교육·서류 제출",
  );
  await page
    .getByRole("button", { name: "본인 등록 단계 보기", exact: true })
    .click();
  await expect(page.locator(".roadmap-stage-detail")).toContainText(
    "본인 정보 등록",
  );
  await page
    .getByRole("button", { name: "현재 단계 보기", exact: true })
    .click();
  await expect(page.locator(".roadmap-stage-detail")).toContainText(
    "보안서약서",
  );
  await page
    .locator(".roadmap-stage-detail")
    .getByRole("button", { name: "보안서약서 작업 상세보기", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("보안서약서");
  await page.getByRole("dialog").getByLabel("닫기", { exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.mouse.move(380, 90);
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  await page
    .getByRole("button", { name: "계정 준비 단계 보기", exact: true })
    .click();
  await expect(page.locator(".roadmap-stage-detail")).toContainText(
    "계정 최초 접속",
  );
  await page.mouse.move(380, 90);
  await page.waitForTimeout(350);
  await page.screenshot({
    path: "artifacts/member-roadmap-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole("button", { name: "현재 단계 보기", exact: true })
    .click();
  await page.screenshot({
    path: "artifacts/member-roadmap-desktop.png",
    fullPage: true,
  });
  await nav("서류");
  await page.locator(".document-tile").first().getByRole("button").click();
  await submitDocument("김민수");
  await chooseDemoRole(page, "pmo");
  await nav("교육·서류 검토");
  await page
    .locator("tbody tr")
    .filter({ hasText: "김민수" })
    .filter({ hasText: "보안서약서" })
    .click();
  let modal = page.getByRole("dialog");
  await modal
    .getByLabel("검토 의견", { exact: true })
    .fill("서명과 내용을 다시 확인해 주세요.");
  await modal.getByRole("button", { name: "보완 요청", exact: true }).click();
  await expect
    .poll(
      async () => (await state()).people.find((p) => p.id === kim.id).tasks.O10,
    )
    .toBe("fix");
  await chooseDemoRole(page, "member", kim.id);
  await expect(page.locator(".member-work")).toContainText("보완 요청");
  await expect(page.locator('[aria-current="step"]')).toContainText(
    "보완 필요",
  );
  await expect(page.locator(".roadmap-stage-detail")).toContainText(
    "보완 요청",
  );
  await page
    .getByRole("button", { name: "보안서약서 수정·재제출", exact: true })
    .click();
  await submitDocument("김민수");
  await chooseDemoRole(page, "pmo");
  await nav("인원 명단");
  await page.locator("tbody tr").filter({ hasText: "김민수" }).first().click();
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
  s = await state();
  const saved = s.people.find((p) => p.id === kim.id);
  assert.equal(saved.tasks.O10, "done");
  assert.equal(saved.submissions.O10.length, 2);
  assert.equal(saved.submissions.O10[0].version, 1);
  assert.equal(saved.submissions.O10[1].version, 2);
  // Batch invites are restricted to the selected pending records.
  const batch = await call("/api/people", {
    requestId: crypto.randomUUID(),
    rows: [
      { name: "초대대기 가", company: "시연회사", project: "SFA" },
      { name: "초대대기 나", company: "시연회사", project: "SFA" },
    ],
  });
  assert.equal(batch.status, 200);
  await nav("인원 명단");
  await page.getByLabel("초대대기 가 인원 선택", { exact: true }).check();
  await page.getByLabel("초대대기 나 인원 선택", { exact: true }).check();
  await page
    .getByRole("button", { name: "선택 인원 초대 링크 (2명)", exact: true })
    .click();
  await expect(page.locator(".invitation-card")).toHaveCount(2);
  await page.getByRole("dialog").getByLabel("닫기", { exact: true }).click();
  // Broken references are visible without exposing the UUID as the person's name.
  await patch((s) =>
    s.messages.push({
      id: crypto.randomUUID(),
      personId: "missing-record-id",
      project: "SFA",
      title: "연결 확인",
      body: "원본 확인",
      status: "접수",
    }),
  );
  await nav("전체 현황");
  await expect(page.locator(".dashboard-work")).toContainText(
    "인원 정보 확인 필요",
  );
  await page
    .getByRole("button", { name: "명단에서 복구 확인", exact: true })
    .click();
  await expect(page.locator(".roster-work")).toContainText(
    "고유 ID는 자동으로 합치거나 변경하지 않습니다.",
  );
  await page
    .getByRole("button", { name: "백업에서 복구", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "시연 설정", exact: true }),
  ).toBeVisible();
  await closeDemoSettings(page);
  await nav("전체 현황");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "artifacts/work-dashboard-mobile.png",
    fullPage: true,
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  await nav("인원 명단");
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  await openDemoSettings(page);
  await expect(
    page.getByRole("dialog", { name: "시연 설정", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "시연 설정", exact: true }),
  ).toHaveCount(0);
  assert.deepEqual(errors, []);
  assert.deepEqual(network, []);
  console.log(
    "Work UX: identities, scoped statistic filters, actionable work/dependencies, independent final/lifecycle, 5-mail/2-draft single approval, correction/resubmission/re-review, mobile layout and accessible demo settings passed.",
  );
} catch (e) {
  await page.screenshot({
    path: "artifacts/work-ux-failure.png",
    fullPage: true,
  });
  console.error(errors);
  throw e;
} finally {
  await browser.close();
}
