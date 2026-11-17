import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
if (existsSync(".env")) process.loadEnvFile(".env");
const server = spawn(process.execPath, ["server/index.mjs"], {
  stdio: "inherit",
  env: process.env,
});
const vite = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "--host",
    "0.0.0.0",
    "--port",
    process.env.WEB_PORT || "5173",
    ...process.argv.slice(2),
  ],
  { stdio: "inherit", env: process.env },
);
let closing = false;
const close = (code = 0) => {
  if (closing) return;
  closing = true;
  server.kill("SIGTERM");
  vite.kill("SIGTERM");
  process.exitCode = code;
};
server.on("exit", (code) => close(code || 0));
vite.on("exit", (code) => close(code || 0));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => close());
