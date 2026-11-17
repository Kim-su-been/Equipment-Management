import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
const dir = mkdtempSync(path.join(os.tmpdir(), "readyboard-browser-"));
const mailSuite = process.env.TEST_SUITE === "mail";
const child = spawn(process.execPath, ["scripts/dev.mjs", "--strictPort"], {
  stdio: "inherit",
  env: {
    ...process.env,
    ADMIN_PASSWORD: "browser-admin",
    SFA_MANAGER_PASSWORD: "browser-sfa",
    GW_MANAGER_PASSWORD: "browser-gw",
    DB_PATH: path.join(dir, "db.sqlite"),
    SEED_DEMO: "false",
    API_PORT: mailSuite ? "3012" : "3011",
    WEB_PORT: mailSuite ? "5181" : "5180",
    PUBLIC_BASE_URL: mailSuite
      ? "http://127.0.0.1:5181"
      : "http://127.0.0.1:5180",
    MAIL_PROVIDER: "mock",
    MAIL_FOLDER: "PMO/인력요청",
    MAIL_SEARCH: "",
    MAIL_SINCE: "",
    OPENAI_API_KEY: "",
  },
});
let closing = false;
function close() {
  if (closing) return;
  closing = true;
  child.kill("SIGTERM");
}
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, close);
child.on("exit", (code) => {
  rmSync(dir, { recursive: true, force: true });
  process.exit(code || 0);
});
