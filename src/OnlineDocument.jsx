import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileText,
  Save,
  ShieldCheck,
  Sparkles,
  ArrowDown,
  MessageSquare,
} from "lucide-react";
import {
  DOCUMENT_VERSION,
  DOCUMENT_CLAUSES,
  DEMO_CODE,
  defaultDocument,
  documentIssues,
  createDemoProof,
  validateSubmission,
} from "./onboarding.js";
import BrandCharacters from "./BrandCharacters.jsx";

const FIELD_LABELS = {
  phone: "연락처",
  name: "이름",
  company: "소속",
  project: "프로젝트",
  email: "이메일",
  start: "투입 시작일",
  end: "투입 종료일",
  read: "중요 조항 읽기",
  acknowledged: "내용 확인",
  consent: "동의 여부",
  signature: "본인 입력 서명",
  verification: "시연 본인확인",
};
export default function OnlineDocument({
  Modal,
  person,
  task,
  admin,
  status,
  onClose,
  onDraft,
  onSubmit,
  onReview,
  onDownload,
  onNotify,
  onInquiry,
}) {
  const latest = person.submissions?.[task.id]?.at(-1);
  const editable = !admin && ["ready", "fix", "done"].includes(status);
  const [values, setValues] = useState(
    () =>
      person.documentDrafts?.[task.id]?.values ||
      (status !== "fix" && latest?.values) ||
      defaultDocument(person, task.id),
  );
  const [active, setActive] = useState("profile"),
    [code, setCode] = useState(""),
    [proof, setProof] = useState(null),
    [requestCode, setRequestCode] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [note, setNote] = useState(""),
    [saved, setSaved] = useState(false);
  const [editing, setEditing] = useState(!latest || status === "fix");
  const sections = useRef({}),
    mounted = useRef(false);
  const formIssues = documentIssues(person, task.id, values);
  const issues = validateSubmission(person, task.id, values, proof);
  const showForm = editable && editing;
  const jump = (field) => {
    const section = ["read", "acknowledged", "consent"].includes(field)
      ? "clauses"
      : field === "signature" || field === "verification"
        ? "signature"
        : "profile";
    setActive(section);
    sections.current[section]?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
    sections.current[section]
      ?.querySelector(`[name="${field}"]`)
      ?.focus({ preventScroll: true });
  };
  const change = (key, value) => {
    setValues((v) => ({ ...v, [key]: value }));
    setProof(null);
    setRequestCode(false);
    setSaved(false);
    setError("");
  };
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (!showForm) return;
    const timer = setTimeout(() => {
      onDraft(values);
      setSaved(true);
    }, 650);
    return () => clearTimeout(timer);
  }, [values, showForm]);
  const submit = async () => {
    setError("");
    if (issues.length) {
      setError(issues[0].message);
      jump(issues[0].field);
      return;
    }
    setBusy(true);
    try {
      await onSubmit(values, proof);
      setEditing(false);
      setProof(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={`${task.title} · 온라인 서류`}
      subtitle={`${person.name || person.id} · ${person.project} · 양식 ${DOCUMENT_VERSION}`}
      onClose={onClose}
      wide
      className="online-document-modal"
    >
      <div className="online-document-layout">
        <div className="online-document-main">
          <div className="online-document-toolbar">
            <span>
              <FileText size={17} />
              {latest ? `최근 제출 v${latest.version}` : "작성 중"}
            </span>
            <span className="subtle-tag">
              {status === "review"
                ? "담당자 확인 요청"
                : status === "done"
                  ? "승인 완료"
                  : "온라인 작성"}
            </span>
            {latest && (
              <button
                className="text-link"
                onClick={() => onDownload(latest.storageId)}
              >
                <Download size={15} />
                제출 원본
              </button>
            )}
          </div>
          {person.notes?.[task.id] && (
            <div className={`notice ${status === "fix" ? "error" : ""}`}>
              <AlertCircle size={17} />
              {person.notes[task.id]}
            </div>
          )}
          <div className="notice compact">
            시연용 양식과 본인확인입니다. 실제 인증·전자서명 서비스, 실제 AI
            모델은 연결되지 않았습니다.
          </div>
          {showForm ? (
            <div className="online-paper">
              <header>
                <span>PROJECT ONBOARDING · ONLINE</span>
                <h2>{task.title}</h2>
                <p>
                  필수 항목을 위에서부터 확인해 주세요. 입력 내용은 임시
                  저장됩니다.
                </p>
              </header>
              <section
                className={active === "profile" ? "active" : ""}
                ref={(el) => (sections.current.profile = el)}
                onFocus={() => setActive("profile")}
              >
                <h3>
                  <b>01</b> 등록 정보 확인
                </h3>
                <p className="section-help">
                  등록 정보로 자동 입력했습니다. 정보 변경이 필요하면 내
                  정보에서 확인해 주세요.
                </p>
                <div className="form-grid">
                  {[
                    ["name", "이름"],
                    ["company", "소속"],
                    ["project", "프로젝트"],
                    ["email", "이메일"],
                    ["start", "투입 시작일"],
                    ["end", "투입 종료일"],
                  ].map(([key, label]) => (
                    <label className="field" key={key}>
                      <span>{label}</span>
                      <input name={key} value={values[key]} readOnly />
                    </label>
                  ))}
                  <label className="field">
                    <span>연락처 *</span>
                    <input
                      name="phone"
                      type="tel"
                      value={values.phone}
                      maxLength={20}
                      onChange={(e) => change("phone", e.target.value)}
                    />
                  </label>
                </div>
              </section>
              <section
                className={active === "clauses" ? "active" : ""}
                ref={(el) => (sections.current.clauses = el)}
                onFocus={() => setActive("clauses")}
              >
                <h3>
                  <b>02</b> 중요한 내용 읽기
                </h3>
                {DOCUMENT_CLAUSES[task.id].map((text, i) => (
                  <p className="important-clause" key={text}>
                    <strong>확인 {i + 1}</strong>
                    {text}
                  </p>
                ))}
                <label className="online-check">
                  <input
                    name="read"
                    type="checkbox"
                    checked={values.read}
                    onChange={(e) => change("read", e.target.checked)}
                  />
                  위 중요 조항을 모두 읽었습니다. *
                </label>
                {task.id === "O11" && (
                  <fieldset className="consent-options">
                    <legend>개인정보 수집·이용 동의 여부 *</legend>
                    {[
                      ["agree", "동의함"],
                      ["disagree", "동의하지 않음"],
                    ].map(([v, label]) => (
                      <label key={v}>
                        <input
                          name="consent"
                          type="radio"
                          value={v}
                          checked={values.consent === v}
                          onChange={() => change("consent", v)}
                        />
                        {label}
                      </label>
                    ))}
                    <p>
                      동의하지 않음을 선택해도 제출할 수 있으며, 담당자에게 별도
                      확인 요청으로 전달됩니다.
                    </p>
                  </fieldset>
                )}
                <label className="online-check">
                  <input
                    name="acknowledged"
                    type="checkbox"
                    checked={values.acknowledged}
                    onChange={(e) => change("acknowledged", e.target.checked)}
                  />
                  작성 내용과 확인 항목을 검토했습니다. *
                </label>
              </section>
              <section
                className={active === "signature" ? "active" : ""}
                ref={(el) => (sections.current.signature = el)}
                onFocus={() => setActive("signature")}
              >
                <h3>
                  <b>03</b> 본인 입력 서명 및 확인
                </h3>
                <label className="field">
                  <span>본인 입력 서명 *</span>
                  <input
                    name="signature"
                    value={values.signature}
                    maxLength={80}
                    placeholder="등록 성명을 동일하게 입력해 주세요"
                    onChange={(e) => change("signature", e.target.value)}
                  />
                </label>
                <div className="demo-verification">
                  <strong>
                    <ShieldCheck size={18} />
                    시연 본인확인 · 실제 인증 아님
                  </strong>
                  <p>
                    이름·연락처 입력만으로 실제 본인인증을 완료한 것으로
                    처리하지 않습니다. 아래 확인은 연결 흐름 시연용입니다.
                  </p>
                  {proof ? (
                    <p className="verified-proof">
                      <CheckCircle2 size={17} />
                      시연 확인 완료 · 내용 변경 시 다시 확인
                    </p>
                  ) : (
                    <>
                      <button
                        className="btn"
                        disabled={formIssues.length > 0}
                        onClick={() => setRequestCode(true)}
                      >
                        시연 확인번호 요청
                      </button>
                      {requestCode && (
                        <div className="verification-code">
                          <p>
                            시연 확인번호: <strong>{DEMO_CODE}</strong> · 문자는
                            발송되지 않습니다.
                          </p>
                          <label className="field">
                            <span>시연 확인번호</span>
                            <input
                              name="verification"
                              inputMode="numeric"
                              maxLength={6}
                              value={code}
                              onChange={(e) => setCode(e.target.value)}
                            />
                          </label>
                          <button
                            className="btn primary"
                            onClick={() => {
                              try {
                                setProof(
                                  createDemoProof(
                                    person,
                                    task.id,
                                    values,
                                    code,
                                  ),
                                );
                                setError("");
                              } catch (e) {
                                setError(e.message);
                              }
                            }}
                          >
                            시연 본인확인
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </section>
            </div>
          ) : latest ? (
            <div className="online-submitted">
              <h2>제출한 내용을 확인하세요</h2>
              <dl>
                {[
                  ["성명", latest.values.name],
                  ["소속", latest.values.company],
                  ["프로젝트", latest.values.project],
                  ["연락처", latest.values.phone],
                  [
                    "투입 예정 기간",
                    `${latest.values.start} ~ ${latest.values.end}`,
                  ],
                  ["본인 입력 서명", latest.values.signature],
                  [
                    "제출 시점",
                    new Date(latest.submittedAt).toLocaleString("ko-KR"),
                  ],
                  ["본인확인", "시연 확인 · 실제 인증 아님"],
                  ["양식", latest.templateVersion],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
              {DOCUMENT_CLAUSES[task.id].map((text) => (
                <p key={text}>{text}</p>
              ))}
              {task.id === "O11" && (
                <p>
                  <strong>
                    동의 여부:{" "}
                    {latest.values.consent === "agree"
                      ? "동의함"
                      : "동의하지 않음 · 담당자 확인 필요"}
                  </strong>
                </p>
              )}
              <p className="digest-note">원본 SHA-256: {latest.digest}</p>
              {!admin && status === "done" && (
                <button
                  className="btn"
                  onClick={() => {
                    setEditing(true);
                    setValues(defaultDocument(person, task.id));
                  }}
                >
                  새 버전 작성
                </button>
              )}
            </div>
          ) : (
            <div className="notice">
              수행사가 온라인 서류를 작성하면 제출 원본과 확인 이력이
              표시됩니다.
            </div>
          )}
          {person.submissions?.[task.id]?.length > 0 && (
            <details className="submission-history">
              <summary>
                제출 버전 기록 ({person.submissions[task.id].length})
              </summary>
              {[...person.submissions[task.id]].reverse().map((record) => (
                <div key={record.id}>
                  <span>
                    v{record.version} ·{" "}
                    {new Date(record.submittedAt).toLocaleString("ko-KR")}
                  </span>
                  <button
                    className="text-link"
                    onClick={() => onDownload(record.storageId)}
                  >
                    원본 다운로드
                  </button>
                </div>
              ))}
            </details>
          )}
        </div>
        <aside className="online-guide">
          <div className="online-guide-heading">
            <Sparkles size={20} />
            <h3>AI 작성 가이드</h3>
            <BrandCharacters focus="guide" />
          </div>
          <p className="guide-demo-label">
            규칙 기반 시연 · 실제 AI 모델 미연동
          </p>
          <div className="online-guide-steps">
            {[
              ["profile", "01 등록 정보"],
              ["clauses", "02 중요 조항"],
              ["signature", "03 서명·확인"],
            ].map(([key, label]) => (
              <button
                className={active === key ? "active" : ""}
                key={key}
                onClick={() =>
                  jump(
                    key === "profile"
                      ? "phone"
                      : key === "clauses"
                        ? "read"
                        : "signature",
                  )
                }
              >
                {label}
                <ArrowDown size={14} />
              </button>
            ))}
          </div>
          <h4>
            {active === "profile"
              ? "등록 정보와 문서가 일치해야 해요"
              : active === "clauses"
                ? "강조한 조항부터 확인해 주세요"
                : "등록 성명과 동일하게 서명해 주세요"}
          </h4>
          <p>
            {active === "profile"
              ? "이름·소속·프로젝트·기간을 자동으로 채웠어요. 연락처까지 확인한 뒤 다음으로 진행하세요."
              : active === "clauses"
                ? "서약·수집 항목과 이용 목적을 확인하고 직접 읽음 표시를 해주세요. 동의 여부를 대신 선택하지 않아요."
                : "서명과 필수 확인을 마치면 시연 본인확인을 할 수 있어요. 내용을 바꾸면 다시 확인해야 해요."}
          </p>
          {showForm && (
            <div className="online-missing">
              <strong>제출 전 확인 {issues.length}개</strong>
              {issues.length ? (
                issues.map((issue, i) => (
                  <button
                    key={`${issue.field}-${i}`}
                    onClick={() => jump(issue.field)}
                  >
                    <AlertCircle size={15} />
                    {FIELD_LABELS[issue.field] || issue.field}
                    <span>{issue.message}</span>
                  </button>
                ))
              ) : (
                <p>
                  <CheckCircle2 size={17} />
                  필수 검사 완료. 담당자에게 제출할 수 있어요.
                </p>
              )}
            </div>
          )}
          {admin && latest && (
            <>
              <div className="notice">
                <CheckCircle2 size={18} />
                필수 항목 규칙 검사 완료. 시연 본인확인 기록과 원문을 검토해
                주세요.
              </div>
              {["review", "error"].includes(status) && (
                <div className="review-form">
                  <label className="field">
                    <span>검토 의견</span>
                    <textarea
                      rows={4}
                      placeholder="확인 결과 또는 보완할 내용을 입력해 주세요."
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                  </label>
                  <div className="review-actions">
                    <button
                      className="btn"
                      onClick={() => onReview("fix", note)}
                    >
                      보완 요청
                    </button>
                    <button
                      className="btn primary"
                      onClick={() => onReview("done", note)}
                    >
                      승인
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
          <button className="text-link" onClick={onInquiry}>
            <MessageSquare size={16} />이 서류 담당자에게 문의
          </button>
        </aside>
      </div>
      {error && (
        <div className="online-error notice error" role="alert">
          {error}
        </div>
      )}
      <footer>
        <span className="draft-status">
          {saved
            ? "임시 저장됨"
            : showForm
              ? "작성 내용은 이 브라우저에 임시 저장됩니다."
              : "제출 원본과 이전 버전을 보관합니다."}
        </span>
        <button className="btn" onClick={onClose}>
          닫기
        </button>
        {showForm && (
          <>
            <button
              className="btn"
              onClick={() => {
                onDraft(values);
                setSaved(true);
                onNotify("작성 내용을 임시 저장했습니다.");
              }}
            >
              <Save size={15} />
              임시 저장
            </button>
            <button
              className="btn primary"
              disabled={busy || issues.length > 0}
              onClick={submit}
            >
              <CheckCircle2 size={16} />
              {busy ? "원본 저장 중…" : "서류 제출"}
            </button>
          </>
        )}
      </footer>
    </Modal>
  );
}
