import { fileURLToPath } from "node:url";
import path from "node:path";
import { existsSync } from "node:fs";
import { createApplication } from "./app.js";
const root = fileURLToPath(new URL("../", import.meta.url));
if (existsSync(path.join(root, ".env")))
  process.loadEnvFile(path.join(root, ".env"));
const passwords = {};
if (process.env.ADMIN_PASSWORD) passwords.PMO = process.env.ADMIN_PASSWORD;
if (process.env.SFA_MANAGER_PASSWORD)
  passwords.SFA = process.env.SFA_MANAGER_PASSWORD;
if (process.env.GW_MANAGER_PASSWORD)
  passwords["그룹웨어"] = process.env.GW_MANAGER_PASSWORD;
if (!passwords.PMO) {
  console.error(
    "ADMIN_PASSWORD를 .env 또는 실행 환경변수에 설정해 주세요. .env.example을 참고하세요.",
  );
  process.exit(1);
}
const port = Number(process.env.API_PORT || 3001),
  host = process.env.API_HOST || "127.0.0.1";
const inviteHours = Number(process.env.INVITE_TTL_HOURS || 72);
if (!Number.isFinite(inviteHours) || inviteHours <= 0 || inviteHours > 720) {
  console.error("INVITE_TTL_HOURS는 0 초과 720 이하로 설정해 주세요.");
  process.exit(1);
}
const publicBase = process.env.PUBLIC_BASE_URL
  ? new URL(process.env.PUBLIC_BASE_URL).origin
  : "";
const app = createApplication({
  dbPath: process.env.DB_PATH || path.join(root, "data/readyboard.sqlite"),
  staticRoot: path.join(root, "dist"),
  passwords,
  seedDemo: process.env.SEED_DEMO === "true",
  inviteKey: process.env.INVITE_ENCRYPTION_KEY,
  inviteTtlMs: inviteHours * 3600000,
  publicBaseUrl: publicBase,
  secureCookies: process.env.SECURE_COOKIES === "true",
  aiKey: process.env.OPENAI_API_KEY || "",
  aiBase: process.env.AI_BASE_URL || "https://api.openai.com/v1",
  aiModel: process.env.AI_MODEL || "gpt-4.1-mini",
  mailProvider: process.env.MAIL_PROVIDER || "mock",
  mailHost: process.env.MAIL_IMAP_HOST || "",
  mailPort: Number(process.env.MAIL_IMAP_PORT || 993),
  mailUser: process.env.MAIL_IMAP_USER || "",
  mailPassword: process.env.MAIL_IMAP_PASSWORD || "",
  mailAccessToken: process.env.MAIL_IMAP_ACCESS_TOKEN || "",
  mailFolder: process.env.MAIL_FOLDER || "",
  mailSearch: process.env.MAIL_SEARCH || "",
  mailSince: process.env.MAIL_SINCE || "",
});
app.server.listen(port, host, () =>
  console.log(
    `Partner360 server: http://${host}:${port} · SQLite persistence enabled`,
  ),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => app.close().then(() => process.exit(0)));
