const http = require("node:http"),
  fs = require("node:fs"),
  path = require("node:path"),
  { spawn } = require("node:child_process");
const server = http.createServer((req, res) => {
  if (!["/", "/readyboard-review.html"].includes(req.url)) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  fs.createReadStream(path.join(__dirname, "readyboard-review.html")).pipe(res);
});
server.listen(0, "127.0.0.1", () => {
  const url = `http://127.0.0.1:${server.address().port}`;
  console.log(`레디보드 HTML: ${url}\n종료: Ctrl+C`);
  if (process.platform === "win32")
    spawn("cmd", ["/c", "start", "", url], { stdio: "ignore" });
});
