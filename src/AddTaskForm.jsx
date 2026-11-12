import { useState } from "react";
import { Plus, Users, ShieldCheck } from "lucide-react";
import { PROJECTS, TASKS } from "./data.js";

export default function AddTaskForm({ scope, people, onClose, onSubmit }) {
  const [form, setForm] = useState({
    title: "",
    desc: "",
    project: scope === "PMO" ? "전체" : scope,
    owner: "member",
    due: "",
    dependency: "",
    required: true,
    target: "all",
    personIds: [],
  });
  const change = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const available = people.filter(
    (p) => form.project === "전체" || p.project === form.project,
  );
  const count =
    form.target === "all" ? available.length : form.personIds.length;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(form);
      }}
    >
      <div className="modal-body add-task-body">
        <div className="notice task-permission-note">
          <ShieldCheck size={18} />
          {scope === "PMO"
            ? "PMO는 전체 또는 특정 프로젝트에 작업을 추가할 수 있습니다."
            : `${scope} 담당자는 ${scope} 인원의 작업만 추가할 수 있습니다.`}
        </div>
        <label className="field">
          <span>작업명 *</span>
          <input
            required
            maxLength={100}
            placeholder="예: 프로젝트 개발 환경 접속 확인"
            value={form.title}
            onChange={(e) => change("title", e.target.value)}
          />
        </label>
        <label className="field">
          <span>작업 안내 *</span>
          <textarea
            required
            rows={3}
            maxLength={1000}
            placeholder="대상 인원이 해야 할 일과 완료 기준을 적어 주세요."
            value={form.desc}
            onChange={(e) => change("desc", e.target.value)}
          />
        </label>
        <div className="form-grid">
          <label className="field">
            <span>적용 프로젝트</span>
            <select
              value={form.project}
              disabled={scope !== "PMO"}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  project: e.target.value,
                  personIds: [],
                }))
              }
            >
              {scope === "PMO" && <option value="전체">전체 프로젝트</option>}
              {(scope === "PMO" ? PROJECTS : [scope]).map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>수행 주체</span>
            <select
              value={form.owner}
              onChange={(e) => change("owner", e.target.value)}
            >
              <option value="member">수행사 본인</option>
              <option value="admin">주관사 담당자</option>
            </select>
          </label>
          <label className="field">
            <span>처리 기한 (선택)</span>
            <input
              type="date"
              value={form.due}
              onChange={(e) => change("due", e.target.value)}
            />
          </label>
          <label className="field">
            <span>선행 작업 (선택)</span>
            <select
              value={form.dependency}
              onChange={(e) => change("dependency", e.target.value)}
            >
              <option value="">없음 · 바로 실행 가능</option>
              {TASKS.filter((t) => t.id !== "O16").map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">
          <span>대상 인원</span>
          <select
            aria-label="대상 인원"
            value={form.target}
            onChange={(e) => change("target", e.target.value)}
          >
            <option value="all">
              프로젝트 인원 전체 (이후 등록 인원 포함)
            </option>
            <option value="selected">특정 인원 선택</option>
          </select>
        </label>
        {form.target === "selected" && (
          <fieldset className="task-recipient-list">
            <legend>작업을 받을 인원 선택</legend>
            {available.map((p) => (
              <label key={p.id}>
                <input
                  type="checkbox"
                  aria-label={`${p.id} 선택`}
                  checked={form.personIds.includes(p.id)}
                  onChange={(e) =>
                    change(
                      "personIds",
                      e.target.checked
                        ? [...form.personIds, p.id]
                        : form.personIds.filter((id) => id !== p.id),
                    )
                  }
                />
                <span>{p.id}</span>
                <small>{p.project}</small>
              </label>
            ))}
          </fieldset>
        )}
        <label className="task-required">
          <input
            type="checkbox"
            checked={form.required}
            onChange={(e) => change("required", e.target.checked)}
          />
          <span>
            <strong>투입 준비 필수 작업</strong>
            <small>
              필수 작업은 준비율과 최종 투입 준비 확인에 반영됩니다.
            </small>
          </span>
        </label>
        <div className="task-target-summary">
          <Users size={19} />
          <span>
            <strong>
              {form.project === "전체" ? "전체 프로젝트" : form.project} ·{" "}
              {count}명
            </strong>
            에게 {form.owner === "member" ? "수행사" : "주관사"} 작업을
            추가합니다.
          </span>
        </div>
      </div>
      <footer>
        <button type="button" className="btn" onClick={onClose}>
          취소
        </button>
        <button
          className="btn primary"
          type="submit"
          disabled={form.target === "selected" && !count}
        >
          <Plus size={16} />
          작업 추가하기
        </button>
      </footer>
    </form>
  );
}
