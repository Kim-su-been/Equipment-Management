import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import http from "node:http";
import { readFile } from "node:fs/promises";
const html = await readFile("preview/readyboard-review.html");
const server = http.createServer((req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(html);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
try {
  const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByRole("button", { name: "받은편지함", exact: true }).click();
  await page.waitForSelector(".inbox-layout");
  assert.equal(await page.locator(".mail-source-settings").count(), 0);
  await page
    .locator(".inbox-toolbar")
    .getByRole("button", { name: "새 메일 확인", exact: true })
    .click();
  const popup = page.getByRole("dialog", {
    name: "수행사 투입 요청 2건",
    exact: true,
  });
  await popup.waitFor();
  assert.ok(
    (await popup.textContent()).includes(
      "새 메일 5통 중 수행사 투입 관련 메일 2통을 찾았습니다.",
    ),
  );
  await popup.getByRole("button", { name: "나중에 검토", exact: true }).click();
  assert.equal(await page.locator("[data-inbox-message]").count(), 5);
  await page
    .locator(".inbox-item")
    .filter({ hasText: "수행사 투입 현황 공유 회의" })
    .click();
  await page.waitForFunction(() =>
    document.querySelector(".inbox-body")?.textContent.includes("금요일 회의"),
  );
  assert.equal(
    await page
      .locator(".inbox-body")
      .getByRole("button", { name: "AI 검토 열기" })
      .count(),
    0,
  );
  await page.screenshot({
    path: "artifacts/inbox-html-desktop.png",
    fullPage: true,
  });
  const original = await page.evaluate(
      async () => await (await fetch("/api/state")).json(),
    ),
    kim = original.state.people.find((p) => p.name === "김민수");
  await page
    .getByRole("button", { name: "검토 대기 2건", exact: true })
    .click();
  const row = page.locator(".mail-inbox tbody tr").filter({
    has: page.locator("td:first-child strong", { hasText: /^김민수$/ }),
  });
  await row.getByRole("button", { name: "검토하기", exact: true }).click();
  await page.getByLabel("메일 반영 인원 선택").selectOption(kim.id);
  await page.getByLabel("메일 원문 검토 확인").check();
  await page.getByRole("button", { name: "승인 후 반영", exact: true }).click();
  await page.locator(".mail-applied-result").waitFor();
  const after = await page.evaluate(
    async () => await (await fetch("/api/state")).json(),
  );
  assert.equal(
    after.state.people.find((p) => p.id === kim.id).start,
    "2026-11-25",
  );
  assert.equal(after.state.people.length, original.state.people.length);
  assert.ok(!after.state.people.some((p) => p.name === "이서연"));
  await page.getByRole("button", { name: "검토함으로", exact: true }).click();
  await page
    .locator(".mail-inbox tbody tr")
    .filter({ hasText: "이서연" })
    .getByRole("button", { name: "검토하기", exact: true })
    .click();
  await page.getByLabel("메일 원문 검토 확인").check();
  await page.getByLabel("메일 별도 신규 기록 확인").check();
  await page.getByRole("button", { name: "승인 후 반영", exact: true }).click();
  await page.locator(".mail-applied-result").waitFor();
  const final = await page.evaluate(
      async () => await (await fetch("/api/state")).json(),
    ),
    lee = final.state.people.find((p) => p.name === "이서연");
  assert.equal(lee.registrationStatus, "pending_registration");
  assert.equal(
    final.state.customTasks.find((t) => /개발망/.test(t.title)).personIds[0],
    lee.id,
  );
  await page
    .locator(".inbox-toolbar")
    .getByRole("button", { name: "새 메일 확인", exact: true })
    .click();
  await page.waitForFunction(() =>
    document
      .querySelector(".mail-workspace")
      ?.textContent.includes("새 초안 0건"),
  );
  assert.equal(await page.getByRole("dialog").count(), 0);
  await page
    .getByRole("button", { name: "받은편지함으로", exact: false })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "artifacts/inbox-html-mobile.png",
    fullPage: true,
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  assert.deepEqual(errors, []);
  console.log(
    "Standalone HTML: five messages, two drafts, ordinary content, one-only approval, both approvals, unchanged UUID, retry and mobile layout passed.",
  );
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
