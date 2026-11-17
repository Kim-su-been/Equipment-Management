import { useState } from "react";
import {
  CheckCircle2,
  ShieldCheck,
  GraduationCap,
  ClipboardList,
  AlertCircle,
} from "lucide-react";
import { api } from "./api.js";
import { todayLocal } from "./onboarding.js";
import BrandCharacters from "./BrandCharacters.jsx";
export default function SelfRegistration({ person, token, onComplete }) {
  const [form, setForm] = useState({
      phone: person.phone || "",
      start: person.start || todayLocal(),
      end: person.end || "",
      birthDate: person.birthDate || "",
      confirmed: false,
    }),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [different, setDifferent] = useState(false);
  return (
    <section className="card invitation-form">
      <div className="card-heading">
        <div>
          <span className="eyebrow">PERSONAL INVITATION</span>
          <h1>내 등록 이어하기</h1>
          <p>
            이 링크는 {person.name}님의 {person.project} 참여 기록 한 건에
            연결됩니다.
          </p>
        </div>
        <BrandCharacters focus="guide" />
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const result = await api(
              `/api/invites/${encodeURIComponent(token)}`,
              { method: "POST", body: form },
            );
            history.replaceState(null, "", "/");
            onComplete(result);
          } catch (e) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="modal-body">
          <div className="registration-basic">
            <h2>계획서에서 확인한 기본 정보</h2>
            <dl>
              {[
                ["성명", person.name],
                ["소속회사", person.company],
                ["프로젝트", person.project],
                [
                  "생년월일",
                  person.birthDate ||
                    (person.birthYear
                      ? `${person.birthYear}년 · 월/일 확인 필요`
                      : "확인 필요"),
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <button
              type="button"
              className="text-link"
              onClick={() => setDifferent(!different)}
            >
              기본 정보가 제 정보와 다릅니다
            </button>
            {different && (
              <div className="notice error">
                <AlertCircle size={18} />이 링크에서 이름·소속을 바꾸지 마세요.
                링크를 전달한 PMO에 기본 정보와 초대 대상을 확인해 주세요.
              </div>
            )}
          </div>
          <h2>추가 정보 입력</h2>
          <div className="form-grid">
            <label className="field">
              <span>생년월일 *</span>
              <input
                required
                aria-label="생년월일"
                type="date"
                value={form.birthDate}
                readOnly={!!person.birthDate}
                onChange={(e) =>
                  setForm({ ...form, birthDate: e.target.value })
                }
              />
              {!person.birthDate && (
                <small>
                  {person.birthYear
                    ? `${person.birthYear}년에 해당하는 월·일을 확인해 주세요.`
                    : "전체 생년월일을 확인해 주세요."}
                </small>
              )}
            </label>
            <label className="field">
              <span>연락처 *</span>
              <input
                required
                aria-label="연락처"
                type="tel"
                maxLength={20}
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </label>
            <label className="field">
              <span>투입 예정 시작일 *</span>
              <input
                required
                type="date"
                value={form.start}
                onChange={(e) => setForm({ ...form, start: e.target.value })}
              />
            </label>
            <label className="field">
              <span>투입 예정 종료일 *</span>
              <input
                required
                type="date"
                value={form.end}
                onChange={(e) => setForm({ ...form, end: e.target.value })}
              />
            </label>
          </div>
          <label className="online-check">
            <input
              required
              type="checkbox"
              checked={form.confirmed}
              onChange={(e) =>
                setForm({ ...form, confirmed: e.target.checked })
              }
            />
            위 기본 정보가 본인의 정보임을 확인했습니다.
          </label>
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
          <div className="registration-next">
            <span>
              <GraduationCap size={17} />
              교육 확인
            </span>
            <span>
              <ClipboardList size={17} />
              서류 제출
            </span>
            <span>
              <ShieldCheck size={17} />
              계정·출입 준비
            </span>
          </div>
          <p className="info-note">
            등록을 완료하면 이 링크는 사용 종료되며, 같은 인원 기록에 준비
            작업이 연결됩니다.
          </p>
        </div>
        <footer>
          <button
            className="btn primary"
            disabled={busy || different || !form.confirmed}
          >
            <CheckCircle2 size={16} />
            {busy ? "서버에 저장 중…" : "등록 완료하고 준비 시작"}
          </button>
        </footer>
      </form>
    </section>
  );
}
