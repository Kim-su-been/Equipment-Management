import { tasksForPerson } from "./data.js";
// Calendar-day offsets. Project settings can override individual task offsets.
export const DEFAULT_DEADLINE_OFFSETS = {
  O02: -3,
  O03: -1,
  O04: -3,
  O05: -1,
  O06: -1,
  O08: -1,
  O09: -1,
  O10: -1,
  O11: -1,
  O13: -1,
  O16: 0,
};
export function validIsoDate(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
export function shiftDate(value, days) {
  return new Date(Date.parse(`${value}T00:00:00Z`) + days * 86400000)
    .toISOString()
    .slice(0, 10);
}
export function reschedulePreparation(
  state,
  person,
  oldStart,
  newStart,
  onlyTaskIds = null,
) {
  if (!validIsoDate(newStart)) return [];
  const changed = [];
  person.taskOverrides ||= {};
  for (const task of tasksForPerson(person, state.customTasks || [])) {
    if (
      (onlyTaskIds && !onlyTaskIds.includes(task.id)) ||
      task.id === "O01" ||
      task.derived ||
      person.tasks[task.id] === "done" ||
      task.cancelled
    )
      continue;
    const configured =
      state.settings?.preparationDeadlineRules?.[person.project]?.[task.id];
    const oldDue = person.taskOverrides[task.id]?.due || task.due;
    let offset =
      Number.isInteger(configured) && configured >= -60 && configured <= 0
        ? configured
        : DEFAULT_DEADLINE_OFFSETS[task.id];
    if (task.custom) {
      offset = Number.isInteger(task.dueOffsetDays)
        ? task.dueOffsetDays
        : validIsoDate(oldDue) && validIsoDate(oldStart)
          ? Math.round((Date.parse(oldDue) - Date.parse(oldStart)) / 86400000)
          : -1;
    }
    if (offset === undefined) continue;
    const due = shiftDate(newStart, offset);
    person.taskOverrides[task.id] = { ...person.taskOverrides[task.id], due };
    if (oldDue !== due)
      changed.push({
        taskId: task.id,
        title: task.title,
        before: oldDue || null,
        after: due,
      });
  }
  return changed;
}
