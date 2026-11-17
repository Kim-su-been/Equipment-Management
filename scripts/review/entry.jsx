import React from "react";
import { createRoot } from "react-dom/client";
import App from "../../src/App.jsx";
import dataset from "../../artifacts/review-data.json";
import { installDemoApi } from "./adapter.js";
import "../../src/styles.css";
import "../../src/woori-theme.css";
import "../../src/workspace-ui.css";
import "../../src/workflow-ui.css";
import "../../src/readyboard-ui.css";
import "../../src/server-ui.css";
import "../../src/mail-ui.css";
const role = new URLSearchParams(location.hash.slice(1)).get("role") || "pmo";
const actor =
  role === "member"
    ? { kind: "member", personId: dataset.kimId, project: "SFA" }
    : { kind: "admin", scope: role === "sfa" ? "SFA" : "PMO" };
const state = installDemoApi(dataset.stages.before, actor);
function showInbox() {
  const button = [...document.querySelectorAll(".sidebar button")].find(
    (b) => b.textContent.trim() === "AI 메일 요청 검토",
  );
  button?.click();
}
function Toolbar() {
  return (
    <div className="review-toolbar">
      <div>
        <b>레디보드 · 받은편지함 시연</b>
        <span>
          합성 데이터 · 규칙 기반 분석 · 변경은 현재 탭에서만 유지 ·
          새로고침하면 초기화
        </span>
      </div>
      <button onClick={showInbox}>받은편지함 열기</button>
      <label>
        역할
        <select
          aria-label="검토 화면 역할"
          value={role}
          onChange={(e) => {
            location.hash = `role=${e.target.value}`;
            location.reload();
          }}
        >
          <option value="pmo">PMO 주관사</option>
          <option value="sfa">SFA 담당자</option>
          <option value="member">수행사 · 김민수</option>
        </select>
      </label>
      <button onClick={() => location.reload()}>시연 초기화</button>
    </div>
  );
}
const style = document.createElement("style");
style.textContent = `body{padding-top:86px}.review-toolbar{position:fixed;inset:0 0 auto;z-index:10000;min-height:86px;display:flex;align-items:center;gap:16px;flex-wrap:wrap;padding:12px 22px;background:#eef7ff;border-bottom:2px solid #0067ac;color:#173f64;font-size:12px}.review-toolbar>div{flex:1;min-width:240px;display:grid;gap:7px}.review-toolbar b{font-size:16px}.review-toolbar label{display:grid;gap:5px}.review-toolbar select,.review-toolbar button{font:inherit;color:#173f64;border:1px solid #a8c7e2;border-radius:6px;padding:8px;background:white}.review-toolbar button{cursor:pointer}.sidebar,.topbar{top:86px!important}.sidebar{height:calc(100vh - 86px)!important}.modal-backdrop{top:86px!important}@media(max-width:850px){body{padding-top:140px}.review-toolbar{min-height:140px}.sidebar,.topbar{top:140px!important}.sidebar{height:calc(100vh - 140px)!important}.modal-backdrop{top:140px!important}}`;
document.head.append(style);
createRoot(document.getElementById("review-bar")).render(<Toolbar />);
createRoot(document.getElementById("root")).render(
  <App initialState={state} actor={actor} onLogout={() => location.reload()} />,
);
