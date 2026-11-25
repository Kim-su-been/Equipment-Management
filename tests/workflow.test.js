import test from "node:test";
import assert from "node:assert/strict";
import {
  seed,
  taskStatus,
  isPrepared,
  progress,
  canManage,
  requiredTasks,
} from "../src/data.js";
test("initial ten people and preparation match the scenario", () => {
  const d = seed();
  assert.equal(d.people.length, 10);
  assert.equal(d.people.filter((p) => p.project === "SFA").length, 5);
  assert.deepEqual(
    d.people.filter((p) => isPrepared(p, d.seats)).map((p) => p.id),
    ["SFA-1", "GW-1", "GW-5"],
  );
  assert.equal(progress(d.people[0], d.seats), 100);
});
test("both account confirmations unlock the member task", () => {
  const d = seed(),
    p = d.people.find((p) => p.id === "SFA-4");
  assert.equal(taskStatus(p, "O06", d.seats), "waiting");
  p.tasks.O03 = "done";
  assert.equal(taskStatus(p, "O06", d.seats), "waiting");
  p.tasks.O05 = "done";
  assert.equal(taskStatus(p, "O06", d.seats), "ready");
});
test("both document approvals unlock access", () => {
  const d = seed(),
    p = d.people.find((p) => p.id === "SFA-2");
  p.tasks.O10 = "done";
  p.tasks.O11 = "review";
  assert.equal(taskStatus(p, "O13", d.seats), "waiting");
  p.tasks.O11 = "done";
  assert.equal(taskStatus(p, "O13", d.seats), "ready");
});
import { createProjectTask } from "../src/project-tasks.js";
import { tasksForPerson } from "../src/data.js";
const customForm = {
  title: "개발 환경 접속 확인",
  desc: "접속 결과를 확인해 주세요.",
  project: "SFA",
  owner: "member",
  target: "all",
  required: true,
  dependency: "O06",
  due: "2026-11-20",
};
test("project task permissions reject forged project and out-of-scope recipients", () => {
  const d = seed();
  assert.throws(() =>
    createProjectTask(d, "SFA", { ...customForm, project: "전체" }),
  );
  assert.throws(() =>
    createProjectTask(d, "SFA", { ...customForm, project: "그룹웨어" }),
  );
  assert.throws(() =>
    createProjectTask(d, "SFA", {
      ...customForm,
      target: "selected",
      personIds: ["GW-1"],
    }),
  );
  assert.throws(() =>
    createProjectTask(d, "PMO", {
      ...customForm,
      target: "selected",
      personIds: [],
    }),
  );
  assert.throws(() =>
    createProjectTask(d, "PMO", { ...customForm, dependency: "O16" }),
  );
  assert.throws(() =>
    createProjectTask(d, "PMO", { ...customForm, due: "2026-02-30" }),
  );
});
test("project tasks follow dependencies, readiness and future project membership", () => {
  const d = seed(),
    person = d.people.find((p) => p.id === "SFA-1");
  const task = createProjectTask(d, "SFA", customForm),
    tasks = [task];
  assert.equal(taskStatus(person, task.id, d.seats, tasks), "ready");
  assert.equal(isPrepared(person, d.seats, tasks), false);
  assert.equal(taskStatus(person, "O16", d.seats, tasks), "waiting");
  assert.equal(
    progress(person, d.seats, tasks),
    Math.round(
      (requiredTasks(person).length / requiredTasks(person, tasks).length) *
        100,
    ),
  );
  assert.equal(
    taskStatus(
      d.people.find((p) => p.id === "SFA-5"),
      task.id,
      d.seats,
      tasks,
    ),
    "waiting",
  );
  assert.equal(
    tasksForPerson({ id: "GW-6", project: "그룹웨어" }, tasks).some(
      (t) => t.id === task.id,
    ),
    false,
  );
  assert.equal(
    tasksForPerson({ id: "SFA-6", project: "SFA" }, tasks).some(
      (t) => t.id === task.id,
    ),
    true,
  );
  person.tasks[task.id] = "done";
  assert.equal(isPrepared(person, d.seats, tasks), true);
  assert.equal(progress(person, d.seats, tasks), 100);
});
test("PMO can assign optional global and individual tasks without changing readiness", () => {
  const d = seed(),
    person = d.people[0];
  const task = createProjectTask(d, "PMO", {
    ...customForm,
    project: "전체",
    required: false,
  });
  assert.ok(
    d.people.every((p) =>
      tasksForPerson(p, [task]).some((t) => t.id === task.id),
    ),
  );
  assert.equal(isPrepared(person, d.seats, [task]), true);
  assert.equal(progress(person, d.seats, [task]), 100);
  const individual = createProjectTask(d, "PMO", {
    ...customForm,
    target: "selected",
    personIds: [person.id],
  });
  const templateCount = tasksForPerson(person).length;
  assert.equal(tasksForPerson(person, [individual]).length, templateCount + 1);
  assert.equal(tasksForPerson(d.people[1], [individual]).length, templateCount);
  assert.equal(
    tasksForPerson({ id: "SFA-6", project: "SFA" }, [individual]).length,
    templateCount,
  );
});

