import PerformancePage from "./PerformancePage.jsx";
import React, { useState, useEffect, useRef } from "react";
import {
  LayoutDashboard,
  BarChart3,
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
  TODAY,
  taskStatus as baseTaskStatus,
  progress as baseProgress,
  isPrepared as baseIsPrepared,
  tasksForPerson,
  requiredTasks,
  canManage,
  evidenceStatus,
} from "./data.js";

import { createProjectTask } from "./project-tasks.js";
import AddTaskForm from "./AddTaskForm.jsx";

import useServerState from "./useServerState.js";
import { api } from "./api.js";
import { ContinueRegistration } from "./AccessPortal.jsx";
import PlanImport from "./PlanImport.jsx";
import InvitationManager from "./InvitationManager.jsx";
import LegacyMigration from "./LegacyMigration.jsx";
import OnlineDocument from "./OnlineDocument.jsx";
import { loadDocumentBackground } from "./document-templates.js";
import TaskExportForm from "./TaskExportForm.jsx";
import { AdminStageDetails } from "./AdminStageBoard.jsx";
import { adminStageGroups } from "./admin-stage-groups.js";
import { RoadmapStageDetails } from "./MemberRoadmap.jsx";
import { memberRoadmap } from "./member-roadmap.js";
import DraftCompletionControls from "./DraftCompletionControls.jsx";
import { recordDraftCompletion } from "./drafting.js";
import EvidenceManager from "./EvidenceManager.jsx";
import ContactRoutes from "./ContactRoutes.jsx";
import StoredEvidence from "./StoredEvidence.jsx";
import { registerSelf, createSubmission, todayLocal } from "./onboarding.js";
import {
  storeEvidence,
  readEvidence,
  clearEvidence,
} from "./evidence-store.js";
import { exportTaskWorkbook } from "./task-exports.js";
import {
  resolveContact,
  saveContactRoute,
  buildDoorayMessage,
} from "./dooray.js";
import BrandCharacters from "./BrandCharacters.jsx";
import useMailInbox from "./useMailInbox.js";
import MailReviewPage from "./MailReviewPage.jsx";
import {
  WorkDashboard,
  RosterPage,
  TaskBoard,
  MemberDashboard,
  Preparation,
} from "./WorkPages.jsx";
import { personState, personIdentity, horizonDays } from "./work-summary.js";
import { reschedulePreparation } from "./personnel-workflow.js";

