import React, { useEffect, useState } from "react";
import {
  Mail,
  RefreshCw,
  Check,
  Pause,
  ArrowLeft,
  Link2,
  AlertTriangle,
} from "lucide-react";
import { reschedulePreparation, validIsoDate } from "./personnel-workflow.js";
import MailChangeOverview, { HighlightedMail } from "./MailChangeOverview.jsx";
import MailInboxPane from "./MailInboxPane.jsx";
import { api } from "./api.js";
const normalize = (value) =>
  String(value || "")
    .replace(/[\s_\-()（）]/g, "")
    .toLowerCase();
const mailTime = (value) =>
  new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
const types = { new: "신규 투입", change: "기존 정보 변경", hold: "투입 보류" },
  states = {
    pending: "검토 대기",
    held: "검토 보류",
    applied: "반영 완료",
    superseded: "최신 회신으로 대체",
  },
  categories = {
    account: "계정",
    access: "출입",
    education: "교육",
    document: "제출 서류",
  },
  actions = { request: "요청", hold: "보류", cancel: "취소" };
export default function MailReviewPage({
  mail,
  data,
  onState,
  onInvite,
  initialReviewIds,
}) {
  const { inbox, error, syncing, syncResult } = mail,
    [form, setForm] = useState({ folder: "", search: "", since: "" }),
    [view, setView] = useState(initialReviewIds ? "review" : "inbox"),
    [reviewIds, setReviewIds] = useState(initialReviewIds || null),
    [settingsOpen, setSettingsOpen] = useState(false),
    [filter, setFilter] = useState("all"),
    [request, setRequest] = useState(null),
    [edit, setEdit] = useState(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [condition, setCondition] = useState(false),
    [newRecord, setNewRecord] = useState(false),
    [source, setSource] = useState(null);
  const settingSignature = JSON.stringify(inbox?.settings || {});
  useEffect(() => {
    if (inbox?.settings) setForm(inbox.settings);
  }, [settingSignature]);
  const reset = (detail) => {
    setRequest(detail);
    setEdit({
      ...detail.edit,
      personId: detail.edit.personId || "",
      reviewNote: detail.edit.reviewNote || "",
      birthRaw: detail.edit.birthRaw || "",
    });
    setConfirmed(false);
    setCondition(false);
    setNewRecord(false);
  };
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
  async function open(id) {
    await run(async () => {
      setView("review");
      reset((await api(`/api/mail/requests/${id}`)).request);
      setSource(null);
    });
  }
  async function save() {
    const result = await api(`/api/mail/requests/${request.id}`, {
      method: "PATCH",
      body: { version: request.version, edit },
    });
    reset(result.request);
    await mail.refresh();
    return result.request;
  }
  const selected = request?.projectPeople.find((p) => p.id === edit?.personId),
    editable = request && ["pending", "held"].includes(request.status),
    conflict =
      editable &&
      selected &&
      request.snapshots[selected.id]?.recordVersion !== selected.recordVersion;
  const duePreview =
    selected && validIsoDate(edit.startDate)
      ? reschedulePreparation(
          data,
          structuredClone(selected),
          selected.start,
          edit.startDate,
        )
      : [];
  const liveCandidates =
    request?.projectPeople.filter(
      (p) =>
        (!edit?.project || p.project === edit.project) &&
        (!edit?.company || normalize(p.company) === normalize(edit.company)) &&
        normalize(p.name) === normalize(edit?.name),
    ) || [];
  const blockers = [];
  if (!edit?.project) blockers.push("프로젝트를 확인하세요.");
  if (!edit?.company?.trim()) blockers.push("수행사를 입력하세요.");
  if (!edit?.name?.trim()) blockers.push("인원명을 입력하세요.");
  if (edit?.type !== "new" && !selected)
    blockers.push("반영할 기존 인원 후보를 확인하고 한 기록을 선택하세요.");
  if (
    selected &&
    (normalize(selected.name) !== normalize(edit?.name) ||
      normalize(selected.company) !== normalize(edit?.company) ||
      selected.project !== edit?.project)
  )
    blockers.push("선택한 인원과 프로젝트·회사·이름을 일치시켜 주세요.");
  if (
    (edit?.type === "new" || edit?.startDateRequested) &&
    edit?.type !== "hold" &&
    !validIsoDate(edit?.startDate)
  )
    blockers.push("제안 투입일의 확정 날짜를 입력하세요.");
  if (edit?.endDateRequested && !validIsoDate(edit?.endDate))
    blockers.push("제안 종료일을 확인하세요.");
  if (edit?.startDate && edit?.endDate && edit.startDate > edit.endDate)
    blockers.push("종료일은 투입일 이후여야 합니다.");
  if (conflict)
    blockers.push("기존값이 변경되었습니다. 최신 값 확인 후 다시 검토하세요.");
  if (!confirmed)
    blockers.push("원문·기존값·제안을 검토하고 검토 확인을 선택하세요.");
  if (edit?.type === "new" && !newRecord)
    blockers.push(
      "기존 후보와 필수값을 확인하고 별도 신규 기록 생성을 확인하세요.",
    );
  if (edit?.conditional && !condition)
    blockers.push("조건부 요청의 조건 충족을 확인하세요.");
  const changedFields = [
    "type",
    "project",
    "company",
    "name",
    "startDate",
    "endDate",
    "tasks",
    "resume",
    "conditional",
    "startDateRequested",
    "endDateRequested",
  ];
  if (
    request &&
    edit &&
    changedFields.some(
      (k) => JSON.stringify(request.payload[k]) !== JSON.stringify(edit[k]),
    ) &&
    !edit.reviewNote?.trim()
  )
    blockers.push("추출값 수정 근거를 검토 메모에 입력하세요.");
  const change = (key, value) => {
    setEdit((prev) => ({ ...prev, [key]: value }));
    setConfirmed(false);
  };
  return (
    <div className="mail-workspace">
      <div className="page-heading">
        <div>
          <span className="eyebrow">PMO · INBOX</span>
          <h1>받은편지함</h1>
          <p>메일을 읽고, 수행사 투입 요청만 검토해 명단에 반영하세요.</p>
        </div>
        <div className="inbox-toolbar">
          {inbox?.provider.provider === "mock" && (
            <span className="mail-origin">시연 모드</span>
          )}
          <button
            className="btn"
            onClick={() => {
              setView("review");
              setReviewIds(null);
              setRequest(null);
              setEdit(null);
            }}
          >
            검토 대기{" "}
            {inbox?.requests.filter((r) => r.status === "pending").length || 0}
            건
          </button>
          <button
            className="btn"
            onClick={() => setSettingsOpen((v) => !v)}
            aria-expanded={settingsOpen}
          >
            설정
          </button>
          <button
            className="btn primary"
            disabled={busy || syncing}
            onClick={() => run(() => mail.sync())}
          >
            <RefreshCw size={16} />
            {syncing ? mail.phase : "새 메일 확인"}
          </button>
        </div>
      </div>
      {settingsOpen && (
        <section className="card mail-source-settings">
          <div className="mail-source-heading">
            <h2>
              <Mail size={19} />
              수집 범위
            </h2>
            <span
              className={`mail-origin ${inbox?.provider.provider === "mock" ? "mock" : "live"}`}
            >
              {inbox?.provider.label || "메일 연결 확인 중"}
            </span>
          </div>
          <p>{inbox?.provider.notice}</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                await api("/api/mail/settings", { method: "PUT", body: form });
                await mail.refresh();
                setSettingsOpen(false);
              });
            }}
          >
            <label>
              폴더 / 라벨
              <input
                aria-label="메일 수집 폴더"
                value={form.folder}
                required
                maxLength={200}
                onChange={(e) => setForm({ ...form, folder: e.target.value })}
              />
            </label>
            <label>
              검색어 (제목·본문)
              <input
                aria-label="메일 검색어"
                value={form.search}
                maxLength={500}
                onChange={(e) => setForm({ ...form, search: e.target.value })}
              />
            </label>
            <label>
              수신 시작일
              <input
                aria-label="메일 수신 시작일"
                type="date"
                value={form.since}
                onChange={(e) => setForm({ ...form, since: e.target.value })}
              />
            </label>
            <button className="btn" disabled={busy || syncing}>
              범위 저장
            </button>
          </form>
          {inbox?.provider.provider === "mock" && (
            <p className="mail-demo-help">
              <a href="/examples/메일검토_기준인력.xlsx" download>
                시연용 김민수 인력계획서
              </a>{" "}
              · 가상 폴더: PMO/인력요청 (김민수·이서연), PMO/날짜미정검증,
              PMO/회신검증. 가상 메일도 같은 분석·승인 경로를 사용합니다.
            </p>
          )}
        </section>
      )}
      {view === "review" && (
        <button
          className="text-link"
          onClick={() => {
            setView("inbox");
            setRequest(null);
            setEdit(null);
          }}
        >
          ← 받은편지함으로
        </button>
      )}
      {syncing && (
        <div className="info-note" role="status">
          {mail.phase}
        </div>
      )}
      {(error || message) && (
        <div className="form-error" role="alert">
          {message || error}
        </div>
      )}
      {syncResult && (
        <div className="info-note" role="status">
          이번 확인: 수집 {syncResult.imported}통 · 기존 메일{" "}
          {syncResult.duplicates}통 · 새 초안 {syncResult.created.length}건
          {syncResult.errors ? ` · 분석 오류 ${syncResult.errors}통` : ""}
          {syncResult.truncated
            ? " · 최근 50통만 처리했습니다. 검색 범위를 좁혀 주세요."
            : ""}
          {syncResult.skipped
            ? ` · 크기 제한 제외 ${syncResult.skipped}통`
            : ""}
        </div>
      )}
      {view === "inbox" ? (
        <MailInboxPane
          inbox={inbox}
          onReview={(ids) => {
            setReviewIds(ids);
            setView("review");
            setRequest(null);
            setEdit(null);
          }}
        />
      ) : request && edit ? (
        <section className="card mail-review-detail">
          <div className="mail-detail-heading">
            <button
              className="text-link"
              onClick={() => {
                setRequest(null);
                setEdit(null);
                setMessage("");
                mail.refresh();
              }}
            >
              <ArrowLeft size={16} />
              검토함으로
            </button>
            <span className={`mail-status ${request.status}`}>
              {states[request.status]}
            </span>
            <button
              className="btn"
              disabled={busy}
              onClick={() => open(request.id)}
            >
              최신 기존값 새로고침
            </button>
          </div>
          <MailChangeOverview
            request={request}
            edit={edit}
            selected={selected}
            recommended={liveCandidates.length === 1 ? liveCandidates[0] : null}
            data={data}
          />
          <div className="mail-review-columns">
            <div className="mail-original">
              <h2>{request.message.subject}</h2>
              <p>
                {mailTime(request.message.receivedAt)} · {request.message.from}
              </p>
              <div className="mail-source-tags">
                <span className="mail-origin">
                  {request.message.source === "mock"
                    ? "가상 메일"
                    : "IMAP 메일"}
                </span>
                <span>
                  {request.message.analysisMode === "ai"
                    ? "실제 AI 응답"
                    : "규칙 기반 초안"}
                </span>
              </div>
              <details className="mail-analysis-info">
                <summary>분석 안내</summary>
                <p>{request.message.analysisNotice}</p>
              </details>
              <h3>최신 본문 · 분석 대상</h3>
              <HighlightedMail
                text={request.message.latestBody}
                quotes={[
                  ...Object.values(request.payload.evidence),
                  ...request.payload.tasks.map((t) => t.evidence),
                ]}
              />
              {request.message.quotedBody && (
                <details>
                  <summary>이전 인용문 · 분석 제외</summary>
                  <pre className="quoted">{request.message.quotedBody}</pre>
                </details>
              )}
              <details className="mail-evidence-fold">
                <summary>상세 추출 근거</summary>
                <dl className="mail-evidence">
                  {Object.entries(request.payload.evidence)
                    .filter(([, v]) => v)
                    .map(([key, value]) => (
                      <div key={key}>
                        <dt>
                          {
                            {
                              type: "유형",
                              name: "인원명",
                              project: "프로젝트",
                              company: "수행사",
                              startDate: "투입일",
                              endDate: "종료일",
                            }[key]
                          }
                        </dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  {request.payload.tasks.map((t, i) => (
                    <div key={i}>
                      <dt>{t.title}</dt>
                      <dd>{t.evidence}</dd>
                    </div>
                  ))}
                </dl>
              </details>
              {request.thread.length > 0 && (
                <div className="mail-thread">
                  <h3>같은 대화의 이전·최신 요청</h3>
                  {request.thread.map((r) => (
                    <button
                      className="mail-thread-item"
                      key={r.id}
                      onClick={() => open(r.id)}
                    >
                      <strong>{r.subject}</strong>
                      <span>
                        {(r.edit || r.payload).name} ·{" "}
                        {types[(r.edit || r.payload).type]} ·{" "}
                        {(r.edit || r.payload).startDate || "날짜 미정"} ·{" "}
                        {states[r.status]}
                      </span>
                      <small>{mailTime(r.receivedAt)}</small>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="mail-proposal">
              <h2>인원별 반영 초안</h2>
              <p className="muted">
                원문 근거가 불명확하면 값을 채우거나 검토 보류하세요. 초안
                수정은 인원 명단을 바꾸지 않습니다.
              </p>
              {request.payload.clarifications.length > 0 && (
                <div className="mail-checks">
                  <strong>
                    <AlertTriangle size={16} />
                    확인 필요
                  </strong>
                  <ul>
                    {request.payload.clarifications.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="form-grid">
                <label>
                  요청 유형
                  <select
                    aria-label="메일 요청 유형"
                    disabled={!editable}
                    value={edit.type}
                    onChange={(e) => change("type", e.target.value)}
                  >
                    {Object.entries(types).map(([value, label]) => (
                      <option value={value} key={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  프로젝트
                  <select
                    aria-label="메일 요청 프로젝트"
                    disabled={!editable}
                    value={edit.project || ""}
                    onChange={(e) => {
                      change("project", e.target.value);
                      change("personId", "");
                    }}
                  >
                    <option value="">확인 필요</option>
                    <option>SFA</option>
                    <option>그룹웨어</option>
                  </select>
                  {!edit.project && (
                    <small className="mail-field-issue">
                      프로젝트 확인 필요
                    </small>
                  )}
                </label>
                <label>
                  수행사
                  <input
                    aria-label="메일 요청 수행사"
                    disabled={!editable}
                    value={edit.company || ""}
                    onChange={(e) => {
                      change("company", e.target.value);
                      change("personId", "");
                    }}
                  />
                  {!edit.company && (
                    <small className="mail-field-issue">수행사 확인 필요</small>
                  )}
                </label>
                <label>
                  인원명
                  <input
                    aria-label="메일 요청 인원명"
                    disabled={!editable}
                    value={edit.name || ""}
                    onChange={(e) => {
                      change("name", e.target.value);
                      change("personId", "");
                    }}
                  />
                  {!edit.name && (
                    <small className="mail-field-issue">인원명 확인 필요</small>
                  )}
                </label>
              </div>
              <section className="mail-candidates">
                <h3>프로젝트·회사·이름 대조 후보 {liveCandidates.length}명</h3>
                {!liveCandidates.length && (
                  <p>
                    일치하는 기존 인원이 없습니다. 대상 정보를 확인하거나 신규
                    등록 여부를 검토하세요.
                  </p>
                )}
                {liveCandidates.map((p) => {
                  const full = data.people.find((x) => x.id === p.id);
                  return (
                    <div className="mail-candidate" key={p.id}>
                      <div>
                        <b>
                          {p.name} · {p.company} · {p.project}
                          {liveCandidates.length === 1 && " · 추천 후보"}
                        </b>
                        <small>
                          {p.displayId !== p.name ? p.displayId + " · " : ""}
                          투입 {p.start || "미정"} ~ {p.end || "미정"} ·{" "}
                          {full?.birthDate || full?.birthYear || "생년 미확인"}
                        </small>
                      </div>
                      {editable && edit.type !== "new" && (
                        <button
                          className="btn"
                          onClick={() => change("personId", p.id)}
                        >
                          {edit.personId === p.id
                            ? "확인한 대상"
                            : "이 인원으로 확인"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </section>
              {edit.type !== "new" && (
                <label className="mail-person-selector">
                  반영 대상 · 고유 인원 기록
                  <select
                    aria-label="메일 반영 인원 선택"
                    disabled={!editable}
                    value={edit.personId || ""}
                    onChange={(e) => change("personId", e.target.value)}
                  >
                    <option value="">반드시 한 기록을 선택하세요</option>
                    {request.projectPeople
                      .filter(
                        (p) => !edit.project || p.project === edit.project,
                      )
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.displayId} · {p.name} · {p.company} ·{" "}
                          {p.start || "투입일 미정"}
                        </option>
                      ))}
                  </select>
                  <small>
                    이름 일치 후보 {liveCandidates.length}명. 이름만으로 자동
                    병합하지 않습니다.
                  </small>
                </label>
              )}
              {edit.type === "new" && (
                <div className="info-note">
                  별도 신규 기록을 생성합니다. 같은 이름 후보{" "}
                  {liveCandidates.length}명
                  {liveCandidates
                    .map((p) => ` · ${p.displayId} ${p.company}`)
                    .join("")}
                  . 생년월일이 없으면 본인 등록 링크에서 확인합니다.
                </div>
              )}
              {selected && (
                <div className="mail-current-values">
                  <h3>{editable ? "시스템 기존값" : "반영 후 현재값"}</h3>
                  <dl>
                    {[
                      [
                        "이름 / 수행사",
                        `${selected.name} / ${selected.company}`,
                      ],
                      ["투입일", selected.start || "미정"],
                      ["종료일", selected.end || "미정"],
                      [
                        "등록 상태",
                        selected.registrationStatus === "registered"
                          ? "등록 완료"
                          : "본인 등록 대기",
                      ],
                      [
                        "완료 작업",
                        `${Object.values(selected.tasks).filter((v) => v === "done").length}건 · 교육·서류 완료 상태 유지`,
                      ],
                    ].map(([k, v]) => (
                      <div key={k}>
                        <dt>{k}</dt>
                        <dd>{v}</dd>
                      </div>
                    ))}
                  </dl>
                  <details>
                    <summary>고유 기록 정보</summary>
                    {selected.id} · 버전 {selected.recordVersion}
                  </details>
                  {conflict && (
                    <div className="form-error">
                      <strong>검토 중 기존값이 변경되었습니다.</strong>
                      <p>
                        위 최신값을 확인한 다음 다시 확인해야 승인할 수
                        있습니다.
                      </p>
                      <button
                        className="btn"
                        disabled={busy || !editable}
                        onClick={() =>
                          run(async () => {
                            const result = await api(
                              `/api/mail/requests/${request.id}/rebase`,
                              {
                                method: "POST",
                                body: {
                                  version: request.version,
                                  personId: selected.id,
                                  personVersion: selected.recordVersion,
                                  acknowledged: true,
                                },
                              },
                            );
                            const unsaved = { ...edit };
                            reset(result.request);
                            setEdit(unsaved);
                          })
                        }
                      >
                        최신 값 확인 · 다시 검토
                      </button>
                    </div>
                  )}
                </div>
              )}
              <div className="form-grid">
                <label>
                  제안 투입일
                  {edit.startDateRequested && !edit.startDate && (
                    <small className="mail-field-issue">
                      날짜 미정 · 확정 날짜 확인 필요
                    </small>
                  )}
                  <input
                    aria-label="메일 제안 투입일"
                    disabled={!editable}
                    type="date"
                    value={edit.startDate || ""}
                    onChange={(e) => {
                      change("startDate", e.target.value || null);
                      change("startDateRequested", true);
                    }}
                  />
                </label>
                <label>
                  제안 종료일
                  <input
                    aria-label="메일 제안 종료일"
                    disabled={!editable}
                    type="date"
                    value={edit.endDate || ""}
                    onChange={(e) => {
                      change("endDate", e.target.value || null);
                      change("endDateRequested", !!e.target.value);
                    }}
                  />
                </label>
              </div>
              <p className="muted">
                미완료 준비 작업의 개인별 마감일만 조정합니다. 완료한
                교육·서류와 본인 등록 상태는 보존합니다.
              </p>
              {duePreview.length > 0 && (
                <details className="mail-deadline-preview" open>
                  <summary>
                    미완료 준비 작업 마감일 변경 예상 ({duePreview.length}건)
                  </summary>
                  <table>
                    <thead>
                      <tr>
                        <th>작업</th>
                        <th>기존</th>
                        <th>제안</th>
                      </tr>
                    </thead>
                    <tbody>
                      {duePreview.map((d) => (
                        <tr key={d.taskId}>
                          <td>{d.title}</td>
                          <td>{d.before || "미정"}</td>
                          <td>{d.after}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              )}
              <details>
                <summary>마감일 반영 기준</summary>
                <p className="muted">
                  프로젝트별 설정이 없으면 계정 신청은 투입 3일 전,
                  발급·교육·서류·출입 확인은 1일 전, 최종 확인은 투입 당일을
                  사용합니다. 달력일 기준이며 완료 상태와 완료 작업의 마감일은
                  유지합니다. 별도 기한이 있는 추가 작업은 기존 투입일과의
                  간격을 유지합니다.
                </p>
              </details>
              <h3>계정·출입 / 교육 / 서류 요청</h3>
              <div className="mail-task-requests">
                {edit.tasks.map((task, i) => (
                  <div className="mail-task-edit" key={i}>
                    <select
                      aria-label={`${i + 1}번 요청 분류`}
                      disabled={!editable}
                      value={task.category}
                      onChange={(e) =>
                        change(
                          "tasks",
                          edit.tasks.map((t, n) =>
                            n === i ? { ...t, category: e.target.value } : t,
                          ),
                        )
                      }
                    >
                      {Object.entries(categories).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                    <input
                      aria-label={`${i + 1}번 요청 작업명`}
                      disabled={!editable}
                      value={task.title}
                      onChange={(e) =>
                        change(
                          "tasks",
                          edit.tasks.map((t, n) =>
                            n === i ? { ...t, title: e.target.value } : t,
                          ),
                        )
                      }
                    />
                    <select
                      aria-label={`${i + 1}번 요청 처리`}
                      disabled={!editable}
                      value={task.action}
                      onChange={(e) =>
                        change(
                          "tasks",
                          edit.tasks.map((t, n) =>
                            n === i ? { ...t, action: e.target.value } : t,
                          ),
                        )
                      }
                    >
                      {Object.entries(actions).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                    {editable && (
                      <button
                        className="text-link"
                        onClick={() =>
                          change(
                            "tasks",
                            edit.tasks.filter((_, n) => n !== i),
                          )
                        }
                      >
                        제외
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {editable && (
                <button
                  className="text-link"
                  onClick={() =>
                    change("tasks", [
                      ...edit.tasks,
                      {
                        category: "account",
                        title: "",
                        action: "request",
                        evidence: "",
                      },
                    ])
                  }
                >
                  + 개인별 요청 작업 추가
                </button>
              )}
              {editable && (
                <>
                  <label>
                    검토 메모 · 추출값 수정 시 필수
                    <textarea
                      aria-label="메일 검토 메모"
                      rows={3}
                      value={edit.reviewNote || ""}
                      onChange={(e) => change("reviewNote", e.target.value)}
                    />
                  </label>
                  <label className="review-confirm">
                    <input
                      type="checkbox"
                      checked={!!edit.resume}
                      onChange={(e) => change("resume", e.target.checked)}
                    />
                    기존 투입 보류를 해제하는 요청으로 확인했습니다.
                  </label>
                  <label className="review-confirm">
                    <input
                      type="checkbox"
                      aria-label="메일 원문 검토 확인"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                    />
                    원문·기존값·변경 제안·확인 사항을 검토했습니다.
                  </label>
                  {edit.conditional && (
                    <label className="review-confirm">
                      <input
                        type="checkbox"
                        checked={condition}
                        onChange={(e) => setCondition(e.target.checked)}
                      />
                      조건부 요청의 조건이 충족되었음을 확인했습니다.
                    </label>
                  )}
                  {edit.type === "new" && (
                    <label className="review-confirm">
                      <input
                        type="checkbox"
                        aria-label="메일 별도 신규 기록 확인"
                        checked={newRecord}
                        onChange={(e) => setNewRecord(e.target.checked)}
                      />
                      기존 인원 후보와 필수 정보를 확인하고 별도 신규 기록으로
                      생성합니다.
                    </label>
                  )}
                  {blockers.length > 0 && (
                    <div className="mail-approval-blockers" aria-live="polite">
                      <strong>승인 전 확인할 항목</strong>
                      <ul>
                        {blockers.map((text, i) => (
                          <li key={i}>{text}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="mail-review-actions">
                    <button
                      className="btn"
                      disabled={busy}
                      onClick={() => run(save)}
                    >
                      초안 수정 저장
                    </button>
                    <button
                      className="btn"
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          const saved = await save();
                          const result = await api(
                            `/api/mail/requests/${request.id}/hold`,
                            {
                              method: "POST",
                              body: {
                                version: saved.version,
                                reason: edit.reviewNote,
                              },
                            },
                          );
                          reset(result.request);
                          await mail.refresh();
                        })
                      }
                    >
                      <Pause size={15} />
                      보류
                    </button>
                    <button
                      className="btn primary"
                      disabled={busy || blockers.length > 0}
                      onClick={() =>
                        run(async () => {
                          const saved = await save();
                          try {
                            const result = await api(
                              `/api/mail/requests/${request.id}/approve`,
                              {
                                method: "POST",
                                body: {
                                  version: saved.version,
                                  reviewConfirmed: true,
                                  newRecordConfirmed: newRecord,
                                  conditionConfirmed: condition,
                                },
                              },
                            );
                            onState(result.state);
                            reset(result.request);
                            await mail.refresh();
                            setMessage("");
                          } catch (e) {
                            const current = await api(
                              `/api/mail/requests/${request.id}`,
                            );
                            reset(current.request);
                            throw e;
                          }
                        })
                      }
                    >
                      <Check size={15} />
                      승인 후 반영
                    </button>
                  </div>
                </>
              )}
              {request.result && (
                <div className="mail-applied-result">
                  <h3>반영 완료</h3>
                  <p>
                    {request.result.after.name} · {request.result.displayId}
                  </p>
                  <p>
                    개인별 마감일 변경 {request.result.changedDeadlines.length}
                    건 · 준비 작업 요청 {request.result.tasks.length}건
                  </p>
                  {request.result.after.registrationStatus ===
                    "pending_registration" && (
                    <button
                      className="btn primary"
                      onClick={() => onInvite(request.result.personId)}
                    >
                      <Link2 size={16} />
                      초대 링크 생성·복사
                    </button>
                  )}
                  <details>
                    <summary>반영 전후·작업 이력</summary>
                    <pre>{JSON.stringify(request.result, null, 2)}</pre>
                  </details>
                </div>
              )}
              {request.history.length > 0 && (
                <details>
                  <summary>
                    초안 수정·보류·반영 이력 ({request.history.length})
                  </summary>
                  {request.history.map((h, i) => (
                    <p key={i}>
                      {h.kind} · {mailTime(h.at)}
                    </p>
                  ))}
                </details>
              )}
            </div>
          </div>
        </section>
      ) : (
        <>
          <section className="card mail-inbox">
            <div className="mail-tabs">
              {[
                ["all", "전체"],
                ["pending", "검토 대기"],
                ["held", "검토 보류"],
                ["applied", "반영 완료"],
                ["superseded", "이전 요청"],
              ].map(([v, label]) => (
                <button
                  className={filter === v ? "active" : ""}
                  key={v}
                  onClick={() => setFilter(v)}
                >
                  {label}{" "}
                  {inbox?.requests.filter((r) => v === "all" || r.status === v)
                    .length || 0}
                </button>
              ))}
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>요청 인원 / 유형</th>
                    <th>메일 / 출처</th>
                    <th>변경 제안</th>
                    <th>검토 상태</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {inbox?.requests
                    .filter(
                      (r) =>
                        (!reviewIds || reviewIds.includes(r.id)) &&
                        (filter === "all" || r.status === filter),
                    )
                    .map((r) => (
                      <tr key={r.id} data-mail-request={r.id}>
                        <td>
                          <strong>{r.payload.name || "인원 확인 필요"}</strong>
                          <small>
                            {r.payload.project || "프로젝트 미확인"} ·{" "}
                            {r.payload.company || "수행사 미확인"}
                          </small>
                          <span>{types[r.payload.type]}</span>
                        </td>
                        <td>
                          <strong>{r.subject}</strong>
                          <small>
                            {mailTime(r.receivedAt)} ·{" "}
                            {r.source === "mock" ? "가상 메일" : "IMAP 메일"} ·{" "}
                            {r.analysisMode === "ai" ? "AI 분석" : "규칙 기반"}
                          </small>
                        </td>
                        <td>
                          {r.payload.startDate ||
                            (r.payload.startDateRequested
                              ? "날짜 확인 필요"
                              : "투입일 변경 없음")}
                          <small>
                            {r.payload.tasks.map((t) => t.title).join(", ") ||
                              "추가 작업 요청 없음"}
                          </small>
                          {r.payload.clarifications.length > 0 && (
                            <span className="mail-needs-review">
                              확인 필요 {r.payload.clarifications.length}건
                            </span>
                          )}
                        </td>
                        <td>
                          <span className={`mail-status ${r.status}`}>
                            {states[r.status]}
                          </span>
                        </td>
                        <td>
                          <button className="btn" onClick={() => open(r.id)}>
                            검토하기
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {!inbox?.requests.length && (
              <div className="empty">
                <h3>아직 검토할 메일 요청이 없습니다.</h3>
                <p>수집 범위를 지정하고 새 메일 확인을 눌러 주세요.</p>
              </div>
            )}
          </section>
          <section className="card mail-messages">
            <h2>수집 메일 · 초안 0건도 확인</h2>
            {inbox?.messages.map((m) => (
              <div className="mail-message-row" key={m.id}>
                <div>
                  <strong>{m.subject}</strong>
                  <p>
                    {m.requestCount}건 ·{" "}
                    {m.analysisState === "error"
                      ? "분석 실패"
                      : m.analysisMode === "ai"
                        ? "AI 분석"
                        : "규칙 기반 분석"}{" "}
                    · {m.source === "mock" ? "가상 메일" : "IMAP 메일"}
                  </p>
                </div>
                <button
                  className="btn"
                  onClick={() =>
                    run(async () =>
                      setSource(
                        (await api(`/api/mail/messages/${m.id}`)).message,
                      ),
                    )
                  }
                >
                  원문 보기
                </button>
                {m.analysisState === "error" && (
                  <button
                    className="btn"
                    onClick={() =>
                      run(async () => {
                        await api(`/api/mail/messages/${m.id}/analyze`, {
                          method: "POST",
                          body: {},
                        });
                        await mail.refresh();
                      })
                    }
                  >
                    다시 분석
                  </button>
                )}
              </div>
            ))}
            {source && (
              <div className="mail-source-expanded">
                <h3>{source.subject}</h3>
                <pre>{source.latestBody}</pre>
                {source.quotedBody && (
                  <details>
                    <summary>이전 인용문</summary>
                    <pre>{source.quotedBody}</pre>
                  </details>
                )}
                <button className="btn" onClick={() => setSource(null)}>
                  원문 닫기
                </button>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