import {
  registerSelf,
  defaultDocument,
  documentIssues,
  DEMO_CODE,
  createDemoProof,
  validateSubmission,
  createSubmission,
  documentHtml,
} from "../src/onboarding.js";
import { crc32, makeZip } from "../src/archive.js";
import { taskExportRows } from "../src/task-exports.js";
import {
  resolveContact,
  saveContactRoute,
  buildDoorayMessage,
} from "../src/dooray.js";
const registration = {
  name: "테스트 인원",
  company: "테스트 수행사",
  project: "SFA",
  role: "개발자",
  email: "new.member@demo.example",
  phone: "010-1234-5678",
  start: "2026-11-16",
  end: "2027-02-26",
};
function validOnline(person, id = "O10") {
  return {
    ...defaultDocument(person, id),
    read: true,
    acknowledged: true,
    signature: person.name,
    consent: id === "O11" ? "agree" : "not-applicable",
  };
}
test("self registration assigns identity, education, documents and host work without premature completion", () => {
  const d = seed(),
    person = registerSelf(d, registration);
  d.people.push(person);
  assert.equal(person.id, "SFA-6");
  assert.equal(person.phone, "01012345678");
  assert.equal(taskStatus(person, "O08", d.seats), "ready");
  assert.equal(taskStatus(person, "O09", d.seats), "ready");
  assert.equal(taskStatus(person, "O10", d.seats), "waiting");
  person.tasks.O08 = "done";
  assert.equal(taskStatus(person, "O10", d.seats), "ready");
  assert.equal(taskStatus(person, "O02", d.seats), "ready");
  assert.equal(taskStatus(person, "O06", d.seats), "waiting");
  assert.equal(isPrepared(person, d.seats), false);
  assert.throws(() => registerSelf(d, { ...registration, name: "중복 인원" }));
  assert.throws(() =>
    registerSelf(d, {
      ...registration,
      email: "else@demo.example",
      start: "2026-02-30",
    }),
  );
});
test("online documents enforce omissions, profile binding, signature and expiring demo verification", () => {
  const p = registerSelf(seed(), registration),
    values = validOnline(p);
  assert.ok(documentIssues(p, "O10", defaultDocument(p, "O10")).length >= 3);
  assert.throws(() => createDemoProof(p, "O10", values, "000000"));
  const proof = createDemoProof(p, "O10", values, DEMO_CODE);
  assert.deepEqual(validateSubmission(p, "O10", values, proof), []);
  assert.ok(
    validateSubmission(p, "O10", { ...values, read: false }, proof).length,
  );
  assert.ok(
    validateSubmission({ ...p, profileRevision: 2 }, "O10", values, proof)
      .length,
  );
  assert.ok(
    validateSubmission(p, "O10", values, proof, Date.now() + 11 * 60 * 1000)
      .length,
  );
  assert.ok(
    validateSubmission(p, "O10", values, { ...proof, verifiedAt: "invalid" })
      .length,
  );
  assert.throws(() =>
    createSubmission(p, "O10", { ...values, signature: "다른 사람" }, proof),
  );
});
test("online submission versions preserve content, consent refusal, demo provenance and escaped input", () => {
  const p = registerSelf(seed(), {
      ...registration,
      name: "<script>test</script>",
    }),
    v = validOnline(p);
  const proof = createDemoProof(p, "O10", v, DEMO_CODE),
    first = createSubmission(p, "O10", v, proof);
  assert.equal(first.version, 1);
  assert.equal(first.proof.mode, "demo");
  assert.ok(first.html.includes("&lt;script&gt;test&lt;/script&gt;"));
  assert.ok(!first.html.includes("<script>test</script>"));
  p.submissions = { O10: [first] };
  const second = createSubmission(p, "O10", v, proof);
  assert.equal(second.version, 2);
  assert.equal(first.version, 1);
  assert.ok(documentHtml(second).includes("제출 v2"));
  const consent = { ...validOnline(p, "O11"), consent: "disagree" };
  assert.equal(documentIssues(p, "O11", consent).length, 0);
  assert.ok(
    createSubmission(
      p,
      "O11",
      consent,
      createDemoProof(p, "O11", consent, DEMO_CODE),
    ).html.includes("동의하지 않음"),
  );
});
test("task-specific exports map actual registered fields and reject out-of-scope selections", () => {
  const d = seed(),
    p = registerSelf(d, registration);
  d.people.push(p);
  const selection = { project: "SFA", taskId: "O02", personIds: [p.id] };
  const result = taskExportRows(d, "SFA", selection);
  assert.equal(result.rows[0]["성명"], registration.name);
  assert.equal(result.rows[0]["연락처"], "01012345678");
  assert.throws(() => taskExportRows(d, "그룹웨어", selection));
  assert.throws(() =>
    taskExportRows(d, "SFA", { ...selection, personIds: ["GW-1"] }),
  );
  assert.throws(() =>
    taskExportRows(d, "SFA", { ...selection, taskId: "O10" }),
  );
});
test("task contact overrides fallback and Dooray drafts never claim external delivery", () => {
  const p = registerSelf(seed(), registration);
  const settings = saveContactRoute({}, "SFA", {
    project: "SFA",
    taskId: "O10",
    name: "서류 담당자",
    memberId: "member-123",
  });
  const route = resolveContact(settings, p, "O10");
  assert.equal(route.name, "서류 담당자");
  assert.equal(resolveContact(settings, p, "O02").name, "SFA-담당자");
  assert.throws(() =>
    saveContactRoute(settings, "SFA", {
      project: "그룹웨어",
      taskId: "O10",
      name: "담당자",
    }),
  );
  const message = buildDoorayMessage(
    p,
    { id: "O10", title: "보안서약서" },
    "질문",
    "서명 위치 문의",
    "실행 가능",
    route,
  );
  assert.equal(message.recipient, "member-123");
  assert.equal(message.delivery, "not_connected");
  assert.ok(message.text.includes(registration.name));
  assert.ok(message.text.includes("보안서약서"));
});
test("UTF-8 ZIP archive preserves original bytes and standard CRC", async () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
  const { default: JSZip } = await import("jszip");
  const bytes = new Uint8Array([0, 1, 2, 255]);
  const zip = makeZip([{ name: "SFA/홍길동_서류.pdf", bytes }]);
  const parsed = await JSZip.loadAsync(await zip.arrayBuffer());
  assert.deepEqual(
    new Uint8Array(
      await parsed.file("SFA/홍길동_서류.pdf").async("uint8array"),
    ),
    bytes,
  );
});

