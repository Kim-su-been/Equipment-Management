import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import ExcelJS from "exceljs";
import { chooseDemoRole } from "./demo-controls.mjs";
import {
  performanceMetrics,
  selectRequests,
  assignmentMetrics,
} from "../src/performance-metrics.js";
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
page.setDefaultTimeout(10000);
page.on("pageerror", (e) => errors.push(e.message));
await context.route("**/*", (route) => {
  if (
    route.request().isNavigationRequest() &&
    route.request().url().startsWith("http://localhost:5192/")
  )
    return route.fulfill({ status: 200, body: html, contentType: "text/html" });
  if (!/^(data|blob):/.test(route.request().url()))
    network.push(route.request().url());
  return route.abort();
});
const call = (path, method = "GET") =>
  page.evaluate(
    async ({ path, method }) => {
      const r = await fetch(path, { method });
      return { status: r.status, data: await r.json() };
    },
    { path, method },
  );
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
try {
  await mkdir("artifacts", { recursive: true });
  await page.goto("http://localhost:5192/");
  await expect(page.locator(".dashboard-work")).toBeVisible();
  await context.setOffline(true);
  const initialPeople = (await call("/api/state")).data.state.people;
  await nav("퍼포먼스 관리");
  await expect(page.locator(".performance-page h1")).toHaveText(
    "퍼포먼스 관리",
  );
  let payload = (await call("/api/performance")).data;
  assert.equal(payload.preview, true);
  assert.equal(
    payload.participants.filter((p) => p.project === "AO 개발팀").length,
    4,
  );
  await expect(page.locator(".perf-stages li")).toHaveCount(5);
  await expect(page.getByLabel("인원 비교 방식")).toHaveValue("combo");
  const toggles = page.getByRole("group", {
    name: "비교 프로젝트·팀",
    exact: true,
  });
  await expect(toggles.getByRole("button")).toHaveCount(4);
  await expect(toggles.getByRole("button", { name: /^SFA/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const sfaPeople = payload.participants.filter((p) => p.project === "SFA");
  await expect(page.locator(".perf-axis-hit")).toHaveCount(sfaPeople.length);
  const axisRows = selectRequests(payload, {
    from: "2026-11-01",
    to: payload.asOf,
  });
  for (const person of sfaPeople) {
    const expected = assignmentMetrics(
      axisRows.filter((r) => r.participantId === person.id),
      "2026-11-01",
      payload.asOf,
    );
    const hit = page.getByRole("button", {
      name: `${person.name} 가로축 그래프 상세 보기`,
      exact: true,
    });
    await expect(hit).toBeVisible();
    const id = person.id;
    await expect(page.locator(".perf-assigned-bar")).toHaveCount(
      sfaPeople.length,
    );
    const plotted = await page
      .locator(".perf-person-axis")
      .evaluate((svg, pid) => {
        const by = (cls) =>
          [...svg.querySelectorAll(cls)].find((n) => n.dataset.personId === pid)
            ?.dataset.value ?? "";
        return {
          assigned: by(".perf-assigned-bar"),
          completed: by(".perf-completed-bar"),
          rate: by(".perf-completion-point"),
          time: by(".perf-cycle-bar"),
          onTime: by(".perf-on-time-point"),
        };
      }, id);
    assert.deepEqual(plotted, {
      assigned: String(expected.assigned),
      completed: String(expected.completed),
      rate: String(expected.completionRate ?? ""),
      time: String(expected.medianAssignedCycle ?? ""),
      onTime: String(expected.onTimeRate ?? ""),
    });
  }
  const xs = await page
    .locator(".perf-assigned-bar")
    .evaluateAll((nodes) => nodes.map((n) => Number(n.getAttribute("x"))));
  assert.deepEqual(
    xs,
    [...xs].sort((a, b) => a - b),
  );
  await toggles.getByRole("button", { name: /^그룹웨어/ }).click();
  await expect(page.locator(".perf-axis-hit")).toHaveCount(
    payload.participants.filter((p) => p.project === "그룹웨어").length,
  );
  assert.ok(
    (
      await page
        .locator(".perf-axis-hit")
        .evaluateAll((nodes) => nodes.map((n) => n.dataset.personId))
    ).every(
      (id) =>
        payload.participants.find((p) => p.id === id).project === "그룹웨어",
    ),
  );
  await toggles.getByRole("button", { name: /^AO 개발팀/ }).click();
  await expect(page.locator(".perf-axis-hit")).toHaveCount(4);
  await page.getByLabel("수행 조회 종료일").fill("2026-11-22");
  await page.getByLabel("수행 요청 유형").selectOption("요청 분석");
  await expect(page.locator(".perf-completion-point")).toHaveCount(0);
  await expect(page.locator(".perf-on-time-point")).toHaveCount(0);
  await expect(page.locator(".perf-person-axis")).toContainText("표본 없음");
  await page.getByLabel("수행 조회 종료일").fill(payload.asOf);
  await page.getByLabel("수행 요청 유형").selectOption("전체");
  await toggles.getByRole("button", { name: /^SFA/ }).click();
  const firstAxis = page.getByRole("button", {
    name: `${sfaPeople[0].name} 가로축 그래프 상세 보기`,
    exact: true,
  });
  await firstAxis.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toContainText("배정기간 기준");
  await page.keyboard.press("Escape");
  await expect(firstAxis).toBeFocused();
  await toggles.getByRole("button", { name: /^전체/ }).click();
  await expect(page.locator(".perf-axis-hit")).toHaveCount(
    payload.participants.length,
  );
  await page.getByLabel("인원 비교 방식").selectOption("matrix");
  await expect(page.getByLabel("인원 비교 방식")).toHaveValue("matrix");
  await expect(page.locator(".perf-matrix thead th")).toHaveCount(6);
  await expect(page.locator(".perf-matrix-person")).toHaveCount(
    payload.participants.length,
  );
  const assignedBaseline = selectRequests(payload, {
    from: "2026-11-01",
    to: payload.asOf,
  });
  for (const person of payload.participants) {
    const expected = assignmentMetrics(
      assignedBaseline.filter((r) => r.participantId === person.id),
      "2026-11-01",
      payload.asOf,
    );
    const row = page.locator(".perf-matrix-person").filter({
      has: page.getByRole("button", {
        name: `${person.name} 종합 비교 상세 보기`,
        exact: true,
      }),
    });
    for (const key of [
      "assigned",
      "completionRate",
      "medianAssignedCycle",
      "onTimeRate",
      "overdue",
    ])
      await expect(row.locator(`[data-metric="${key}"]`)).toHaveAttribute(
        "data-value",
        String(expected[key] ?? ""),
      );
  }
  const zeroLate = page
    .locator(
      '.perf-matrix-person td[data-metric="overdue"][data-value="0"] .perf-matrix-bar',
    )
    .first();
  await expect(zeroLate).toHaveCSS("background-color", "rgb(225, 237, 245)");
  assert.equal(
    await zeroLate
      .locator("i")
      .evaluate((e) => e.getBoundingClientRect().width),
    0,
  );
  const matrixPerson = payload.participants[0];
  await page
    .getByRole("button", {
      name: `${matrixPerson.name} 종합 비교 상세 보기`,
      exact: true,
    })
    .click();
  await expect(page.getByRole("dialog")).toContainText("배정기간 기준");
  const matrixExpected = assignmentMetrics(
    assignedBaseline.filter((r) => r.participantId === matrixPerson.id),
    "2026-11-01",
    payload.asOf,
  );
  await expect(page.getByRole("dialog")).toContainText(
    `배정 ${matrixExpected.assigned}건 중 완료 ${matrixExpected.completed}건`,
  );
  await page.keyboard.press("Escape");
  await page.getByLabel("인원 비교 정렬").selectOption("high");
  await page
    .getByLabel("종합 비교 정렬 지표")
    .selectOption("medianAssignedCycle");
  for (const group of await page.locator(".perf-matrix tbody").all()) {
    const values = await group
      .locator('[data-metric="medianAssignedCycle"]')
      .evaluateAll((nodes) =>
        nodes
          .filter((n) => n.dataset.value !== "")
          .map((n) => Number(n.dataset.value)),
      );
    assert.deepEqual(
      values,
      [...values].sort((a, b) => b - a),
    );
  }
  await page.getByLabel("인원 비교 방식").selectOption("chart");
  await expect(page.locator(".perf-comparison-groups")).toHaveCount(1);
  await expect(page.locator(".perf-comparison-group")).toHaveCount(3);
  await expect(page.locator(".perf-comparison-person")).toHaveCount(
    payload.participants.length,
  );
  await expect(page.getByLabel("인원 비교 지표")).toHaveValue("punctuality");
  const baselineRows = selectRequests(payload, {
    from: "2026-11-01",
    to: payload.asOf,
  });
  for (const person of payload.participants) {
    const expected = performanceMetrics(
      baselineRows.filter((r) => r.participantId === person.id),
      payload.asOf,
    );
    const button = page.getByRole("button", {
      name: `${person.name} 비교 그래프 상세 보기`,
      exact: true,
    });
    await expect(button).toHaveAttribute(
      "data-value",
      String(expected.onTimeRate ?? ""),
    );
  }
  await page.getByLabel("인원 비교 지표").selectOption("volume");
  const total = await page
    .locator(".perf-comparison-person")
    .first()
    .getAttribute("data-value");
  assert.ok(Number(total) > 0);
  await expect(page.locator(".perf-comparison-legend")).toContainText(
    "진행 지연",
  );
  for (const metricName of ["overdue", "cycle", "rework", "punctuality"]) {
    await page.getByLabel("인원 비교 지표").selectOption(metricName);
    await expect(page.locator(".perf-comparison-group")).toHaveCount(3);
  }
  await page.getByLabel("인원 비교 정렬").selectOption("high");
  for (const group of await page.locator(".perf-comparison-group").all()) {
    const values = (
      await group
        .locator(".perf-comparison-person")
        .evaluateAll((nodes) => nodes.map((n) => n.dataset.value))
    )
      .filter((v) => v !== "")
      .map(Number);
    assert.deepEqual(
      values,
      [...values].sort((a, b) => b - a),
    );
  }
  const comparisonPerson = payload.participants[0];
  await page
    .getByRole("button", {
      name: `${comparisonPerson.name} 비교 그래프 상세 보기`,
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("dialog", {
      name: `${comparisonPerson.name} · 수행 지표`,
      exact: true,
    }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", {
      name: `${comparisonPerson.name} 비교 그래프 상세 보기`,
      exact: true,
    }),
  ).toBeFocused();
  await page.getByLabel("수행 프로젝트 필터").selectOption("AO 개발팀");
  await expect(page.locator(".perf-comparison-group")).toHaveCount(1);
  await expect(page.locator(".perf-comparison-person")).toHaveCount(4);
  await page.getByLabel("수행 조회 종료일").fill("2026-11-22");
  await page.getByLabel("수행 요청 유형").selectOption("요청 분석");
  await expect(page.locator(".perf-comparison-person")).toHaveCount(4);
  await expect(page.locator(".perf-comparison-person").first()).toHaveAttribute(
    "data-value",
    "",
  );
  await expect(page.locator(".perf-comparison-person").first()).toContainText(
    "—",
  );
  await page.getByLabel("수행 요청 유형").selectOption("전체");
  await page.getByLabel("수행 조회 종료일").fill(payload.asOf);
  await page.getByLabel("수행 프로젝트 필터").selectOption("전체");

  await page.getByLabel("인원 비교 방식").selectOption("combo");
  await toggles.getByRole("button", { name: /^SFA/ }).click();

  const metric = performanceMetrics(
    selectRequests(payload, { from: "2026-11-01", to: payload.asOf }),
    payload.asOf,
  );
  await expect(
    page.getByRole("button", {
      name: `완료 처리 ${metric.completed}건 근거 보기`,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: `납기 준수율 ${metric.onTimeRate}% 근거 보기`,
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "가상 자료 불러오기", exact: true })
    .click();
  await expect(page.locator(".perf-notice")).toContainText(
    "가상 자료 수집 완료",
  );
  payload = (await call("/api/performance")).data;
  assert.equal(payload.preview, false);
  assert.deepEqual(
    (await call("/api/state")).data.state.people,
    initialPeople,
    "performance sync must not alter personnel or preparation",
  );
  await page
    .getByRole("button", { name: "가상 자료 불러오기", exact: true })
    .click();
  await expect(page.locator(".perf-notice")).toContainText(
    "신규 0건 / 갱신 0건",
  );
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(350);
  await page.screenshot({
    path: "artifacts/performance-overview-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: /^개발 \d+건 보기$/ }).click();
  await expect(
    page.getByRole("dialog", { name: "개발 · 업무 목록", exact: true }),
  ).toBeVisible();
  const first = page
    .getByRole("dialog")
    .getByRole("button", { name: / 원본 근거 보기$/ })
    .first();
  await first.click();
  await expect(page.getByRole("dialog")).toContainText("단계 변경 이력");
  await expect(page.getByRole("dialog")).toContainText("가상 원천 데이터");
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", {
      name: `진행 중 지연 ${metric.overdue}건 근거 보기`,
      exact: true,
    })
    .click();
  await expect(page.getByLabel("수행 업무 상태")).toHaveValue("overdue");
  await expect(page.locator(".perf-requests tbody tr")).toHaveCount(
    metric.overdue,
  );
  await page.getByRole("button", { name: "인원별 지표", exact: true }).click();
  await expect(page.locator(".perf-person-card")).toHaveCount(
    payload.participants.length,
  );
  const person = payload.participants[0];
  await page
    .getByRole("button", { name: `${person.name} 수행 지표 보기`, exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "기존 인원 고유 기록에 연결",
  );
  await expect(
    page.getByRole("dialog").locator(".perf-duration-chart"),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^완료 처리/ })
    .click();
  await expect(
    page.getByRole("dialog", { name: "개인 지표 · 근거 업무", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog").locator("tbody tr")).toHaveCount(
    performanceMetrics(
      selectRequests(payload).filter((r) => r.participantId === person.id),
      payload.asOf,
    ).completed,
  );
  await page.keyboard.press("Escape");
  await page.getByLabel("수행 프로젝트 필터").selectOption("AO 개발팀");
  await expect(page.locator(".perf-person-card")).toHaveCount(4);
  const waiting = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "현재 범위 엑셀", exact: true })
    .click();
  const download = await waiting;
  await download.saveAs("artifacts/performance-ao.xlsx");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile("artifacts/performance-ao.xlsx");
  assert.equal(wb.getWorksheet("업무 근거").rowCount, 33);
  assert.equal(wb.getWorksheet("배정 기준 비교").rowCount, 5);
  const aoFirst = payload.participants.find((p) => p.project === "AO 개발팀");
  assert.equal(
    wb.getWorksheet("배정 기준 비교").getCell("F2").value,
    assignmentMetrics(
      selectRequests(payload).filter((r) => r.participantId === aoFirst.id),
      "2026-11-01",
      payload.asOf,
    ).completionRate,
  );
  assert.ok(
    wb
      .getWorksheet("업무 근거")
      .getColumn(2)
      .values.slice(2)
      .every((p) => p === "AO 개발팀"),
  );
  await page.getByRole("button", { name: "업무 목록", exact: true }).click();
  await page.getByLabel("수행 업무 상태").selectOption("missing");
  const aoMissing = selectRequests(payload, {
    project: "AO 개발팀",
    from: "2026-11-01",
    to: payload.asOf,
  }).filter((r) => r.done && !r.cancelled && !r.dueDate).length;
  await expect(page.locator(".perf-requests tbody tr")).toHaveCount(aoMissing);
  await page.getByLabel("수행 조회 종료일").fill("2026-11-27");
  await expect(page.getByRole("alert")).toContainText("종료일");
  await expect(
    page.getByRole("button", { name: "현재 범위 엑셀", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("수행 조회 종료일").fill("2026-11-10");
  await page.getByLabel("수행 업무 상태").selectOption("all");
  const historical = selectRequests(payload, {
    project: "AO 개발팀",
    from: "2026-11-01",
    to: "2026-11-10",
  });
  await expect(page.locator(".perf-requests tbody tr")).toHaveCount(
    historical.length,
  );
  await page.reload();
  await expect(page.locator(".dashboard-work")).toBeVisible();
  await nav("퍼포먼스 관리");
  assert.equal((await call("/api/performance")).data.preview, false);
  assert.equal(
    (await call("/api/performance")).data.requests.length,
    payload.requests.length,
  );
  await chooseDemoRole(page, "sfa");
  await nav("퍼포먼스 관리");
  let scoped = (await call("/api/performance")).data;
  assert.ok(scoped.requests.every((r) => r.project === "SFA"));
  assert.ok(!scoped.participants.some((p) => p.project === "AO 개발팀"));
  await expect(
    page.getByLabel("수행 프로젝트 필터").locator("option"),
  ).toHaveCount(1);
  await expect(page.locator(".perf-axis-hit")).toHaveCount(
    scoped.participants.length,
  );
  await expect(
    page
      .getByRole("group", { name: "비교 프로젝트·팀", exact: true })
      .getByRole("button"),
  ).toHaveCount(1);
  await expect(
    page.getByRole("group", { name: "비교 프로젝트·팀", exact: true }),
  ).toContainText("SFA");
  await chooseDemoRole(page, "member", person.personId);
  await nav("나의 수행 현황");
  scoped = (await call("/api/performance")).data;
  assert.equal(scoped.participants.length, 1);
  assert.equal(scoped.participants[0].personId, person.personId);
  await expect(page.locator(".perf-comparison")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "가상 자료 불러오기", exact: true }),
  ).toHaveCount(0);
  assert.equal((await call("/api/performance/sync", "POST")).status, 403);
  await expect(
    page.getByRole("button", { name: "인원별 지표", exact: true }),
  ).toHaveCount(0);
  await chooseDemoRole(page, "pmo");
  await nav("퍼포먼스 관리");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.mouse.move(380, 90);
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(350);
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  await expect(page.locator(".perf-axis-scroll")).toBeVisible();
  assert.ok(
    await page
      .locator(".perf-axis-scroll")
      .evaluate((e) => e.scrollWidth > e.clientWidth),
  );
  await page
    .locator(".perf-axis-scroll")
    .evaluate((e) => (e.scrollLeft = e.scrollWidth));
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  await page.screenshot({
    path: "artifacts/performance-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: /^개발 \d+건 보기$/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  await page.getByRole("dialog").getByLabel("닫기", { exact: true }).click();
  await nav("전체 현황");
  await expect(page.locator(".compact-stage-board")).toBeVisible();
  assert.deepEqual(errors, []);
  assert.deepEqual(network, []);
  console.log(
    "Performance: mock sync/idempotency/reload, exact KPI evidence, phase and person dialogs, AO filter/export, missing deadlines, historic snapshot, staff/member scopes, desktop/mobile and unchanged onboarding passed with zero external network calls.",
  );
} catch (e) {
  await page.screenshot({
    path: "artifacts/performance-failure.png",
    fullPage: true,
  });
  console.error(errors);
  throw e;
} finally {
  await browser.close();
}
