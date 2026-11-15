import { PROJECTS, TASKS, canManage } from "./data.js";
export const DOCUMENT_IDS = ["O10", "O11"];
export const DOCUMENT_VERSION = "2.0-demo";
export const DEMO_CODE = "135790";
export function todayLocal() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export const DOCUMENT_CLAUSES = {
  O10: [
    "업무 중 취득한 정보와 자료를 승인 없이 외부에 제공하지 않습니다.",
    "자료 접근·보관·반납에 관한 프로젝트 보안 기준을 준수합니다.",
  ],
  O11: [
    "수집 항목: 성명, 소속, 프로젝트, 업무용 연락처, 투입 기간",
    "이용 목적: 프로젝트 인력 투입과 교육·서류·출입 준비 관리. 보유기간은 실제 운영 양식 확정 시 고지하며, 현재 문서는 시연용입니다.",
  ],
};
export const cleanPhone = (value = "") => value.replace(/[^\d]/g, "");
export function profileErrors(form, people = [], exceptId) {
  const errors = [];
  for (const [key, label] of [
    ["name", "이름"],
    ["company", "소속"],
    ["role", "역할"],
  ])
    if (!form[key]?.trim() || form[key].length > 80)
      errors.push(`${label}을 80자 이내로 입력해 주세요.`);
  if (!PROJECTS.includes(form.project))
    errors.push("프로젝트를 선택해 주세요.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email || ""))
    errors.push("업무용 이메일을 확인해 주세요.");
  if (!/^0\d{8,10}$/.test(cleanPhone(form.phone)))
    errors.push("연락처를 확인해 주세요.");
  const dateOk = (v) =>
    /^\d{4}-\d{2}-\d{2}$/.test(v || "") &&
    Number.isFinite(Date.parse(v)) &&
    new Date(v).toISOString().slice(0, 10) === v;
  if (!dateOk(form.start) || !dateOk(form.end) || form.start > form.end)
    errors.push("투입 예정 시작일과 종료일을 확인해 주세요.");
  if (
    people.some(
      (p) =>
        p.id !== exceptId &&
        p.email?.trim().toLowerCase() === form.email?.trim().toLowerCase(),
    )
  )
    errors.push("이미 등록된 이메일입니다. 기존 인원 화면을 선택해 주세요.");
  return errors;
}
export function registerSelf(data, form) {
  const errors = profileErrors(form, data.people);
  if (errors.length) throw new Error(errors.join("\n"));
  const prefix = form.project === "SFA" ? "SFA" : "GW";
  let number = 1;
  while (data.people.some((p) => p.id === `${prefix}-${number}`)) number++;
  return {
    id: `${prefix}-${number}`,
    name: form.name.trim(),
    company: form.company.trim(),
    project: form.project,
    role: form.role.trim(),
    email: form.email.trim().toLowerCase(),
    phone: cleanPhone(form.phone),
    start: form.start,
    end: form.end,
    lifecycle: "투입 예정",
    selfRegistered: true,
    profileRevision: 1,
    registeredAt: new Date().toISOString(),
    tasks: { O01: "done" },
    files: {},
    notes: {},
    certChecks: {},
    documentDrafts: {},
    submissions: {},
    history: [
      {
        text: "수행사 본인 등록 · 공통 교육·서류·주관사 작업 자동 배정",
        date: new Date().toLocaleString("ko-KR"),
      },
    ],
  };
}
export function defaultDocument(person, id) {
  return {
    name: person.name || person.id,
    company: person.company,
    project: person.project,
    email: person.email,
    phone: person.phone || "",
    start: person.start,
    end: person.end,
    read: false,
    acknowledged: false,
    consent: id === "O11" ? "" : "not-applicable",
    signature: "",
  };
}
export function documentIssues(person, id, values) {
  if (!DOCUMENT_IDS.includes(id))
    return [{ field: "name", message: "지원하지 않는 서류입니다." }];
  const issues = [];
  for (const key of ["name", "company", "project", "start", "end", "email"])
    if (values[key] !== defaultDocument(person, id)[key])
      issues.push({
        field: key,
        message:
          "등록 정보가 변경되었습니다. 내 정보 확인 후 서류를 다시 열어 주세요.",
      });
  if (!/^0\d{8,10}$/.test(cleanPhone(values.phone)))
    issues.push({
      field: "phone",
      message: "본인확인에 사용할 연락처를 입력해 주세요.",
    });
  if (person.phone && cleanPhone(values.phone) !== cleanPhone(person.phone))
    issues.push({ field: "phone", message: "등록 연락처와 일치해야 합니다." });
  if (!values.read)
    issues.push({ field: "read", message: "중요 조항을 읽고 확인해 주세요." });
  if (!values.acknowledged)
    issues.push({
      field: "acknowledged",
      message: "서류 내용 확인 항목을 체크해 주세요.",
    });
  if (id === "O11" && !["agree", "disagree"].includes(values.consent))
    issues.push({
      field: "consent",
      message: "개인정보 수집·이용 동의 여부를 선택해 주세요.",
    });
  if (values.signature?.trim() !== (person.name || person.id).trim())
    issues.push({
      field: "signature",
      message: "등록된 성명과 동일하게 서명해 주세요.",
    });
  return issues;
}
export function proofBinding(person, id, values) {
  return JSON.stringify({
    personId: person.id,
    profileRevision: person.profileRevision || 1,
    id,
    version: DOCUMENT_VERSION,
    values,
  });
}
export function createDemoProof(person, id, values, code, now = Date.now()) {
  if (documentIssues(person, id, values).length)
    throw new Error("필수 작성 항목을 먼저 완료해 주세요.");
  if (code !== DEMO_CODE)
    throw new Error("화면에 안내된 시연 확인번호를 입력해 주세요.");
  return {
    mode: "demo",
    provider: "미연동 · 시연 본인확인",
    reference: crypto.randomUUID(),
    name: person.name || person.id,
    personId: person.id,
    verifiedAt: new Date(now).toISOString(),
    binding: proofBinding(person, id, values),
  };
}
export function validateSubmission(
  person,
  id,
  values,
  proof,
  now = Date.now(),
) {
  const issues = documentIssues(person, id, values);
  const age = now - Date.parse(proof?.verifiedAt || "");
  if (
    proof?.mode !== "demo" ||
    proof.personId !== person.id ||
    proof.binding !== proofBinding(person, id, values) ||
    !Number.isFinite(age) ||
    age < 0 ||
    age > 10 * 60 * 1000
  )
    issues.push({
      field: "verification",
      message:
        "현재 작성 내용으로 시연 본인확인을 완료해 주세요. 확인은 10분간 유효합니다.",
    });
  return issues;
}
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function documentHtml(submission) {
  const { values: v, taskId: id } = submission;
  const title = TASKS.find((t) => t.id === id)?.title || id;
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title><style>body{font:16px/1.8 sans-serif;color:#173b58;max-width:820px;margin:40px auto;padding:24px}h1{color:#0067ac}table{border-collapse:collapse;width:100%}th,td{border:1px solid #b9cedd;text-align:left;padding:10px}th{background:#eef6fc}aside{padding:16px;background:#fff3dc}footer{border-top:1px solid #bdcddd;margin-top:24px;font-size:13px;overflow-wrap:anywhere}@media print{body{margin:0}}</style><body><aside>시연 제출본 · 실제 본인인증/전자서명 서비스 미연동 · 운영용 법적 서식 아님</aside><h1>${escape(title)}</h1><p>양식 ${DOCUMENT_VERSION} · 제출 v${submission.version}</p><table>${[
    ["성명", v.name],
    ["소속", v.company],
    ["프로젝트", v.project],
    ["이메일", v.email],
    ["연락처", v.phone],
    ["투입 예정 기간", `${v.start} ~ ${v.end}`],
  ]
    .map(([k, x]) => `<tr><th>${k}</th><td>${escape(x)}</td></tr>`)
    .join(
      "",
    )}</table><h2>확인할 내용</h2>${DOCUMENT_CLAUSES[id].map((t) => `<p>${escape(t)}</p>`).join("")}${id === "O11" ? `<p>동의 여부: <strong>${v.consent === "agree" ? "동의함" : "동의하지 않음 · 담당자 확인 필요"}</strong></p>` : ""}<p>조항 읽기 및 내용 확인: 완료</p><p>본인 입력 서명: <strong>${escape(v.signature)}</strong></p><footer>제출자: ${escape(submission.personId)}<br>제출 시점: ${escape(submission.submittedAt)}<br>시연 본인확인 시점: ${escape(submission.proof.verifiedAt)}<br>시연 확인 식별자: ${escape(submission.proof.reference)}<br>문서 식별자: ${escape(submission.id)}</footer></body></html>`;
}
export function createSubmission(person, id, values, proof) {
  const issues = validateSubmission(person, id, values, proof);
  if (issues.length) throw new Error(issues.map((i) => i.message).join("\n"));
  const previous = person.submissions?.[id] || [];
  const result = {
    id: crypto.randomUUID(),
    personId: person.id,
    project: person.project,
    taskId: id,
    version:
      Math.max(
        0,
        ...previous.map((item) => item.version || 0),
        ...(person.fileHistory?.[id] || []).map((item) => item.version || 0),
        person.files?.[id]?.version || 0,
      ) + 1,
    templateVersion: DOCUMENT_VERSION,
    values: structuredClone(values),
    proof: structuredClone(proof),
    submittedAt: new Date().toISOString(),
  };
  return { ...result, html: documentHtml(result) };
}
export function authorizedPeople(data, scope, project, personIds) {
  if (
    !["PMO", ...PROJECTS].includes(scope) ||
    !["전체", ...PROJECTS].includes(project) ||
    (scope !== "PMO" && project !== scope)
  )
    throw new Error("담당 프로젝트 범위를 벗어났습니다.");
  const ids = [...new Set(personIds || [])];
  if (!ids.length) throw new Error("대상 인원을 선택해 주세요.");
  return ids.map((id) => {
    const person = data.people.find((p) => p.id === id);
    if (
      !person ||
      !canManage(scope, person) ||
      (project !== "전체" && person.project !== project)
    )
      throw new Error("접근할 수 없는 인원이 포함되어 있습니다.");
    return person;
  });
}
