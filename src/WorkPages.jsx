import React, { useEffect, useState } from "react";
import {
  ArrowRight,
  Plus,
  Upload,
  Download,
  Link2,
  ChevronDown,
  Search,
  AlertTriangle,
  Users,
  Mail,
  ClipboardList,
} from "lucide-react";
import BrandCharacters from "./BrandCharacters.jsx";
import MemberRoadmap from "./MemberRoadmap.jsx";
import AdminStageBoard from "./AdminStageBoard.jsx";
import { memberRoadmap } from "./member-roadmap.js";
import { STATUS, PROJECTS } from "./data.js";
import {
  businessDate,
  dayGap,
  horizonDays,
  personIdentity,
  personState,
  attentionRows,
  summaryCounts,
  matchesPerson,
  taskRows,
} from "./work-summary.js";
const date = (s) => (s ? s.replaceAll("-", ".") : "미정");
const btn = (text, action, primary = false, disabled = false) => (
  <button
    className={`btn ${primary ? "primary" : ""}`}
    onClick={action}
    disabled={disabled}
  >
    {text}
  </button>
);
export function WorkBadge({ status, children, tone }) {
  const [text, color] = STATUS[status] || [status, "gray"];
  return (
    <span className={`work-badge ${tone || color}`}>{children || text}</span>
  );
}
export function Preparation({ person, data }) {
  const s = personState(person, data);
  return (
    <div className="preparation-summary">
      <b>{s.pct}%</b>
      <span
        className={`work-badge ${s.final ? "green" : s.ready ? "orange" : "gray"}`}
      >
        {s.preparation}
      </span>
    </div>
  );
}
export function WorkDashboard({
  data,
  people,
  mailRequests,
  scope,
  canImport,
  onPeople,
  onReviews,
  onMail,
  onTasks,
  onOpen,
  onTask,
  onInvite,
  onLifecycle,
  onImport,
}) {
  const today = businessDate(),
    count = summaryCounts(people, data, mailRequests, today),
    projects = PROJECTS.filter(
      (project) => scope === "PMO" || scope === project,
    );
  const orphanIds = [
    ...new Set(
      [
        ...(data.notifications || []),
        ...(data.messages || []),
        ...(data.activity || []),
        ...(data.referenceIssues || []),
      ]
        .map((x) => x.personId)
        .filter((id) => id && !data.people.some((p) => p.id === id)),
    ),
  ];
  return (
    <div className="work-page dashboard-work">
      <header className="work-title">
        <div>
          <span className="eyebrow">PROJECT WORKSPACE</span>
          <h1>전체 현황</h1>
          <p>
            {scope === "PMO" ? "전체 프로젝트" : scope} · 기준일 {date(today)} ·
            지금 필요한 조치를 확인하세요.
          </p>
        </div>
        <BrandCharacters className="work-mascot" />
        {canImport && btn("인력계획서 불러오기", onImport, true)}
      </header>
      <div className="work-stats">
        {[
          ["전체 인원", count.total, "명", () => onPeople({})],
          [
            "투입 임박·준비 미완료",
            count.imminent,
            "명",
            () => onPeople({ preparation: "imminent" }),
          ],
          ["교육·서류 검토 대기", count.reviews, "건", onReviews],
          ["메일 요청 검토 대기", count.mail, "건", onMail],
        ].map(([label, value, unit, action]) => (
          <button
            key={label}
            className="work-stat"
            onClick={action}
            disabled={label === "메일 요청 검토 대기" && !canImport}
            title={
              label === "메일 요청 검토 대기" && !canImport
                ? "메일 요청은 PMO에서 검토합니다."
                : undefined
            }
          >
            <span>{label}</span>
            <strong>
              {value}
              <small>{unit}</small>
            </strong>
            <span className="stat-foot">
              {label.startsWith("투입 임박")
                ? `${horizonDays(data.settings)}일 이내 투입 예정`
                : "목록 보기"}{" "}
              <ArrowRight size={15} />
            </span>
          </button>
        ))}
      </div>
      <section className="card work-card">
        <div className="work-card-heading">
          <div>
            <h2>
              단계별 준비 인원 <span>조회 범위 {people.length}명</span>
            </h2>
            <p>
              준비 단계 아래에서 해당 인원을 확인하고 필요한 조치로 이동하세요.
            </p>
          </div>
          {btn("준비 작업 전체 보기", onTasks)}
        </div>
        {count.overdue > 0 && (
          <button
            className="work-alert"
            onClick={() => onPeople({ preparation: "overdue" })}
          >
            <AlertTriangle size={17} />
            예정일 경과 · 준비 미완료 {count.overdue}명 · 명단에서 확인{" "}
            <ArrowRight size={15} />
          </button>
        )}
        {orphanIds.length > 0 && (
          <div className="work-alert">
            <AlertTriangle size={17} />
            인원 정보 확인 필요 · 연결되지 않은 기록 {orphanIds.length}건
            {btn("명단에서 복구 확인", () =>
              onPeople({ repairId: orphanIds[0] }),
            )}
          </div>
        )}
        <AdminStageBoard
          people={people}
          data={data}
          scope={scope}
          today={today}
          canInvite={canImport}
          onOpen={onOpen}
          onTask={onTask}
          onInvite={onInvite}
          onLifecycle={onLifecycle}
          onRepair={(id) => onPeople({ repairId: id })}
        />
      </section>
      <section className="card work-card">
        <div className="work-card-heading">
          <h2>프로젝트별 준비 현황</h2>
        </div>
        <div className="project-preparation-grid">
          {projects.map((project) => {
            const list = people.filter((p) => p.project === project),
              ready = list.filter((p) => personState(p, data).ready).length,
              final = list.filter((p) => personState(p, data).final).length;
            return (
              <button
                className="project-preparation"
                key={project}
                onClick={() => onPeople({ project })}
              >
                <strong>
                  {project}
                  <small>{list.length}명</small>
                </strong>
                <span>
                  필수 준비 충족 {ready}명 · 최종 확인 완료 {final}명
                </span>
                <span className="work-progress">
                  <i
                    style={{
                      width: `${list.length ? (ready / list.length) * 100 : 0}%`,
                    }}
                  />
                </span>
                <span>
                  미완료 {list.length - ready}명 <ArrowRight size={15} />
                </span>
              </button>
            );
          })}
        </div>
      </section>
      <section className="card work-card">
        <h2>최근 활동</h2>
        <ul className="work-activity">
          {data.activity
            .filter((a) => !a.project || scope === "PMO" || a.project === scope)
            .slice(0, 5)
            .map((a, i) => (
              <li key={a.id || i}>
                <strong>{a.title}</strong>
                <span>{a.desc}</span>
                <time>{a.time}</time>
              </li>
            ))}
        </ul>
      </section>
    </div>
  );
}
const emptyFilters = {
  search: "",
  project: "전체",
  registration: "전체",
  preparation: "전체",
  lifecycle: "전체",
};
export function RosterPage({
  data,
  people,
  scope,
  canImport,
  canInvite,
  query,
  onImport,
  onRegister,
  onExport,
  onTaskExport,
  onInvite,
  onOpen,
  onLifecycle,
}) {
  const [filters, setFilters] = useState({
      ...emptyFilters,
      project: scope === "PMO" ? "전체" : scope,
      ...query,
    }),
    [selection, setSelection] = useState([]),
    [more, setMore] = useState(false);
  useEffect(() => {
    setFilters({
      ...emptyFilters,
      project: scope === "PMO" ? "전체" : scope,
      ...query,
    });
    setSelection([]);
  }, [JSON.stringify(query)]);
  const filtered = people.filter((p) => matchesPerson(p, data, filters)),
    selected = selection.filter((id) => people.some((p) => p.id === id)),
    pending = selected.filter(
      (id) =>
        people.find((p) => p.id === id)?.registrationStatus ===
        "pending_registration",
    );
  const change = (k, value) => setFilters((f) => ({ ...f, [k]: value }));
  return (
    <div className="work-page roster-work">
      <header className="work-title">
        <div>
          <h1>인원 명단</h1>
          <p>등록·준비·실제 투입 상태를 구분해 확인하세요.</p>
        </div>
        {btn("인력계획서 불러오기", onImport, true, !canImport)}
        <div className="work-more">
          <button
            className="btn"
            onClick={() => setMore((v) => !v)}
            aria-expanded={more}
          >
            기타 작업 <ChevronDown size={15} />
          </button>
          {more && (
            <div className="work-more-menu">
              {btn("개별 인원 등록", onRegister)}
              {btn("엑셀 내보내기", onExport)}
              {btn("작업 양식", onTaskExport)}
            </div>
          )}
        </div>
      </header>
      {query.repairId && (
        <div className="work-alert">
          <div>
            <strong>인원 정보 확인 필요</strong>
            <p>
              연결할 명단을 검색하거나 원본 계획서·이전 백업에서 인원을 확인해
              주세요. 고유 ID는 자동으로 합치거나 변경하지 않습니다.
            </p>
            <details>
              <summary>연결 기록 정보</summary>
              {query.repairId}
            </details>
          </div>
          {canImport && btn("원본 계획서 확인", onImport)}
          {globalThis.__READYBOARD_OFFLINE__ &&
            btn("백업에서 복구", () =>
              window.dispatchEvent(new Event("readyboard:open-demo-settings")),
            )}
        </div>
      )}
      <section className="card work-card">
        <div className="work-filters">
          <label className="work-search">
            이름·소속·역할 검색
            <input
              value={filters.search}
              onChange={(e) => change("search", e.target.value)}
              placeholder="이름, 소속, 역할"
            />
          </label>
          {[
            [
              "project",
              "프로젝트 필터",
              [["전체", "전체 프로젝트"], ...PROJECTS.map((x) => [x, x])],
            ],
            [
              "registration",
              "등록 상태 필터",
              [
                ["전체", "전체 등록 상태"],
                ["pending_registration", "본인 등록 대기"],
                ["registered", "등록 완료"],
              ],
            ],
            [
              "preparation",
              "준비 상태 필터",
              [
                ["전체", "전체 준비 상태"],
                ["incomplete", "필수 준비 미완료"],
                ["final_pending", "필수 항목 완료 · 최종 확인 대기"],
                ["confirmed", "최종 준비 확인 완료"],
                ["imminent", "투입 임박·준비 미완료"],
                ["overdue", "예정일 경과·준비 미완료"],
              ],
            ],
            [
              "lifecycle",
              "투입 상태 필터",
              [
                ["전체", "전체 투입 상태"],
                ...["투입 예정", "투입 중", "투입 보류", "철수 완료"].map(
                  (x) => [x, x],
                ),
              ],
            ],
          ].map(([key, label, options]) => (
            <label key={key}>
              {label.replace(" 필터", "")}
              <select
                aria-label={label}
                value={filters[key]}
                onChange={(e) => change(key, e.target.value)}
                disabled={key === "project" && scope !== "PMO"}
              >
                {options.map(([v, l]) => (
                  <option value={v} key={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <div className="work-selection">
          <span>
            검색 결과 {filtered.length}명 · 선택 {selected.length}명
          </span>
          {selected.length > 0 &&
            canInvite &&
            btn(
              `선택 인원 초대 링크 (${pending.length}명)`,
              () => onInvite(pending),
              false,
              !pending.length,
            )}
          <button
            className="text-link"
            onClick={() => {
              setFilters({
                ...emptyFilters,
                project: scope === "PMO" ? "전체" : scope,
              });
              setSelection([]);
            }}
          >
            필터 초기화
          </button>
        </div>
        <div className="table-scroll work-table">
          <table>
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    aria-label="표시 인원 전체 선택"
                    checked={
                      !!filtered.length &&
                      filtered.every((p) => selected.includes(p.id))
                    }
                    onChange={(e) =>
                      setSelection(
                        e.target.checked ? filtered.map((p) => p.id) : [],
                      )
                    }
                  />
                </th>
                <th>인원·소속</th>
                <th>프로젝트 / 투입일</th>
                <th>준비 상태</th>
                <th>등록 / 투입 상태</th>
                <th>다음 조치</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const s = personState(p, data),
                  identity = personIdentity(data, p.id),
                  next = attentionRows([p], data)[0];
                return (
                  <tr key={p.id} onClick={() => onOpen(p)}>
                    <td onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`${p.name} 인원 선택`}
                        checked={selected.includes(p.id)}
                        onChange={(e) =>
                          setSelection((ids) =>
                            e.target.checked
                              ? [...ids, p.id]
                              : ids.filter((id) => id !== p.id),
                          )
                        }
                      />
                    </td>
                    <td>
                      <button
                        className="person-name"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpen(p);
                        }}
                      >
                        {identity.name}
                      </button>
                      {identity.code && <small>{identity.code}</small>}
                      <span>{identity.company}</span>
                      {p.role && <small>{p.role}</small>}
                    </td>
                    <td>
                      <b>{p.project}</b>
                      <span>{date(p.start)}</span>
                      {s.overdue && (
                        <WorkBadge tone="orange">
                          예정일 경과 · 투입 여부 확인 필요
                        </WorkBadge>
                      )}
                    </td>
                    <td>
                      <Preparation person={p} data={data} />
                    </td>
                    <td>
                      <WorkBadge tone={s.registered ? "green" : "orange"}>
                        {s.registration}
                      </WorkBadge>
                      <span>{s.lifecycle}</span>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <small>
                        {next?.next?.task.title || next?.reason || "준비 완료"}
                      </small>
                      {!s.registered && canInvite
                        ? btn("초대 링크 생성·복사", () => onInvite([p.id]))
                        : btn(
                            s.overdue ? "투입 상태 확인" : "준비 작업 보기",
                            () => (s.overdue ? onLifecycle(p) : onOpen(p)),
                          )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!filtered.length && (
          <p className="work-empty">
            조건에 맞는 인원이 없습니다. 검색어나 상태 필터를 변경해 주세요.
          </p>
        )}
      </section>
    </div>
  );
}
export function TaskBoard({
  data,
  people,
  admin,
  onTask,
  onInvite,
  actionFor,
  onAdd,
  onExport,
}) {
  const [owner, setOwner] = useState("mine"),
    [status, setStatus] = useState("actionable"),
    [due, setDue] = useState("all"),
    [search, setSearch] = useState(""),
    [view, setView] = useState("list"),
    [limit, setLimit] = useState(8);
  const rows = taskRows(people, data),
    myOwner = admin ? "admin" : "member",
    base = rows.filter(
      (r) =>
        (owner === "all" ||
          r.owner ===
            (owner === "mine" ? myOwner : admin ? "member" : "admin")) &&
        [r.person.name, r.person.company, r.task.title]
          .join(" ")
          .toLowerCase()
          .includes(search.toLowerCase()) &&
        (due === "all" ||
          (due === "overdue" && r.gap !== null && r.gap < 0) ||
          (due === "week" && r.gap !== null && r.gap >= 0 && r.gap <= 7)),
    ),
    completed = base.filter((r) => r.done),
    filtered = base.filter(
      (r) =>
        !r.done &&
        (status === "open" ||
          (status === "actionable" && r.actionable) ||
          r.status === status),
    );
  const renderRow = (r) => (
    <article
      className="work-task-row"
      key={`${r.person.id}-${r.task.id}`}
      data-work-task={r.task.id}
    >
      <div>
        <b>{r.task.title}</b>
        <span>
          {r.person.name} · {r.person.company} · {r.person.project}
        </span>
        <small>
          담당: {r.contact} · 기한 {date(r.due)}
        </small>
        {r.registrationBlocked ? (
          <div className="dependency-reason">
            본인 등록 완료 후 시작할 수 있습니다.
            {admin && btn("등록 상태 보기", () => onInvite(r.person.id))}
          </div>
        ) : (
          r.status === "waiting" && (
            <div className="dependency-reason">
              대기 중인 이유:{" "}
              {r.blockedBy.map((id) => (
                <button
                  className="text-link"
                  key={id}
                  onClick={() => onTask(r.person, id)}
                >
                  {rows.find(
                    (x) => x.person.id === r.person.id && x.task.id === id,
                  )?.task.title || id}{" "}
                  확인
                </button>
              ))}
            </div>
          )
        )}
      </div>
      <WorkBadge status={r.status} />
      {r.registrationBlocked ? (
        <span>등록 대기</span>
      ) : (
        actionFor(r.person, r.task)
      )}
    </article>
  );
  return (
    <div className="work-page task-board">
      <header className="work-title">
        <div>
          <h1>{admin ? "준비 작업" : "나의 작업"}</h1>
          <p>현재 담당자가 처리할 미완료 작업을 먼저 보여드립니다.</p>
        </div>
        {admin && (
          <>
            {btn("작업 양식 다운로드", onExport)}
            {btn("작업 추가", onAdd, true)}
          </>
        )}
      </header>
      <div className="work-tabs" role="group" aria-label="작업 담당 범위">
        {[
          ["mine", "내 작업"],
          ["all", "전체 작업"],
          ["other", admin ? "수행사 작업" : "주관사 작업"],
        ].map(([id, label]) => (
          <button
            key={id}
            aria-pressed={owner === id}
            className={owner === id ? "active" : ""}
            onClick={() => {
              setOwner(id);
              setLimit(8);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <section className="card work-card">
        <div className="work-filters">
          <label>
            작업·인원 검색
            <input
              aria-label="작업·인원 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label>
            작업 상태
            <select
              aria-label="작업 상태 필터"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setLimit(8);
              }}
            >
              {[
                ["actionable", "지금 처리할 작업"],
                ["open", "미완료 전체"],
                ["ready", "실행 가능"],
                ["waiting", "선행 작업 대기"],
                ["review", "검토 대기"],
                ["fix", "보완 요청"],
                ["on_hold", "보류"],
              ].map(([v, l]) => (
                <option value={v} key={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label>
            기한
            <select
              aria-label="작업 기한 필터"
              value={due}
              onChange={(e) => setDue(e.target.value)}
            >
              <option value="all">전체 기한</option>
              <option value="overdue">기한 경과</option>
              <option value="week">7일 이내</option>
            </select>
          </label>
          <label>
            보기
            <select
              aria-label="작업 보기 방식"
              value={view}
              onChange={(e) => setView(e.target.value)}
            >
              <option value="list">기한순 작업</option>
              <option value="person">인원별 요약</option>
            </select>
          </label>
        </div>
        <p>{filtered.length}건 · 완료 작업은 아래에서 펼쳐볼 수 있습니다.</p>
        {view === "list"
          ? filtered.slice(0, limit).map(renderRow)
          : people
              .filter((p) => filtered.some((r) => r.person.id === p.id))
              .map((p) => {
                const state = personState(p, data),
                  list = filtered.filter((r) => r.person.id === p.id);
                return (
                  <details className="person-task-summary" key={p.id}>
                    <summary>
                      <b>{p.name}</b>
                      <span>
                        {date(p.start)} 투입 · 남은 필수{" "}
                        {state.remaining.length}건
                      </span>
                      <small>다음: {list[0]?.task.title}</small>
                    </summary>
                    {list.map(renderRow)}
                  </details>
                );
              })}
        {!filtered.length && (
          <p className="work-empty">
            선택한 조건에서 처리할 작업이 없습니다. 담당 범위나 상태 필터를
            변경해 주세요.
          </p>
        )}
        {view === "list" &&
          filtered.length > limit &&
          btn(`작업 더 보기 (${filtered.length - limit}건)`, () =>
            setLimit((n) => n + 8),
          )}
        <details className="completed-work">
          <summary>완료 작업 {completed.length}건</summary>
          {completed.map(renderRow)}
        </details>
      </section>
    </div>
  );
}
export function MemberDashboard({
  person,
  data,
  onPage,
  onTask,
  actionFor,
  onContinue,
}) {
  const s = personState(person, data),
    rows = taskRows([person], data),
    roadmap = memberRoadmap(person, data),
    mine = roadmap.mine,
    fix = roadmap.fixes.filter((r) => r.task.kind),
    host = rows.filter((r) => r.owner === "admin" && !r.done);
  return (
    <div className="work-page member-work">
      <header className="work-title">
        <div>
          <h1>{person.name}님의 투입 준비</h1>
          <p>
            {person.company} · {person.project} · 투입 {date(person.start)}
          </p>
          <WorkBadge tone={s.registered ? "green" : "orange"}>
            {s.registration}
          </WorkBadge>{" "}
          <WorkBadge>{s.lifecycle}</WorkBadge>
        </div>
        {btn(
          s.registered ? "내 정보 조회·수정" : "내 등록 이어하기",
          s.registered ? () => onPage("profile") : onContinue,
        )}
        <BrandCharacters focus="guide" className="work-mascot" />
      </header>
      <MemberRoadmap
        roadmap={roadmap}
        onTask={(id) => onTask(person, id)}
        onProfile={() => onPage("profile")}
        onContinue={onContinue}
      />
      {s.overdue && (
        <div className="work-alert">
          예정일 경과 · 투입 여부를 담당자가 확인 중입니다.
        </div>
      )}
      {fix.length > 0 && (
        <section className="work-alert">
          <b>보완 요청 {fix.length}건</b>
          {fix.map((r) => (
            <button
              className="btn"
              key={r.task.id}
              onClick={() => onTask(person, r.task.id)}
            >
              {r.task.title} 수정·재제출
            </button>
          ))}
        </section>
      )}
      <section className="card work-card">
        <div className="work-card-heading">
          <div>
            <h2>
              지금 내가 할 일 <span>{mine.length}건</span>
            </h2>
            <p>기한을 확인하고 바로 처리하세요.</p>
          </div>
          {btn("나의 작업 전체 보기", () => onPage("tasks"))}
        </div>
        {mine.map((r) => (
          <article className="work-task-row" key={r.task.id}>
            <div>
              <b>{r.task.title}</b>
              <span>기한 {date(r.due)} · 수행사 본인</span>
              {r.status === "fix" && (
                <span className="work-error">
                  {person.notes?.[r.task.id] ||
                    "담당자 보완 요청을 확인해 주세요."}
                </span>
              )}
            </div>
            <WorkBadge status={r.status} />
            {r.task.kind === "education" &&
              btn("교육 시작", () => onPage("education"))}
            {actionFor(person, r.task)}
          </article>
        ))}
        {!mine.length && <p className="work-empty">{roadmap.note}</p>}
        {roadmap.waiting.length > 0 && (
          <details className="completed-work member-waiting-work">
            <summary>대기·검토 중인 내 작업 {roadmap.waiting.length}건</summary>
            {roadmap.waiting.map((r) => (
              <article className="work-task-row" key={r.task.id}>
                <div>
                  <b>{r.task.title}</b>
                  <span>
                    기한 {date(r.due)} ·{" "}
                    {r.status === "on_hold"
                      ? "투입·작업 보류"
                      : r.owner === "admin"
                        ? "주관사에서 검토 중"
                        : "선행 작업 대기"}
                  </span>
                  {r.blockedBy.length > 0 && r.status === "waiting" && (
                    <div className="dependency-reason">
                      대기 중인 이유:{" "}
                      {r.blockedBy.map((id) => (
                        <button
                          className="text-link"
                          key={id}
                          onClick={() => onTask(person, id)}
                        >
                          {rows.find((row) => row.task.id === id)?.task.title ||
                            "선행 작업"}{" "}
                          확인
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <WorkBadge status={r.status} />
                {btn("상세 보기", () => onTask(person, r.task.id))}
              </article>
            ))}
          </details>
        )}
        {roadmap.completed.length > 0 && (
          <details className="completed-work member-completed-work">
            <summary>완료한 내 작업 {roadmap.completed.length}건</summary>
            {roadmap.completed.map((r) => (
              <article className="work-task-row" key={r.task.id}>
                <div>
                  <b>{r.task.title}</b>
                  <span>본인 작업 완료</span>
                </div>
                <WorkBadge status="done" />
                {btn("상세 보기", () => onTask(person, r.task.id))}
              </article>
            ))}
          </details>
        )}
      </section>
      <div className="member-overview-links">
        {["education", "documents"].map((page, i) => (
          <button className="card" key={page} onClick={() => onPage(page)}>
            <b>{i ? "제출 서류" : "필수 교육"}</b>
            <span>
              {
                rows.filter(
                  (r) =>
                    r.task.kind === (i ? "document" : "education") && r.done,
                ).length
              }{" "}
              /{" "}
              {
                rows.filter(
                  (r) => r.task.kind === (i ? "document" : "education"),
                ).length
              }{" "}
              완료
            </span>
            <ArrowRight size={16} />
          </button>
        ))}
      </div>
      <section className="card work-card">
        <h2>
          주관사에서 준비 중인 항목 <span>{host.length}건</span>
        </h2>
        <p>본인 작업과 별도로 담당자가 처리합니다.</p>
        {host.slice(0, 5).map((r) => (
          <div className="host-summary-row" key={r.task.id}>
            <span>{r.task.title}</span>
            <small>{r.contact}</small>
            <WorkBadge status={r.status} />
          </div>
        ))}
      </section>
    </div>
  );
}
