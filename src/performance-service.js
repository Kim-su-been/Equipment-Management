import { makePerformanceDemo } from "./performance-data.js";
const canSee = (actor, p) =>
  actor.kind === "member"
    ? p.personId === actor.personId
    : actor.scope === "PMO" || actor.scope === p.project;
export function scopePerformance(payload, actor, people = []) {
  const participants = payload.participants
    .filter((p) => canSee(actor, p))
    .map((p) => {
      const current = people.find((person) => person.id === p.personId);
      return current
        ? {
            ...p,
            name: current.name,
            company: current.company,
            project: current.project,
          }
        : p;
    });
  const ids = new Set(participants.map((p) => p.id));
  return {
    ...payload,
    participants,
    requests: payload.requests.filter((r) => ids.has(r.participantId)),
  };
}
export function getPerformance(store, actor) {
  const state = store.load(),
    saved = state.performance;
  const payload =
    saved?.schema === 1 &&
    Array.isArray(saved.requests) &&
    Array.isArray(saved.participants)
      ? saved
      : makePerformanceDemo(state.people);
  return {
    ...scopePerformance(payload, actor, state.people),
    preview: payload !== saved,
  };
}
export function syncPerformance(store, actor) {
  if (actor.kind !== "admin")
    throw Object.assign(
      new Error("가상 자료 수집은 주관사만 실행할 수 있습니다."),
      { status: 403 },
    );
  const state = store.load(),
    incoming = scopePerformance(
      makePerformanceDemo(state.people),
      actor,
      state.people,
    );
  const saved = state.performance || {
    schema: 1,
    participants: [],
    requests: [],
  };
  const participants = new Map(saved.participants.map((p) => [p.id, p]));
  for (const p of incoming.participants) participants.set(p.id, p);
  const requests = new Map(saved.requests.map((r) => [r.id, r]));
  let added = 0,
    updated = 0;
  for (const r of incoming.requests) {
    if (!requests.has(r.id)) added++;
    else if (JSON.stringify(requests.get(r.id)) !== JSON.stringify(r))
      updated++;
    requests.set(r.id, r);
  }
  state.performance = {
    ...incoming,
    participants: [...participants.values()],
    requests: [...requests.values()],
    syncedAt: new Date().toISOString(),
  };
  store.save(state);
  store.audit?.(actor, "performance.mock-sync", {
    added,
    updated,
    source: "mock-groupware",
  });
  return {
    ...getPerformance(store, actor),
    sync: {
      added,
      updated,
      unchanged: incoming.requests.length - added - updated,
    },
  };
}
