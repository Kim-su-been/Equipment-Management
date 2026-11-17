const randomUUID = () => crypto.randomUUID();
import { PROJECTS } from "./data.js";
import { parseBirth } from "./birth.js";
import { reschedulePreparation } from "./personnel-workflow.js";
export function createPendingPerson(state, input) {
  if (!PROJECTS.includes(input.project))
    throw new Error("프로젝트를 확인해 주세요.");
  const name = String(input.name || "").trim(),
    company = String(input.company || "").trim();
  if (!name || !company || name.length > 80 || company.length > 100)
    throw new Error("이름과 소속을 확인해 주세요.");
  const prefix = input.project === "SFA" ? "SFA" : "GW";
  let serial = 1;
  while (state.people.some((p) => p.displayId === `${prefix}-${serial}`))
    serial++;
  const birth = parseBirth(
    input.birthRaw ?? input.birthDate ?? input.birthYear ?? "",
  );
  if (birth.review === "오류") throw new Error("생년월일을 확인해 주세요.");
  const person = {
    id: randomUUID(),
    displayId: `${prefix}-${serial}`,
    project: input.project,
    name,
    company,
    ...birth,
    birthReview: birth.review,
    registrationStatus: "pending_registration",
    lifecycle: "투입 예정",
    start: input.start || "",
    end: input.end || "",
    phone: input.phone || "",
    email: input.email || "",
    role: input.role || "",
    tasks: { O01: "done" },
    files: {},
    certChecks: {},
    notes: {},
    history: [],
    profileRevision: 1,
    importSources: [],
  };
  delete person.review;
  delete person.reason;
  state.people.push(person);
  reschedulePreparation(state, person, "", person.start);
  return person;
}