const NAV = [
  ["dashboard", "전체 현황", LayoutDashboard],
  ["performance", "퍼포먼스 관리", BarChart3],
  ["people", "인원 명단", Users],
  ["tasks", "준비 작업", ClipboardList],
  ["reviews", "교육·서류 검토", FileCheck2],
  ["messages", "문의·알림", MessageSquare],
  ["mail", "받은편지함", Mail],
];
const MEMBER_NAV = [
  ["dashboard", "나의 투입 준비", LayoutDashboard],
  ["performance", "나의 수행 현황", BarChart3],
  ["profile", "내 정보", UserRound],
  ["tasks", "나의 작업", ClipboardList],
  ["messages", "문의·변경 요청", MessageSquare],
];
const titleMap = Object.fromEntries(
  [
    ...NAV,
    ...MEMBER_NAV,
    ["education", "교육"],
    ["documents", "서류"],
    ["settings", "운영 기준"],
  ].map(([k, t]) => [k, t]),
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
      {person.project === "SFA" ? "S" : "G"}
      <span>{(person.displayId || "").split("-").at(-1)}</span>
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

export default function App({ initialState, actor, onLogout }) {
  const {
    data,
    mutate,
    refresh,
    accept,
    saving,
    error: saveError,
    clearError,
  } = useServerState(initialState);
  const mail = useMailInbox(actor.kind === "admin" && actor.scope === "PMO");
  const admin = actor.kind === "admin",
    mode = admin ? "admin" : "member";
  const [scope, setScope] = useState(admin ? actor.scope : "PMO");
  const [memberId, setMemberId] = useState(
    actor.personId || initialState.people[0]?.id || "",
  );
  const [page, setPage] = useState("dashboard");
  const [peopleQuery, setPeopleQuery] = useState({});
  const [settingsDraft, setSettingsDraft] = useState({
    ...initialState.settings,
  });
  const [mailReviewKey, setMailReviewKey] = useState(0);
  const [mailReviewIds, setMailReviewIds] = useState(null);
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
    [reviewTab, setReviewTab] = useState("전체");
  const [chat, setChat] = useState([]),
    [chatInput, setChatInput] = useState("");
  const toastTimer = useRef(),
    urls = useRef({});
  const member = data.people.find((p) => p.id === memberId) ||
    data.people[0] || {
      id: "",
      name: "",
      project: "SFA",
      tasks: {},
      files: {},
      certChecks: {},
      notes: {},
      history: [],
      company: "",
      start: "",
      end: "",
    };
  const scoped = data.people.filter((p) =>
    admin ? scope === "PMO" || p.project === scope : p.id === member.id,
  );
  const personTasks = (person) =>
    tasksForPerson(person, data.customTasks || []);
  const taskStatus = (person, id, seats = undefined) =>
    baseTaskStatus(person, id, seats, data.customTasks || []);
  const progress = (person, seats = undefined) =>
    baseProgress(person, seats, data.customTasks || []);
  const isPrepared = (person, seats = undefined) =>
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
    if (saveError) notify(saveError);
  }, [saveError]);
  useEffect(() => {
    document.body.style.overflow = modal || mobile ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [modal, mobile]);
  const go = (id, reviewIds = null) => {
    if (id === "settings") setSettingsDraft({ ...data.settings });
    if (id === "mail") setMailReviewIds(reviewIds);
    if (id === "mail") setMailReviewKey((v) => v + 1);
    setPeopleQuery({});
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
      (t) => statuses.includes(taskStatus(p, t.id, undefined)) && !t.derived,
    ).length;
  const pending = scoped
    .flatMap((p) =>
      ["O08", "O09", "O10", "O11"].map((id) => ({
        person: p,
        task: TASKS.find((t) => t.id === id),
        status: evidenceStatus(p, id, undefined),
      })),
    )
    .filter((r) => ["review", "ai", "fix", "error"].includes(r.status));
  const reviewCount = pending.filter((r) =>
    ["review", "error"].includes(r.status),
  ).length;
  useEffect(() => {
    if (mail.alertIds.length && !modal) setModal({ type: "mailAlert" });
  }, [mail.alertIds.join(","), modal]);
  const nav = admin
    ? NAV.filter((item) => item[0] !== "mail" || actor.scope === "PMO")
    : MEMBER_NAV;
  const screenTitle = admin
    ? {
        dashboard: "전체 현황",
        ...Object.fromEntries(NAV.map((x) => [x[0], x[1]])),
        settings: "운영 기준",
      }[page] || titleMap[page]
    : titleMap[page];
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
    const current = taskStatus(p, id, undefined);
    if (!["ready", "progress"].includes(current))
      return notify("선행 작업을 먼저 완료해 주세요.");
    mutate((d) => {
      const person = d.people.find((x) => x.id === p.id);
      person.tasks[id] = status;

      person.history.unshift({
        text: `${task.title} 완료`,
        date: new Date().toLocaleString("ko-KR"),
      });
      audit(
        d,
        `${p.name} · ${task.title} 완료`,
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
  async function uploadFile(p, id, file) {
    if (!file) return;
    if (admin || p.id !== member.id)
      return notify("수행사 본인 화면에서 제출해 주세요.");
    if (!["ready", "fix", "done"].includes(taskStatus(p, id, undefined)))
      return notify("선행 작업을 먼저 확인해 주세요.");
    if (!/\.(pdf|png|jpe?g)$/i.test(file.name) || file.size > 10 * 1024 * 1024)
      return notify("10MB 이하의 PDF, PNG, JPG 파일을 선택해 주세요.");
    let stored;
    try {
      stored = await storeEvidence(file, {
        name: file.name,
        personId: p.id,
        taskId: id,
      });
    } catch (error) {
      return notify(error.message);
    }
    const key = `${p.id}-${id}`;
    if (urls.current[key]) URL.revokeObjectURL(urls.current[key]);
    urls.current[key] = URL.createObjectURL(file);
    await mutate((d) => {
      const person = d.people.find((x) => x.id === p.id);
      person.files[id] = {
        name: file.name,
        size: `${Math.max(1, Math.round(file.size / 1024))} KB`,
        date: new Date().toISOString().slice(0, 10),
        demo: false,
        storageId: stored.id,
        digest: stored.digest,
        version: (person.fileHistory?.[id]?.length || 0) + 1,
      };
      person.fileHistory ||= {};
      person.fileHistory[id] = [
        ...(person.fileHistory[id] || []),
        structuredClone(person.files[id]),
      ];
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
        `${p.name} · ${taskLabel(id)} 제출`,
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
  async function submitOnlineDocument(p, task, values, proof) {
    if (admin || member.id !== p.id)
      throw new Error("수행사 본인만 제출할 수 있습니다.");
    const latestPerson = data.people.find((person) => person.id === p.id);
    if (!["ready", "fix", "done"].includes(taskStatus(latestPerson, task.id)))
      throw new Error(
        "이미 확인 중인 서류입니다. 담당자 결과를 확인해 주세요.",
      );
    const background = await loadDocumentBackground(task.id);
    const submission = createSubmission(
      latestPerson,
      task.id,
      values,
      proof,
      background,
    );
    const filename = `${p.id}_${task.title}_v${submission.version}.html`;
    const stored = await storeEvidence(
      new Blob([submission.html], { type: "text/html;charset=utf-8" }),
      { name: filename, personId: p.id, taskId: task.id },
    );
    const { html, ...record } = submission;
    const saved = {
      ...record,
      filename,
      storageId: stored.id,
      digest: stored.digest,
    };
    await mutate((d) => {
      const person = d.people.find((person) => person.id === p.id);
      person.submissions ||= {};
      person.submissions[task.id] = [
        ...(person.submissions[task.id] || []),
        saved,
      ];
      person.files[task.id] = {
        name: filename,
        size: `${Math.max(1, Math.round(stored.blob.size / 1024))} KB`,
        date: submission.submittedAt.slice(0, 10),
        version: submission.version,
        storageId: stored.id,
        digest: stored.digest,
        online: true,
        demo: true,
        submittedAt: submission.submittedAt,
        templateVersion: submission.templateVersion,
      };
      person.fileHistory ||= {};
      person.fileHistory[task.id] = [
        ...(person.fileHistory[task.id] || []),
        structuredClone(person.files[task.id]),
      ];
      person.tasks[task.id] = "review";
      person.notes[task.id] =
        "필수 항목 규칙 검사 완료 · 시연 본인확인 · 담당자 원문 확인 필요";
      if (task.id === "O11" && values.consent === "disagree")
        person.notes[task.id] =
          "개인정보 수집·이용에 동의하지 않음 · 담당자 별도 확인 필요";
      person.documentDrafts ||= {};
      delete person.documentDrafts[task.id];
      person.history.unshift({
        text: `${task.title} 온라인 제출 v${submission.version} · 규칙 검사 후 담당자 확인 요청`,
        date: new Date().toLocaleString("ko-KR"),
      });
      audit(
        d,
        `${p.name} · ${task.title} 확인 요청`,
        `온라인 제출 v${submission.version} · 실제 인증/AI 미연동`,
        "document",
      );
      addNotice(
        d,
        person,
        `${task.title} 확인 요청`,
        "온라인 서류의 필수 검사가 끝났습니다. 제출 원본을 검토해 주세요.",
      );
    });
    notify(
      "온라인 서류와 확인 기록을 보관하고 담당자 확인 요청으로 전달했습니다.",
    );
  }
  async function downloadStoredEvidence(id) {
    try {
      const record = await readEvidence(id);
      if (!record) return notify("보관된 원본이 없습니다. 다시 제출해 주세요.");
      const owner = data.people.find((p) => p.id === record.personId);
      if (!owner || (admin ? !canEdit(owner) : member.id !== owner.id))
        return notify("원본에 접근할 수 없습니다.");
      download(record.blob, record.name);
    } catch (error) {
      notify(error.message);
    }
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
        `${p.name} · 서류 확인 요청`,
        "시연용 AI 결과 · 실제 AI 분석 미연동",
        "document",
      );
      addNotice(
        d,
        p,
        `${p.name}님의 ${taskLabel(id)} 확인 요청`,
        "시연용 AI 사전 검토 결과가 준비되었습니다.",
      );
    });
    notify("시연용 AI 결과를 표시하고 담당자 확인 요청을 생성했습니다.");
  }
  function review(p, id, result, note) {
    if (!canEdit(p))
      return notify("해당 프로젝트 담당자만 검토할 수 있습니다.");
    if (!["review", "error"].includes(evidenceStatus(p, id, undefined)))
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
        `${p.name} · ${taskLabel(id)} ${result === "done" ? "승인" : "보완 요청"}`,
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
    else if (/교육|수료/.test(q))
      answer =
        "교육 사이트에서 수강한 뒤 발급받은 수료증을 이곳에 등록해 주세요. 링크를 여는 것만으로는 완료되지 않습니다. 파일이 등록되면 교육은 완료로 표시되며, 증빙 검증 상태는 별도로 관리합니다.\n근거: 교육 처리 기준 v1";
    else {
      const list = scoped.filter((p) => !isPrepared(p, undefined));
      answer = `현재 조회 범위 ${admin ? scope : member.name}에서 준비 미완료 인원은 ${list.length}명입니다. ${list
        .slice(0, 4)
        .map((p) => `${p.name}(${progress(p, undefined)}%)`)
        .join(
          ", ",
        )}${list.length > 4 ? " 등이 있습니다." : "입니다."}\n계정 발급 대기, 서류 확인 요청, 출입 준비 대기 순으로 확인해 보세요. 이 답변은 시연 데이터에서 생성한 고정 규칙 안내입니다.\n근거: 현재 명단·작업 현황 · 기준일 2026.11.09`;
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
      `파트너360_${kind === "template" ? "인원등록_템플릿" : "인원현황"}.xlsx`,
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
  function actionFor(p, t, compact = false) {
    const status = ["O08", "O09"].includes(t.id)
        ? evidenceStatus(p, t.id)
        : taskStatus(p, t.id, undefined),
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
            : status === "done" || status === "review" || status === "ai"
              ? "제출본 보기"
              : status === "waiting"
                ? "대기 사유 보기"
                : status === "fix"
                  ? "보완·재제출"
                  : t.kind === "education"
                    ? "수료증 제출"
                    : "서류 작성"}
          <ChevronRight size={14} />
        </button>
      );
    if (["on_hold", "cancelled"].includes(status))
      return (
        <span className="muted">
          {status === "on_hold" ? "보류 중" : "요청 취소"}
        </span>
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
          {t.id === "O16"
            ? "최종 준비 확인"
            : status === "progress"
              ? "완료 확인"
              : "작업 시작"}
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
          const status = taskStatus(person, t.id, undefined);
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
                        (d) => taskStatus(person, d, undefined) !== "done",
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
  function openWorkTask(p, id) {
    const task = personTasks(p).find((t) => t.id === id);
    if (!task) return openPerson(p);
    setModal({
      type:
        task.kind === "education" || task.kind === "document"
          ? "document"
          : "task",
      id: p.id,
      task: id,
    });
  }
  function invitePeople(ids) {
    if (actor.scope !== "PMO")
      return openPerson(
        data.people.find((p) => p.id === (Array.isArray(ids) ? ids[0] : ids)),
      );
    setModal({
      type: "invitations",
      ...(Array.isArray(ids) ? { ids } : { id: ids }),
    });
  }
  function showPeople(query = {}) {
    go("people");
    setPeopleQuery(query);
  }
  function Dashboard() {
    return (
      <WorkDashboard
        data={data}
        people={scoped}
        mailRequests={mail.inbox?.requests || []}
        scope={scope}
        canImport={actor.scope === "PMO"}
        onPeople={showPeople}
        onReviews={() => {
          go("reviews");
          setReviewTab("확인 요청");
        }}
        onMail={() =>
          go(
            "mail",
            (mail.inbox?.requests || [])
              .filter(
                (r) =>
                  r.status === "pending" &&
                  (scope === "PMO" || r.payload.project === scope),
              )
              .map((r) => r.id),
          )
        }
        onTasks={() => go("tasks")}
        onStage={(stage) => setModal({ type: "adminStage", stage })}
        onOpen={openPerson}
        onTask={openWorkTask}
        onInvite={invitePeople}
        onLifecycle={(p) => setModal({ type: "editPerson", id: p.id })}
        onImport={() => setModal({ type: "planImport" })}
      />
    );
  }
  function People() {
    return (
      <>
        <RosterPage
          data={data}
          people={scoped}
          scope={scope}
          canImport={actor.scope === "PMO"}
          canInvite={actor.scope === "PMO"}
          query={peopleQuery}
          onImport={() => setModal({ type: "planImport" })}
          onRegister={() =>
            setModal({ type: "register", requestId: crypto.randomUUID() })
          }
          onExport={() => workbook("export")}
          onTaskExport={() => setModal({ type: "taskExport" })}
          onInvite={invitePeople}
          onOpen={openPerson}
          onLifecycle={(p) => setModal({ type: "editPerson", id: p.id })}
        />
      </>
    );
  }
  async function saveDraftRecord(selection) {
    try {
      await mutate((d) => {
        const changed = recordDraftCompletion(d, scope, selection, actor.scope);
        if (changed)
          audit(
            d,
            `기안 작성 ${selection.done ? "완료 기록" : "기록 취소"}`,
            `${taskLabel(selection.taskId)} · ${changed}명`,
          );
      });
      notify(
        `기안 작성 ${selection.done ? "완료를 기록" : "완료 기록을 취소"}했습니다. 계정 신청 상태는 별도로 관리됩니다.`,
      );
    } catch (error) {
      notify(error.message);
    }
  }
  function Tasks() {
    return (
      <TaskBoard
        data={data}
        people={scoped}
        admin={admin}
        scope={scope}
        onDraftRecord={saveDraftRecord}
        onTask={openWorkTask}
        onInvite={invitePeople}
        actionFor={actionFor}
        onAdd={() => setModal({ type: "addTask" })}
        onExport={(selection) =>
          setModal({
            type: "taskExport",
            selection: selection?.taskId ? selection : undefined,
          })
        }
      />
    );
  }
  function Reviews() {
    const entries = scoped.flatMap((p) =>
      ["O10", "O11", "O08", "O09"]
        .filter((id) => p.files[id])
        .map((id) => ({ p, id, status: evidenceStatus(p, id, undefined) })),
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
        (!search ||
          `${r.p.name} ${r.p.company} ${taskLabel(r.id)}`.includes(search)),
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
        <EvidenceManager
          key={scope}
          data={data}
          scope={scope}
          onDownload={download}
          onNotify={notify}
          onOpen={(id, task) => setModal({ type: "document", id, task })}
        />
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
                      <strong>{p.name || p.id}</strong>
                      <p className="cell-sub">
                        {p.displayId} · {p.project}
                      </p>
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
                  id: admin ? scoped[0]?.id : member.id,
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
  function MemberProfile() {
    const educationDone = ["O08", "O09"].filter(
      (id) => taskStatus(member, id) === "done",
    ).length;
    const documentsDone = ["O10", "O11"].filter(
      (id) => taskStatus(member, id) === "done",
    ).length;
    return (
      <>
        <PageHeading
          title="내 정보"
          desc="프로젝트 참여 정보와 투입 준비 상태를 확인하세요."
        />
        <section className="card member-profile profile-overview">
          <div className="profile-identity">
            <span className="profile-portrait">
              {(member.name || member.id).slice(0, 1)}
            </span>
            <div className="profile-identity-copy">
              <span className="eyebrow">MY PROFILE</span>
              <h2>
                {member.name || member.id} <span>({member.project})</span>
              </h2>
              <p>{member.company}</p>
            </div>
            <Badge tone={member.lifecycle === "투입 중" ? "green" : "blue"}>
              {member.lifecycle}
            </Badge>
          </div>
          <div className="profile-detail-section">
            <h3>참여 정보</h3>
            <div className="profile-details">
              {[
                ["성명", member.name || member.id],
                ["소속 수행사", member.company],
                ["소속 프로젝트", member.project],
                ["연락처", member.phone || "미등록"],
              ].map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          </div>
          <div className="profile-period">
            <CalendarDays size={21} />
            <div>
              <span>투입 예정 기간</span>
              <strong>
                <time>{fmt(member.start)}</time>
                <span>—</span>
                <time>{fmt(member.end)}</time>
              </strong>
            </div>
            <span className="subtle-tag">예정 일정</span>
          </div>
        </section>
        <section className="profile-readiness card">
          <div className="card-heading">
            <div>
              <h2>나의 준비 현황</h2>
              <p>필요한 준비부터 바로 이어서 진행하세요.</p>
            </div>
            <Progress value={progress(member)} />
          </div>
          <div className="profile-assignment-grid">
            {[
              [
                "education",
                "필수 교육",
                `${educationDone} / 2 완료`,
                "외부 수강 후 수료증 등록",
                GraduationCap,
              ],
              [
                "documents",
                "제출 서류",
                `${documentsDone} / 2 승인`,
                "원본 서약서와 작성 가이드",
                FileText,
              ],
              [
                "tasks",
                "준비 작업",
                `${progress(member)}% 준비`,
                "계정·출입 준비 확인",
                ClipboardList,
              ],
            ].map(([id, title, count, desc, Icon]) => (
              <button
                className="profile-shortcut"
                key={id}
                onClick={() => go(id)}
              >
                <span className="profile-shortcut-icon">
                  <Icon size={20} />
                </span>
                <span>
                  <strong>{title}</strong>
                  <b>{count}</b>
                  <small>{desc}</small>
                </span>
                <ChevronRight size={18} />
              </button>
            ))}
          </div>
        </section>
        <div className="profile-support">
          <div>
            <ShieldCheck size={20} />
            <span>
              <strong>등록 정보가 변경되었나요?</strong>
              <small>담당자에게 정정 요청을 남겨 주세요.</small>
            </span>
          </div>
          <Btn
            icon={MessageSquare}
            onClick={() => setModal({ type: "change", id: member.id })}
          >
            정보 정정 요청
          </Btn>
        </div>
      </>
    );
  }
  function MemberHome() {
    return (
      <MemberDashboard
        person={member}
        data={data}
        onPage={go}
        onTask={openWorkTask}
        actionFor={actionFor}
        onContinue={() => setModal({ type: "continueRegistration" })}
        onStage={(stage) =>
          setModal({ type: "roadmapStage", id: member.id, stage })
        }
      />
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
            const done = taskStatus(member, id, undefined) === "done",
              waiting = taskStatus(member, id, undefined) === "waiting";
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
              const status = taskStatus(member, id, undefined);
              return (
                <div className="document-tile" key={id}>
                  <span className="document-type">
                    {member.files[id] && !member.files[id].online
                      ? "등록 파일"
                      : "온라인 서식"}
                  </span>
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
                    <span>
                      {member.files[id] && !member.files[id].online
                        ? "기존 제출 자료"
                        : "온라인 양식 v2.0 · 시연"}
                    </span>
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
  function SettingsPage() {
    const links = settingsDraft,
      setLinks = setSettingsDraft;
    return (
      <>
        <PageHeading
          title="운영 기준"
          desc="교육 경로와 알림 정책 등 프로젝트 공통 기준을 관리하세요."
        />
        {actor.scope === "PMO" && <LegacyMigration onComplete={accept} />}
        <ContactRoutes
          key={scope}
          scope={scope}
          settings={data.settings}
          onNotify={notify}
          onSave={(form) => {
            const settings = saveContactRoute(data.settings, scope, form);
            mutate((d) => {
              d.settings = settings;
            });
          }}
        />
        <section className="card settings-card">
          <div className="card-heading">
            <h2>투입 임박 기준</h2>
            <p>
              현재 기준일로부터 이 기간 안에 투입 예정인 준비 미완료 인원을
              표시합니다.
            </p>
          </div>
          <label className="field">
            <span>투입 임박 기준 일수</span>
            <input
              aria-label="투입 임박 기준 일수"
              type="number"
              min="1"
              max="60"
              disabled={scope !== "PMO"}
              value={links.imminentDays ?? horizonDays(data.settings)}
              onChange={(e) =>
                setLinks({ ...links, imminentDays: e.target.value })
              }
            />
          </label>
          <Btn
            variant="primary"
            disabled={scope !== "PMO"}
            onClick={() => {
              const value = Number(
                links.imminentDays ?? horizonDays(data.settings),
              );
              if (!Number.isInteger(value) || value < 1 || value > 60)
                return notify("투입 임박 기준은 1~60일로 입력해 주세요.");
              mutate((d) => {
                d.settings.imminentDays = value;
              });
              notify("투입 임박 기준을 저장했습니다.");
            }}
          >
            투입 임박 기준 저장
          </Btn>
        </section>
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
              <p>계정·출입·교육·서류 준비 · 버전 v2.0</p>
            </div>
            <Btn icon={Eye} onClick={() => setModal({ type: "template" })}>
              템플릿 보기
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
    if (modal.type === "adminStage" && admin) {
      const group = adminStageGroups(scoped, data, scope).find(
        (g) => g.id === modal.stage,
      );
      if (!group) return null;
      return (
        <Modal
          title={`${group.title} · 준비 인원`}
          subtitle="세부 업무를 펼쳐 대상 인원을 확인하고 작업을 처리하세요."
          onClose={close}
          wide
          className="admin-stage-popup"
        >
          <div className="modal-body">
            <AdminStageDetails
              group={group}
              canInvite={actor.scope === "PMO"}
              onOpen={openPerson}
              onTask={openWorkTask}
              onInvite={invitePeople}
              onLifecycle={(person) =>
                setModal({ type: "editPerson", id: person.id })
              }
              onRepair={(id) => {
                close();
                showPeople({ repairId: id });
              }}
            />
          </div>
          <footer>
            <button className="btn" onClick={close}>
              닫기
            </button>
          </footer>
        </Modal>
      );
    }
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
          title={`${p.name} · 인원 상세`}
          subtitle={`${p.project} 프로젝트 · ${p.company}`}
          wide
          onClose={close}
        >
          <div className="person-summary">
            <Avatar person={p} />
            <div>
              <h3>
                {p.name} ({p.project}){" "}
                <Badge tone={p.lifecycle === "투입 중" ? "green" : "blue"}>
                  {p.lifecycle}
                </Badge>
              </h3>
              <p>
                {[p.role, p.email].filter(Boolean).join(" · ") ||
                  "수행사 등록 인원"}
              </p>
            </div>
            <div className="summary-progress">
              <span>투입 준비율</span>
              <Progress value={progress(p, undefined)} />
            </div>
          </div>
          <div className="person-state-overview">
            <span>등록: {personState(p, data).registration}</span>
            <Preparation person={p} data={data} />
            <span>투입: {p.lifecycle}</span>
          </div>
          {p.registrationStatus === "pending_registration" && (
            <div className="info-note registration-banner">
              <div>
                <strong>본인 등록 대기</strong>
                <p>
                  초대 링크로 추가 정보 입력을 완료하면 계정·출입, 교육, 서류
                  준비를 진행할 수 있습니다.
                </p>
              </div>
              {actor.scope === "PMO" && (
                <Btn
                  icon={Link2}
                  variant="primary"
                  onClick={() => setModal({ type: "invitations", id: p.id })}
                >
                  초대 링크 생성·복사
                </Btn>
              )}
            </div>
          )}
          <div className="person-detail-metrics">
            <span>
              교육 완료{" "}
              <b>
                {
                  ["O08", "O09"].filter((id) => taskStatus(p, id) === "done")
                    .length
                }
                /2
              </b>
            </span>
            <span>
              서류 승인{" "}
              <b>
                {
                  ["O10", "O11"].filter((id) => taskStatus(p, id) === "done")
                    .length
                }
                /2
              </b>
            </span>
            <span>
              증빙 보완{" "}
              <b>
                {
                  ["O08", "O09", "O10", "O11"].filter(
                    (id) => evidenceStatus(p, id) === "fix",
                  ).length
                }
                건
              </b>
            </span>
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
                    ["성명", p.name || p.displayId],
                    [
                      "생년월일",
                      p.birthDate ||
                        (p.birthYear
                          ? `${p.birthYear}년 · 월/일 확인 필요`
                          : "확인 필요"),
                    ],
                    [
                      "등록 상태",
                      p.registrationStatus === "pending_registration"
                        ? "본인 등록 대기"
                        : "등록 완료",
                    ],
                    ["고유 기록 ID", p.id],
                    ["연락처", p.phone || "미입력"],
                    ["프로젝트", p.project],
                    ["소속 수행사", p.company],
                    ["업무 역할", p.role || "미등록"],
                    ["업무용 이메일", p.email || "미등록"],
                    ["투입 시작일", fmt(p.start)],
                    ["투입 종료일", fmt(p.end)],
                    [
                      "관리 담당자",
                      `${p.project === "SFA" ? "SFA" : "GW"}-담당자`,
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
    if (modal.type === "continueRegistration")
      return (
        <Modal title="내 등록 이어하기" onClose={close}>
          <div className="modal-body">
            <ContinueRegistration onClose={close} />
          </div>
        </Modal>
      );
    if (
      modal.type === "planImport" &&
      actor.kind === "admin" &&
      actor.scope === "PMO"
    )
      return (
        <PlanImport
          Modal={Modal}
          initialProject={scope === "PMO" ? "SFA" : scope}
          people={data.people}
          onClose={close}
          onComplete={(state) => {
            accept(state);
            close();
            go("people");
            notify(
              "확정한 인원을 저장했습니다. 개인 초대 링크를 발급해 주세요.",
            );
          }}
        />
      );
    if (
      modal.type === "invitations" &&
      actor.kind === "admin" &&
      actor.scope === "PMO"
    )
      return (
        <InvitationManager
          Modal={Modal}
          people={data.people}
          personId={modal.id}
          personIds={modal.ids}
          onClose={close}
        />
      );
    if (modal.type === "roadmapStage" && !admin && p?.id === member.id) {
      const roadmap = memberRoadmap(p, data);
      const stage = roadmap.stages.find((item) => item.id === modal.stage);
      if (!stage) return null;
      return (
        <Modal
          title={`${stage.title} · 단계 상세`}
          subtitle="현재 상태와 담당 주체를 확인하고 작업을 선택하세요."
          onClose={close}
          wide
          className="roadmap-stage-popup"
        >
          <div className="modal-body">
            <RoadmapStageDetails
              stage={stage}
              onTask={(id) => openWorkTask(p, id)}
              onProfile={() => {
                close();
                go("profile");
              }}
              onContinue={() => setModal({ type: "continueRegistration" })}
            />
          </div>
          <footer>
            <button className="btn" onClick={close}>
              닫기
            </button>
          </footer>
        </Modal>
      );
    }
    if (modal.type === "taskExport" && admin)
      return (
        <TaskExportForm
          Modal={Modal}
          data={data}
          scope={scope}
          initialSelection={modal.selection}
          onClose={close}
          onExport={async (selection) => {
            const result = await exportTaskWorkbook(data, scope, selection);
            download(result.blob, result.name);
            notify("선택한 인원의 작업별 예시 양식을 다운로드했습니다.");
          }}
        />
      );
    if (
      modal.type === "document" &&
      p &&
      task?.kind === "document" &&
      (modal.online || !p.files[task.id] || p.files[task.id].online)
    )
      return (
        <OnlineDocument
          Modal={Modal}
          key={`${p.id}-${task.id}`}
          person={p}
          task={task}
          admin={admin}
          status={taskStatus(p, task.id)}
          onClose={close}
          onDraft={(values) => {
            if (admin || p.id !== member.id) return;
            return mutate((d) => {
              const person = d.people.find((x) => x.id === p.id);
              person.documentDrafts ||= {};
              person.documentDrafts[task.id] = {
                values,
                savedAt: new Date().toISOString(),
              };
            });
          }}
          onSubmit={(values, proof) =>
            submitOnlineDocument(p, task, values, proof)
          }
          onReview={(result, note) => review(p, task.id, result, note)}
          onDownload={downloadStoredEvidence}
          onNotify={notify}
          onInquiry={() =>
            setModal({ type: "inquiry", id: p.id, task: task.id })
          }
        />
      );
    if (modal.type === "document" && p && task)
      return (
        <StoredEvidence file={p.files[task.id]}>
          {(storedUrl) => (
            <DocumentDialog
              person={p}
              task={task}
              admin={admin}
              onOnline={() => setModal({ ...modal, online: true })}
              status={evidenceStatus(p, task.id, undefined)}
              onClose={close}
              onUpload={(f) => uploadFile(p, task.id, f)}
              onSimulate={() => simulateAI(p, task.id)}
              onReview={(result, note) => review(p, task.id, result, note)}
              onAsk={(q) => {
                setAi(true);
                askAI(q);
              }}
              onNotify={notify}
              previewUrl={storedUrl || urls.current[`${p.id}-${task.id}`]}
              onDownload={() =>
                p.files[task.id]?.storageId
                  ? downloadStoredEvidence(p.files[task.id].storageId)
                  : download(
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
          )}
        </StoredEvidence>
      );
    if (modal.type === "task" && p && task)
      return (
        <Modal
          title={task.title}
          subtitle={`${p.name} · ${task.owner === "admin" ? "주관사" : "수행사"} 수행 작업`}
          onClose={close}
        >
          <div className="modal-body">
            <div className="task-modal-icon">
              <ClipboardList size={28} />
            </div>
            <p className="lead">{task.desc}</p>
            {admin && (
              <DraftCompletionControls
                person={p}
                taskId={task.id}
                onRecord={saveDraftRecord}
              />
            )}
            {task.due && (
              <p className="task-deadline">처리 기한: {fmt(task.due)}</p>
            )}
            <div className="detail-grid">
              <div>
                <span>담당 인원</span>
                <strong>{p.name}</strong>
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
    if (modal.type === "register")
      return (
        <RegisterForm
          scope={scope}
          people={data.people}
          onClose={close}
          onTemplate={() => workbook("template")}
          onSave={async (rows) => {
            try {
              const result = await api("/api/people", {
                method: "POST",
                body: { rows, requestId: modal.requestId },
              });
              accept(result.state);
              close();
              notify(
                "본인 등록 대기 인원을 저장했습니다. 초대 링크를 발급해 주세요.",
              );
            } catch (error) {
              notify(error.message);
            }
          }}
        />
      );
    if (modal.type === "inquiry" || modal.type === "change")
      return (
        <InquiryForm
          person={p || member}
          tasks={personTasks(p || member)}
          settings={data.settings}
          getStatus={(id) => taskStatus(p || member, id)}
          onNotify={notify}
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
                contact: form.contact,
                dooray: form.dooray,
                delivery: "not_connected",
              });
              addNotice(
                d,
                person,
                `${person.name}님의 새 ${modal.type === "change" ? "변경 요청" : "문의"}`,
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
            mutate((d) => {
              const person = d.people.find((x) => x.id === p.id);
              const previousStart = person.start;
              person.start = form.start;
              reschedulePreparation(d, person, previousStart, form.start);
              person.end = form.end;
              person.role = form.role;
              person.lifecycle = form.lifecycle;
              person.history.unshift({
                text: `투입 정보 변경 · ${form.reason}`,
                date: new Date().toLocaleString("ko-KR"),
              });
              audit(d, `${p.name} 투입 정보 변경`, form.reason);
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
          onConfirm={async () => {
            if (!canEdit(p)) return;
            await mutate((d) => {
              const person = d.people.find((x) => x.id === p.id);
              person.lifecycle = "철수 완료";
              person.history.unshift({
                text: "계정·출입 및 자료 반납 확인 후 철수 완료",
                date: new Date().toLocaleString("ko-KR"),
              });
            });
            close();
            notify("철수 확인을 저장했습니다.");
          }}
        />
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
              <li>파트너360의 교육 화면에서 수료증을 등록합니다.</li>
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
          title="공통 작업 템플릿 v2.0"
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
              ["X02", "출입·자료 반납 보고", "수행사"],
              ["X03", "계정·출입 정리 확인 및 종료", "주관사"],
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
    if (modal.type === "mailAlert")
      return (
        <Modal
          title={`수행사 투입 요청 ${mail.alertIds.length}건`}
          subtitle="분석 초안입니다. 승인 전에는 명단과 준비 작업을 변경하지 않습니다."
          onClose={() => {
            mail.dismiss();
            close();
          }}
        >
          <div className="modal-body">
            <p>
              새 메일 {mail.syncResult?.imported || 0}통 중 수행사 투입 관련
              메일 {mail.syncResult?.relatedMessages || 0}통을 찾았습니다.
            </p>
          </div>
          <footer>
            <Btn
              onClick={() => {
                mail.dismiss();
                close();
              }}
            >
              나중에 검토
            </Btn>
            <Btn
              variant="primary"
              onClick={() => {
                const ids = [...mail.alertIds];
                mail.dismiss();
                go("mail", ids);
              }}
            >
              검토하기
            </Btn>
          </footer>
        </Modal>
      );
    if (modal.type === "help")
      return (
        <Modal
          title="파트너360 프로토타입 안내"
          subtitle="프로젝트의 시작을 연결하는 인력 투입관리 워크스페이스"
          onClose={close}
        >
          <div className="modal-body help-body">
            <div className="help-brand">
              P<span>파트너360</span>
            </div>
            <h3>이렇게 시연해 보세요</h3>
            <ol className="guide-list">
              <li>
                PMO로 로그인해 인력계획서를 불러오고 시트·헤더·열과 미리보기
                행을 확인하세요.
              </li>
              <li>주관사 드롭다운에서 PMO, SFA, 그룹웨어를 선택하세요.</li>
              <li>
                확정한 인원의 개인 초대 링크를 별도 브라우저로 열어 추가 정보를
                입력하세요.
              </li>
              <li>
                수행사에서 서류를 제출하고 주관사 세션에서 원문 확인·승인 또는
                보완 요청을 진행하세요.
              </li>
              <li>
                개인 초대로 본인 등록을 마치고 다른 담당자 화면에서 최신 준비
                상태를 확인하세요.
              </li>
            </ol>
            <div className="notice">
              <Monitor size={18} />
              {globalThis.__READYBOARD_OFFLINE__
                ? "명단·상태·원본은 이 브라우저에 저장합니다. 상단에서 수행사와 담당자를 바꾸어 시연하세요. 시연 백업에 업로드 원본도 포함됩니다. 외부 메일·AI·본인확인·메신저는 시연입니다."
                : "명단·상태·원본은 서버에 저장합니다. 문서 가이드·본인확인은 시연 기능이며 Dooray 전송은 미연동입니다. 인력계획서 AI 매핑은 서버의 AI 키 설정 시 사용할 수 있습니다."}
            </div>
          </div>
        </Modal>
      );
    return null;
  }
  return (
    <div className="app-shell" data-brand="tongyang">
      <aside
        inert={modal ? true : undefined}
        className={cx("sidebar", mobile && "open")}
      >
        <button
          className="brand"
          onClick={() => go("dashboard")}
          aria-label="파트너360 홈"
        >
          <span className="brand-mark">
            P<span />
          </span>
          <span className="brand-wordmark">
            파트너360<small>PARTNER360 · PEOPLE</small>
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
            <React.Fragment key={id}>
              <button
                aria-label={label}
                className={cx(
                  "nav-item",
                  (page === id ||
                    (!admin &&
                      id === "tasks" &&
                      ["education", "documents"].includes(page))) &&
                    "active",
                )}
                onClick={() => go(id)}
              >
                <Icon size={19} />
                <span>{label}</span>
                {id === "reviews" && reviewCount > 0 && <b>{reviewCount}</b>}
                {page === id && <i />}
              </button>
              {!admin && id === "tasks" && (
                <div className="member-subnav" aria-label="나의 작업 하위 메뉴">
                  {[
                    ["education", "교육", GraduationCap],
                    ["documents", "서류", FileText],
                  ].map(([key, text, SubIcon]) => (
                    <button
                      key={key}
                      aria-label={text}
                      aria-current={page === key ? "page" : undefined}
                      className={cx("nav-item", page === key && "active")}
                      onClick={() => go(key)}
                    >
                      <SubIcon size={16} />
                      <span>{text}</span>
                    </button>
                  ))}
                </div>
              )}
            </React.Fragment>
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
          <button
            className="nav-item assistant-entry"
            onClick={() => setAi((v) => !v)}
          >
            <Sparkles size={18} />
            <span>AI 업무 도우미</span>
            <BrandCharacters focus="guide" />
          </button>
          <button
            className="sidebar-help"
            onClick={() => setModal({ type: "help" })}
          >
            <HelpCircle size={17} />
            이용 가이드
            <ArrowUpRight size={14} />
          </button>
          <button className="nav-item" onClick={onLogout}>
            <LogOut size={18} />
            <span>로그아웃</span>
          </button>
          <div className="sidebar-user">
            <span className="user-avatar">{admin ? "P" : member.id[0]}</span>
            <div>
              <strong>
                {admin
                  ? scope === "PMO"
                    ? "PMO 관리자"
                    : `${scope === "SFA" ? "SFA" : "GW"}-담당자`
                  : member.name}
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
          <div className="tongyang-ci">
            <img
              src="/brand/tongyang-ci.svg"
              alt="수호천사동양생명"
              width="166"
              height="25"
            />
          </div>
          <div className="topbar-actions">
            {!globalThis.__READYBOARD_OFFLINE__ && (
              <span className="demo-mode-badge">시연 모드</span>
            )}
            <button
              className="icon-btn"
              aria-label="시연 안내"
              onClick={() => setModal({ type: "help" })}
            >
              <HelpCircle size={17} />
            </button>
            <div className="mode-switch" aria-label="접속 역할">
              <span className="selected">
                <UserRound size={14} />
                {admin ? "주관사" : "수행사"}
              </span>
            </div>
            <span className="header-divider" />
            {!globalThis.__READYBOARD_OFFLINE__ && (
              <div className="scope-selector">
                <span className="scope-dot" />
                <select
                  aria-label={admin ? "주관사 역할 선택" : "수행사 인원 선택"}
                  value={admin ? scope : member.id}
                  disabled={!admin || actor.scope !== "PMO"}
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
                    ? (actor.scope === "PMO"
                        ? ["PMO", "SFA", "그룹웨어"]
                        : [actor.scope]
                      ).map((s) => <option key={s}>{s}</option>)
                    : [member].map((p) => (
                        <option key={p.id} value={p.id}>
                          {personIdentity(data, p.id).code
                            ? `${p.name} · ${p.displayId}`
                            : p.name}
                        </option>
                      ))}
                </select>
              </div>
            )}
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
        {(saving || saveError) && (
          <div className="work-save-status" role="status">
            {saving ? "저장 중…" : saveError}
            {saveError && (
              <button
                onClick={() => {
                  clearError();
                  refresh();
                }}
              >
                최신 상태 다시 확인
              </button>
            )}
          </div>
        )}
        <main
          className="main-content"
          key={
            admin ? `${mode}-${scope}-${page}` : `${mode}-${member.id}-${page}`
          }
        >
          {!admin && ["tasks", "education", "documents"].includes(page) && (
            <nav className="member-task-tabs" aria-label="나의 작업 하위 탭">
              {[
                ["tasks", "작업 목록"],
                ["education", "교육"],
                ["documents", "서류"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  className={page === key ? "active" : ""}
                  aria-current={page === key ? "page" : undefined}
                  onClick={() => go(key)}
                >
                  {label}
                </button>
              ))}
            </nav>
          )}
          {admin ? (
            page === "dashboard" ? (
              Dashboard()
            ) : page === "performance" ? (
              <PerformancePage actor={actor} scope={scope} />
            ) : page === "people" ? (
              People()
            ) : page === "tasks" ? (
              Tasks()
            ) : page === "reviews" ? (
              Reviews()
            ) : page === "messages" ? (
              Messages()
            ) : page === "mail" && actor.scope === "PMO" ? (
              <MailReviewPage
                key={mailReviewKey}
                initialReviewIds={mailReviewIds}
                mail={mail}
                data={data}
                onState={accept}
                onInvite={(id) => setModal({ type: "invitations", id })}
              />
            ) : page === "settings" ? (
              SettingsPage()
            ) : (
              Dashboard()
            )
          ) : page === "dashboard" ? (
            MemberHome()
          ) : page === "performance" ? (
            <PerformancePage actor={actor} scope={member.project} />
          ) : page === "profile" ? (
            MemberProfile()
          ) : page === "tasks" ? (
            Tasks()
          ) : page === "education" ? (
            Education()
          ) : page === "documents" ? (
            Documents()
          ) : (
            Messages()
          )}
          <div className="page-footer">
            <span>
              파트너360 <i>·</i> 프로젝트의 시작을 연결하다
            </span>
            <span>
              DEMO WORKSPACE <b>·</b> 2026
            </span>
          </div>
        </main>
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
              <h2>파트너360 AI</h2>
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
              : `${member.name} · ${screenTitle}`}
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
                  "현재 계정·출입 준비 현황을 알려줘",
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
  onOnline,
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
  const [uploading, setUploading] = useState(false);
  const edu = task.kind === "education",
    file = person.files[task.id],
    isConsent = task.id === "O11";
  return (
    <Modal
      title={task.title}
      subtitle={`${person.name} · ${person.project} 프로젝트 · ${edu ? "수료증" : "양식 v1.0"}`}
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
            {!admin && !edu && ["ready", "fix", "done"].includes(status) && (
              <button className="text-link" onClick={onOnline}>
                온라인으로 작성
              </button>
            )}
            <button className="text-link" onClick={onDownload}>
              <Download size={14} />
              {file?.storageId ? "원본 다운로드" : "예시 안내 다운로드"}
            </button>
          </div>
          {previewUrl ? (
            <div className="file-preview">
              {/\.(png|jpe?g)$/i.test(file?.name) ? (
                <img src={previewUrl} alt="직접 선택한 제출 파일 미리보기" />
              ) : (
                <iframe
                  sandbox=""
                  title="직접 선택한 PDF 미리보기"
                  src={previewUrl}
                />
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
                      성명<strong>{person.name}</strong>
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
                      성명: {person.name}　{" "}
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
            새로 제출한 원본과 상태는 보관함에 저장됩니다. 초기 가상 제출본에는
            원본이 없습니다.
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
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    setUploading(true);
                    try {
                      await onUpload(file);
                    } catch (error) {
                      onNotify(error.message);
                    } finally {
                      setUploading(false);
                    }
                  }}
                />
                <Btn
                  className="upload-document"
                  variant="primary full"
                  icon={Upload}
                  disabled={
                    uploading ||
                    ["waiting", "ai", "review", "error"].includes(status)
                  }
                  onClick={() => input.current.click()}
                >
                  {uploading
                    ? "저장 중…"
                    : file
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
function RegisterForm({ scope, onClose, onSave }) {
  const [form, setForm] = useState({
      name: "",
      company: "",
      project: scope === "PMO" ? "SFA" : scope,
      start: "",
      end: "",
      phone: "",
      email: "",
      role: "",
    }),
    [busy, setBusy] = useState(false);
  return (
    <Modal
      title="인원 등록"
      subtitle="한 명을 수동으로 등록하고 개인 링크로 추가 정보를 받습니다."
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await onSave([form]);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="modal-body">
          <div className="info-note">
            계약 인력계획서는 PMO의 ‘인력계획서 불러오기’를 이용하세요. 이
            경로에서도 본인 등록 대기 기록만 생성하며 같은 이름의 인원을 자동
            병합하지 않습니다.
          </div>
          {[
            ["name", "성명", 80],
            ["company", "소속 수행사", 100],
          ].map(([key, label, max]) => (
            <label className="field" key={key}>
              <span>{label} *</span>
              <input
                required
                maxLength={max}
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              />
            </label>
          ))}
          <label className="field">
            <span>프로젝트</span>
            <select
              value={form.project}
              disabled={scope !== "PMO"}
              onChange={(e) => setForm({ ...form, project: e.target.value })}
            >
              <option>SFA</option>
              <option>그룹웨어</option>
            </select>
          </label>
        </div>
        <footer>
          <Btn type="button" onClick={onClose}>
            취소
          </Btn>
          <button className="btn primary" disabled={busy}>
            {busy ? "저장 중…" : "본인 등록 대기로 저장"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

function InquiryForm({
  person,
  tasks = TASKS,
  defaultTask,
  change,
  settings = {},
  getStatus = () => "ready",
  onNotify = () => {},
  onClose,
  onSubmit,
}) {
  const [form, setForm] = useState({
    task: defaultTask || "O01",
    title: "",
    body: "",
  });
  const contact = resolveContact(settings, person, form.task);
  const relatedTask = tasks.find((t) => t.id === form.task) || tasks[0];
  const payload = buildDoorayMessage(
    person,
    relatedTask,
    form.title,
    form.body,
    STATUS[getStatus(form.task)]?.[0] || getStatus(form.task),
    contact,
  );
  return (
    <Modal
      title={change ? "투입 정보 변경 요청" : "담당자에게 문의"}
      subtitle={`${person.name || person.id} · ${contact.name}에게 연결됩니다.`}
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({ ...form, contact, dooray: payload });
        }}
      >
        <div className="modal-body">
          <div className="notice">
            <Link2 size={17} />
            담당자: {contact.name} · Dooray 수신자{" "}
            {contact.memberId || "미설정"}. 앱 내 접수와 문의문 복사를
            지원합니다. Dooray API는 미연동이며 외부 메시지는 전송되지 않습니다.
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
          <div className="dooray-preview">
            <strong>Dooray 문의 초안 · 자동 연결 정보</strong>
            <pre>{payload.text}</pre>
            <button
              type="button"
              className="btn"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(payload.text);
                  onNotify(
                    "담당자와 작업 정보가 포함된 문의문을 복사했습니다.",
                  );
                } catch {
                  onNotify(
                    "자동 복사를 사용할 수 없습니다. 표시된 문의 초안을 직접 복사해 주세요.",
                  );
                }
              }}
            >
              Dooray 문의문 복사
            </button>
            <span>외부 전송 미연동</span>
          </div>
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
    lifecycle: person.lifecycle || "투입 예정",
    start: person.start,
    end: person.end,
    role: person.role,
    reason: "",
  });
  return (
    <Modal
      title="투입 정보 변경"
      subtitle={`${person.name} · 변경 내용과 사유가 이력에 남습니다.`}
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
                required={key !== "role"}
                min={key === "end" ? form.start : undefined}
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              />
            </label>
          ))}
          <label className="field full-field">
            <span>실제 투입 상태</span>
            <select
              aria-label="실제 투입 상태"
              value={form.lifecycle}
              onChange={(e) => setForm({ ...form, lifecycle: e.target.value })}
            >
              {["투입 예정", "투입 중", "투입 보류", "철수 완료"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
            <small>
              준비율·최종 확인과 별도로 담당자가 실제 투입 여부를 기록합니다.
            </small>
          </label>
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
            기간 변경은 관련 서류의 재확인 여부를 확인해 주세요.
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
      title={`${person.name} · 철수 확인`}
      subtitle="외부 처리 결과와 반납을 확인한 후 철수를 완료합니다."
      onClose={onClose}
    >
      <div className="modal-body">
        <div className="notice">
          <AlertTriangle size={18} />
          확인 결과는 인원 기록에 저장됩니다. 이 서비스가 외부 계정을 실제
          삭제하지는 않습니다.
        </div>
        {[
          "철수 예정일과 반납 대상을 확인했습니다.",
          "수행사의 출입수단·업무 자료 반납을 확인했습니다.",
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
