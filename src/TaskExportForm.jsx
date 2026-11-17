import { useState } from "react";
import { Download } from "lucide-react";
import { TASKS, PROJECTS } from "./data.js";
export default function TaskExportForm({
  Modal,
  data,
  scope,
  onClose,
  onExport,
}) {
  const [project, setProject] = useState(scope === "PMO" ? "전체" : scope),
    [taskId, setTaskId] = useState("O02"),
    [selected, setSelected] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const task = [...TASKS, ...(data.customTasks || [])].find(
    (t) => t.id === taskId,
  );
  const people = data.people.filter(
    (p) =>
      (scope === "PMO" || p.project === scope) &&
      (project === "전체" || p.project === project) &&
      (!task?.custom ||
        ((task.project === "전체" || task.project === p.project) &&
          (!task.personIds || task.personIds.includes(p.id)))),
  );
  const ids = (selected || people.map((p) => p.id)).filter((id) =>
    people.some((p) => p.id === id),
  );
  return (
    <Modal
      title="작업별 양식 다운로드"
      subtitle="등록된 인원 정보를 주관사 작업의 예시 양식에 맞춰 내려받습니다."
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await onExport({ project, taskId, personIds: ids });
          } catch (error) {
            setError(error.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="modal-body">
          <div className="notice">
            eGIS·Dooray·출입별 예시 양식입니다. 실제 사내 서식을 확보하면 같은
            등록 정보에 양식을 연결할 수 있습니다.
          </div>
          <label className="field">
            <span>적용 프로젝트</span>
            <select
              aria-label="양식 프로젝트"
              disabled={scope !== "PMO"}
              value={project}
              onChange={(e) => {
                setProject(e.target.value);
                setSelected(null);
              }}
            >
              {scope === "PMO" && <option value="전체">전체 프로젝트</option>}
              {(scope === "PMO" ? PROJECTS : [scope]).map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>작업 양식</span>
            <select
              aria-label="작업 양식"
              value={taskId}
              onChange={(e) => {
                setTaskId(e.target.value);
                setSelected(null);
              }}
            >
              {[...TASKS, ...(data.customTasks || [])]
                .filter(
                  (t) =>
                    t.owner === "admin" &&
                    !t.derived &&
                    (!t.custom ||
                      scope === "PMO" ||
                      t.project === scope ||
                      t.project === "전체"),
                )
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
            </select>
          </label>
          <div className="export-selection-head">
            <strong>대상 인원 {ids.length}명</strong>
            <button
              type="button"
              className="text-link"
              onClick={() =>
                setSelected(ids.length === people.length ? [] : null)
              }
            >
              {ids.length === people.length ? "전체 해제" : "전체 선택"}
            </button>
          </div>
          <div className="task-recipient-list">
            {people.map((p) => (
              <label key={p.id}>
                <input
                  aria-label={`${p.id} 양식 대상`}
                  type="checkbox"
                  checked={ids.includes(p.id)}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...ids, p.id]
                        : ids.filter((id) => id !== p.id),
                    )
                  }
                />
                <span>
                  {p.name || p.id}
                  <small>
                    {p.id} · {p.project}
                  </small>
                </span>
              </label>
            ))}
          </div>
          {error && (
            <div className="notice error" role="alert">
              {error}
            </div>
          )}
        </div>
        <footer>
          <button type="button" className="btn" onClick={onClose}>
            닫기
          </button>
          <button className="btn primary" disabled={busy || !ids.length}>
            <Download size={16} />
            {busy ? "생성 중…" : "양식 다운로드"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
