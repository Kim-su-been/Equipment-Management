import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import App from "../../src/App.jsx";
import { InvitePortal, ContinueRegistration } from "../../src/AccessPortal.jsx";
import dataset from "./seed.json";
import { installDemoApi } from "./adapter.js";
import "../../src/styles.css";
import "../../src/woori-theme.css";
import "../../src/workspace-ui.css";
import "../../src/workflow-ui.css";
import "../../src/readyboard-ui.css";
import "../../src/server-ui.css";
import "../../src/mail-ui.css";
import "../../src/work-ui.css";
import "../../src/tongyang-theme.css";
const controller = await installDemoApi(dataset.stages.before);
// This flag only selects offline labels/routing; the production app continues to use its server.
function download(blob, name) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function Demo() {
  const [route, setRoute] = useState(location.hash),
    [settingsOpen, setSettingsOpen] = useState(false),
    settingsDialog = useRef(null),
    [, setVersion] = useState(0),
    [epoch, setEpoch] = useState(0),
    [loggedOut, setLoggedOut] = useState(false),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [resetPrompt, setResetPrompt] = useState(false),
    [continueOpen, setContinueOpen] = useState(false),
    bar = useRef(null);
  const params = new URLSearchParams(route.slice(1)),
    invite = params.get("invite"),
    role = params.get("role") || "pmo",
    people = controller.people(),
    registered = people.filter((p) => p.registrationStatus === "registered");
  const person =
    registered.find((p) => p.id === params.get("person")) ||
    registered.find((p) => p.id === dataset.kimId) ||
    registered[0];
  const actor =
    role === "member" && person
      ? { kind: "member", personId: person.id, project: person.project }
      : {
          kind: "admin",
          scope: role === "sfa" ? "SFA" : role === "gw" ? "그룹웨어" : "PMO",
        };
  controller.setActor(loggedOut ? null : actor);
  const resource = controller.getResource();
  useEffect(() => {
    const hash = () => {
        setRoute(location.hash);
        setContinueOpen(false);
      },
      changed = () => setVersion((v) => v + 1);
    const settings = () => setSettingsOpen(true);
    window.addEventListener("readyboard:open-demo-settings", settings);
    window.addEventListener("hashchange", hash);
    window.addEventListener("readyboard:offline-change", changed);
    return () => {
      window.removeEventListener("readyboard:open-demo-settings", settings);
      window.removeEventListener("hashchange", hash);
      window.removeEventListener("readyboard:offline-change", changed);
    };
  }, []);
  useEffect(() => {
    const measure = () =>
      document.documentElement.style.setProperty(
        "--demo-bar-height",
        `${bar.current?.getBoundingClientRect().height || 110}px`,
      );
    const observer = new ResizeObserver(measure);
    observer.observe(bar.current);
    measure();
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (settingsOpen) settingsDialog.current?.showModal();
  }, [settingsOpen]);
  async function run(action) {
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }
  function choose(value, pid) {
    setLoggedOut(false);
    location.hash = new URLSearchParams({
      role: value,
      ...(value === "member" && pid ? { person: pid } : {}),
    }).toString();
  }
  function closeSettings() {
    settingsDialog.current?.close();
    setSettingsOpen(false);
  }
  function showInbox() {
    closeSettings();
    choose("pmo");
    setTimeout(
      () =>
        [...document.querySelectorAll(".sidebar button")]
          .find((b) => b.textContent.trim() === "받은편지함")
          ?.click(),
      50,
    );
  }
  return (
    <>
      <div className="review-toolbar" ref={bar}>
        <span className="demo-mode-badge">시연 모드</span>
        <button
          className="demo-settings-trigger"
          aria-label="시연 설정"
          aria-haspopup="dialog"
          aria-expanded={settingsOpen}
          onClick={() => setSettingsOpen(true)}
        >
          시연 설정 · 안내
        </button>
      </div>
      {settingsOpen && (
        <dialog
          ref={settingsDialog}
          className="demo-settings-dialog"
          aria-label="시연 설정"
          onCancel={(e) => {
            e.preventDefault();
            closeSettings();
          }}
        >
          <header>
            <h2>시연 설정</h2>
            <button aria-label="시연 설정 닫기" onClick={closeSettings}>
              닫기
            </button>
          </header>
          <div className="demo-description">
            <b>
              레디보드 · HTML 단독 시연{" "}
              <small className="demo-build">
                {document.querySelector('meta[name="readyboard-build"]')
                  ?.content || "브라우저 모드"}
              </small>
            </b>
            <span>
              {controller.storageKind === "IndexedDB"
                ? "명단·파일·검토 이력을 이 브라우저에 저장합니다."
                : "현재 브라우저에서 영구 저장을 사용할 수 없습니다. 종료 전 백업을 내려받으세요."}{" "}
              외부 메일·AI·본인확인·메신저는 시연입니다.
            </span>
          </div>
          <div className="demo-controls">
            <label>
              화면 역할
              <select
                aria-label="검토 화면 역할"
                value={role}
                disabled={busy}
                onChange={(e) => choose(e.target.value, person?.id)}
              >
                <option value="pmo">PMO 주관사</option>
                <option value="sfa">SFA 담당자</option>
                <option value="gw">그룹웨어 담당자</option>
                <option value="member">수행사</option>
              </select>
            </label>
            {role === "member" && (
              <label>
                수행사 인원
                <select
                  aria-label="시연 수행사 인원"
                  value={person?.id || ""}
                  onChange={(e) => choose("member", e.target.value)}
                >
                  {registered.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.project})
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button onClick={showInbox}>받은편지함 열기</button>
            <button
              onClick={() => {
                closeSettings();
                setContinueOpen((v) => !v);
              }}
            >
              초대 링크 열기
            </button>
            <button
              disabled={busy}
              onClick={() =>
                run(async () => {
                  download(await controller.backup(), "레디보드_시연백업.json");
                  setMessage("명단·파일·초대·메일 이력을 백업했습니다.");
                })
              }
            >
              시연 백업
            </button>
            <label className="demo-restore">
              백업 불러오기
              <input
                aria-label="시연 백업 불러오기"
                type="file"
                accept=".json"
                disabled={busy}
                onChange={(e) => {
                  const file = e.target.files[0];
                  if (file)
                    run(async () => {
                      await controller.restore(file);
                      setEpoch((v) => v + 1);
                      choose("pmo");
                      setVersion((v) => v + 1);
                      setMessage("백업을 불러왔습니다.");
                    });
                  e.target.value = "";
                }}
              />
            </label>
            <button disabled={busy} onClick={() => setResetPrompt(true)}>
              시연 초기화
            </button>
          </div>
          {resetPrompt && (
            <div className="demo-confirm" role="alert">
              <span>
                현재 브라우저의 시연 명단·업로드 원본·검토 이력을 초기 데이터로
                되돌릴까요? 필요한 자료는 먼저 백업하세요.
              </span>
              <button
                onClick={() =>
                  run(async () => {
                    await controller.reset();
                    setResetPrompt(false);
                    choose("pmo");
                    setVersion((v) => v + 1);
                    location.reload();
                  })
                }
              >
                초기화 실행
              </button>
              <button onClick={() => setResetPrompt(false)}>취소</button>
            </div>
          )}
          {message && (
            <p className="demo-notice" role="status">
              {message}
              <button onClick={() => setMessage("")}>닫기</button>
            </p>
          )}
        </dialog>
      )}
      {continueOpen ? (
        <main className="demo-continue">
          <ContinueRegistration onClose={() => setContinueOpen(false)} />
        </main>
      ) : invite ? (
        <InvitePortal
          key={invite}
          token={invite}
          onComplete={(result) => {
            controller.setActor(result.actor);
            choose("member", result.actor.personId);
            setVersion((v) => v + 1);
          }}
        />
      ) : loggedOut ? (
        <main className="demo-continue">
          <h2>시연 화면을 종료했습니다.</h2>
          <p>상단에서 역할을 선택하거나 아래 버튼으로 시연을 계속하세요.</p>
          <button className="btn primary" onClick={() => choose("pmo")}>
            PMO로 시작
          </button>
          <button className="btn" onClick={() => choose("member", person?.id)}>
            수행사로 시작
          </button>
        </main>
      ) : (
        <App
          key={`${role}-${person?.id}-${epoch}`}
          initialState={resource.state}
          actor={actor}
          onLogout={() => {
            controller.setActor(null);
            setLoggedOut(true);
          }}
        />
      )}
    </>
  );
}
const style = document.createElement("style");
style.textContent = `:root{--demo-bar-height:32px}body{padding-top:var(--demo-bar-height)}.review-toolbar{position:fixed;inset:0 0 auto;z-index:950;display:flex;justify-content:flex-end;align-items:center;gap:12px;padding:4px 22px;background:#f6f8fa;border-bottom:1px solid #dce3e9;color:#42566b;font-size:12px;height:32px}.demo-settings-trigger{border:0;background:transparent;color:#0067ac;font-weight:650;cursor:pointer;font:inherit}.demo-settings-dialog{position:fixed;width:min(720px,calc(100vw - 28px));max-height:85dvh;overflow:auto;inset:0;margin:auto;padding:24px;border:1px solid #b9c9d7;border-radius:14px;background:white;color:#20384f;z-index:10000;box-shadow:0 20px 80px #123f6d30}.demo-settings-dialog::backdrop{background:#142a4266}.demo-settings-dialog>header{display:flex;justify-content:space-between;align-items:center;margin-bottom:18px}.demo-settings-dialog h2{margin:0;font-size:22px}.demo-settings-dialog button,.demo-settings-dialog select{font:inherit;cursor:pointer;border:1px solid #b9cad8;border-radius:7px;padding:8px;background:white;color:#254662}.demo-description{display:grid;gap:12px;line-height:1.8;margin-bottom:20px}.demo-description b{font-size:15px}.demo-description small{color:#516a80}.demo-controls{display:flex;gap:12px;flex-wrap:wrap;align-items:end}.demo-controls label{display:grid;gap:6px;font-size:13px}.demo-controls select{max-width:280px}.demo-restore input{max-width:200px}.demo-restore{border:1px solid #b9cad8;border-radius:7px;padding:8px;cursor:pointer}.demo-confirm{display:flex;gap:10px;flex-wrap:wrap;border:1px solid #dec175;background:#fff8e5;padding:14px;margin-top:18px;border-radius:8px}.demo-confirm span{width:100%}.demo-notice{display:flex;gap:10px;justify-content:space-between;padding:12px;background:#eef6fc;color:#123f6d}.sidebar,.topbar{top:var(--demo-bar-height)!important}.sidebar{height:calc(100dvh - var(--demo-bar-height))!important}.modal-backdrop{top:var(--demo-bar-height)!important}.demo-continue{max-width:620px;margin:30px auto;padding:24px;background:white;border:1px solid #bfd8ed;border-radius:14px}.invitation-page{min-height:calc(100dvh - var(--demo-bar-height))}@media(max-width:750px){.review-toolbar{padding:4px 14px}.demo-settings-dialog{padding:18px}.demo-continue{margin:20px 12px}}`;

document.head.append(style);
createRoot(document.getElementById("review-bar")).render(null);
createRoot(document.getElementById("root")).render(<Demo />);
