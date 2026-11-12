import React, { useState, useEffect, useRef } from "react";
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  GraduationCap,
  FileText,
  Armchair,
  MessageSquare,
  Settings,
  ChevronDown,
  ChevronRight,
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  Plus,
  Search,
  Bell,
  Download,
  Upload,
  X,
  Check,
  CheckCheck,
  CheckCircle2,
  Clock,
  AlertCircle,
  AlertTriangle,
  Sparkles,
  RefreshCw,
  Filter,
  MoreHorizontal,
  CalendarDays,
  Building2,
  ExternalLink,
  Send,
  PanelRightClose,
  ShieldCheck,
  Lock,
  Play,
  History,
  MapPin,
  Mail,
  HelpCircle,
  LogOut,
  Menu,
  MoveUpRight,
  FileCheck2,
  FileUp,
  Trash2,
  Layers,
  BookOpen,
  Link2,
  UserRound,
  Eye,
  Monitor,
  LoaderCircle,
  GripVertical,
  MousePointer2,
  Save,
  Undo2,
} from "lucide-react";
import {
  TASKS,
  STATUS,
  SEAT_IDS,
  TODAY,
  seed,
  taskStatus as baseTaskStatus,
  progress as baseProgress,
  isPrepared as baseIsPrepared,
  tasksForPerson,
  requiredTasks,
  canManage,
  evidenceStatus,
} from "./data.js";

import {
  createSeatDraft,
  stageSeatAssignment,
  stageSeatMove,
  stageSeatRelease,
  stageSeatOffboarding,
  getSeatChanges,
  commitSeatDraft,
} from "./seat-workspace.js";

import { createProjectTask } from "./project-tasks.js";
import AddTaskForm from "./AddTaskForm.jsx";

import BrandCharacters from "./BrandCharacters.jsx";

const STORAGE = "tuip-on-demo-v1";
const NAV = [
  ["dashboard", "전체 현황", LayoutDashboard],
  ["people", "인원 명단", Users],
  ["tasks", "준비 작업", ClipboardList],
  ["reviews", "교육·서류 검토", FileCheck2],
  ["seats", "좌석 관리", Armchair],
  ["messages", "문의·알림", MessageSquare],
];
const MEMBER_NAV = [
  ["dashboard", "나의 투입 준비", LayoutDashboard],
  ["tasks", "나의 작업", ClipboardList],
  ["education", "교육", GraduationCap],
  ["documents", "서류", FileText],
  ["myseat", "내 좌석", Armchair],
  ["messages", "문의·변경 요청", MessageSquare],
];
const titleMap = Object.fromEntries(
  [...NAV, ...MEMBER_NAV, ["settings", "운영 기준"]].map(([k, t]) => [k, t]),
);
const taskLabel = (id) => TASKS.find((t) => t.id === id)?.title || id;
const cx = (...a) => a.filter(Boolean).join(" ");
const fmt = (s) => s?.replaceAll("-", ".") || "—";
function Badge({ status, children, tone }) {
  const spec = STATUS[status] || [status, "gray"];
  return (
    <span className={cx("badge", tone || spec[1])}>
      <i />
      {children || spec[0]}
    </span>
  );
}
function Btn({ children, icon: Icon, variant = "", className = "", ...props }) {
  return (
    <button className={cx("btn", variant, className)} {...props}>
      {Icon && <Icon size={15} />} {children}
    </button>
  );
}
function Empty({
  title = "아직 등록된 항목이 없어요",
  desc = "새로운 작업이 생기면 이곳에 표시됩니다.",
  icon: Icon = ClipboardList,
  children,
}) {
  return (
    <div className="empty">
      <div className="empty-character">
        <BrandCharacters focus="bear" />
        <span className="empty-icon">
          <Icon size={20} />
        </span>
      </div>
      <h3>{title}</h3>
      <p>{desc}</p>
      {children}
    </div>
  );
}
function Avatar({ person, small = false }) {
  return (
    <span
      className={cx(
        "avatar",
        person.project === "SFA" ? "sfa" : "gw",
        small && "small",
      )}
    >
      {person.id.split("-")[0] === "SFA" ? "S" : "G"}
      <span>{person.id.split("-")[1]}</span>
    </span>
  );
}
function Progress({ value }) {
  return (
    <div className="progress-cell">
      <span className="progress-track">
        <i style={{ width: `${value}%` }} />
      </span>
      <span>
        {value}
        <small>%</small>
      </span>
    </div>
  );
}
function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
  className = "",
}) {
  const ref = useRef();
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = ref.current;
    dialog?.focus();
    const handler = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const all = [
          ...dialog.querySelectorAll(
            'button,input,select,textarea,a[href],[tabindex="0"]',
          ),
        ].filter((x) => !x.disabled);
        if (!all.length) return;
        const first = all[0],
          last = all.at(-1);
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === dialog)
        ) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
        className={cx("modal", wide && "wide", className)}
      >
        <header>
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button aria-label="닫기" className="icon-btn" onClick={onClose}>
            <X size={21} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

