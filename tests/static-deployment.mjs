import { chooseDemoRole } from "./demo-controls.mjs";
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import http from "node:http";
import { readFile, mkdir } from "node:fs/promises";
const config = JSON.parse(await readFile("vercel.json", "utf8"));
assert.equal(config.buildCommand, "npm run build:offline");
assert.equal(config.outputDirectory, "dist");
const html = await readFile("dist/index.html", "utf8");
assert.ok(html.includes('name="readyboard-mode" content="offline"'));
assert.ok(!html.includes('src="/src/main.jsx"'));
const apiRequests = [];
// Like the configured static SPA deployment: all routes return the HTML, with no API implementation.
const server = http.createServer((req, res) => {
  if (req.url.startsWith("/api/")) apiRequests.push(req.url);
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
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
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await expect(page.locator(".sidebar")).toBeVisible();
  await expect(page.locator(".review-toolbar")).toContainText("시연 모드");
  assert.equal(
    await page.getByText("서버 연결이 필요합니다.", { exact: true }).count(),
    0,
  );
  await page.getByRole("button", { name: "받은편지함", exact: true }).click();
  await page
    .locator(".inbox-toolbar")
    .getByRole("button", { name: "새 메일 확인", exact: true })
    .click();
  const popup = page.getByRole("dialog", {
    name: "수행사 투입 요청 2건",
    exact: true,
  });
  await expect(popup).toBeVisible();
  await expect(popup).toContainText(
    "새 메일 5통 중 수행사 투입 관련 메일 2통을 찾았습니다.",
  );
  await popup.getByRole("button", { name: "나중에 검토", exact: true }).click();
  await expect(page.locator("[data-inbox-message]")).toHaveCount(5);
  await page.reload();
  await expect(page.locator(".sidebar")).toBeVisible();
  await page.getByRole("button", { name: "받은편지함", exact: true }).click();
  await expect(page.locator("[data-inbox-message]")).toHaveCount(5);
  await expect(
    page.getByRole("button", { name: "검토 대기 2건", exact: true }),
  ).toBeVisible();
  await chooseDemoRole(page, "member");
  await expect(page.locator(".sidebar")).toBeVisible();
  const own = await page.evaluate(
    async () => await (await fetch("/api/state")).json(),
  );
  assert.equal(own.state.people.length, 1);
  assert.equal(own.actor.kind, "member");
  await chooseDemoRole(page, "pmo");
  await expect(page.locator(".sidebar")).toBeVisible();
  await page.evaluate(() => scrollTo(0, 0));
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({
    path: "artifacts/vercel-static-deployment.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(apiRequests, []);
  console.log(
    "Vercel static build: root opens offline app, 5 mails/2 drafts, reload persistence, role switching, zero network API requests passed.",
  );
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
