import { memberRoadmap, PREPARATION_STAGES } from "./member-roadmap.js";
import { businessDate, personIdentity, personState } from "./work-summary.js";

const active = new Set(["ready", "progress", "review", "error", "fix", "ai"]);
const reviewing = new Set(["review", "error", "ai"]);

// Group work that can be processed now, not every future dependent stage.
// Parallel work can put a person in several columns; each column stays unique.
export function adminStageGroups(
  people,
  data,
  scope = "PMO",
  today = businessDate(),
) {
  const groups = PREPARATION_STAGES.map((stage) => ({ ...stage, people: [] }));
  const seen = new Set();
  for (const person of people) {
    if (seen.has(person.id) || (scope !== "PMO" && person.project !== scope))
      continue;
    seen.add(person.id);
    const roadmap = memberRoadmap(person, data);
    const state = personState(person, data, today);
    let stages;
    if (!state.registered) stages = [roadmap.stages[0]];
    else if (roadmap.final) stages = [roadmap.stages[4]];
    else if (roadmap.held) stages = [roadmap.current];
    else {
      stages = roadmap.stages.filter((stage) => {
        if (stage.done || stage.id === "registration") return false;
        if (stage.id === "review")
          return stage.items.some((r) => !r.done && reviewing.has(r.status));
        return stage.items.some((r) => !r.done && active.has(r.status));
      });
      if (!stages.length) stages = [roadmap.current];
    }
    for (const stage of stages) {
      const remaining = stage.items.filter((r) => !r.done);
      const next =
        remaining.find((r) => r.owner === "admin" && active.has(r.status)) ||
        remaining.find((r) => active.has(r.status)) ||
        remaining[0];
      groups
        .find((g) => g.id === stage.id)
        .people.push({
          person,
          identity: personIdentity(data, person.id),
          state,
          stage,
          next,
          held: roadmap.held,
          final: roadmap.final,
          remaining: remaining.length,
          needsFix: remaining.some((r) => r.status === "fix"),
          rank: roadmap.held
            ? 4
            : state.overdue && !roadmap.final
              ? 0
              : state.imminent
                ? 1
                : remaining.some((r) => r.status === "fix")
                  ? 2
                  : 3,
        });
    }
  }
  for (const group of groups)
    group.people.sort(
      (a, b) =>
        a.rank - b.rank ||
        (a.person.start || "9999").localeCompare(b.person.start || "9999") ||
        a.identity.name.localeCompare(b.identity.name),
    );
  return groups;
}
