import { useState } from "react";
import { Download } from "lucide-react";
import { TASKS, PROJECTS, tasksForPerson } from "./data.js";
import { taskExportRows, taskExportTemplate } from "./task-exports.js";
import { batchEligibility } from "./batch-tasks.js";
export default function TaskExportForm({
  Modal,
  data,
  scope,
  initialSelection,
  onClose,
  onExport,
}) {
  const [project, setProject] = useState(
    initialSelection?.project || (scope === "PMO" ? "전체" : scope),
  );
  const [taskId, setTaskId] = useState(initialSelection?.taskId || "O02");
  const [selected, setSelected] = useState(initialSelection?.personIds || null);
  const [commonFields, setCommonFields] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pendingOnly = !!initialSelection?.pendingOnly;
  const contextual = !!initialSelection?.taskId;
  const task = [...TASKS, ...(data.customTasks || [])].find(
    (t) => t.id === taskId,
  );
  const template = task && taskExportTemplate(task);
  const people = data.people.filter((p) => {
    if (
      (scope !== "PMO" && p.project !== scope) ||
      (project !== "전체" && p.project !== project)
    )
      return false;
    if (contextual && !initialSelection.personIds.includes(p.id)) return false;
    const assigned = tasksForPerson(p, data.customTasks || []).find(
      (t) => t.id === taskId,
    );
    return (
      !!assigned &&
      (!pendingOnly || !batchEligibility(p, assigned, data.customTasks || []))
    );
  });
  const ids = (selected || people.map((p) => p.id)).filter((id) =>
    people.some((p) => p.id === id),
  );
  const selection = {
    project,
    taskId,
    personIds: ids,
    pendingOnly,
    commonFields,
  };
  let preview = null,
    previewError = "";
  if (ids.length) {
    try {
      preview = taskExportRows(data, scope, selection);
    } catch (e) {
      previewError = e.message;
    }
  }
  const missing =
    preview?.rows.reduce(
      (n, row) => n + Object.values(row).filter((v) => v === "미입력").length,
      0,
    ) || 0;
  return (
    <Modal
      title="작업별 양식 다운로드"
      subtitle="선택한 인원을 업무별 예시 양식으로 확인한 뒤 기안에 첨부하세요."
      wide
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await onExport(selection);
          } catch (e) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="modal-body">
          <div className="notice">
            사내 공식 양식이 아닌 업무별 예시입니다.{" "}
            {contextual ? "준비 작업에서 선택한 인원만 표시합니다. " : ""}엑셀
            생성 후 사내 결재시스템에 첨부하고, 처리 결과는 작업에서 별도로
            기록해 주세요.
          </div>
          <div className="export-form-selectors">
            <label className="field">
              <span>적용 프로젝트</span>
              <select
                aria-label="양식 프로젝트"
                disabled={scope !== "PMO" || contextual}
                value={project}
                onChange={(e) => {
                  setProject(e.target.value);
                  setSelected(null);
                  setCommonFields({});
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
                disabled={contextual}
                value={taskId}
                onChange={(e) => {
                  setTaskId(e.target.value);
                  setSelected(null);
                  setCommonFields({});
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
          </div>
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
                  aria-label={`${p.name} 양식 대상`}
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
                  {p.name}
                  <small>
                    {p.company} · {p.project}
                  </small>
                </span>
              </label>
            ))}
          </div>
          {!people.length && (
            <p className="work-empty">
              선택할 수 있는 인원이 없습니다. 작업 상태가 변경됐다면 준비
              작업에서 다시 선택해 주세요.
            </p>
          )}
          {!!template?.extraFields?.length && (
            <fieldset className="export-common-fields">
              <legend>신청·징구 추가 정보</legend>
              <p>
                선택한 인원에게 공통으로 들어갈 내용입니다. 인원마다 다른 값은
                내려받은 엑셀에서 보완해 주세요.
              </p>
              <div>
                {template.extraFields.map(([label, key]) => (
                  <label className="field" key={key}>
                    <span>{label}</span>
                    <input
                      aria-label={`양식 ${label}`}
                      type={key === "collectionDate" ? "date" : "text"}
                      maxLength={300}
                      value={commonFields[key] || ""}
                      onChange={(e) =>
                        setCommonFields((v) => ({
                          ...v,
                          [key]: e.target.value,
                        }))
                      }
                    />
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          {preview && (
            <section
              className="export-preview-section"
              aria-label="기안 첨부 엑셀 미리보기"
            >
              <h3>엑셀 미리보기 · {preview.rows.length}명</h3>
              {missing > 0 && (
                <p className="export-missing">
                  미입력 {missing}칸이 있습니다. 신청 전에 확인·보완해 주세요.
                </p>
              )}
              <div className="export-preview">
                <table>
                  <thead>
                    <tr>
                      {template.columns.map(([label]) => (
                        <th key={label}>{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.slice(0, 5).map((row, index) => (
                      <tr key={ids[index]}>
                        {template.columns.map(([label]) => (
                          <td
                            className={row[label] === "미입력" ? "missing" : ""}
                            key={label}
                          >
                            {row[label]}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.rows.length > 5 && (
                <p>
                  미리보기는 처음 5명이며, 엑셀에는 선택한 전체{" "}
                  {preview.rows.length}명이 포함됩니다.
                </p>
              )}
            </section>
          )}
          {(error || previewError) && (
            <div className="notice error" role="alert">
              {error || previewError}
            </div>
          )}
        </div>
        <footer>
          <button type="button" className="btn" onClick={onClose}>
            닫기
          </button>
          <button
            className="btn primary"
            disabled={busy || !ids.length || !!previewError}
          >
            <Download size={16} />
            {busy ? "생성 중…" : "양식 다운로드"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
