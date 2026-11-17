// Inactive seat information is excluded from all current workflow calculations.
const RETIRED_TASKS = new Set(["O07", "O14", "O15"]);
export function normalizeLegacyState(input) {
  const state = structuredClone(input);
  const retired = new Set([
    ...RETIRED_TASKS,
    ...(state.customTasks || [])
      .filter(
        (t) =>
          t.kind === "seat" || /좌석/.test(`${t.title || ""} ${t.group || ""}`),
      )
      .map((t) => t.id),
  ]);
  state.people = (state.people || []).map((p) => ({
    ...p,
    displayId: p.displayId || p.id,
    registrationStatus: p.registrationStatus || "registered",
    recordVersion: p.recordVersion || 1,
    tasks: Object.fromEntries(
      Object.entries(p.tasks || {}).filter(([id]) => !retired.has(id)),
    ),
    files: p.files || {},
    certChecks: p.certChecks || {},
    notes: p.notes || {},
    history: p.history || [],
  }));
  state.customTasks = (state.customTasks || [])
    .filter((t) => !retired.has(t.id))
    .map((t) => ({
      ...t,
      group: t.group === "추가 작업" ? "계정 준비" : t.group,
      deps: (t.deps || []).filter((id) => !retired.has(id)),
    }));
  state.settings = state.settings || { O08: "", O09: "", reminder: true };
  state.messages = (state.messages || []).filter((m) => !retired.has(m.task));
  state.notifications = (state.notifications || []).filter(
    (n) => !String(n.title || "").includes("좌석"),
  );
  state.activity = (state.activity || []).filter((a) => a.type !== "seat");
  delete state.seats;
  delete state.versions;
  return state;
}
export function personLabel(person) {
  return person?.name || person?.displayId || "인원";
}
