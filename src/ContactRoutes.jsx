import { useState } from "react";
import { TASKS, PROJECTS } from "./data.js";
import { resolveContact } from "./dooray.js";
export default function ContactRoutes({ scope, settings, onSave, onNotify }) {
  const [project, setProject] = useState(scope === "PMO" ? "SFA" : scope),
    [taskId, setTaskId] = useState("default"),
    [name, setName] = useState(""),
    [memberId, setMemberId] = useState("");
  const current = resolveContact(settings, { project }, taskId);
  const reset = () => {
    setName("");
    setMemberId("");
  };
  return (
    <section className="card settings-card">
      <div className="card-heading">
        <div>
          <h2>작업별 문의 담당자</h2>
          <p>프로젝트 기본 담당자 또는 특정 작업 담당자를 지정합니다.</p>
        </div>
        <span className="badge gray">Dooray API 미연동</span>
      </div>
      <div className="settings-body">
        <div className="form-grid">
          <label className="field">
            <span>담당 프로젝트</span>
            <select
              aria-label="문의 담당 프로젝트"
              value={project}
              disabled={scope !== "PMO"}
              onChange={(e) => {
                setProject(e.target.value);
                reset();
              }}
            >
              {(scope === "PMO" ? PROJECTS : [scope]).map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>문의 작업</span>
            <select
              aria-label="문의 담당 작업"
              value={taskId}
              onChange={(e) => {
                setTaskId(e.target.value);
                reset();
              }}
            >
              <option value="default">프로젝트 기본 담당자</option>
              {TASKS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>담당자명</span>
            <input
              aria-label="문의 담당자명"
              placeholder={current.name}
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Dooray 수신자 ID (선택)</span>
            <input
              aria-label="Dooray 수신자 ID"
              placeholder={current.memberId || "API 연동 시 사용할 수신자 ID"}
              value={memberId}
              maxLength={120}
              onChange={(e) => setMemberId(e.target.value)}
            />
          </label>
        </div>
        <p className="info-note">
          현재 연결: {current.name} · {current.memberId || "수신자 ID 미설정"}.
          담당자 설정만으로 외부 메시지가 전송되지는 않습니다. API 비밀키는
          브라우저에 저장하지 않습니다.
        </p>
        <button
          className="btn primary"
          onClick={() => {
            try {
              onSave({
                project,
                taskId,
                name: name || current.name,
                memberId: memberId || current.memberId || "",
              });
              onNotify("문의 담당자를 저장했습니다.");
            } catch (e) {
              onNotify(e.message);
            }
          }}
        >
          담당자 저장
        </button>
      </div>
    </section>
  );
}
