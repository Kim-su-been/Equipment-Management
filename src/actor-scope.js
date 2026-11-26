import { scopePerformance } from "./performance-service.js";
import { PROJECTS } from "./data.js";
export function inScope(actor, person) {
  return actor.kind === "member"
    ? actor.personId === person.id
    : actor.scope === "PMO" || actor.scope === person.project;
}
export function viewState(store, actor) {
  const state = store.load(),
    people = state.people.filter((p) => inScope(actor, p)),
    ids = new Set(people.map((p) => p.id));
  return {
    ...state,
    performance:
      state.performance?.schema === 1
        ? scopePerformance(state.performance, actor, state.people)
        : null,
    referenceIssues:
      actor.kind === "member"
        ? []
        : ["messages", "notifications", "activity"].flatMap((collection) =>
            (state[collection] || [])
              .filter(
                (item) =>
                  item.personId &&
                  !state.people.some((p) => p.id === item.personId) &&
                  (actor.scope === "PMO" || item.project === actor.scope),
              )
              .map((item) => ({
                collection,
                recordId: item.id,
                personId: item.personId,
                project: item.project,
              })),
          ),
    people,
    projects: PROJECTS,
    companies: [...new Set(people.map((p) => p.company))],
    customTasks: state.customTasks.filter(
      (t) =>
        (t.project === "전체" || people.some((p) => p.project === t.project)) &&
        (!t.personIds || t.personIds.some((id) => ids.has(id))),
    ),
    messages: state.messages.filter((m) => ids.has(m.personId)),
    notifications: state.notifications.filter((n) =>
      n.personId
        ? ids.has(n.personId)
        : actor.kind !== "member" &&
          (actor.scope === "PMO" || n.project === actor.scope),
    ),
    activity: state.activity.filter((a) =>
      a.personId
        ? ids.has(a.personId)
        : actor.kind !== "member" &&
          (actor.scope === "PMO" || a.project === actor.scope),
    ),
    settings:
      actor.kind === "member"
        ? {
            O08: state.settings.O08,
            O09: state.settings.O09,
            reminder: state.settings.reminder,
            contactRoutes: Object.fromEntries(
              Object.entries(state.settings.contactRoutes || {}).filter(
                ([key]) => key.startsWith(`${people[0]?.project}:`),
              ),
            ),
          }
        : state.settings,
  };
}