test("simplified self registration ignores email/role and deduplicates by project and phone", () => {
  const data = seed(),
    minimal = {
      name: "김레디",
      company: "예시 수행사",
      project: "SFA",
      phone: "010-3333-4444",
      start: "2026-11-16",
      end: "2027-02-26",
    };
  const person = registerSelf(data, minimal);
  assert.equal(person.email, "");
  assert.equal(person.role, "");
  data.people.push(person);
  assert.throws(
    () => registerSelf(data, { ...minimal, name: "같은 인원" }),
    /연락처/,
  );
  assert.equal(
    registerSelf(data, { ...minimal, project: "그룹웨어" }).project,
    "그룹웨어",
  );
});

test("original PDF templates match their hashes and keep all field locations on one page", async () => {
  const { getDocumentTemplate } = await import("../src/document-templates.js");
  const { readFile } = await import("node:fs/promises");
  const { createHash } = await import("node:crypto");
  for (const id of ["O10", "O11"]) {
    const template = getDocumentTemplate(id);
    const pdf = await readFile(
      new URL(`../public${template.pdfUrl}`, import.meta.url),
    );
    assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
    assert.equal(
      createHash("sha256").update(pdf).digest("hex"),
      template.digest,
    );
    for (const rect of Object.values(template.fields)) {
      assert.ok(
        rect.x >= 0 &&
          rect.y >= 0 &&
          rect.w > 0 &&
          rect.h > 0 &&
          rect.x + rect.w <= 100 &&
          rect.y + rect.h <= 100,
      );
    }
    assert.ok(!("email" in template.fields));
    assert.ok(template.fields.signature);
  }
});
test("other-category tasks and retired legacy tasks never enter preparation percentage", () => {
  const data = seed(),
    person = data.people[0];
  person.tasks.O14 = "waiting";
  person.tasks.O15 = "waiting";
  const extra = createProjectTask(data, "PMO", {
    ...customForm,
    group: "기타",
  });
  assert.equal(progress(person, undefined, [extra]), 100);
  assert.equal(isPrepared(person, undefined, [extra]), true);
  const account = createProjectTask(data, "PMO", {
    ...customForm,
    group: "계정 준비",
  });
  assert.equal(isPrepared(person, undefined, [account]), false);
});
