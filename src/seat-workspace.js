import { canManage, validateAssignment } from "./data.js";
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export function createSeatDraft(data, scope) {
  return {
    scope,
    baseVersion: data.versions.at(-1).version,
    baseSeats: structuredClone(data.seats),
    seats: structuredClone(data.seats),
    offboarding: [],
    reasons: [],
  };
}
function checkDraft(data, draft, scope) {
  if (!draft || draft.scope !== scope)
    throw Error("현재 역할의 편집 내용이 아닙니다.");
  if (draft.baseVersion !== data.versions.at(-1).version)
    throw Error(
      "다른 관리자가 배치도를 저장했습니다. 임시 변경은 유지됩니다. 변경을 취소한 뒤 최신 버전에서 다시 편집해 주세요.",
    );
}
export function stageSeatAssignment(data, draft, args) {
  checkDraft(data, draft, args.scope);
  const error = validateAssignment({ ...data, seats: draft.seats }, args);
  if (error) throw Error(error);
  const person = data.people.find((p) => p.id === args.personId);
  if (person.lifecycle === "철수 완료" || draft.offboarding.includes(person.id))
    throw Error("철수 처리 중인 인원은 배정할 수 없습니다.");
  const next = structuredClone(draft);
  for (const id of Object.keys(next.seats))
    if (next.seats[id]?.personId === args.personId) next.seats[id] = null;
  next.seats[args.seatId] = {
    personId: person.id,
    project: person.project,
    start: args.start,
    end: args.end,
  };
  if (args.reason) next.reasons.push(args.reason);
  return next;
}
export function stageSeatMove(data, draft, args) {
  checkDraft(data, draft, args.scope);
  const source = draft.seats[args.fromSeatId];
  if (!source || source.personId !== args.personId)
    throw Error("원래 좌석의 배정이 변경되었습니다.");
  if (args.fromSeatId === args.toSeatId) return draft;
  return stageSeatAssignment(data, draft, {
    seatId: args.toSeatId,
    personId: source.personId,
    scope: args.scope,
    start: source.start,
    end: source.end,
  });
}
export function stageSeatRelease(data, draft, { seatId, scope }) {
  checkDraft(data, draft, scope);
  const source = draft.seats[seatId],
    person = data.people.find((p) => p.id === source?.personId);
  if (!person || !canManage(scope, person))
    throw Error("이 인원의 좌석을 해제할 권한이 없습니다.");
  const next = structuredClone(draft);
  next.seats[seatId] = null;
  return next;
}
export function stageSeatOffboarding(data, draft, { personId, scope }) {
  checkDraft(data, draft, scope);
  const person = data.people.find((p) => p.id === personId);
  if (!person || !canManage(scope, person))
    throw Error("철수 처리 권한이 없습니다.");
  const next = structuredClone(draft);
  for (const id of Object.keys(next.seats))
    if (next.seats[id]?.personId === personId) next.seats[id] = null;
  if (!next.offboarding.includes(personId)) next.offboarding.push(personId);
  return next;
}
export function getSeatChanges(draft) {
  if (!draft) return [];
  const index = (seats) =>
    Object.fromEntries(
      Object.entries(seats)
        .filter(([, v]) => v)
        .map(([id, v]) => [v.personId, { seatId: id, ...v }]),
    );
  const before = index(draft.baseSeats),
    after = index(draft.seats);
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].flatMap(
    (personId) => {
      if (same(before[personId], after[personId])) return [];
      const from = before[personId],
        to = after[personId];
      return [
        {
          personId,
          fromSeatId: from?.seatId,
          toSeatId: to?.seatId,
          before: from,
          after: to,
          kind: !from
            ? "배정"
            : !to
              ? "해제"
              : from.seatId === to.seatId
                ? "기간 변경"
                : "이동",
        },
      ];
    },
  );
}
export function commitSeatDraft(data, draft, scope) {
  checkDraft(data, draft, scope);
  if (!same(draft.baseSeats, data.seats))
    throw Error(
      "저장된 원장과 기준이 다릅니다. 최신 버전에서 다시 편집해 주세요.",
    );
  const changes = getSeatChanges(draft);
  if (!changes.length && !draft.offboarding.length) return data;
  const seatKeys = Object.keys(data.seats).sort();
  if (!same(seatKeys, Object.keys(draft.seats).sort()))
    throw Error("좌석 구조를 변경할 수 없습니다.");
  const seen = new Set();
  for (const id of seatKeys) {
    const old = data.seats[id],
      next = draft.seats[id];
    if (!same(old, next))
      for (const a of [old, next])
        if (a) {
          const p = data.people.find((p) => p.id === a.personId);
          if (!p || !canManage(scope, p))
            throw Error("다른 프로젝트 인원의 좌석을 변경할 수 없습니다.");
        }
    if (next) {
      const person = data.people.find((p) => p.id === next.personId);
      if (
        !person ||
        person.project !== next.project ||
        person.lifecycle === "철수 완료" ||
        draft.offboarding.includes(person.id)
      )
        throw Error("배정 인원을 다시 확인해 주세요.");
      if (seen.has(person.id))
        throw Error("같은 인원을 여러 좌석에 배정할 수 없습니다.");
      seen.add(person.id);
      if (
        !next.start ||
        !next.end ||
        next.start > next.end ||
        next.start < person.start ||
        next.end > person.end
      )
        throw Error("좌석 사용 기간을 다시 확인해 주세요.");
    }
  }
  for (const personId of draft.offboarding) {
    const person = data.people.find((p) => p.id === personId);
    if (!person || !canManage(scope, person))
      throw Error("철수 처리 권한이 없습니다.");
  }
  const next = structuredClone(data),
    date = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  next.seats = structuredClone(draft.seats);
  for (const id of draft.offboarding) {
    const person = next.people.find((p) => p.id === id);
    person.lifecycle = "철수 완료";
    person.history.unshift({
      text: "좌석 변경 저장 · 계정 정리·반납 확인 및 철수 완료",
      date,
    });
  }
  const summaries = changes.map(
    (c) =>
      `${c.personId} ${c.fromSeatId || "미배정"} → ${c.toSeatId || "배정 해제"}`,
  );
  next.versions.push({
    version: data.versions.at(-1).version + 1,
    by: scope === "PMO" ? "PMO" : `${scope === "SFA" ? "SFA" : "GW"}-담당자`,
    date,
    reason: `${changes.length}건 변경 저장 · ${summaries.join(", ")}${draft.offboarding.length ? " · 철수 확인" : ""}`,
    changes,
    seats: structuredClone(next.seats),
  });
  return next;
}