export default function App() {
  const [data, setData] = useState(() => {
    try {
      const d = JSON.parse(localStorage.getItem(STORAGE));
      if (d?.people && d?.versions && d?.settings) return d;
    } catch {}
    return seed();
  });
  const [mode, setMode] = useState("admin"),
    [scope, setScope] = useState("PMO"),
    [memberId, setMemberId] = useState("SFA-3"),
    [page, setPage] = useState("dashboard");
  const [modal, setModal] = useState(null),
    [personTab, setPersonTab] = useState("tasks"),
    [ai, setAi] = useState(false),
    [notifications, setNotifications] = useState(false),
    [mobile, setMobile] = useState(false),
    [toast, setToast] = useState("");
  const [search, setSearch] = useState(""),
    [projectFilter, setProjectFilter] = useState("전체 프로젝트"),
    [statusFilter, setStatusFilter] = useState("전체 상태"),
    [taskOwner, setTaskOwner] = useState("전체 작업"),
    [reviewTab, setReviewTab] = useState("전체"),
    [seatVersion, setSeatVersion] = useState(null),
    [seatZone, setSeatZone] = useState("전체 구역"),
    [seatDate, setSeatDate] = useState(TODAY);
  const [chat, setChat] = useState([]),
    [chatInput, setChatInput] = useState("");
  const [seatDrafts, setSeatDrafts] = useState({});
  const activeSeatDraft = mode === "admin" ? seatDrafts[scope] || null : null;
  const editableSeats = activeSeatDraft?.seats || data.seats;
  const pendingSeatChanges = getSeatChanges(activeSeatDraft);
  const hasSeatEdits =
    pendingSeatChanges.length > 0 ||
    (activeSeatDraft?.offboarding.length || 0) > 0;
  const [dragSeat, setDragSeat] = useState(null);
  const [dropSeat, setDropSeat] = useState(null);
  const seatDrag = useRef(null);
  const suppressSeatClick = useRef(0);
  const toastTimer = useRef(),
    urls = useRef({});
  const admin = mode === "admin",
    member = data.people.find((p) => p.id === memberId) || data.people[0];
  const scoped = data.people.filter((p) =>
    admin ? scope === "PMO" || p.project === scope : p.id === member.id,
  );
  const personTasks = (person) =>
    tasksForPerson(person, data.customTasks || []);
  const taskStatus = (person, id, seats = data.seats) =>
    baseTaskStatus(person, id, seats, data.customTasks || []);
  const progress = (person, seats = data.seats) =>
    baseProgress(person, seats, data.customTasks || []);
  const isPrepared = (person, seats = data.seats) =>
    baseIsPrepared(person, seats, data.customTasks || []);
  const taskLabel = (id) =>
    [...TASKS, ...(data.customTasks || [])].find((t) => t.id === id)?.title ||
    id;
  const notify = (text) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 4200);
  };
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE, JSON.stringify(data));
    } catch {
      notify("저장 공간이 부족합니다. 이 탭에서 변경 사항을 유지합니다.");
    }
  }, [data]);
  useEffect(() => {
    const sync = (e) => {
      if (e.key === STORAGE && e.newValue) {
        try {
          setData(JSON.parse(e.newValue));
        } catch {}
      }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  useEffect(() => {
    document.body.style.overflow = modal || mobile ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [modal, mobile]);
  const mutate = (fn) =>
    setData((d) => {
      const next = structuredClone(d);
      fn(next);
      return next;
    });
  const go = (id) => {
    setPage(id);
    setSearch("");
    setStatusFilter("전체 상태");
    setProjectFilter("전체 프로젝트");
    setModal(null);
    setMobile(false);
  };
  const audit = (d, title, desc, type = "task") => {
    d.activity.unshift({
      id: Date.now(),
      title,
      desc,
      type,
      time: new Date().toLocaleTimeString("ko-KR", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    });
    d.activity = d.activity.slice(0, 30);
  };
  const addNotice = (d, p, title, body) =>
    d.settings.reminder &&
    d.notifications.unshift({
      id: String(Date.now()) + Math.random(),
      project: p.project,
      personId: p.id,
      title,
      body,
      read: false,
    });
  const canEdit = (p) => admin && canManage(scope, p);
  const countStatus = (p, statuses) =>
    personTasks(p).filter(
      (t) => statuses.includes(taskStatus(p, t.id, data.seats)) && !t.derived,
    ).length;
  const pending = scoped
    .flatMap((p) =>
      ["O08", "O09", "O10", "O11"].map((id) => ({
        person: p,
        task: TASKS.find((t) => t.id === id),
        status: evidenceStatus(p, id, data.seats),
      })),
    )
    .filter((r) => ["review", "ai", "fix", "error"].includes(r.status));
  const reviewCount = pending.filter((r) =>
    ["review", "error"].includes(r.status),
  ).length;
  const nav = admin ? NAV : MEMBER_NAV;
  const screenTitle = admin
    ? {
        dashboard: "전체 현황",
        ...Object.fromEntries(NAV.map((x) => [x[0], x[1]])),
        settings: "운영 기준",
      }[page] || titleMap[page]
    : titleMap[page];
  const currentSeat = Object.entries(data.seats).find(
    ([, v]) => v?.personId === member.id,
  );
  function openPerson(p) {
    if (!scoped.some((x) => x.id === p.id))
      return notify("해당 인원 상세에 접근할 수 없습니다.");
    setPersonTab("tasks");
    setModal({ type: "person", id: p.id });
  }
  function updateTask(p, id, status = "done") {
    const task = personTasks(p).find((t) => t.id === id);
    if (!task) return;
    if (
      (task.owner === "admin" && !canEdit(p)) ||
      (task.owner === "member" && (admin || member.id !== p.id))
    )
      return notify("해당 작업의 수행 주체로 전환해 주세요.");
    const current = taskStatus(p, id, data.seats);
    if (!["ready", "progress"].includes(current))
      return notify("선행 작업을 먼저 완료해 주세요.");
    if (id === "O16" && p.start > TODAY)
      return notify(
        `투입 시작일 ${fmt(p.start)}부터 확정할 수 있습니다. 시연 기준일은 ${fmt(TODAY)}입니다.`,
      );
    mutate((d) => {
      const person = d.people.find((x) => x.id === p.id);
      person.tasks[id] = status;
      if (id === "O16") person.lifecycle = "투입 중";
      person.history.unshift({
        text: `${task.title} 완료`,
        date: new Date().toLocaleString("ko-KR"),
      });
      audit(
        d,
        `${p.id} · ${task.title} 완료`,
        `${task.owner === "admin" ? "주관사" : "수행사"} 처리`,
      );
      addNotice(
        d,
        p,
        `${task.title} 완료`,
        "연결된 작업의 실행 가능 상태가 갱신되었습니다.",
      );
    });
    notify("작업을 완료했습니다. 연결된 후속 작업이 갱신되었습니다.");
  }
  function uploadFile(p, id, file) {
    if (!file) return;
    if (admin || p.id !== member.id)
      return notify("수행사 본인 화면에서 제출해 주세요.");
    if (!["ready", "fix", "done"].includes(taskStatus(p, id, data.seats)))
      return notify("선행 작업을 먼저 확인해 주세요.");
    if (!/\.(pdf|png|jpe?g)$/i.test(file.name) || file.size > 10 * 1024 * 1024)
      return notify("10MB 이하의 PDF, PNG, JPG 파일을 선택해 주세요.");
    const key = `${p.id}-${id}`;
    if (urls.current[key]) URL.revokeObjectURL(urls.current[key]);
    urls.current[key] = URL.createObjectURL(file);
    mutate((d) => {
      const person = d.people.find((x) => x.id === p.id);
      person.files[id] = {
        name: file.name,
        size: `${Math.max(1, Math.round(file.size / 1024))} KB`,
        date: TODAY,
        demo: false,
      };
      person.tasks[id] = ["O08", "O09"].includes(id) ? "done" : "ai";
      if (["O08", "O09"].includes(id)) {
        person.certChecks ||= {};
        person.certChecks[id] = "ai";
      }
      person.notes[id] = "";
      person.history.unshift({
        text: `${taskLabel(id)} 제출 · ${file.name}`,
        date: new Date().toLocaleString("ko-KR"),
      });
      audit(
        d,
        `${p.id} · ${taskLabel(id)} 제출`,
        id === "O08" || id === "O09"
          ? "수료증 등록 · 교육 완료"
          : "AI 검토 대기 · 시연 결과 확인 가능",
        "document",
      );
      addNotice(
        d,
        p,
        `${taskLabel(id)} 제출됨`,
        id === "O08" || id === "O09"
          ? "수료증 등록으로 교육 완료 처리되었습니다. 증빙 확인은 별도입니다."
          : "시연용 AI 검토 결과를 확인할 수 있습니다.",
      );
    });
    notify(
      ["O08", "O09"].includes(id)
        ? "수료증을 등록했습니다. 교육이 완료되었습니다."
        : "서류가 제출되었습니다. AI 검토 화면으로 연결됩니다.",
    );
  }
  function simulateAI(p, id) {
    if (!canEdit(p) && !(mode === "member" && p.id === member.id)) return;
    mutate((d) => {
      const person = d.people.find((x) => x.id === p.id);
      if (["O08", "O09"].includes(id)) {
        person.certChecks ||= {};
        person.certChecks[id] = "review";
      } else person.tasks[id] = "review";
      person.notes[id] =
        p.id === "GW-2" && id === "O10"
          ? "서명란 누락 가능성이 있습니다. 담당자 원문 확인이 필요합니다."
          : "필수 항목이 확인되었습니다. 최종 확인은 담당자가 수행합니다.";
      audit(
        d,
        `${p.id} · 서류 확인 요청`,
        "시연용 AI 결과 · 실제 AI 분석 미연동",
        "document",
      );
      addNotice(
        d,
        p,
        `${p.id}님의 ${taskLabel(id)} 확인 요청`,
        "시연용 AI 사전 검토 결과가 준비되었습니다.",
      );
    });
    notify("시연용 AI 결과를 표시하고 담당자 확인 요청을 생성했습니다.");
  }
  function review(p, id, result, note) {
    if (!canEdit(p))
      return notify("해당 프로젝트 담당자만 검토할 수 있습니다.");
    if (!["review", "error"].includes(evidenceStatus(p, id, data.seats)))
      return notify("확인 요청 상태의 문서만 처리할 수 있습니다.");
    if (result === "fix" && !note.trim())
      return notify("보완이 필요한 이유를 입력해 주세요.");
    mutate((d) => {
      const person = d.people.find((x) => x.id === p.id);
      if (["O08", "O09"].includes(id)) {
        person.certChecks ||= {};
        person.certChecks[id] = result;
        person.tasks[id] = result === "done" ? "done" : "fix";
      } else person.tasks[id] = result;
      person.notes[id] = note;
      person.history.unshift({
        text: `${taskLabel(id)} ${result === "done" ? "승인" : "보완 요청"}`,
        date: new Date().toLocaleString("ko-KR"),
      });
      audit(
        d,
        `${p.id} · ${taskLabel(id)} ${result === "done" ? "승인" : "보완 요청"}`,
        note || "담당자 원문 확인 완료",
        "document",
      );
      addNotice(
        d,
        p,
        `${taskLabel(id)} ${result === "done" ? "승인" : "보완 요청"}`,
        note || "담당자가 확인했습니다.",
      );
    });
    notify(
      result === "done"
        ? "서류를 승인했습니다. 후속 작업이 갱신되었습니다."
        : "보완 요청을 전달했습니다.",
    );
    setModal(null);
  }
  function askAI(q) {
    if (!q.trim()) return;
    let answer;
    if (/서명|작성|서류/.test(q))
      answer =
        "보안서약서는 성명, 소속, 프로젝트, 작성일을 채운 후 마지막 서명란에 본인이 서명합니다. 개인정보 동의서는 수집 목적·보유기간을 먼저 확인해 주세요. 제출 후 AI 사전 검토 화면을 거쳐 담당자에게 확인 요청이 전달됩니다.\n근거: 시연용 서류 작성 가이드 v1 · 실제 AI 미연동";
    else if (/좌석/.test(q))
      answer = `현재 공용 배치도는 v${data.versions.at(-1).version}입니다. ${Object.values(data.seats).filter(Boolean).length}석이 배정되어 있습니다. 주관사 담당자는 본인 프로젝트 인원만 배정할 수 있으며, 수행사는 본인 배정 결과만 확인합니다.\n근거: 현재 시연 좌석 원장`;
    else if (/교육|수료/.test(q))
      answer =
        "교육 사이트에서 수강한 뒤 발급받은 수료증을 이곳에 등록해 주세요. 링크를 여는 것만으로는 완료되지 않습니다. 파일이 등록되면 교육은 완료로 표시되며, 증빙 검증 상태는 별도로 관리합니다.\n근거: 교육 처리 기준 v1";
    else {
      const list = scoped.filter((p) => !isPrepared(p, data.seats));
      answer = `현재 조회 범위 ${admin ? scope : member.id}에서 준비 미완료 인원은 ${list.length}명입니다. ${list
        .slice(0, 4)
        .map((p) => `${p.id}(${progress(p, data.seats)}%)`)
        .join(
          ", ",
        )}${list.length > 4 ? " 등이 있습니다." : "입니다."}\n계정 발급 대기, 서류 확인 요청, 좌석 미배정 순으로 확인해 보세요. 이 답변은 시연 데이터에서 생성한 고정 규칙 안내입니다.\n근거: 현재 명단·작업 현황 · 기준일 2026.11.09`;
    }
    setChat((c) => [
      ...c,
      { role: "user", text: q },
      { role: "assistant", text: answer },
    ]);
    setChatInput("");
  }
  async function workbook(kind) {
    const { default: ExcelJS } = await import("exceljs");
    const wb = new ExcelJS.Workbook();
    const sh = wb.addWorksheet(kind === "template" ? "인원등록" : "인원현황");
    sh.columns = [
      { header: "성명", key: "name", width: 18 },
      { header: "프로젝트", key: "project", width: 18 },
      { header: "회사", key: "company", width: 22 },
      { header: "역할", key: "role", width: 15 },
      { header: "이메일", key: "email", width: 32 },
      { header: "투입시작일", key: "start", width: 20 },
      { header: "투입종료일", key: "end", width: 20 },
    ];
    if (kind === "template")
      sh.addRow({
        name: "샘플-1",
        project: scope === "PMO" ? "SFA" : scope,
        company: "샘플 수행사",
        role: "개발자",
        email: "sample@demo.example",
        start: "2026-11-16",
        end: "2027-02-26",
      });
    else filteredPeople().forEach((p) => sh.addRow(p));
    sh.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sh.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1B6558" },
    };
    const blob = new Blob([await wb.xlsx.writeBuffer()], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    download(
      blob,
      `투입ON_${kind === "template" ? "인원등록_템플릿" : "인원현황"}.xlsx`,
    );
    notify("엑셀 파일을 다운로드했습니다.");
  }
  function download(blob, name) {
    const u = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = u;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(u), 1000);
  }
  function filteredPeople() {
    return scoped.filter(
      (p) =>
        (projectFilter === "전체 프로젝트" || p.project === projectFilter) &&
        (!search ||
          [p.id, p.company, p.email, p.role]
            .join(" ")
            .toLowerCase()
            .includes(search.toLowerCase())) &&
        (statusFilter === "전체 상태" ||
          (statusFilter === "준비 미완료"
            ? !isPrepared(p, data.seats)
            : statusFilter === "준비 충족"
              ? isPrepared(p, data.seats)
              : statusFilter === p.lifecycle)),
    );
  }
  function actionFor(p, t, compact = false) {
    const status = taskStatus(p, t.id, data.seats),
      own = admin
        ? t.owner === "admin" && canEdit(p)
        : t.owner === "member" && p.id === member.id;
    if (t.kind === "education" || t.kind === "document")
      return (
        <button
          className="text-link"
          onClick={() => setModal({ type: "document", id: p.id, task: t.id })}
        >
          {admin
            ? "상세 보기"
            : status === "done"
              ? "제출본 보기"
              : status === "waiting"
                ? "안내 보기"
                : "시작하기"}
          <ChevronRight size={14} />
        </button>
      );
    if (t.kind === "seat")
      return admin ? (
        <button
          className="text-link"
          onClick={() => {
            go("seats");
            if (status !== "done")
              setModal({
                type: "assign",
                personId: p.id,
                base: data.versions.at(-1).version,
              });
          }}
        >
          좌석 {status === "done" ? "보기" : "배정"}
          <ChevronRight size={14} />
        </button>
      ) : (
        <span className="muted">주관사 처리</span>
      );
    if (t.derived)
      return admin ? (
        <button className="text-link" onClick={() => go("reviews")}>
          검토함 보기
          <ChevronRight size={14} />
        </button>
      ) : (
        <span className="muted">주관사 확인</span>
      );
    if (own && ["ready", "progress"].includes(status))
      return (
        <Btn
          variant="small"
          onClick={() => setModal({ type: "task", id: p.id, task: t.id })}
        >
          {status === "progress" ? "완료 확인" : "작업 시작"}
          <ArrowRight size={13} />
        </Btn>
      );
    if (status === "done")
      return (
        <span className="done-label">
          <Check size={14} /> 완료
        </span>
      );
    return (
      <span className="muted">
        {status === "waiting"
          ? "선행 작업 대기"
          : own
            ? "처리 대기"
            : "상대방 처리"}
      </span>
    );
  }
  function PersonTable({ people = filteredPeople(), simple = false }) {
    return (
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>인원 / 소속</th>
              <th>프로젝트</th>
              <th>투입 기간</th>
              <th>준비율</th>
              {!simple && <th>교육 / 서류</th>}
              <th>투입 상태</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr
                key={p.id}
                onClick={() => openPerson(p)}
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && openPerson(p)}
              >
                <td>
                  <div className="person-cell">
                    <Avatar person={p} />
                    <div>
                      <strong>{p.name}</strong>
                      <span>
                        {p.company} · {p.role}
                      </span>
                    </div>
                  </div>
                </td>
                <td>
                  <span
                    className={cx(
                      "project-label",
                      p.project === "SFA" ? "" : "violet",
                    )}
                  >
                    {p.project}
                  </span>
                </td>
                <td>
                  <span className="date-text">
                    {fmt(p.start)}
                    <br />
                    <span className="muted">~ {fmt(p.end)}</span>
                  </span>
                </td>
                <td>
                  <Progress value={progress(p, data.seats)} />
                </td>
                {!simple && (
                  <td>
                    <div className="two-status">
                      <span>
                        <GraduationCap size={14} />
                        {
                          ["O08", "O09"].filter(
                            (id) => taskStatus(p, id, data.seats) === "done",
                          ).length
                        }
                        /2
                      </span>
                      <span>
                        <FileText size={14} />
                        {
                          ["O10", "O11"].filter(
                            (id) => taskStatus(p, id, data.seats) === "done",
                          ).length
                        }
                        /2
                      </span>
                    </div>
                  </td>
                )}
                <td>
                  <Badge
                    tone={
                      p.lifecycle === "투입 중"
                        ? "green"
                        : p.lifecycle === "철수 완료"
                          ? "gray"
                          : "blue"
                    }
                  >
                    {p.lifecycle}
                  </Badge>
                </td>
                <td>
                  <ChevronRight size={17} className="muted" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!people.length && (
          <Empty
            title="조건에 맞는 인원이 없어요"
            desc="검색어나 필터를 변경해 주세요."
          />
        )}
      </div>
    );
  }
  function TaskRows({ person, filter = "전체 작업" }) {
    const list = personTasks(person).filter(
      (t) =>
        (filter === "전체 작업" ||
          (filter === "내가 할 작업"
            ? t.owner === (admin ? "admin" : "member")
            : filter === "주관사 작업"
              ? t.owner === "admin"
              : t.owner === "member")) &&
        (!search ||
          t.title.includes(search) ||
          person.id.toLowerCase().includes(search.toLowerCase())),
    );
    return (
      <div className="task-list">
        {list.map((t) => {
          const status = taskStatus(person, t.id, data.seats);
          return (
            <div
              className={cx("task-row", status === "done" && "completed")}
              key={t.id}
            >
              <div className={cx("task-check", status === "done" && "checked")}>
                {status === "done" ? (
                  <Check size={15} />
                ) : status === "waiting" ? (
                  <Lock size={13} />
                ) : (
                  <span />
                )}
              </div>
              <div className="task-title">
                <strong>{t.title}</strong>
                <span>
                  {t.group} <b>·</b> {t.owner === "admin" ? "주관사" : "수행사"}{" "}
                  <b>·</b> {t.required === false ? "선택" : "필수"}
                  {t.due && ` · 기한 ${fmt(t.due)}`}
                  {status === "waiting" &&
                    ` · 대기: ${[
                      ...t.deps,
                      ...(t.id === "O16"
                        ? requiredTasks(person, data.customTasks)
                            .filter((x) => x.custom)
                            .map((x) => x.id)
                        : []),
                    ]
                      .filter(
                        (d) => taskStatus(person, d, data.seats) !== "done",
                      )
                      .map(taskLabel)
                      .join(", ")}`}
                </span>
              </div>
              <Badge status={status} />
              <div className="task-action">{actionFor(person, t)}</div>
              <button
                className="icon-btn"
                aria-label={`${t.title} 문의`}
                title="담당자 문의"
                onClick={() =>
                  setModal({ type: "inquiry", id: person.id, task: t.id })
                }
              >
                <MessageSquare size={16} />
              </button>
            </div>
          );
        })}
        {!list.length && <Empty />}
      </div>
    );
  }
  function Stats() {
    const ready = scoped.filter((p) => isPrepared(p, data.seats)).length;
    const cards = [
      {
        label: "전체 투입 인원",
        value: scoped.length,
        unit: "명",
        desc: `${admin && scope === "PMO" ? "2개 프로젝트" : "선택 프로젝트"} 통합 관리`,
        icon: Users,
        color: "green",
        action: () => go("people"),
      },
      {
        label: "투입 준비 완료",
        value: ready,
        unit: "명",
        desc: `전체 인원의 ${Math.round((ready / scoped.length) * 100) || 0}% 준비 충족`,
        icon: CheckCircle2,
        color: "mint",
        action: () => {
          go("people");
          setStatusFilter("준비 충족");
        },
      },
      {
        label: "확인 요청",
        value: reviewCount,
        unit: "건",
        desc: "교육·서류 검토가 필요해요",
        icon: FileCheck2,
        color: "orange",
        action: () => {
          go("reviews");
          setReviewTab("확인 요청");
        },
      },
      {
        label: "준비 미완료",
        value: scoped.length - ready,
        unit: "명",
        desc: "아직 진행 중인 작업이 있어요",
        icon: Clock,
        color: "violet",
        action: () => {
          go("people");
          setStatusFilter("준비 미완료");
        },
      },
    ];
    return (
      <div className="stats">
        {cards.map((c) => (
          <button className="stat-card" key={c.label} onClick={c.action}>
            <div className="stat-top">
              <span>{c.label}</span>
              <span className={cx("stat-icon", c.color)}>
                <c.icon size={19} />
              </span>
            </div>
            <div className="stat-value">
              {c.value}
              <small>{c.unit}</small>
              <ArrowUpRight size={18} />
            </div>
            <p>{c.desc}</p>
          </button>
        ))}
      </div>
    );
  }
  function Dashboard() {
    const needs = scoped.filter((p) => !isPrepared(p, data.seats)).slice(0, 4);
    return (
      <>
        <section className="page-heading dashboard-welcome">
          <div className="welcome-copy">
            <div className="eyebrow">TOGETHER, READY FOR YOUR NEXT</div>
            <p className="welcome-kicker">함께 준비하는 프로젝트의 첫 시작</p>
            <h1 className="campaign-title">
              한눈에 보는 투입 현황
              <span className="heading-dot" />
            </h1>
            <p>새로운 시작의 모든 준비를, 투입ON과 차근차근 연결해 보세요.</p>
          </div>
          <div className="welcome-visual">
            <BrandCharacters label="함께 프로젝트의 시작을 준비하는 캐릭터들" />
          </div>
          <Btn
            icon={Plus}
            variant="primary"
            onClick={() => setModal({ type: "register" })}
          >
            인원 등록
          </Btn>
          <div className="brand-one-motif" aria-hidden="true">
            <i />
            <b />
          </div>
        </section>
        <div className="date-strip">
          <div>
            <CalendarDays size={15} />
            <strong>2026년 11월 9일 월요일</strong>
            <span className="muted">시연 기준일</span>
          </div>
          <span className="live">
            <i /> 모든 프로젝트 현황을 확인하고 있어요
          </span>
        </div>
        <Stats />
        <div className="overview-grid">
          <section className="card project-card">
            <div className="card-heading">
              <div>
                <h2>프로젝트별 준비 현황</h2>
                <p>투입에 필요한 준비가 얼마나 완료되었나요?</p>
              </div>
              <span className="subtle-tag">
                {scope === "PMO" ? "전체 프로젝트" : scope}
              </span>
            </div>
            <div className="project-list">
              {(scope === "PMO" ? ["SFA", "그룹웨어"] : [scope]).map(
                (project, i) => {
                  const ps = scoped.filter((p) => p.project === project);
                  const avg = Math.round(
                    ps.reduce((v, p) => v + progress(p, data.seats), 0) /
                      (ps.length || 1),
                  );
                  return (
                    <button
                      className="project-overview"
                      key={project}
                      onClick={() => {
                        go("people");
                        setProjectFilter(project);
                      }}
                    >
                      <div
                        className={cx(
                          "project-symbol",
                          project === "그룹웨어" && "purple",
                        )}
                      >
                        <Layers size={23} />
                      </div>
                      <div className="project-info">
                        <div>
                          <strong>{project}</strong>
                          <Badge tone="blue">진행 중</Badge>
                        </div>
                        <p>
                          <Users size={12} /> {ps.length}명 <span>·</span>{" "}
                          {project === "SFA" ? "SFA" : "GW"}-담당자
                        </p>
                        <div className="project-progress">
                          <span>
                            <i style={{ width: `${avg}%` }} />
                          </span>
                          <strong>
                            {avg}
                            <small>%</small>
                          </strong>
                        </div>
                      </div>
                      <ChevronRight size={17} />
                    </button>
                  );
                },
              )}
            </div>
            <div className="project-foot">
              <ShieldCheck size={16} />
              <span>계정 · 교육 · 서류 · 좌석 준비 상태를 함께 확인해요.</span>
            </div>
          </section>
          <section className="card needs-card">
            <div className="card-heading">
              <div>
                <h2>
                  지금 확인이 필요해요{" "}
                  <span className="count-pill">{needs.length}</span>
                </h2>
                <p>투입 준비가 남은 인원을 먼저 확인하세요.</p>
              </div>
              <button
                className="icon-btn"
                aria-label="미완료 전체 보기"
                onClick={() => {
                  go("people");
                  setStatusFilter("준비 미완료");
                }}
              >
                <ArrowUpRight size={19} />
              </button>
            </div>
            <div>
              {needs.map((p) => (
                <button
                  className="needs-row"
                  key={p.id}
                  onClick={() => openPerson(p)}
                >
                  <Avatar person={p} small />
                  <div>
                    <strong>
                      {p.id}
                      <span>{p.project}</span>
                    </strong>
                    <p>
                      {["O10", "O11"].some((id) =>
                        ["review", "error"].includes(
                          taskStatus(p, id, data.seats),
                        ),
                      )
                        ? "서류 확인 요청을 확인해 주세요"
                        : Object.values(p.tasks).includes("ai")
                          ? "제출한 서류의 AI 검토가 진행 중이에요"
                          : taskStatus(p, "O06", data.seats) === "waiting"
                            ? "주관사 계정 준비를 기다리고 있어요"
                            : "교육·서류·좌석 준비를 진행해 주세요"}
                    </p>
                  </div>
                  <ChevronRight size={15} />
                </button>
              ))}
              {!needs.length && (
                <Empty
                  title="모든 준비가 완료되었어요"
                  desc="새로운 투입 인원을 등록해 보세요."
                />
              )}
            </div>
          </section>
        </div>
        <div className="ai-banner">
          <div className="ai-banner-character">
            <BrandCharacters focus="guide" />
          </div>
          <div>
            <span>YOUR PMO ASSISTANT</span>
            <h3>복잡한 현황 파악, AI에게 물어보세요.</h3>
            <p>
              준비가 늦어지는 인원부터 다음 조치까지, 필요한 정보를 한 번에.
            </p>
          </div>
          <Btn
            onClick={() => {
              setAi(true);
              askAI("현재 준비 미완료 현황을 요약해 줘");
            }}
          >
            AI 현황 브리핑 <ArrowUpRight size={15} />
          </Btn>
          <div className="banner-orbit" />
        </div>
        <div className="bottom-grid">
          <section className="card">
            <div className="card-heading">
              <div>
                <h2>투입 인원 현황</h2>
                <p>인원별 준비 상태와 투입 일정을 확인하세요.</p>
              </div>
              <button className="text-link" onClick={() => go("people")}>
                전체 보기
                <ArrowRight size={14} />
              </button>
            </div>
            <PersonTable people={scoped.slice(0, 4)} simple />
          </section>
          <section className="card activity-card">
            <div className="card-heading">
              <div>
                <h2>최근 활동</h2>
                <p>워크스페이스의 새로운 소식</p>
              </div>
              <History size={18} className="muted" />
            </div>
            <div className="activity-list">
              {data.activity
                .filter(
                  (a) =>
                    scope === "PMO" ||
                    a.title.includes(scope === "SFA" ? "SFA" : "GW") ||
                    a.desc.includes(scope === "SFA" ? "SFA" : "GW"),
                )
                .slice(0, 4)
                .map((a, i) => (
                  <div className="activity" key={a.id}>
                    <span
                      className={cx(
                        "activity-icon",
                        a.type === "seat"
                          ? "blue"
                          : a.type === "document"
                            ? "purple"
                            : "green",
                      )}
                    >
                      {a.type === "seat" ? (
                        <Armchair size={15} />
                      ) : a.type === "document" ? (
                        <FileText size={15} />
                      ) : (
                        <Users size={15} />
                      )}
                    </span>
                    <div>
                      <strong>{a.title}</strong>
                      <p>{a.desc}</p>
                      <time>{a.time}</time>
                    </div>
                  </div>
                ))}
            </div>
          </section>
        </div>
      </>
    );
  }
  function People() {
    return (
      <>
        <PageHeading
          title="인원 명단"
          desc="프로젝트 인원과 투입 준비 상태를 한곳에서 관리하세요."
          actions={
            <>
              <Btn icon={Download} onClick={() => workbook("export")}>
                엑셀 내보내기
              </Btn>
              <Btn
                icon={Plus}
                variant="primary"
                onClick={() => setModal({ type: "register" })}
              >
                인원 등록
              </Btn>
            </>
          }
        />
        <div className="mini-summary">
          <span>
            전체 인원 <strong>{scoped.length}</strong>
          </span>
          <i />
          <span>
            투입 중{" "}
            <strong>
              {scoped.filter((p) => p.lifecycle === "투입 중").length}
            </strong>
          </span>
          <i />
          <span>
            투입 예정{" "}
            <strong>
              {scoped.filter((p) => p.lifecycle === "투입 예정").length}
            </strong>
          </span>
        </div>
        <section className="card">
          <div className="filter-bar">
            <SearchBox
              value={search}
              onChange={setSearch}
              placeholder="이름, 소속, 역할 검색"
            />
            <div className="filter-controls">
              {scope === "PMO" && (
                <select
                  aria-label="프로젝트 필터"
                  value={projectFilter}
                  onChange={(e) => setProjectFilter(e.target.value)}
                >
                  <option>전체 프로젝트</option>
                  <option>SFA</option>
                  <option>그룹웨어</option>
                </select>
              )}
              <select
                aria-label="상태 필터"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                {[
                  "전체 상태",
                  "투입 중",
                  "투입 예정",
                  "준비 충족",
                  "준비 미완료",
                  "철수 완료",
                ].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
              <span className="result-count">
                총 {filteredPeople().length}명
              </span>
            </div>
          </div>
          <PersonTable />
          <div className="table-footer">
            <span>선택한 범위의 전체 인원 {filteredPeople().length}명</span>
            <span className="page-number">1</span>
          </div>
        </section>
        <div className="info-note">
          <ShieldCheck size={16} />
          {scope === "PMO"
            ? "PMO는 전체 프로젝트의 인원과 준비 현황을 관리할 수 있습니다."
            : `${scope} 담당자에게는 해당 프로젝트 인원만 표시됩니다.`}
        </div>
      </>
    );
  }
  function Tasks() {
    const ps = admin ? scoped : [member];
    return (
      <>
        <PageHeading
          title={admin ? "준비 작업" : "나의 작업"}
          desc="누가, 무엇을, 언제 해야 하는지 연결된 흐름으로 확인하세요."
          actions={
            <>
              <Btn icon={Sparkles} onClick={() => setAi(true)}>
                AI 업무 도우미
              </Btn>
              {admin && (
                <Btn
                  variant="primary"
                  icon={Plus}
                  onClick={() => setModal({ type: "addTask" })}
                >
                  작업 추가
                </Btn>
              )}
            </>
          }
        />
        <div className="tabs">
          {[
            "전체 작업",
            "내가 할 작업",
            admin ? "수행사 작업" : "주관사 작업",
          ].map((v) => (
            <button
              className={taskOwner === v ? "active" : ""}
              key={v}
              onClick={() => setTaskOwner(v)}
            >
              {v}
            </button>
          ))}
        </div>
        <div className="filter-bar standalone">
          <SearchBox
            value={search}
            onChange={setSearch}
            placeholder="작업명 또는 인원 검색"
          />
          <span className="muted">
            <Link2 size={14} /> 선행 작업 완료 시 후속 작업이 열립니다
          </span>
        </div>
        {ps
          .filter(
            (p) =>
              !search ||
              p.id.toLowerCase().includes(search.toLowerCase()) ||
              personTasks(p).some((t) => t.title.includes(search)),
          )
          .map((p) => (
            <section className="card task-person" key={p.id}>
              <div className="card-heading">
                <div className="person-cell">
                  <Avatar person={p} small />
                  <div>
                    <h2>
                      {p.id} <span className="subtle-tag">{p.project}</span>
                    </h2>
                    <p>
                      {fmt(p.start)} 투입 · {p.project === "SFA" ? "SFA" : "GW"}
                      -담당자
                    </p>
                  </div>
                </div>
                <Progress value={progress(p, data.seats)} />
              </div>
              <TaskRows person={p} filter={taskOwner} />
            </section>
          ))}
      </>
    );
  }
  function Reviews() {
    const entries = scoped.flatMap((p) =>
      ["O10", "O11", "O08", "O09"]
        .filter((id) => p.files[id])
        .map((id) => ({ p, id, status: evidenceStatus(p, id, data.seats) })),
    );
    const rows = entries.filter(
      (r) =>
        (reviewTab === "전체" ||
          (reviewTab === "확인 요청"
            ? ["review", "error"].includes(r.status)
            : reviewTab === "AI 검토 중"
              ? r.status === "ai"
              : reviewTab === "보완 요청"
                ? r.status === "fix"
                : r.status === "done")) &&
        (!search || `${r.p.id} ${taskLabel(r.id)}`.includes(search)),
    );
    return (
      <>
        <PageHeading
          title="교육·서류 검토"
          desc="AI 사전 검토 결과와 원문을 확인하고 다음 작업으로 연결하세요."
        />
        <div className="review-stats">
          <div>
            <span className="square-icon orange">
              <FileCheck2 size={20} />
            </span>
            <div>
              <span>확인 요청</span>
              <strong>
                {
                  entries.filter((r) => ["review", "error"].includes(r.status))
                    .length
                }
                <small>건</small>
              </strong>
            </div>
          </div>
          <div>
            <span className="square-icon purple">
              <Sparkles size={20} />
            </span>
            <div>
              <span>AI 검토 중</span>
              <strong>
                {entries.filter((r) => r.status === "ai").length}
                <small>건</small>
              </strong>
            </div>
          </div>
          <div>
            <span className="square-icon green">
              <CheckCheck size={20} />
            </span>
            <div>
              <span>서류 승인·교육 완료</span>
              <strong>
                {entries.filter((r) => r.status === "done").length}
                <small>건</small>
              </strong>
            </div>
          </div>
        </div>
        <section className="card">
          <div className="tabs card-tabs">
            {["전체", "확인 요청", "AI 검토 중", "보완 요청", "완료"].map(
              (t) => (
                <button
                  key={t}
                  className={reviewTab === t ? "active" : ""}
                  onClick={() => setReviewTab(t)}
                >
                  {t}
                  {t === "확인 요청" && <span>{reviewCount}</span>}
                </button>
              ),
            )}
          </div>
          <div className="filter-bar">
            <SearchBox
              value={search}
              onChange={setSearch}
              placeholder="인원 또는 서류명 검색"
            />
            <span className="result-count">총 {rows.length}건</span>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>검토 항목</th>
                  <th>제출자</th>
                  <th>제출일</th>
                  <th>진행 상태</th>
                  <th>AI 사전 검토</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ p, id, status }) => (
                  <tr
                    key={`${p.id}${id}`}
                    onClick={() =>
                      setModal({ type: "document", id: p.id, task: id })
                    }
                  >
                    <td>
                      <div className="file-name">
                        <span
                          className={cx(
                            "file-icon",
                            ["O08", "O09"].includes(id) && "edu",
                          )}
                        >
                          {["O08", "O09"].includes(id) ? (
                            <GraduationCap size={20} />
                          ) : (
                            <FileText size={20} />
                          )}
                        </span>
                        <div>
                          <strong>{taskLabel(id)}</strong>
                          <span>{p.files[id].name}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <strong>{p.id}</strong>
                      <p className="cell-sub">{p.project}</p>
                    </td>
                    <td className="date-text">{fmt(p.files[id].date)}</td>
                    <td>
                      <Badge status={status} />
                    </td>
                    <td>
                      <span
                        className={cx(
                          "ai-result",
                          status === "error" ? "danger" : "",
                        )}
                      >
                        {status === "ai" ? (
                          <>
                            <LoaderCircle size={14} />
                            검토 대기
                          </>
                        ) : status === "error" ? (
                          <>
                            <AlertCircle size={14} />
                            분석 실패
                          </>
                        ) : p.notes[id]?.includes("서명") ? (
                          <>
                            <AlertTriangle size={14} />
                            서명 확인 필요
                          </>
                        ) : (
                          <>
                            <Sparkles size={14} />
                            원문 확인 필요
                          </>
                        )}
                      </span>
                    </td>
                    <td>
                      <ChevronRight size={17} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length && (
              <Empty
                title="현재 조건의 검토 항목이 없어요"
                desc="다른 탭을 선택하거나 새 제출을 기다려 주세요."
              />
            )}
          </div>
        </section>
        <div className="info-note">
          <Sparkles size={16} />
          AI 영역은 시연용 화면입니다. 서류의 최종 승인과 보완 요청은 담당자가
          직접 처리합니다.
        </div>
      </>
    );
  }
  function stageSeatEdit(edit) {
    try {
      const next = edit(activeSeatDraft || createSeatDraft(data, scope));
      setSeatDrafts((all) => ({
        ...all,
        [scope]:
          getSeatChanges(next).length || next.offboarding.length ? next : null,
      }));
      return true;
    } catch (error) {
      notify(error.message);
      return false;
    }
  }
  function saveSeatChanges() {
    if (!activeSeatDraft || !hasSeatEdits) return;
    let current = data;
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE));
      if (stored?.versions) current = stored;
    } catch {}
    try {
      const next = commitSeatDraft(current, activeSeatDraft, scope);
      audit(
        next,
        `좌석 변경 ${pendingSeatChanges.length}건 저장`,
        `공용 배치도 v${next.versions.at(-1).version}`,
        "seat",
      );
      localStorage.setItem(STORAGE, JSON.stringify(next));
      setData(next);
      setSeatDrafts((all) => ({ ...all, [scope]: null }));
      setSeatVersion(null);
      notify(
        `저장 완료 · ${pendingSeatChanges.length}건의 변경을 v${next.versions.at(-1).version}에 기록했습니다.`,
      );
    } catch (error) {
      setData(current);
      notify(error.message);
    }
  }
  useEffect(() => {
    const hasPending = Object.values(seatDrafts).some(
      (d) => d && (getSeatChanges(d).length || d.offboarding.length),
    );
    if (!hasPending) return;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [seatDrafts]);
  function beginSeatDrag(event, id) {
    const assignment = editableSeats[id];
    const person = data.people.find((p) => p.id === assignment?.personId);
    const historical =
      seatVersion !== null && seatVersion !== data.versions.at(-1).version;
    if (
      !admin ||
      historical ||
      !person ||
      !canEdit(person) ||
      person.lifecycle === "철수 완료"
    ) {
      event.preventDefault();
      return;
    }
    seatDrag.current = {
      fromSeatId: id,
      personId: person.id,
      scope,
      baseVersion: data.versions.at(-1).version,
    };
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-tuipon-seat", id);
    setDragSeat(id);
  }
  function endSeatDrag() {
    seatDrag.current = null;
    setDragSeat(null);
    setDropSeat(null);
    suppressSeatClick.current = Date.now() + 250;
  }
  function dropSeatAssignment(event, toSeatId) {
    event.preventDefault();
    const drag = seatDrag.current;
    if (!drag) return;
    const historical =
      seatVersion !== null && seatVersion !== data.versions.at(-1).version;
    if (!admin || historical || scope !== drag.scope) {
      endSeatDrag();
      return notify("현재 역할 또는 과거 버전에서는 이동할 수 없습니다.");
    }
    const changed = stageSeatEdit((draft) =>
      stageSeatMove(data, draft, { ...drag, toSeatId }),
    );
    if (changed && drag.fromSeatId !== toSeatId)
      notify(
        `${drag.personId} · ${drag.fromSeatId} → ${toSeatId} 임시 이동. 저장 버튼으로 확정하세요.`,
      );
    endSeatDrag();
  }

  function Seats() {
    const version =
        data.versions.find((v) => v.version === seatVersion) ||
        data.versions.at(-1),
      historical =
        seatVersion !== null && seatVersion !== data.versions.at(-1).version;
    const seats = historical ? version.seats : editableSeats;
    const zones = seatZone === "전체 구역" ? ["A", "B"] : [seatZone[0]];
    const occupied = Object.values(seats).filter(
      (v) => v && v.start <= seatDate && v.end >= seatDate,
    ).length;
    const reserved = Object.values(seats).filter(
      (v) => v && v.start > seatDate,
    ).length;
    return (
      <>
        <PageHeading
          title="좌석 관리"
          desc="하나의 배치도에서, 모든 프로젝트의 업무 공간을 함께 관리하세요."
          actions={
            <>
              {hasSeatEdits && (
                <Btn
                  icon={Undo2}
                  onClick={() => setModal({ type: "discardSeat" })}
                >
                  변경 취소
                </Btn>
              )}
              <Btn
                icon={Plus}
                disabled={historical}
                onClick={() =>
                  setModal({
                    type: "assign",
                    base:
                      activeSeatDraft?.baseVersion ||
                      data.versions.at(-1).version,
                  })
                }
              >
                좌석 배정
              </Btn>
              <Btn
                icon={Save}
                variant="primary"
                disabled={historical || !hasSeatEdits}
                onClick={saveSeatChanges}
              >
                변경 저장
                {hasSeatEdits ? ` · ${pendingSeatChanges.length}건` : ""}
              </Btn>
            </>
          }
        />
        <div className="seat-status-bar">
          <div className="seat-stats">
            <span>
              전체 <strong>12석</strong>
            </span>
            <i />
            <span>
              <b className="dot green" />
              사용 중 <strong>{occupied}</strong>
            </span>
            <span>
              <b className="dot purple" />
              예약 <strong>{reserved}</strong>
            </span>
            <span>
              <b className="dot hollow" />
              미배정 <strong>{12 - occupied - reserved}</strong>
            </span>
          </div>
          <span className="live">
            <i />
            {historical
              ? `과거 버전 v${version.version} · 읽기 전용`
              : `최신 v${data.versions.at(-1).version}`}
          </span>
        </div>
        {hasSeatEdits && (
          <div
            className={cx(
              "seat-draft-banner",
              activeSeatDraft.baseVersion !== data.versions.at(-1).version &&
                "conflict",
            )}
          >
            <span className="draft-banner-icon">
              <Layers size={20} />
            </span>
            <div>
              <strong>
                {activeSeatDraft.baseVersion !== data.versions.at(-1).version
                  ? "다른 관리자가 새 버전을 저장했습니다"
                  : `${pendingSeatChanges.length}건의 변경사항이 아직 저장되지 않았어요`}
              </strong>
              <p>
                {activeSeatDraft.baseVersion !== data.versions.at(-1).version
                  ? "임시 편집은 유지됩니다. 내용을 확인한 뒤 변경을 취소하고 최신 배치도에서 다시 적용해 주세요."
                  : `v${activeSeatDraft.baseVersion} 기준 임시 편집 · 저장하면 한 번에 새 버전으로 기록됩니다. 다른 관리자에게는 저장 전 배치도가 표시됩니다.`}
              </p>
            </div>
            <button
              className="text-link"
              onClick={() => setModal({ type: "seatChanges" })}
            >
              변경 내역
              <ChevronRight size={14} />
            </button>
          </div>
        )}
        <div className="seat-layout">
          <section className="card floor-card">
            <div className="floor-toolbar">
              <div className="floor-title">
                <Building2 size={18} />
                <strong>가상 업무공간 · 1층</strong>
                <Badge tone={historical ? "orange" : "green"}>
                  {historical ? "과거 기록" : "공용 배치도"}
                </Badge>
              </div>
              <div>
                <select
                  aria-label="좌석 구역"
                  value={seatZone}
                  onChange={(e) => setSeatZone(e.target.value)}
                >
                  <option>전체 구역</option>
                  <option>A 구역</option>
                  <option>B 구역</option>
                </select>
                <input
                  aria-label="좌석 조회일"
                  type="date"
                  value={seatDate}
                  onChange={(e) => setSeatDate(e.target.value)}
                />
              </div>
            </div>
            {historical && (
              <div className="historical-banner">
                <History size={16} />v{version.version}의 배치도입니다. 변경할
                수 없습니다.
                <button onClick={() => setSeatVersion(null)}>
                  최신 버전으로 돌아가기
                  <ArrowRight size={13} />
                </button>
              </div>
            )}
            {!historical && (
              <div className="drag-instruction">
                <span className="drag-instruction-icon">
                  <MousePointer2 size={18} />
                </span>
                <div>
                  <strong>인원을 드래그해 빈 좌석으로 옮겨보세요</strong>
                  <p>
                    원하는 만큼 편집한 뒤 변경 저장을 누르세요. 저장할 때만 새
                    버전이 생성됩니다. 클릭으로도 배정을 변경할 수 있어요.
                  </p>
                </div>
                <span className="drag-shortcut">
                  <GripVertical size={14} /> DRAG & DROP
                </span>
              </div>
            )}
            <div className={cx("floor-map", dragSeat && "drag-active")}>
              <div className="office-top">
                <span>MEETING ROOM</span>
                <span>LOUNGE & PANTRY</span>
                <span>
                  <ArrowRight size={13} /> 출입구
                </span>
              </div>
              <div className="office-label">
                <span />
                WORKSPACE · 1F
                <span />
              </div>
              <div className="zones">
                {zones.map((zone) => (
                  <div className="seat-zone" key={zone}>
                    <div className="zone-label">
                      <span>{zone} ZONE</span>
                      <p>
                        {zone === "A" ? "집중 업무 공간" : "협업 업무 공간"}
                      </p>
                    </div>
                    <div className="seat-grid">
                      {SEAT_IDS.filter((id) => id.startsWith(zone)).map(
                        (id) => {
                          const assignment = seats[id],
                            p = data.people.find(
                              (p) => p.id === assignment?.personId,
                            );
                          const active =
                            assignment &&
                            assignment.start <= seatDate &&
                            assignment.end >= seatDate;
                          const future =
                            assignment && assignment.start > seatDate;
                          return (
                            <button
                              key={id}
                              className={cx(
                                "desk",
                                dragSeat === id && "dragging",
                                dropSeat === id && !assignment && "drop-target",
                                dropSeat === id &&
                                  assignment &&
                                  dragSeat !== id &&
                                  "drop-blocked",
                                p && (p.project === "SFA" ? "sfa" : "gw"),
                                future && "reserved",
                                !active && !future && "available",
                              )}
                              aria-label={`${id} ${p?.id || "미배정"}`}
                              draggable={Boolean(
                                !historical &&
                                p &&
                                canEdit(p) &&
                                p.lifecycle !== "철수 완료",
                              )}
                              title={
                                !historical && p && canEdit(p)
                                  ? `${p.id}을 빈 좌석으로 드래그하거나 클릭해 변경`
                                  : historical
                                    ? "과거 버전 · 읽기 전용"
                                    : p
                                      ? "배정 정보 보기"
                                      : "빈 좌석 · 인원을 끌어 놓으세요"
                              }
                              onDragStart={(e) => beginSeatDrag(e, id)}
                              onDragEnd={endSeatDrag}
                              onDragOver={(e) => {
                                if (!seatDrag.current || historical) return;
                                e.preventDefault();
                                e.dataTransfer.dropEffect =
                                  !assignment || id === dragSeat
                                    ? "move"
                                    : "none";
                                if (dropSeat !== id) setDropSeat(id);
                              }}
                              onDragLeave={(e) => {
                                if (!e.currentTarget.contains(e.relatedTarget))
                                  setDropSeat(null);
                              }}
                              onDrop={(e) => dropSeatAssignment(e, id)}
                              onClick={() => {
                                if (Date.now() < suppressSeatClick.current)
                                  return;
                                setModal({
                                  type: "seatInfo",
                                  seat: id,
                                  version: historical ? version.version : null,
                                });
                              }}
                            >
                              <span className="desk-top">
                                <Monitor size={18} />
                                {!historical &&
                                  p &&
                                  canEdit(p) &&
                                  p.lifecycle !== "철수 완료" && (
                                    <GripVertical
                                      size={13}
                                      className="desk-grip"
                                    />
                                  )}
                                <span>{id}</span>
                              </span>
                              <strong>{p?.id || "미배정"}</strong>
                              <span className="desk-project">
                                {p
                                  ? `${p.project}${future ? " · 예약" : ""}`
                                  : "배정 가능"}
                              </span>
                              <span className="chair" />
                            </button>
                          );
                        },
                      )}
                    </div>
                    <div className="zone-divider">
                      <span>공용 통로</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="office-bottom">
                <span>PHONE BOOTH</span>
                <span>PRINT & STORAGE</span>
                <div>
                  <MapPin size={13} /> 가상 업무공간 1층
                </div>
              </div>
            </div>
            {!historical && (
              <div className="seat-save-bar">
                <div>
                  <span
                    className={cx("save-state-dot", hasSeatEdits && "dirty")}
                  />
                  <span>
                    {hasSeatEdits
                      ? `${pendingSeatChanges.length}건 미저장`
                      : `저장된 배치도 v${data.versions.at(-1).version}`}
                  </span>
                  <small>임시 편집은 현재 탭·역할에만 유지됩니다.</small>
                </div>
                <Btn
                  icon={Save}
                  variant="primary"
                  disabled={!hasSeatEdits}
                  onClick={saveSeatChanges}
                >
                  변경 저장
                </Btn>
              </div>
            )}
            <div className="map-legend">
              <span>
                <b className="legend-swatch sfa" />
                SFA
              </span>
              <span>
                <b className="legend-swatch gw" />
                그룹웨어
              </span>
              <span>
                <b className="legend-swatch" />
                미배정
              </span>
              <p>
                <Lock size={13} />
                {scope === "PMO"
                  ? "전체 프로젝트 배정 가능"
                  : `${scope} 인원만 배정·변경 가능`}
              </p>
            </div>
          </section>
          <aside className="card versions-card">
            <div className="card-heading">
              <div>
                <h2>
                  <History size={17} /> 버전 기록
                </h2>
                <p>좌석 변경 사항을 빠짐없이 기록해요.</p>
              </div>
            </div>
            <div className="version-list">
              {[...data.versions].reverse().map((v) => (
                <button
                  key={v.version}
                  onClick={() =>
                    setSeatVersion(
                      v.version === data.versions.at(-1).version
                        ? null
                        : v.version,
                    )
                  }
                  className={cx(
                    "version-item",
                    version.version === v.version && "selected",
                  )}
                >
                  <span className="version-point" />
                  <div>
                    <div className="version-item-top">
                      <strong>v{v.version}</strong>
                      {v.version === data.versions.at(-1).version && (
                        <span>최신</span>
                      )}
                    </div>
                    <p>{v.reason}</p>
                    <span>{v.by}</span>
                    <time>{v.date}</time>
                  </div>
                </button>
              ))}
            </div>
            <div className="versions-foot">
              <ShieldCheck size={16} />
              <p>
                모든 관리자가 같은 원장을 사용합니다.
                <br />
                저장 버튼을 누를 때만 새 버전이 생성됩니다.
              </p>
            </div>
          </aside>
        </div>
      </>
    );
  }
  function Messages() {
    const messages = data.messages.filter((m) =>
      admin ? scope === "PMO" || m.project === scope : m.personId === member.id,
    );
    return (
      <>
        <PageHeading
          title={admin ? "문의·알림" : "문의·변경 요청"}
          desc="작업의 맥락을 그대로, 필요한 담당자와 연결하세요."
          actions={
            <Btn
              icon={Plus}
              variant="primary"
              onClick={() =>
                setModal({
                  type: "inquiry",
                  id: admin ? scoped[0].id : member.id,
                })
              }
            >
              새 문의
            </Btn>
          }
        />
        <div className="integration-notice">
          <span className="dooray-logo">D</span>
          <div>
            <strong>두레이 1:1 메시지 연동 준비</strong>
            <p>
              현재는 앱 안에서 문의를 주고받습니다. 실제 메시지는 전송되지
              않습니다.
            </p>
          </div>
          <Badge tone="gray">미연동</Badge>
        </div>
        <section className="card">
          <div className="card-heading">
            <div>
              <h2>
                문의함 <span className="count-pill">{messages.length}</span>
              </h2>
              <p>문의 내용과 담당자의 답변을 확인하세요.</p>
            </div>
          </div>
          {messages.length ? (
            <div className="message-list">
              {messages.map((m) => (
                <button
                  key={m.id}
                  className="message-row"
                  onClick={() => setModal({ type: "message", messageId: m.id })}
                >
                  <span className="message-symbol">
                    <MessageSquare size={19} />
                  </span>
                  <div>
                    <div>
                      <Badge tone={m.reply ? "green" : "orange"}>
                        {m.reply ? "답변 완료" : "확인 중"}
                      </Badge>
                      <span>
                        {m.project} · {m.personId}
                      </span>
                    </div>
                    <h3>{m.title}</h3>
                    <p>{m.body}</p>
                    <time>
                      {m.date} · {taskLabel(m.task)}
                    </time>
                  </div>
                  <ChevronRight size={18} />
                </button>
              ))}
            </div>
          ) : (
            <Empty
              title="아직 문의가 없어요"
              desc="작업별 문의 버튼으로 담당자에게 질문을 남겨보세요."
            />
          )}
        </section>
        {!admin && (
          <button
            className="change-request-card"
            onClick={() => setModal({ type: "change", id: member.id })}
          >
            <CalendarDays size={23} />
            <div>
              <strong>투입 기간이나 정보가 변경되었나요?</strong>
              <p>담당자에게 변경 요청을 남겨 주세요.</p>
            </div>
            <ArrowUpRight size={20} />
          </button>
        )}
      </>
    );
  }
  function MemberHome() {
    const pct = progress(member, data.seats),
      next = personTasks(member).filter(
        (t) =>
          t.owner === "member" &&
          ["ready", "fix"].includes(taskStatus(member, t.id, data.seats)),
      );
    return (
      <>
        <div className="page-heading member-heading">
          <div>
            <div className="eyebrow">MY ONBOARDING</div>
            <h1>
              {member.id}님, 반가워요
              <span className="heading-dot" />
            </h1>
            <p>새로운 프로젝트의 시작, 투입ON이 함께 준비할게요.</p>
          </div>
          <span className="subtle-tag">{member.project} 프로젝트</span>
        </div>
        <section className="member-hero">
          <div>
            <span className="hero-project">
              <Layers size={15} />
              {member.project} 프로젝트
            </span>
            <h2>
              {isPrepared(member, data.seats)
                ? "투입 준비를 모두 마쳤어요."
                : "하나씩 준비하면, 시작이 가까워져요."}
            </h2>
            <p>
              {fmt(member.start)} 투입{" "}
              {member.lifecycle === "투입 중" ? "중" : "예정"} <span>·</span>{" "}
              {member.company}
            </p>
            <div className="hero-progress">
              <span>
                <i style={{ width: `${pct}%` }} />
              </span>
              <strong>
                {pct}
                <small>%</small>
              </strong>
            </div>
            <div className="hero-footer">
              <CheckCircle2 size={14} />
              {isPrepared(member, data.seats)
                ? "모든 필수 준비가 충족되었습니다."
                : `필수 준비 ${requiredTasks(member, data.customTasks).filter((t) => taskStatus(member, t.id) === "done").length}/${requiredTasks(member, data.customTasks).length} 완료`}
            </div>
          </div>
          <div className="hero-illustration member-cast">
            <BrandCharacters label="프로젝트의 첫 시작을 응원하는 캐릭터들" />
            <span>우리 함께, 준비 ON!</span>
          </div>
        </section>
        <div className="member-quick-grid">
          {[
            {
              id: "education",
              icon: GraduationCap,
              title: "교육",
              num: ["O08", "O09"].filter(
                (id) => taskStatus(member, id, data.seats) === "done",
              ).length,
              total: 2,
              color: "blue",
            },
            {
              id: "documents",
              icon: FileText,
              title: "서류",
              num: ["O10", "O11"].filter(
                (id) => taskStatus(member, id, data.seats) === "done",
              ).length,
              total: 2,
              color: "purple",
            },
            {
              id: "myseat",
              icon: Armchair,
              title: "내 좌석",
              num: currentSeat?.[0] || "미배정",
              color: "green",
            },
          ].map((c) => (
            <button
              className="quick-card card"
              key={c.id}
              onClick={() => go(c.id)}
            >
              <span className={cx("square-icon", c.color)}>
                <c.icon size={22} />
              </span>
              <div>
                <span>{c.title}</span>
                <strong>
                  {c.num}
                  {c.total && <small> / {c.total} 완료</small>}
                </strong>
              </div>
              <ChevronRight size={17} />
            </button>
          ))}
        </div>
        <section className="card">
          <div className="card-heading">
            <div>
              <h2>
                지금 내가 할 일{" "}
                <span className="count-pill">{next.length}</span>
              </h2>
              <p>실행 가능한 작업부터 차근차근 시작해 보세요.</p>
            </div>
            <button className="text-link" onClick={() => go("tasks")}>
              전체 작업
              <ArrowRight size={14} />
            </button>
          </div>
          {next.length ? (
            <div className="next-list">
              {next.map((t) => (
                <div className="next-row" key={t.id}>
                  <span
                    className={cx(
                      "next-icon",
                      t.kind === "education"
                        ? "blue"
                        : t.kind === "document"
                          ? "purple"
                          : "green",
                    )}
                  >
                    {t.kind === "education" ? (
                      <GraduationCap size={21} />
                    ) : t.kind === "document" ? (
                      <FileText size={21} />
                    ) : (
                      <ClipboardList size={21} />
                    )}
                  </span>
                  <div>
                    <strong>{t.title}</strong>
                    <p>{t.desc}</p>
                  </div>
                  <Badge status={taskStatus(member, t.id, data.seats)} />
                  {actionFor(member, t)}
                </div>
              ))}
            </div>
          ) : (
            <Empty
              title={
                isPrepared(member, data.seats)
                  ? "모든 준비를 마쳤어요!"
                  : "주관사의 준비를 기다리고 있어요"
              }
              desc="주관사 작업이 완료되면 후속 작업을 시작할 수 있어요."
            />
          )}
        </section>
        <div className="member-bottom">
          <section className="card">
            <div className="card-heading">
              <div>
                <h2>주관사에서 준비하고 있어요</h2>
                <p>담당자의 처리 현황도 함께 확인하세요.</p>
              </div>
              <Building2 size={18} />
            </div>
            <div className="host-work">
              {TASKS.filter(
                (t) =>
                  t.owner === "admin" && !["O01", "O12", "O16"].includes(t.id),
              )
                .slice(0, 5)
                .map((t) => (
                  <div key={t.id}>
                    <span>{t.title}</span>
                    <Badge status={taskStatus(member, t.id, data.seats)} />
                  </div>
                ))}
            </div>
          </section>
          <section className="member-help">
            <Sparkles size={28} />
            <h2>
              막히는 순간엔,
              <br />
              AI 도우미에게 물어보세요.
            </h2>
            <p>
              투입 절차부터 서류 작성까지
              <br />
              필요한 안내를 한곳에서.
            </p>
            <Btn onClick={() => setAi(true)}>
              도움 받기
              <ArrowRight size={14} />
            </Btn>
            <span>시연용 AI · 실제 모델 미연동</span>
          </section>
        </div>
      </>
    );
  }
  function Education() {
    return (
      <>
        <PageHeading
          title="나의 교육"
          desc="교육을 수강한 후 수료증을 등록하면 완료됩니다."
        />
        <div className="education-flow">
          <span>
            <span>1</span>교육 사이트에서 수강
          </span>
          <ArrowRight size={16} />
          <span>
            <span>2</span>수료증 발급
          </span>
          <ArrowRight size={16} />
          <span>
            <span>3</span>수료증 등록 · 완료
          </span>
        </div>
        <div className="education-grid">
          {["O08", "O09"].map((id, i) => {
            const done = taskStatus(member, id, data.seats) === "done",
              waiting = taskStatus(member, id, data.seats) === "waiting";
            return (
              <section className="card education-card" key={id}>
                <div className={cx("course-art", i && "purple")}>
                  <div className="course-art-lines" />
                  {i ? (
                    <ShieldCheck size={70} strokeWidth={1.2} />
                  ) : (
                    <Lock size={65} strokeWidth={1.2} />
                  )}
                  <span>MANDATORY LEARNING</span>
                </div>
                <div className="course-body">
                  <div className="course-tags">
                    <span>필수 교육</span>
                    <Badge tone={done ? "green" : waiting ? "gray" : "orange"}>
                      {done
                        ? "완료 · 수료증 등록"
                        : waiting
                          ? "선행 작업 대기"
                          : "미완료"}
                    </Badge>
                  </div>
                  <h2>{taskLabel(id)}</h2>
                  <p>
                    {i
                      ? "개인정보 수집·이용과 안전한 처리 원칙을 알아봅니다."
                      : "프로젝트 수행에 필요한 보안 수칙과 정보 보호 원칙을 확인합니다."}
                  </p>
                  <div className="course-meta">
                    <span>
                      <Clock size={14} />
                      {i ? "30" : "45"}분 · 시연 예시
                    </span>
                    <span>
                      <Building2 size={14} />
                      외부 교육
                    </span>
                  </div>
                  {done && (
                    <div className="uploaded-cert">
                      <FileCheck2 size={17} />
                      <span>{member.files[id]?.name || "수료증 등록됨"}</span>
                      <Check size={16} />
                    </div>
                  )}
                  {waiting && (
                    <div className="notice compact">
                      <Lock size={14} />
                      계정 최초 접속 확인 후 시작할 수 있어요.
                    </div>
                  )}
                  <div className="course-actions">
                    <Btn
                      icon={ExternalLink}
                      onClick={() => {
                        if (data.settings[id])
                          window.open(
                            data.settings[id],
                            "_blank",
                            "noopener,noreferrer",
                          );
                        else setModal({ type: "training", task: id });
                      }}
                    >
                      교육 사이트
                    </Btn>
                    <Btn
                      variant={done ? "" : "primary"}
                      icon={done ? Eye : Upload}
                      disabled={waiting}
                      onClick={() =>
                        setModal({ type: "document", id: member.id, task: id })
                      }
                    >
                      {done ? "수료증 보기" : "수료증 등록"}
                    </Btn>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
        <div className="info-note">
          <AlertCircle size={16} />
          교육 링크를 열거나 수강만 한 경우에는 미완료로 표시됩니다. 수료증 등록
          이후 증빙 확인은 별도로 진행됩니다.
        </div>
      </>
    );
  }
  function Documents() {
    return (
      <>
        <PageHeading
          title="나의 서류"
          desc="필요한 서류를 확인하고, AI 안내와 함께 준비해 보세요."
          actions={
            <Btn icon={Sparkles} onClick={() => setAi(true)}>
              AI 작성 도우미
            </Btn>
          }
        />
        <section className="card">
          <div className="card-heading">
            <div>
              <h2>
                필수 제출 서류 <span className="count-pill">2</span>
              </h2>
              <p>작성 전 읽기·서명 항목을 꼭 확인해 주세요.</p>
            </div>
          </div>
          <div className="document-cards">
            {["O10", "O11"].map((id) => {
              const status = taskStatus(member, id, data.seats);
              return (
                <div className="document-tile" key={id}>
                  <span className="document-type">PDF</span>
                  <div className="document-tile-top">
                    <span className="large-file">
                      <FileText size={30} />
                    </span>
                    <Badge status={status} />
                  </div>
                  <h2>{taskLabel(id)}</h2>
                  <p>
                    {id === "O10"
                      ? "보안 수칙 준수와 프로젝트 정보 보호에 대한 서약입니다."
                      : "개인정보의 수집 목적과 보유기간을 확인하고 동의 여부를 표시합니다."}
                  </p>
                  <div className="doc-meta">
                    <span>양식 v1.0</span>
                    <span>본인 서명 필수</span>
                  </div>
                  {member.notes[id] && (
                    <div
                      className={cx(
                        "notice compact",
                        status === "fix" && "error",
                      )}
                    >
                      <AlertCircle size={14} />
                      {member.notes[id]}
                    </div>
                  )}
                  <Btn
                    variant="full"
                    onClick={() =>
                      setModal({ type: "document", id: member.id, task: id })
                    }
                  >
                    {status === "done"
                      ? "제출 내역 보기"
                      : status === "fix"
                        ? "보완 및 재제출"
                        : "서류 열기"}
                    <ArrowUpRight size={15} />
                  </Btn>
                </div>
              );
            })}
          </div>
        </section>
        <div className="process-line">
          <span>
            <Upload size={17} />
            서류 제출
          </span>
          <ArrowRight size={16} />
          <span>
            <Sparkles size={17} />
            AI 사전 검토
          </span>
          <ArrowRight size={16} />
          <span>
            <UserRound size={17} />
            담당자 확인
          </span>
          <ArrowRight size={16} />
          <span>
            <CheckCircle2 size={17} />
            승인 완료
          </span>
        </div>
      </>
    );
  }
  function MySeat() {
    const assignment = currentSeat?.[1];
    return (
      <>
        <PageHeading
          title="내 좌석"
          desc="배정된 업무 공간과 사용 기간을 확인하세요."
        />
        {assignment ? (
          <div className="myseat-layout">
            <section className="card myseat-card">
              <span className="eyebrow">YOUR WORKSPACE</span>
              <span className="myseat-illustration">
                <Armchair size={85} strokeWidth={1} />
              </span>
              <h2>{currentSeat[0]}</h2>
              <p>가상 업무공간 · 1층 · {currentSeat[0][0]} 구역</p>
              <Badge tone="green">좌석 배정 완료</Badge>
              <div className="myseat-dates">
                <span>
                  사용 시작<strong>{fmt(assignment.start)}</strong>
                </span>
                <ArrowRight size={17} />
                <span>
                  사용 종료<strong>{fmt(assignment.end)}</strong>
                </span>
              </div>
              <Btn
                icon={MessageSquare}
                onClick={() =>
                  setModal({ type: "inquiry", id: member.id, task: "O14" })
                }
              >
                좌석 관련 문의
              </Btn>
            </section>
            <section className="card space-guide">
              <h2>업무 공간 이용 안내</h2>
              {[
                "좌석 이동은 주관사 담당자를 통해 요청해 주세요.",
                "개인 문서와 장비는 업무 종료 후 안전하게 보관해 주세요.",
                "공용 공간과 회의실은 사용 후 정리해 주세요.",
                "철수 시 반납 확인 후 배정이 종료됩니다.",
              ].map((t, i) => (
                <div key={t}>
                  <span>0{i + 1}</span>
                  <p>{t}</p>
                </div>
              ))}
              <div className="info-note">
                <Lock size={16} />
                좌석 배정·변경은 주관사에서 처리합니다.
              </div>
            </section>
          </div>
        ) : (
          <section className="card">
            <Empty
              title="아직 좌석을 준비하고 있어요"
              desc="주관사에서 좌석을 배정하면 위치와 사용 기간이 표시됩니다."
              icon={Armchair}
            >
              <Btn
                onClick={() =>
                  setModal({ type: "inquiry", id: member.id, task: "O14" })
                }
              >
                담당자에게 문의
              </Btn>
            </Empty>
          </section>
        )}
      </>
    );
  }
  function SettingsPage() {
    const [links, setLinks] = useState({ ...data.settings });
    return (
      <>
        <PageHeading
          title="운영 기준"
          desc="교육 경로와 알림 정책 등 프로젝트 공통 기준을 관리하세요."
        />
        <section className="card settings-card">
          <div className="card-heading">
            <div>
              <h2>
                <GraduationCap size={19} /> 교육 사이트 설정
              </h2>
              <p>수행사가 접속할 실제 교육 URL을 입력하세요.</p>
            </div>
            <Badge tone="blue">PMO 관리</Badge>
          </div>
          <div className="settings-body">
            {["O08", "O09"].map((id) => (
              <label className="field" key={id}>
                <span>{taskLabel(id)} URL</span>
                <input
                  type="url"
                  placeholder="https://교육사이트.example"
                  disabled={scope !== "PMO"}
                  value={links[id]}
                  onChange={(e) => setLinks({ ...links, [id]: e.target.value })}
                />
              </label>
            ))}
            <div className="notice">
              <AlertCircle size={17} />
              URL을 비워두면 시연용 교육 안내 화면을 보여줍니다. 실제 수료증을
              발급하지 않습니다.
            </div>
            <Btn
              variant="primary"
              disabled={scope !== "PMO"}
              onClick={() => {
                for (const id of ["O08", "O09"]) {
                  if (links[id] && !/^https:\/\/[^\s]+$/.test(links[id]))
                    return notify("올바른 HTTPS 교육 URL을 입력해 주세요.");
                }
                mutate((d) => {
                  d.settings = {
                    ...d.settings,
                    O08: links.O08,
                    O09: links.O09,
                  };
                });
                notify("교육 사이트 설정을 저장했습니다.");
              }}
            >
              설정 저장
            </Btn>
          </div>
        </section>
        <section className="card settings-card">
          <div className="card-heading">
            <div>
              <h2>
                <Bell size={19} /> 알림 정책
              </h2>
              <p>외부 메시지 대신 앱 안에서 처리 결과를 확인합니다.</p>
            </div>
          </div>
          <div className="setting-toggle">
            <div>
              <strong>작업 상태 변경 알림</strong>
              <p>실행 가능, 확인 요청, 보완 결과를 앱 알림에 표시합니다.</p>
            </div>
            <button
              role="switch"
              aria-checked={data.settings.reminder}
              aria-label="상태 변경 알림"
              className={cx("switch", data.settings.reminder && "on")}
              disabled={scope !== "PMO"}
              onClick={() =>
                mutate((d) => {
                  d.settings.reminder = !d.settings.reminder;
                })
              }
            >
              <span />
            </button>
          </div>
          <div className="setting-toggle">
            <div>
              <strong>두레이 1:1 메시지</strong>
              <p>향후 서버 측 API 어댑터를 통해 연결할 예정입니다.</p>
            </div>
            <Badge tone="gray">미연동</Badge>
          </div>
        </section>
        <section className="card settings-card">
          <div className="card-heading">
            <div>
              <h2>
                <ClipboardList size={19} /> 공통 작업 템플릿
              </h2>
              <p>투입 준비 16개 · 철수 3개 · 버전 v1.1</p>
            </div>
            <Btn icon={Eye} onClick={() => setModal({ type: "template" })}>
              템플릿 보기
            </Btn>
          </div>
        </section>
        <section className="card settings-card danger-zone">
          <div className="setting-toggle">
            <div>
              <strong>시연 데이터 초기화</strong>
              <p>SFA·그룹웨어 10명과 좌석 배치도 v1~v4로 되돌립니다.</p>
            </div>
            <Btn
              icon={RefreshCw}
              variant="danger"
              disabled={scope !== "PMO"}
              onClick={() => setModal({ type: "reset" })}
            >
              초기화
            </Btn>
          </div>
        </section>
      </>
    );
  }
  function renderModal() {
    if (!modal) return null;
    const p = data.people.find((p) => p.id === modal.id),
      task = [...TASKS, ...(data.customTasks || [])].find(
        (t) => t.id === modal.task,
      );
    const close = () => setModal(null);
    if (modal.type === "addTask" && admin)
      return (
        <Modal
          title="작업 추가"
          className="add-task-modal"
          subtitle="프로젝트 공통 작업이나 특정 인원에게 필요한 작업을 등록하세요."
          onClose={close}
        >
          <AddTaskForm
            scope={scope}
            people={scoped}
            onClose={close}
            onSubmit={(form) => {
              try {
                const task = createProjectTask(data, scope, form);
                mutate((d) => {
                  d.customTasks = [...(d.customTasks || []), task];
                  const recipients = d.people.filter((person) =>
                    tasksForPerson(person, [task]).some(
                      (t) => t.id === task.id,
                    ),
                  );
                  recipients.forEach((person) => {
                    person.history.unshift({
                      text: `${task.title} 작업 추가 · ${scope} 담당`,
                      date: new Date().toLocaleString("ko-KR"),
                    });
                    addNotice(
                      d,
                      person,
                      "새 준비 작업이 등록되었습니다",
                      task.title,
                    );
                  });
                  audit(
                    d,
                    `${task.title} 작업 추가`,
                    `${task.project} · ${recipients.length}명 · ${task.required ? "필수" : "선택"}`,
                  );
                });
                close();
                notify(
                  "작업을 추가했습니다. 대상 인원의 준비 작업에 반영되었습니다.",
                );
              } catch (error) {
                notify(error.message);
              }
            }}
          />
        </Modal>
      );
    if (modal.type === "person" && p)
      return (
        <Modal
          title={`${p.id} · 인원 상세`}
          subtitle={`${p.project} 프로젝트 · ${p.company}`}
          wide
          onClose={close}
        >
          <div className="person-summary">
            <Avatar person={p} />
            <div>
              <h3>
                {p.id}{" "}
                <Badge tone={p.lifecycle === "투입 중" ? "green" : "blue"}>
                  {p.lifecycle}
                </Badge>
              </h3>
              <p>
                {p.role} · {p.email}
              </p>
            </div>
            <div className="summary-progress">
              <span>투입 준비율</span>
              <Progress value={progress(p, data.seats)} />
            </div>
          </div>
          <div className="tabs modal-tabs">
            {[
              ["tasks", "준비 작업"],
              ["info", "기본 정보"],
              ["history", "변경 이력"],
            ].map(([id, title]) => (
              <button
                key={id}
                className={personTab === id ? "active" : ""}
                onClick={() => setPersonTab(id)}
              >
                {title}
              </button>
            ))}
          </div>
          <div className="modal-scroll">
            {personTab === "tasks" ? (
              <TaskRows person={p} />
            ) : personTab === "info" ? (
              <div className="person-info">
                <div className="detail-grid">
                  {[
                    ["프로젝트", p.project],
                    ["소속 수행사", p.company],
                    ["업무 역할", p.role],
                    ["업무용 이메일", p.email],
                    ["투입 시작일", fmt(p.start)],
                    ["투입 종료일", fmt(p.end)],
                    [
                      "관리 담당자",
                      `${p.project === "SFA" ? "SFA" : "GW"}-담당자`,
                    ],
                    [
                      "좌석",
                      Object.entries(data.seats).find(
                        ([, s]) => s?.personId === p.id,
                      )?.[0] || "미배정",
                    ],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <span>{k}</span>
                      <strong>{v}</strong>
                    </div>
                  ))}
                </div>
                <div className="person-info-actions">
                  <Btn
                    icon={CalendarDays}
                    onClick={() => setModal({ type: "editPerson", id: p.id })}
                  >
                    투입 정보 변경
                  </Btn>
                  <Btn
                    variant="danger"
                    onClick={() => setModal({ type: "offboard", id: p.id })}
                  >
                    철수 처리
                  </Btn>
                </div>
              </div>
            ) : p.history.length ? (
              <div className="history-list">
                {p.history.map((h, i) => (
                  <div key={i}>
                    <span className="history-dot" />
                    <div>
                      <strong>{h.text}</strong>
                      <p>{h.date}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Empty
                title="변경 이력이 없어요"
                desc="앞으로 처리한 작업과 변경 사항이 이곳에 기록됩니다."
              />
            )}
          </div>
        </Modal>
      );
    if (modal.type === "document" && p && task)
      return (
        <DocumentDialog
          person={p}
          task={task}
          admin={admin}
          status={evidenceStatus(p, task.id, data.seats)}
          onClose={close}
          onUpload={(f) => uploadFile(p, task.id, f)}
          onSimulate={() => simulateAI(p, task.id)}
          onReview={(result, note) => review(p, task.id, result, note)}
          onAsk={(q) => {
            setAi(true);
            askAI(q);
          }}
          onNotify={notify}
          previewUrl={urls.current[`${p.id}-${task.id}`]}
          onDownload={() =>
            download(
              new Blob(
                [
                  `${task.title} — 시연용 서식 · 법적 효력 없음\n\n1. 프로젝트 정보\n성명:\n소속:\n프로젝트:\n\n2. 확인할 내용\n업무 목적에 따라 제공된 정보를 안전하게 관리합니다.\n\n3. 본인 확인\n작성일:\n본인 서명:\n\n※ 이 파일은 시연용 안내 텍스트입니다. 운영 양식이 아닙니다.`,
                ],
                { type: "text/plain;charset=utf-8" },
              ),
              `시연용_${task.title}_안내.txt`,
            )
          }
        />
      );
    if (modal.type === "task" && p && task)
      return (
        <Modal
          title={task.title}
          subtitle={`${p.id} · ${task.owner === "admin" ? "주관사" : "수행사"} 수행 작업`}
          onClose={close}
        >
          <div className="modal-body">
            <div className="task-modal-icon">
              <ClipboardList size={28} />
            </div>
            <p className="lead">{task.desc}</p>
            {task.due && (
              <p className="task-deadline">처리 기한: {fmt(task.due)}</p>
            )}
            <div className="detail-grid">
              <div>
                <span>담당 인원</span>
                <strong>{p.id}</strong>
              </div>
              <div>
                <span>프로젝트</span>
                <strong>{p.project}</strong>
              </div>
            </div>
            <div className="notice">
              <CheckCircle2 size={18} />
              실제 처리가 완료되었는지 확인한 후 아래 버튼을 눌러 주세요.
              {task.custom
                ? " 안내된 완료 기준을 충족했는지 확인해 주세요."
                : " 시연에서 외부 계정이나 출입 권한을 실제 발급하지는 않습니다."}
            </div>
          </div>
          <footer>
            <Btn onClick={close}>취소</Btn>
            <Btn
              variant="primary"
              icon={Check}
              onClick={() => {
                updateTask(p, task.id);
                close();
              }}
            >
              완료 확인
            </Btn>
          </footer>
        </Modal>
      );
    if (modal.type === "assign")
      return (
        <SeatAssignForm
          data={{ ...data, seats: editableSeats }}
          scope={scope}
          initial={modal}
          onClose={close}
          onSubmit={(args) => {
            if (
              stageSeatEdit((draft) =>
                stageSeatAssignment(data, draft, { ...args, scope }),
              )
            ) {
              close();
              notify(
                "좌석 배정을 임시 반영했습니다. 변경 저장을 눌러 확정하세요.",
              );
            }
          }}
        />
      );
    if (modal.type === "seatInfo") {
      const v = data.versions.find((v) => v.version === modal.version);
      const seats = v?.seats || editableSeats,
        s = seats[modal.seat],
        person = data.people.find((p) => p.id === s?.personId),
        editable = !v && (!person || canEdit(person));
      return (
        <Modal
          title={`${modal.seat} · 좌석 정보`}
          subtitle={
            v
              ? `과거 버전 v${v.version} · 읽기 전용`
              : "가상 업무공간 · 1층 · 공용 배치도"
          }
          onClose={close}
        >
          <div className="modal-body">
            <div className="seat-info-big">
              <Armchair size={45} />
              <h3>{modal.seat}</h3>
              <Badge tone={person ? "green" : "gray"}>
                {person ? "배정됨" : "미배정"}
              </Badge>
            </div>
            {person ? (
              <div className="detail-grid">
                {[
                  ["배정 인원", person.id],
                  ["프로젝트", person.project],
                  ["사용 시작", fmt(s.start)],
                  ["사용 종료", fmt(s.end)],
                ].map(([k, val]) => (
                  <div key={k}>
                    <span>{k}</span>
                    <strong>{val}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <p className="center muted">
                새로운 인원을 배정할 수 있는 좌석입니다.
              </p>
            )}
            {!editable && (
              <div className="notice">
                <Lock size={16} />
                {v
                  ? "과거 버전은 변경할 수 없습니다."
                  : "다른 프로젝트 인원의 배정은 PMO만 변경할 수 있습니다."}
              </div>
            )}
          </div>
          <footer>
            <Btn onClick={close}>닫기</Btn>
            {editable && person && (
              <Btn
                variant="danger"
                onClick={() => {
                  if (
                    stageSeatEdit((draft) =>
                      stageSeatRelease(data, draft, {
                        seatId: modal.seat,
                        scope,
                      }),
                    )
                  ) {
                    close();
                    notify(
                      "배정 해제를 임시 반영했습니다. 변경 저장을 눌러 확정하세요.",
                    );
                  }
                }}
              >
                배정 해제
              </Btn>
            )}
            {editable && (
              <Btn
                variant="primary"
                onClick={() =>
                  setModal({
                    type: "assign",
                    seatId: modal.seat,
                    personId: person?.id,
                    base: data.versions.at(-1).version,
                  })
                }
              >
                {person ? "배정 변경" : "인원 배정"}
              </Btn>
            )}
          </footer>
        </Modal>
      );
    }
    if (modal.type === "register")
      return (
        <RegisterForm
          scope={scope}
          people={data.people}
          onClose={close}
          onTemplate={() => workbook("template")}
          onSave={(rows) => {
            mutate((d) => {
              rows.forEach((row) => {
                const person = {
                  ...row,
                  id: row.name,
                  lifecycle: "투입 예정",
                  tasks: { O01: "done" },
                  files: {},
                  certChecks: {},
                  notes: {},
                  history: [
                    {
                      text: "신규 인원 등록",
                      date: new Date().toLocaleString("ko-KR"),
                    },
                  ],
                };
                d.people.push(person);
              });
              audit(
                d,
                `${rows[0].project} 프로젝트 인원 등록`,
                `${rows.length}명 · 관리자가 명단 등록`,
                "person",
              );
            });
            close();
            notify(`${rows.length}명의 인원을 등록했습니다.`);
          }}
        />
      );
    if (modal.type === "inquiry" || modal.type === "change")
      return (
        <InquiryForm
          person={p || member}
          tasks={personTasks(p || member)}
          defaultTask={modal.task}
          change={modal.type === "change"}
          onClose={close}
          onSubmit={(form) => {
            const person = p || member;
            mutate((d) => {
              d.messages.unshift({
                id: String(Date.now()),
                personId: person.id,
                project: person.project,
                task: form.task,
                title: form.title,
                body: form.body,
                reply: "",
                date: new Date().toLocaleString("ko-KR"),
                status: "접수",
              });
              addNotice(
                d,
                person,
                `${person.id}님의 새 ${modal.type === "change" ? "변경 요청" : "문의"}`,
                form.title,
              );
            });
            close();
            notify(
              "앱 내 문의함에 접수했습니다. 외부 메시지는 전송하지 않았습니다.",
            );
          }}
        />
      );
    if (modal.type === "message") {
      const m = data.messages.find((x) => x.id === modal.messageId);
      if (!m) return null;
      return (
        <MessageDialog
          message={m}
          taskTitle={taskLabel(m.task)}
          admin={admin}
          onClose={close}
          onReply={(reply) => {
            mutate((d) => {
              const msg = d.messages.find((x) => x.id === m.id);
              msg.reply = reply;
              msg.status = "답변 완료";
              const person = d.people.find((x) => x.id === m.personId);
              addNotice(d, person, "문의에 답변이 등록되었습니다.", m.title);
            });
            notify("앱 내 답변을 저장했습니다.");
            close();
          }}
        />
      );
    }
    if (modal.type === "editPerson" && p)
      return (
        <EditPersonForm
          person={p}
          onClose={close}
          onSave={(form) => {
            if (!canEdit(p)) return;
            const assignment = Object.values(data.seats).find(
              (s) => s?.personId === p.id,
            );
            if (
              assignment &&
              (assignment.start < form.start || assignment.end > form.end)
            )
              return notify("현재 좌석 사용 기간을 먼저 조정해 주세요.");
            mutate((d) => {
              const person = d.people.find((x) => x.id === p.id);
              person.start = form.start;
              person.end = form.end;
              person.role = form.role;
              person.history.unshift({
                text: `투입 정보 변경 · ${form.reason}`,
                date: new Date().toLocaleString("ko-KR"),
              });
              audit(d, `${p.id} 투입 정보 변경`, form.reason);
            });
            close();
            notify("투입 정보를 변경하고 이력을 남겼습니다.");
          }}
        />
      );
    if (modal.type === "offboard" && p)
      return (
        <OffboardDialog
          person={p}
          onClose={close}
          onConfirm={() => {
            if (!canEdit(p)) return;
            if (
              stageSeatEdit((draft) =>
                stageSeatOffboarding(data, draft, { personId: p.id, scope }),
              )
            ) {
              close();
              setPage("seats");
              setSeatVersion(null);
              notify(
                "철수·좌석 반납을 임시 반영했습니다. 변경 저장을 누르면 함께 확정됩니다.",
              );
            }
          }}
        />
      );
    if (modal.type === "seatChanges")
      return (
        <Modal
          title="저장 전 변경 내역"
          subtitle={`기준 배치도 v${activeSeatDraft?.baseVersion} · 아직 다른 관리자에게 반영되지 않았습니다.`}
          onClose={close}
        >
          <div className="modal-body seat-change-list">
            {pendingSeatChanges.map((c) => (
              <div key={c.personId}>
                <span className="draft-change-kind">{c.kind}</span>
                <div>
                  <strong>{c.personId}</strong>
                  <p>
                    {c.fromSeatId || "미배정"} <ArrowRight size={13} />{" "}
                    {c.toSeatId || "배정 해제"}
                  </p>
                  {c.after && (
                    <small>
                      {fmt(c.after.start)} ~ {fmt(c.after.end)}
                    </small>
                  )}
                </div>
              </div>
            ))}
            {activeSeatDraft?.offboarding.map((id) => (
              <div key={`off-${id}`}>
                <span className="draft-change-kind">철수</span>
                <div>
                  <strong>{id}</strong>
                  <p>저장 시 철수 완료·좌석 반납 확정</p>
                </div>
              </div>
            ))}
          </div>
          <footer>
            <Btn onClick={close}>닫기</Btn>
            <Btn
              variant="primary"
              icon={Save}
              onClick={() => {
                saveSeatChanges();
                close();
              }}
            >
              변경 저장
            </Btn>
          </footer>
        </Modal>
      );
    if (modal.type === "discardSeat")
      return (
        <Modal
          title="임시 변경을 취소할까요?"
          subtitle="아직 저장하지 않은 좌석 변경과 철수 확인이 취소됩니다."
          onClose={close}
        >
          <div className="modal-body">
            <div className="notice">
              <Undo2 size={19} />
              저장된 최신 배치도와 기존 버전 이력은 유지됩니다. 임시 편집만
              취소합니다.
            </div>
          </div>
          <footer>
            <Btn onClick={close}>계속 편집</Btn>
            <Btn
              variant="primary"
              onClick={() => {
                setSeatDrafts((all) => ({ ...all, [scope]: null }));
                setSeatVersion(null);
                close();
                notify("임시 변경을 취소하고 최신 배치도로 돌아왔습니다.");
              }}
            >
              임시 변경 취소
            </Btn>
          </footer>
        </Modal>
      );
    if (modal.type === "reset")
      return (
        <Modal
          title="시연 데이터를 초기화할까요?"
          subtitle="이 브라우저에 저장한 변경 사항이 초기 상태로 돌아갑니다."
          onClose={close}
        >
          <div className="modal-body">
            <div className="notice error">
              <AlertTriangle size={20} />
              등록한 인원, 제출 파일명, 문의, 작업 상태, 좌석 변경이
              초기화됩니다. 초기 10명과 좌석 v1~v4는 다시 생성됩니다.
            </div>
          </div>
          <footer>
            <Btn onClick={close}>취소</Btn>
            <Btn
              variant="danger"
              onClick={() => {
                Object.values(urls.current).forEach(URL.revokeObjectURL);
                urls.current = {};
                setData(seed());
                setSeatDrafts({});
                setMemberId("SFA-3");
                setSeatVersion(null);
                setChat([]);
                close();
                notify("시연 데이터를 초기화했습니다.");
              }}
            >
              초기화하기
            </Btn>
          </footer>
        </Modal>
      );
    if (modal.type === "training")
      return (
        <Modal
          title={`${taskLabel(modal.task)} · 교육 안내`}
          subtitle="외부 교육 사이트가 아직 설정되지 않았습니다."
          onClose={close}
        >
          <div className="modal-body">
            <div className="training-visual">
              <GraduationCap size={52} />
              <span>LEARNING GUIDE</span>
            </div>
            <h3>수강부터 완료까지</h3>
            <ol className="guide-list">
              <li>담당자가 제공하는 교육 사이트에서 수강합니다.</li>
              <li>교육을 마치면 수료증을 발급받습니다.</li>
              <li>투입ON의 교육 화면에서 수료증을 등록합니다.</li>
            </ol>
            <div className="notice">
              <AlertCircle size={17} />이 화면은 시연용 안내입니다. 실제
              교육·수료증 발급 기능은 제공하지 않습니다. PMO가 운영 기준에서
              교육 URL을 설정할 수 있습니다.
            </div>
          </div>
          <footer>
            <Btn onClick={close}>확인</Btn>
          </footer>
        </Modal>
      );
    if (modal.type === "template")
      return (
        <Modal
          title="공통 작업 템플릿 v1.1"
          subtitle="선행 작업과 수행 주체로 연결된 투입 준비 흐름"
          wide
          onClose={close}
        >
          <div className="modal-body template-list">
            {TASKS.map((t) => (
              <div key={t.id}>
                <code>{t.id}</code>
                <strong>{t.title}</strong>
                <span>{t.owner === "admin" ? "주관사" : "수행사"}</span>
                <small>
                  {t.deps.length
                    ? `선행: ${t.deps.join(" · ")}`
                    : "선행조건 없음"}
                </small>
              </div>
            ))}
            {[
              ["X01", "철수 예정일·반납 대상 확인", "주관사"],
              ["X02", "좌석·출입 관련 반납 보고", "수행사"],
              ["X03", "계정 정리·좌석 반납 확인 및 종료", "주관사"],
            ].map(([id, title, owner]) => (
              <div key={id}>
                <code>{id}</code>
                <strong>{title}</strong>
                <span>{owner}</span>
                <small>철수 시 담당자 확인</small>
              </div>
            ))}
          </div>
        </Modal>
      );
    if (modal.type === "help")
      return (
        <Modal
          title="투입ON 프로토타입 안내"
          subtitle="프로젝트의 시작을 연결하는 인력 투입관리 워크스페이스"
          onClose={close}
        >
          <div className="modal-body help-body">
            <div className="help-brand">
              on<span>투입ON</span>
            </div>
            <h3>이렇게 시연해 보세요</h3>
            <ol className="guide-list">
              <li>상단에서 주관사 또는 수행사 화면으로 전환하세요.</li>
              <li>주관사 드롭다운에서 PMO, SFA, 그룹웨어를 선택하세요.</li>
              <li>
                SFA-4의 계정 발급을 완료한 뒤 수행사 화면에서 후속 작업이
                열리는지 확인하세요.
              </li>
              <li>
                서류를 제출하고 시연용 AI 결과를 본 뒤, 담당자로 전환해
                확인·보완하세요.
              </li>
              <li>
                좌석을 배정하고 다른 담당자 화면에서 최신 배치도와 버전 이력을
                확인하세요.
              </li>
            </ol>
            <div className="notice">
              <Monitor size={18} />
              브라우저 로컬 프로토타입입니다. 파일명과 업무 상태를 이 기기에
              저장합니다. 실제 파일 업로드 서버·인증·AI·두레이 API는 연결되어
              있지 않습니다. 민감한 실제 자료 대신 시연 자료를 사용해 주세요.
            </div>
          </div>
        </Modal>
      );
    return null;
  }
  return (
    <div className="app-shell">
      <aside
        inert={modal ? true : undefined}
        className={cx("sidebar", mobile && "open")}
      >
        <button
          className="brand"
          onClick={() => go("dashboard")}
          aria-label="투입ON 홈"
        >
          <span className="brand-mark">
            on
            <span />
          </span>
          <span>
            투입<span>ON</span>
            <small>PROJECT PEOPLE, CONNECTED.</small>
          </span>
        </button>
        <div className="workspace-label">
          WORKSPACE<span>PROTOTYPE</span>
        </div>
        <button
          className="workspace-switch"
          onClick={() => setModal({ type: "help" })}
        >
          <span className="workspace-icon">
            <Building2 size={18} />
          </span>
          <span>
            프로젝트 통합관리
            <small>
              {admin ? "주관사 워크스페이스" : "수행사 워크스페이스"}
            </small>
          </span>
          <ChevronDown size={15} />
        </button>
        <div className="nav-label">
          {admin ? "프로젝트 관리" : "나의 프로젝트"}
        </div>
        <nav>
          {nav.map(([id, label, Icon]) => (
            <button
              key={id}
              aria-label={label}
              className={cx("nav-item", page === id && "active")}
              onClick={() => go(id)}
            >
              <Icon size={19} />
              <span>{label}</span>
              {id === "reviews" && reviewCount > 0 && <b>{reviewCount}</b>}
              {page === id && <i />}
            </button>
          ))}
        </nav>
        {admin && (
          <>
            <div className="nav-divider" />
            <div className="nav-label">워크스페이스 설정</div>
            <button
              className={cx("nav-item", page === "settings" && "active")}
              onClick={() => go("settings")}
            >
              <Settings size={19} />
              <span>운영 기준</span>
              {page === "settings" && <i />}
            </button>
          </>
        )}
        <div className="sidebar-bottom">
          <div className="sidebar-ai">
            <BrandCharacters focus="guide" className="sidebar-character" />
            <span>
              <Sparkles size={19} />
              투입ON AI
            </span>
            <p>
              준비부터 다음 조치까지,
              <br />
              함께 생각하는 업무 도우미
            </p>
            <button onClick={() => setAi(true)}>
              AI에게 물어보기
              <ArrowUpRight size={16} />
            </button>
          </div>
          <button
            className="sidebar-help"
            onClick={() => setModal({ type: "help" })}
          >
            <HelpCircle size={17} />
            이용 가이드
            <ArrowUpRight size={14} />
          </button>
          <div className="sidebar-user">
            <span className="user-avatar">{admin ? "P" : member.id[0]}</span>
            <div>
              <strong>
                {admin
                  ? scope === "PMO"
                    ? "PMO 관리자"
                    : `${scope === "SFA" ? "SFA" : "GW"}-담당자`
                  : member.id}
              </strong>
              <span>
                {admin ? "주관사 · 관리자" : "수행사 · 프로젝트 참여자"}
              </span>
            </div>
            <button
              className="icon-btn"
              aria-label="프로토타입 안내"
              onClick={() => setModal({ type: "help" })}
            >
              <MoreHorizontal size={18} />
            </button>
          </div>
        </div>
      </aside>
      {mobile && (
        <div className="sidebar-scrim" onClick={() => setMobile(false)} />
      )}
      <div className="workspace-main" inert={modal ? true : undefined}>
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-btn mobile-menu"
              aria-label="메뉴 열기"
              onClick={() => setMobile(true)}
            >
              <Menu size={20} />
            </button>
            <span>워크스페이스</span>
            <ChevronRight size={14} />
            <strong>{screenTitle}</strong>
          </div>
          <div className="topbar-actions">
            <div className="mode-switch" aria-label="화면 전환">
              <button
                className={admin ? "selected" : ""}
                onClick={() => {
                  setMode("admin");
                  go("dashboard");
                  setChat([]);
                }}
              >
                <Building2 size={14} />
                주관사
              </button>
              <button
                className={!admin ? "selected" : ""}
                onClick={() => {
                  setMode("member");
                  go("dashboard");
                  setChat([]);
                }}
              >
                <UserRound size={14} />
                수행사
              </button>
            </div>
            <span className="header-divider" />
            <div className="scope-selector">
              <span className="scope-dot" />
              <select
                aria-label={admin ? "주관사 역할 선택" : "수행사 인원 선택"}
                value={admin ? scope : member.id}
                onChange={(e) => {
                  admin
                    ? setScope(e.target.value)
                    : setMemberId(e.target.value);
                  setSearch("");
                  setProjectFilter("전체 프로젝트");
                  setStatusFilter("전체 상태");
                  setModal(null);
                  setChat([]);
                }}
              >
                {admin
                  ? ["PMO", "SFA", "그룹웨어"].map((s) => (
                      <option key={s}>{s}</option>
                    ))
                  : data.people.map((p) => <option key={p.id}>{p.id}</option>)}
              </select>
            </div>
            <span className="header-divider" />
            <button
              className={cx(
                "icon-btn notification-trigger",
                notifications && "selected",
              )}
              aria-label="알림 열기"
              onClick={() => setNotifications(!notifications)}
            >
              <Bell size={19} />
              {data.notifications.some(
                (n) =>
                  !n.read &&
                  (admin
                    ? scope === "PMO" || n.project === scope
                    : n.personId === member.id),
              ) && <i />}
            </button>
            <span className="top-avatar">{admin ? "P" : member.id[0]}</span>
          </div>
        </header>
        <div className="prototype-strip">
          <span>
            <span className="prototype-dot" />
            INTERACTIVE PROTOTYPE
          </span>
          <p>
            가상 데이터로 자유롭게 둘러보세요. 역할 전환으로 연결된 업무를
            확인할 수 있어요.
          </p>
          <button onClick={() => setModal({ type: "help" })}>
            시연 가이드
            <ArrowUpRight size={12} />
          </button>
        </div>
        <main
          className="main-content"
          key={`${mode}-${scope}-${member.id}-${page}`}
        >
          {admin ? (
            page === "dashboard" ? (
              Dashboard()
            ) : page === "people" ? (
              People()
            ) : page === "tasks" ? (
              Tasks()
            ) : page === "reviews" ? (
              Reviews()
            ) : page === "seats" ? (
              Seats()
            ) : page === "messages" ? (
              Messages()
            ) : page === "settings" ? (
              <SettingsPage />
            ) : (
              Dashboard()
            )
          ) : page === "dashboard" ? (
            MemberHome()
          ) : page === "tasks" ? (
            Tasks()
          ) : page === "education" ? (
            Education()
          ) : page === "documents" ? (
            Documents()
          ) : page === "myseat" ? (
            MySeat()
          ) : (
            Messages()
          )}
          <div className="page-footer">
            <span>
              투입ON <i>·</i> 프로젝트의 시작을 연결하다
            </span>
            <span>
              DEMO WORKSPACE <b>·</b> 2026
            </span>
          </div>
        </main>
        <button className="floating-ai" onClick={() => setAi(!ai)}>
          <Sparkles size={19} />
          <span>AI 도우미</span>
          <span className="ai-floating-dot" />
        </button>
      </div>
      {notifications && (
        <>
          <div
            className="popover-scrim"
            onClick={() => setNotifications(false)}
          />
          <section className="notifications-popover">
            <header>
              <h3>알림</h3>
              <button
                className="text-link"
                onClick={() =>
                  mutate((d) =>
                    d.notifications.forEach((n) => {
                      if (
                        admin
                          ? scope === "PMO" || n.project === scope
                          : n.personId === member.id
                      )
                        n.read = true;
                    }),
                  )
                }
              >
                모두 읽음
              </button>
            </header>
            {data.notifications.filter((n) =>
              admin
                ? scope === "PMO" || n.project === scope
                : n.personId === member.id,
            ).length ? (
              data.notifications
                .filter((n) =>
                  admin
                    ? scope === "PMO" || n.project === scope
                    : n.personId === member.id,
                )
                .map((n) => (
                  <button
                    className={cx("notification-item", !n.read && "unread")}
                    key={n.id}
                    onClick={() => {
                      mutate((d) => {
                        d.notifications.find((x) => x.id === n.id).read = true;
                      });
                      setNotifications(false);
                      go(admin ? "reviews" : "tasks");
                    }}
                  >
                    <span>
                      <Bell size={17} />
                    </span>
                    <div>
                      <strong>{n.title}</strong>
                      <p>{n.body}</p>
                    </div>
                    {!n.read && <i />}
                  </button>
                ))
            ) : (
              <Empty
                title="새로운 알림이 없어요"
                desc="작업이 바뀌면 알려드릴게요."
              />
            )}
          </section>
        </>
      )}
      {renderModal()}
      {ai && (
        <aside className="ai-panel">
          <header>
            <span className="ai-panel-mark">
              <BrandCharacters focus="guide" />
            </span>
            <div>
              <h2>투입ON AI</h2>
              <p>현재 화면에 맞춘 업무 도우미</p>
            </div>
            <button
              className="icon-btn"
              aria-label="AI 패널 닫기"
              onClick={() => setAi(false)}
            >
              <PanelRightClose size={20} />
            </button>
          </header>
          <div className="ai-demo-label">
            <span />
            시연용 응답 · 실제 AI 모델 미연동
          </div>
          <div className="ai-context">
            <Layers size={14} />
            {admin
              ? `${scope} · ${screenTitle}`
              : `${member.id} · ${screenTitle}`}
          </div>
          <div className="chat-scroll">
            {!chat.length ? (
              <div className="ai-welcome">
                <div className="ai-welcome-characters">
                  <BrandCharacters />
                </div>
                <h3>함께라면, 준비가 쉬워져요.</h3>
                <p>
                  현황을 살펴보고 궁금한 내용을
                  <br />
                  하나씩 함께 풀어보세요.
                </p>
                {[
                  "현재 준비 미완료 현황을 요약해 줘",
                  "서류는 어떻게 작성하나요?",
                  "교육 수료증 등록 방법을 알려줘",
                  "현재 좌석 현황을 알려줘",
                ].map((q) => (
                  <button key={q} onClick={() => askAI(q)}>
                    {q}
                    <ArrowUpRight size={14} />
                  </button>
                ))}
              </div>
            ) : (
              chat.map((c, i) => (
                <div key={i} className={cx("chat-message", c.role)}>
                  {c.role === "assistant" && (
                    <span className="chat-ai-icon">
                      <Sparkles size={15} />
                    </span>
                  )}
                  <div>
                    {c.text.split("\n").map((t, j) => (
                      <p key={j}>{t}</p>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
          <form
            className="chat-form"
            onSubmit={(e) => {
              e.preventDefault();
              askAI(chatInput);
            }}
          >
            <div>
              <textarea
                aria-label="AI 질문"
                placeholder="궁금한 내용을 물어보세요"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    askAI(chatInput);
                  }
                }}
              />
              <button aria-label="질문 보내기" disabled={!chatInput.trim()}>
                <ArrowUpRight size={19} />
              </button>
            </div>
            <p>시연 답변입니다. 실제 규정과 담당자 안내를 확인해 주세요.</p>
          </form>
        </aside>
      )}
      <div
        className={cx("toast", toast && "visible")}
        role="status"
        aria-live="polite"
      >
        <CheckCircle2 size={18} />
        {toast}
      </div>
    </div>
  );
}

function PageHeading({ title, desc, actions }) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">PROJECT WORKSPACE</div>
        <h1>
          {title}
          <span className="heading-dot" />
        </h1>
        <p>{desc}</p>
      </div>
      {actions && <div className="heading-actions">{actions}</div>}
    </div>
  );
}
function SearchBox({ value, onChange, placeholder }) {
  return (
    <div className="search-box">
      <Search size={16} />
      <input
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button
          aria-label="검색어 지우기"
          className="icon-btn"
          onClick={() => onChange("")}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
function DocumentDialog({
  person,
  task,
  admin,
  status,
  onClose,
  onUpload,
  onSimulate,
  onReview,
  onAsk,
  onNotify,
  previewUrl,
  onDownload,
}) {
  const [section, setSection] = useState(1),
    [note, setNote] = useState(""),
    [read, setRead] = useState(false),
    [guideTab, setGuideTab] = useState("guide");
  const input = useRef();
  const edu = task.kind === "education",
    file = person.files[task.id],
    isConsent = task.id === "O11";
  return (
    <Modal
      title={task.title}
      subtitle={`${person.id} · ${person.project} 프로젝트 · ${edu ? "수료증" : "양식 v1.0"}`}
      onClose={onClose}
      wide
      className="document-modal"
    >
      <div className="document-modal-body">
        <div className="document-main">
          <div className="document-toolbar">
            <span>
              <FileText size={15} />
              {file?.name || `${task.title} · 시연용 서식`}
            </span>
            <button className="text-link" onClick={onDownload}>
              <Download size={14} />
              안내 다운로드
            </button>
          </div>
          {previewUrl ? (
            <div className="file-preview">
              {/\.(png|jpe?g)$/i.test(file?.name) ? (
                <img src={previewUrl} alt="직접 선택한 제출 파일 미리보기" />
              ) : (
                <iframe title="직접 선택한 PDF 미리보기" src={previewUrl} />
              )}
            </div>
          ) : (
            <div className="paper-container">
              <div className="document-paper">
                <div className="paper-watermark">DEMO · 시연용 서식</div>
                <div className="paper-header">
                  <span>
                    {edu ? "CERTIFICATE OF COMPLETION" : "PROJECT ONBOARDING"}
                  </span>
                  <ShieldCheck size={24} />
                </div>
                <h2>{edu ? "교 육 수 료 증" : task.title}</h2>
                <p className="paper-intro">
                  {edu
                    ? "이 문서는 화면 구성을 위한 가상 수료증입니다. 실제 교육 이수 사실을 증명하지 않습니다."
                    : "프로젝트의 원활한 수행과 안전한 정보 관리를 위해 아래 내용을 충분히 확인해 주세요."}
                </p>
                <section className={section === 1 ? "highlighted" : ""}>
                  <div className="paper-section-head">
                    <b>01</b>
                    <h3>{edu ? "수료 정보" : "기본 정보"}</h3>
                  </div>
                  <div className="paper-fields">
                    <span>
                      성명<strong>{person.id}</strong>
                    </span>
                    <span>
                      소속<strong>{person.company}</strong>
                    </span>
                    <span>
                      프로젝트<strong>{person.project}</strong>
                    </span>
                    <span>
                      {edu ? "교육명" : "작성일"}
                      <strong>{edu ? task.title : "2026년 11월 __일"}</strong>
                    </span>
                  </div>
                </section>
                <section className={section === 2 ? "highlighted" : ""}>
                  <div className="paper-section-head">
                    <b>02</b>
                    <h3>
                      {edu
                        ? "수료 확인"
                        : isConsent
                          ? "수집·이용에 관한 안내"
                          : "보안 준수 사항"}
                    </h3>
                  </div>
                  {edu ? (
                    <p>
                      외부 교육 사이트에서 발급받은 수료증 원본을 등록해 주세요.
                      이 미리보기는 실제 제출한 파일 원문이 아닌 시연용
                      화면입니다.
                    </p>
                  ) : (
                    <>
                      <p>
                        {isConsent
                          ? "프로젝트 인력 투입관리를 위해 성명, 소속, 업무용 연락처, 투입 기간 정보를 사용합니다. 실제 보유기간과 처리 기준은 운영 양식에서 확인해야 합니다."
                          : "프로젝트 수행 과정에서 알게 된 업무 자료와 관련 정보를 허가 없이 외부로 유출하지 않으며, 정해진 정보보호 기준을 준수합니다."}
                      </p>
                      <p>
                        제출 전 안내와 필수 기재 항목을 확인하고, 이해하기
                        어려운 내용은 담당자에게 문의합니다.
                      </p>
                      {isConsent && (
                        <div className="paper-agree">
                          □ 동의함　　□ 동의하지 않음
                        </div>
                      )}
                    </>
                  )}
                </section>
                <section className={section === 3 ? "highlighted" : ""}>
                  <div className="paper-section-head">
                    <b>03</b>
                    <h3>{edu ? "발급 정보" : "본인 확인 및 서명"}</h3>
                  </div>
                  <p>
                    {edu
                      ? "수료증의 성명, 교육명, 발급일을 확인해 주세요."
                      : "위 내용을 충분히 읽고 확인하였으며, 본인이 직접 작성합니다."}
                  </p>
                  <div className="paper-sign">
                    <span>2026년 11월 ____일</span>
                    <div>
                      성명: {person.id}　{" "}
                      <span className="signature-area">
                        {edu ? "발급기관 확인" : "(본인 서명)"}
                      </span>
                    </div>
                  </div>
                </section>
                <div className="paper-bottom">
                  시연용 · 법적 효력 없음 · 실제 운영 서식이 아닙니다.
                </div>
              </div>
            </div>
          )}
          <div className="file-storage-note">
            <Lock size={12} />
            제출 파일명·상태는 이 기기에 저장됩니다. 실제 파일 미리보기는 현재
            탭에서만 유지됩니다.
          </div>
        </div>
        <aside className="document-guide">
          <div className="guide-header">
            <Sparkles size={19} />
            <strong>{edu ? "수료증 등록 안내" : "AI 작성 도우미"}</strong>
            <span>DEMO</span>
          </div>
          <div className="guide-tabs">
            <button
              className={guideTab === "guide" ? "active" : ""}
              onClick={() => setGuideTab("guide")}
            >
              작성 안내
            </button>
            <button
              className={guideTab === "result" ? "active" : ""}
              onClick={() => setGuideTab("result")}
            >
              검토 결과
            </button>
          </div>
          <div className="guide-content">
            {guideTab === "guide" ? (
              <>
                <h3>
                  {edu ? "수료증을 준비해 주세요" : "제출 전 확인해 주세요"}
                </h3>
                <p className="muted">
                  {edu
                    ? "교육 사이트에서 발급받은 파일을 등록하면 교육이 완료됩니다."
                    : "필수 항목과 서명 위치를 확인하세요. 아래 항목은 관리자가 지정한 시연용 안내입니다."}
                </p>
                {[
                  {
                    n: 1,
                    title: edu ? "성명·교육명 확인" : "기본 정보 작성",
                    desc: edu
                      ? "본인의 교육 수료증인지 확인해 주세요."
                      : "성명, 회사, 프로젝트 정보를 확인하세요.",
                  },
                  {
                    n: 2,
                    title: edu ? "수료·발급일 확인" : "중요 내용 읽기",
                    desc: edu
                      ? "인정 대상 교육과 발급일을 확인해 주세요."
                      : isConsent
                        ? "수집 목적, 항목, 보유기간을 읽어 주세요."
                        : "프로젝트 정보 보호와 보안 수칙을 읽어 주세요.",
                  },
                  {
                    n: 3,
                    title: edu ? "원본 수료증 등록" : "본인 서명하기",
                    desc: edu
                      ? "PDF 또는 이미지로 등록해 주세요."
                      : "마지막 서명란에 본인이 서명해 주세요.",
                  },
                ].map((c) => (
                  <button
                    className={cx("guide-step", section === c.n && "selected")}
                    key={c.n}
                    onClick={() => setSection(c.n)}
                  >
                    <span>
                      {c.n === 3 ? (
                        <span>
                          {edu ? <Upload size={15} /> : <Check size={15} />}
                        </span>
                      ) : (
                        c.n
                      )}
                    </span>
                    <div>
                      <strong>{c.title}</strong>
                      <p>{c.desc}</p>
                    </div>
                    <ChevronRight size={14} />
                  </button>
                ))}
                {!edu && (
                  <label className="read-check">
                    <input
                      type="checkbox"
                      checked={read}
                      onChange={(e) => setRead(e.target.checked)}
                    />
                    안내 내용을 읽고 확인했어요
                  </label>
                )}
                <button
                  className="guide-ask"
                  onClick={() =>
                    onAsk(
                      edu
                        ? "교육 수료증 등록 방법을 알려줘"
                        : `${task.title}의 작성 및 서명 위치를 알려줘`,
                    )
                  }
                >
                  <MessageSquare size={16} />
                  궁금한 점을 AI에게 물어보기
                  <ArrowUpRight size={14} />
                </button>
              </>
            ) : (
              <>
                <div className="ai-review-heading">
                  <Sparkles size={23} />
                  <h3>시연용 사전 검토</h3>
                  <p>실제 문서 분석은 연결되지 않았습니다.</p>
                </div>
                <Badge status={status} />
                <div className="review-checks">
                  {["성명·소속 정보", "필수 항목 기재", "본인 서명 확인"].map(
                    (t, i) => (
                      <div key={t}>
                        {status === "ai" ? (
                          <Clock size={16} />
                        ) : i === 2 &&
                          person.notes[task.id]?.includes("서명") ? (
                          <AlertTriangle size={16} />
                        ) : (
                          <CheckCircle2 size={16} />
                        )}
                        <span>{t}</span>
                        <small>{status === "ai" ? "대기" : "원문 확인"}</small>
                      </div>
                    ),
                  )}
                </div>
                <div className="notice compact">
                  <AlertCircle size={16} />
                  {person.notes[task.id] ||
                    "AI의 의견은 참고용입니다. 최종 판단은 담당자가 원문을 확인한 후 수행합니다."}
                </div>
              </>
            )}
            {file && (
              <div className="submission-info">
                <FileText size={16} />
                <div>
                  <strong>{file.name}</strong>
                  <span>
                    {file.size} · {fmt(file.date)}
                    {file.demo ? " · 가상 제출본" : ""}
                  </span>
                </div>
              </div>
            )}
            {status === "fix" && (
              <div className="notice error">
                <AlertCircle size={17} />
                <div>
                  <strong>보완이 필요해요</strong>
                  <p>{person.notes[task.id]}</p>
                </div>
              </div>
            )}
            {status === "ai" && (
              <div className="simulation-card">
                <span>
                  <Sparkles size={16} />
                  AI 검토 화면 시연
                </span>
                <p>실제 분석 대신 준비된 검토 결과를 표시합니다.</p>
                <Btn
                  variant="full"
                  onClick={() => {
                    onSimulate();
                    setGuideTab("result");
                  }}
                >
                  시연 결과 보기
                  <ArrowRight size={14} />
                </Btn>
              </div>
            )}
            {status === "error" && (
              <div className="notice error">
                <AlertTriangle size={17} />
                AI 분석 실패 · 담당자가 원문을 수동 확인할 수 있습니다.
              </div>
            )}
            {admin && ["review", "error"].includes(status) && (
              <div className="review-form">
                <label className="field">
                  <span>
                    검토 의견 <small>보완 요청 시 필수</small>
                  </span>
                  <textarea
                    placeholder="확인 결과 또는 보완할 내용을 입력해 주세요."
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </label>
                <div>
                  <Btn variant="danger" onClick={() => onReview("fix", note)}>
                    보완 요청
                  </Btn>
                  <Btn
                    variant="primary"
                    icon={Check}
                    onClick={() => onReview("done", note)}
                  >
                    승인
                  </Btn>
                </div>
              </div>
            )}
            {!admin && (
              <>
                <input
                  type="file"
                  className="visually-hidden"
                  ref={input}
                  accept=".pdf,.png,.jpg,.jpeg"
                  onChange={(e) => {
                    onUpload(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
                <Btn
                  className="upload-document"
                  variant="primary full"
                  icon={Upload}
                  disabled={["waiting", "ai", "review", "error"].includes(
                    status,
                  )}
                  onClick={() => input.current.click()}
                >
                  {file
                    ? "파일 교체·재제출"
                    : edu
                      ? "수료증 등록"
                      : "작성한 서류 제출"}
                </Btn>
                <p className="upload-hint">PDF, PNG, JPG · 최대 10MB</p>
              </>
            )}
            {edu && person.tasks[task.id] === "done" && (
              <div className="notice">
                <CheckCircle2 size={17} />
                교육 완료 · 수료증 등록됨. 증빙 검증 상태는 교육 완료 여부와
                별도로 표시됩니다.
              </div>
            )}
          </div>
        </aside>
      </div>
    </Modal>
  );
}
function SeatAssignForm({ data, scope, initial, onClose, onSubmit }) {
  const eligible = data.people.filter(
    (p) => canManage(scope, p) && p.lifecycle !== "철수 완료",
  );
  const defaultPerson =
    eligible.find((p) => p.id === initial.personId) || eligible[0];
  const [form, setForm] = useState({
    personId: defaultPerson?.id || "",
    seatId: initial.seatId || SEAT_IDS.find((id) => !data.seats[id]) || "",
    start: defaultPerson?.start || TODAY,
    end: defaultPerson?.end || "",
    reason: "",
  });
  const [error, setError] = useState("");
  return (
    <Modal
      title="좌석 배정"
      subtitle={`배치도 v${initial.base} 기준 임시 배정 · 변경 저장 시 확정됩니다.`}
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!form.personId || !form.seatId)
            return setError("인원과 좌석을 선택해 주세요.");
          onSubmit(form);
        }}
      >
        <div className="modal-body form-grid">
          <label className="field">
            <span>배정 인원</span>
            <select
              value={form.personId}
              required
              onChange={(e) => {
                const p = eligible.find((p) => p.id === e.target.value);
                setForm({
                  ...form,
                  personId: p.id,
                  start: p.start,
                  end: p.end,
                });
              }}
            >
              {eligible.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.id} · {p.project}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>좌석</span>
            <select
              value={form.seatId}
              required
              onChange={(e) => setForm({ ...form, seatId: e.target.value })}
            >
              <option value="">좌석 선택</option>
              {SEAT_IDS.map((id) => (
                <option
                  value={id}
                  key={id}
                  disabled={
                    !!data.seats[id] &&
                    data.seats[id].personId !== form.personId
                  }
                >
                  {id} · {data.seats[id]?.personId || "미배정"}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>사용 시작일</span>
            <input
              required
              type="date"
              value={form.start}
              onChange={(e) => setForm({ ...form, start: e.target.value })}
            />
          </label>
          <label className="field">
            <span>사용 종료일</span>
            <input
              required
              type="date"
              min={form.start}
              value={form.end}
              onChange={(e) => setForm({ ...form, end: e.target.value })}
            />
          </label>
          <label className="field full-field">
            <span>배정·변경 사유</span>
            <textarea
              placeholder="예: 신규 투입으로 좌석 배정"
              required
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
            />
          </label>
          {error && <div className="notice error full-field">{error}</div>}
          <div className="notice full-field">
            <History size={17} />
            좌석 배정은 임시 반영되며, 변경 저장을 누르면 모든 관리자 화면에
            반영되고 새 버전이 생성됩니다.
          </div>
        </div>
        <footer>
          <Btn type="button" onClick={onClose}>
            취소
          </Btn>
          <Btn variant="primary" icon={Check} type="submit">
            배정 확정
          </Btn>
        </footer>
      </form>
    </Modal>
  );
}
function RegisterForm({ scope, people, onClose, onTemplate, onSave }) {
  const [tab, setTab] = useState("excel"),
    [rows, setRows] = useState([]),
    [errors, setErrors] = useState([]),
    [loading, setLoading] = useState(false),
    [filename, setFilename] = useState("");
  const fileInput = useRef();
  const [form, setForm] = useState({
    name: "",
    project: scope === "PMO" ? "SFA" : scope,
    company: "",
    role: "개발자",
    email: "",
    start: "2026-11-16",
    end: "2027-02-26",
  });
  function validate(rows) {
    const errors = [],
      seen = new Set(people.map((p) => p.id));
    rows.forEach((r, i) => {
      const n = i + 2;
      if (!r.name || !r.company || !r.email)
        errors.push(`${n}행 · 성명, 회사, 이메일을 입력해 주세요.`);
      if (!["SFA", "그룹웨어"].includes(r.project))
        errors.push(`${n}행 · 프로젝트는 SFA 또는 그룹웨어여야 합니다.`);
      if (scope !== "PMO" && scope !== r.project)
        errors.push(`${n}행 · ${scope} 인원만 등록할 수 있습니다.`);
      if (seen.has(r.name))
        errors.push(`${n}행 · 이미 등록된 인원 또는 파일 내 중복: ${r.name}`);
      seen.add(r.name);
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(r.start) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(r.end) ||
        r.start > r.end
      )
        errors.push(
          `${n}행 · 날짜를 YYYY-MM-DD 형식과 올바른 기간으로 입력해 주세요.`,
        );
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email))
        errors.push(`${n}행 · 이메일 형식을 확인해 주세요.`);
    });
    if (rows.length === 0) errors.push("등록할 인원이 없습니다.");
    return errors;
  }
  async function readExcel(file) {
    if (!file) return;
    setFilename(file.name);
    setErrors([]);
    setRows([]);
    if (!/\.xlsx$/i.test(file.name) || file.size > 5 * 1024 * 1024)
      return setErrors(["5MB 이하의 XLSX 파일을 선택해 주세요."]);
    setLoading(true);
    try {
      const { default: ExcelJS } = await import("exceljs");
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await file.arrayBuffer());
      const sheet = wb.worksheets[0];
      if (!sheet) throw Error("시트가 없습니다.");
      const headers = [
        "성명",
        "프로젝트",
        "회사",
        "역할",
        "이메일",
        "투입시작일",
        "투입종료일",
      ];
      if (
        headers.some(
          (h, i) =>
            sheet
              .getRow(1)
              .getCell(i + 1)
              .text.trim() !== h,
        )
      )
        throw Error(
          "템플릿 열 순서가 다릅니다. 제공된 템플릿을 사용해 주세요.",
        );
      if (sheet.rowCount > 501)
        throw Error("한 번에 최대 500명까지 등록할 수 있습니다.");
      const result = [];
      sheet.eachRow((row, n) => {
        if (n === 1) return;
        const keys = [
          "name",
          "project",
          "company",
          "role",
          "email",
          "start",
          "end",
        ];
        const record = {};
        keys.forEach((key, i) => {
          const cell = row.getCell(i + 1);
          record[key] =
            cell.value instanceof Date
              ? cell.value.toISOString().slice(0, 10)
              : cell.text.trim();
        });
        result.push(record);
      });
      setRows(result);
      setErrors(validate(result));
    } catch (e) {
      setErrors([`파일을 읽지 못했습니다. ${e.message}`]);
    } finally {
      setLoading(false);
    }
  }
  return (
    <Modal
      title="인원 등록"
      subtitle="명단을 검증한 후 등록하면 필요한 준비 작업이 자동으로 생성됩니다."
      onClose={onClose}
      wide
    >
      <div className="tabs modal-tabs">
        <button
          className={tab === "excel" ? "active" : ""}
          onClick={() => {
            setTab("excel");
            setErrors([]);
          }}
        >
          엑셀 일괄 등록
        </button>
        <button
          className={tab === "manual" ? "active" : ""}
          onClick={() => {
            setTab("manual");
            setErrors([]);
          }}
        >
          직접 등록
        </button>
      </div>
      <div className="modal-body">
        {tab === "excel" ? (
          <>
            <div className="import-step">
              <span className="step-number">01</span>
              <div>
                <h3>템플릿을 다운로드하고 명단을 작성하세요</h3>
                <p>
                  필수 항목과 날짜 형식을 확인해 주세요. 최대 500명까지 등록할
                  수 있습니다.
                </p>
              </div>
              <Btn icon={Download} onClick={onTemplate}>
                템플릿 다운로드
              </Btn>
            </div>
            <div className="import-step">
              <span className="step-number">02</span>
              <div>
                <h3>작성한 파일을 업로드하세요</h3>
                <p>
                  등록 전 오류·중복을 확인합니다. 업로드만으로는 반영되지
                  않습니다.
                </p>
              </div>
            </div>
            <input
              className="visually-hidden"
              type="file"
              accept=".xlsx"
              ref={fileInput}
              onChange={(e) => {
                readExcel(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <button
              className="dropzone"
              onClick={() => fileInput.current.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                readExcel(e.dataTransfer.files?.[0]);
              }}
            >
              <span>
                <Upload size={25} />
              </span>
              <strong>
                {loading
                  ? "파일을 검증하고 있어요…"
                  : filename || "파일을 끌어다 놓거나 클릭해 업로드하세요"}
              </strong>
              <p>XLSX 파일 · 최대 5MB</p>
            </button>
            {rows.length > 0 && (
              <div className="import-preview">
                <div>
                  <strong>등록 미리보기 · {rows.length}명</strong>
                  <Badge tone={errors.length ? "red" : "green"}>
                    {errors.length ? "수정 필요" : "검증 완료"}
                  </Badge>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>성명</th>
                        <th>프로젝트</th>
                        <th>소속</th>
                        <th>투입 시작</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, 10).map((r, i) => (
                        <tr key={i}>
                          <td>{r.name}</td>
                          <td>{r.project}</td>
                          <td>{r.company}</td>
                          <td>{r.start}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="form-grid">
            {[
              ["name", "성명 / 시연 표시명", "text"],
              ["company", "소속 수행사", "text"],
              ["email", "업무용 이메일", "email"],
              ["role", "업무 역할", "text"],
              ["start", "투입 시작일", "date"],
              ["end", "투입 종료일", "date"],
            ].map(([key, label, type]) => (
              <label className="field" key={key}>
                <span>{label}</span>
                <input
                  type={type}
                  value={form[key]}
                  placeholder={key === "name" ? "예: SFA-6" : ""}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                />
              </label>
            ))}
            <label className="field">
              <span>프로젝트</span>
              <select
                disabled={scope !== "PMO"}
                value={form.project}
                onChange={(e) => setForm({ ...form, project: e.target.value })}
              >
                <option>SFA</option>
                <option>그룹웨어</option>
              </select>
            </label>
          </div>
        )}
        {errors.length > 0 && (
          <div className="validation-errors">
            <strong>
              <AlertCircle size={17} />
              입력 내용을 확인해 주세요
            </strong>
            {errors.slice(0, 12).map((e, i) => (
              <p key={i}>{e}</p>
            ))}
          </div>
        )}
        <div className="notice">
          <ShieldCheck size={17} />
          가상 데이터로 시연해 주세요. 이 프로토타입에는 실제 인증과 서버 저장이
          연결되어 있지 않습니다.
        </div>
      </div>
      <footer>
        <Btn onClick={onClose}>취소</Btn>
        <Btn
          variant="primary"
          icon={Plus}
          disabled={
            loading || (tab === "excel" && (!rows.length || !!errors.length))
          }
          onClick={() => {
            const result = tab === "excel" ? rows : [form];
            const err = validate(result);
            setErrors(err);
            if (!err.length) onSave(result);
          }}
        >
          등록 확정{tab === "excel" && rows.length ? ` · ${rows.length}명` : ""}
        </Btn>
      </footer>
    </Modal>
  );
}
function InquiryForm({
  person,
  tasks = TASKS,
  defaultTask,
  change,
  onClose,
  onSubmit,
}) {
  const [form, setForm] = useState({
    task: defaultTask || "O01",
    title: "",
    body: "",
  });
  return (
    <Modal
      title={change ? "투입 정보 변경 요청" : "담당자에게 문의"}
      subtitle={`${person.id} · ${person.project === "SFA" ? "SFA" : "GW"}-담당자에게 연결됩니다.`}
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(form);
        }}
      >
        <div className="modal-body">
          <div className="notice">
            <Link2 size={17} />
            인원·프로젝트·작업 정보를 함께 전달합니다. 두레이 외부 전송은 하지
            않습니다.
          </div>
          <label className="field">
            <span>관련 작업</span>
            <select
              value={form.task}
              onChange={(e) => setForm({ ...form, task: e.target.value })}
            >
              {tasks.map((t) => (
                <option value={t.id} key={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>제목</span>
            <input
              required
              maxLength={100}
              placeholder={
                change
                  ? "예: 투입 종료일 변경 요청"
                  : "문의 내용을 짧게 적어주세요"
              }
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </label>
          <label className="field">
            <span>{change ? "변경 내용과 사유" : "문의 내용"}</span>
            <textarea
              required
              rows={5}
              placeholder="담당자가 확인할 내용을 입력해 주세요."
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
            />
          </label>
        </div>
        <footer>
          <Btn type="button" onClick={onClose}>
            취소
          </Btn>
          <Btn variant="primary" icon={Send} type="submit">
            {change ? "변경 요청 접수" : "문의 접수"}
          </Btn>
        </footer>
      </form>
    </Modal>
  );
}
function MessageDialog({ message, taskTitle, admin, onClose, onReply }) {
  const [reply, setReply] = useState(message.reply || "");
  return (
    <Modal
      title={message.title}
      subtitle={`${message.personId} · ${message.project} · ${taskTitle || taskLabel(message.task)}`}
      onClose={onClose}
    >
      <div className="modal-body">
        <div className="inquiry-body">
          <span>문의 내용</span>
          <p>{message.body}</p>
          <time>{message.date}</time>
        </div>
        {message.reply && (
          <div className="reply-body">
            <span>
              <MessageSquare size={15} />
              담당자 답변
            </span>
            <p>{message.reply}</p>
          </div>
        )}
        {admin && (
          <label className="field">
            <span>답변 작성</span>
            <textarea
              rows={5}
              placeholder="문의에 대한 답변을 입력하세요."
              value={reply}
              onChange={(e) => setReply(e.target.value)}
            />
          </label>
        )}
        {!admin && !message.reply && (
          <div className="notice">
            <Clock size={17} />
            담당자가 확인하고 있어요. 답변이 등록되면 알림을 보내드립니다.
          </div>
        )}
      </div>
      <footer>
        <Btn onClick={onClose}>닫기</Btn>
        {admin && (
          <Btn
            variant="primary"
            disabled={!reply.trim()}
            icon={Send}
            onClick={() => onReply(reply)}
          >
            답변 저장
          </Btn>
        )}
      </footer>
    </Modal>
  );
}
function EditPersonForm({ person, onClose, onSave }) {
  const [form, setForm] = useState({
    start: person.start,
    end: person.end,
    role: person.role,
    reason: "",
  });
  return (
    <Modal
      title="투입 정보 변경"
      subtitle={`${person.id} · 변경 내용과 사유가 이력에 남습니다.`}
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave(form);
        }}
      >
        <div className="modal-body form-grid">
          {[
            ["start", "투입 시작일", "date"],
            ["end", "투입 종료일", "date"],
            ["role", "업무 역할", "text"],
          ].map(([key, label, type]) => (
            <label className="field" key={key}>
              <span>{label}</span>
              <input
                type={type}
                required
                min={key === "end" ? form.start : undefined}
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              />
            </label>
          ))}
          <label className="field full-field">
            <span>변경 사유</span>
            <textarea
              required
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
            />
          </label>
          <div className="notice full-field">
            <AlertCircle size={17} />
            좌석 사용 기간과 충돌하는 날짜 변경은 먼저 좌석 배정을 조정해
            주세요.
          </div>
        </div>
        <footer>
          <Btn type="button" onClick={onClose}>
            취소
          </Btn>
          <Btn variant="primary" type="submit">
            변경 저장
          </Btn>
        </footer>
      </form>
    </Modal>
  );
}
function OffboardDialog({ person, onClose, onConfirm }) {
  const [checks, setChecks] = useState([false, false, false]);
  return (
    <Modal
      title={`${person.id} · 철수 확인`}
      subtitle="외부 처리 결과와 반납을 확인한 후 철수를 완료합니다."
      onClose={onClose}
    >
      <div className="modal-body">
        <div className="notice">
          <AlertTriangle size={18} />
          확인 결과는 임시 반영됩니다. 좌석 관리의 변경 저장을 누르면 철수와
          좌석 반납이 함께 확정되고 새 버전이 생성됩니다. 이 프로토타입이 외부
          계정을 실제 삭제하지는 않습니다.
        </div>
        {[
          "철수 예정일과 반납 대상을 확인했습니다.",
          "수행사의 좌석·출입 관련 반납을 확인했습니다.",
          "eGIS·두레이 계정 정리를 외부 담당자와 확인했습니다.",
        ].map((t, i) => (
          <label className="offboard-check" key={t}>
            <input
              type="checkbox"
              checked={checks[i]}
              onChange={(e) =>
                setChecks((c) =>
                  c.map((v, n) => (n === i ? e.target.checked : v)),
                )
              }
            />
            <span>
              <small>X0{i + 1}</small>
              {t}
            </span>
          </label>
        ))}
      </div>
      <footer>
        <Btn onClick={onClose}>취소</Btn>
        <Btn
          variant="danger"
          disabled={!checks.every(Boolean) || person.lifecycle === "철수 완료"}
          onClick={onConfirm}
        >
          철수 완료
        </Btn>
      </footer>
    </Modal>
  );
}
