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
import OriginalDocument from "./OriginalDocument.jsx";

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
  const documentRef = useRef(null),
    verificationRef = useRef(null),
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
    const control = (
      field === "verification" ? verificationRef.current : documentRef.current
    )?.querySelector(`[name="${field}"], [data-field="${field}"]`);
    control?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "center",
      inline: "center",
    });
    control?.focus({ preventScroll: true });
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
    const timer = setTimeout(async () => {
      try {
        await onDraft(values);
        setSaved(true);
      } catch (e) {
        setError(e.message);
      }
    }, 650);
    return () => clearTimeout(timer);
  }, [values, showForm]);
  useEffect(() => {
    if (
      !showForm ||
      (values.start === person.start && values.end === person.end)
    )
      return;
    setValues((previous) => ({
      ...previous,
      start: person.start,
      end: person.end,
      read: false,
      acknowledged: false,
      signature: "",
    }));
    setProof(null);
    setRequestCode(false);
    setSaved(false);
    setError(
      "투입 기간이 변경되어 미제출 서류의 기간을 갱신했습니다. 내용을 다시 확인하고 서명해 주세요.",
    );
  }, [person.start, person.end, showForm]);
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
      subtitle={`${person.name || person.id} · ${person.project} · 일반형 예시 원본`}
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
            일반적인 프로젝트 서약서 형식의 예시 원본입니다. 실제 인증·전자서명
            서비스, 실제 AI 모델은 연결되지 않았습니다.
          </div>
          {showForm ? (
            <OriginalDocument
              id={task.id}
              values={values}
              editable
              lockedPhone={!!person.phone}
              active={active}
              onChange={change}
              onActive={setActive}
              rootRef={documentRef}
            />
          ) : latest ? (
            <div className="online-submitted">
              <OriginalDocument
                id={task.id}
                values={latest.values}
                editable={false}
                date={latest.submittedDate || latest.submittedAt.slice(0, 10)}
              />
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
              ["profile", "01 개인정보"],
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
                ? "중요 조항을 읽고 확인란을 표시해 주세요"
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
            <div className="demo-verification" ref={verificationRef}>
              <strong>
                <ShieldCheck size={18} />
                시연 본인확인 · 실제 인증 아님
              </strong>
              <p>
                이름·연락처 입력만으로 실제 본인인증을 완료한 것으로 처리하지
                않습니다. 아래 확인은 연결 흐름 시연용입니다.
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
                              createDemoProof(person, task.id, values, code),
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
          )}
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
              ? "임시 저장을 누르면 작성 내용을 보관합니다."
              : "제출 원본과 이전 버전을 보관합니다."}
        </span>
        <button className="btn" onClick={onClose}>
          닫기
        </button>
        {showForm && (
          <>
            <button
              className="btn"
              onClick={async () => {
                try {
                  await onDraft(values);
                  setSaved(true);
                  onNotify("작성 내용을 임시 저장했습니다.");
                } catch (e) {
                  setError(e.message);
                }
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
