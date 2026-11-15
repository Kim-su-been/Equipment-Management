import { useState } from "react";
import {
  CheckCircle2,
  ClipboardList,
  GraduationCap,
  ShieldCheck,
} from "lucide-react";
import { PROJECTS } from "./data.js";
import { profileErrors, todayLocal } from "./onboarding.js";
import BrandCharacters from "./BrandCharacters.jsx";

export default function SelfRegistration({
  Modal,
  people,
  onClose,
  onRegister,
}) {
  const [form, setForm] = useState({
    name: "",
    company: "",
    project: "SFA",
    phone: "",
    start: todayLocal(),
    end: "2027-02-26",
  });
  const [errors, setErrors] = useState([]);
  return (
    <Modal
      title="수행사 본인 등록"
      subtitle="한 번 등록하면 필요한 교육·서류와 담당자 업무가 연결됩니다."
      className="registration-modal"
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const issues = profileErrors(form, people);
          setErrors(issues);
          if (!issues.length) onRegister(form);
        }}
      >
        <div className="modal-body">
          <div className="onboarding-intro">
            <div>
              <strong>프로젝트의 첫 시작, 레디보드과 함께</strong>
              <p>본인 정보 입력 → 교육·서류 배정 → 주관사 준비 → 투입 확인</p>
            </div>
            <BrandCharacters focus="guide" />
          </div>
          <div className="form-grid">
            {[
              ["name", "이름", "text"],
              ["company", "소속 수행사", "text"],
              ["phone", "연락처", "tel"],
              ["start", "투입 예정 시작일", "date"],
              ["end", "투입 예정 종료일", "date"],
            ].map(([key, label, type]) => (
              <label className="field" key={key}>
                <span>{label} *</span>
                <input
                  required
                  maxLength={80}
                  type={type}
                  value={form[key]}
                  autoComplete="off"
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                />
              </label>
            ))}
            <label className="field">
              <span>프로젝트 *</span>
              <select
                aria-label="등록 프로젝트"
                value={form.project}
                onChange={(e) => setForm({ ...form, project: e.target.value })}
              >
                {PROJECTS.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
          </div>
          {errors.length > 0 && (
            <div className="notice error" role="alert">
              <ul>
                {errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="registration-next">
            <span>
              <GraduationCap size={17} /> 필수 교육 2개
            </span>
            <span>
              <ClipboardList size={17} /> 온라인 서류 2개
            </span>
            <span>
              <ShieldCheck size={17} /> 주관사 준비 작업
            </span>
          </div>
          <p className="info-note">
            프로토타입에서는 가상 정보를 사용해 주세요. 입력한 연락처로 실제
            문자나 인증 요청을 보내지 않습니다.
          </p>
        </div>
        <footer>
          <button type="button" className="btn" onClick={onClose}>
            취소
          </button>
          <button className="btn primary" type="submit">
            <CheckCircle2 size={16} />
            등록하고 준비 시작
          </button>
        </footer>
      </form>
    </Modal>
  );
}
