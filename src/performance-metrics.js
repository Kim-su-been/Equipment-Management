import { SDLC_STAGES, shiftDay } from "./performance-data.js";
export const validDay = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
export const daysBetween = (a, b) =>
  validDay(a) && validDay(b)
    ? Math.round(
        (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) /
          86400000,
      )
    : null;
export const ratio = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : null);
export const median = (values) => {
  if (!values.length) return null;
  const a = [...values].sort((x, y) => x - y),
    m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};
export function requestAt(request, asOf) {
  const events = (request.events || [])
    .filter((e) => e.at <= asOf)
    .sort((a, b) => a.at.localeCompare(b.at));
  const cancelled = !!request.cancelledAt && request.cancelledAt <= asOf;
  const done = !!request.completedAt && request.completedAt <= asOf;
  const stage = done ? "completed" : events.at(-1)?.stage || "request";
  const overdue =
    !cancelled && !done && validDay(request.dueDate) && request.dueDate < asOf;
  const late =
    done && validDay(request.dueDate) && request.completedAt > request.dueDate;
  const reworked = events.some(
    (e, i) =>
      i > 0 &&
      e.stage === "development" &&
      events[i - 1].stage === "verification",
  );
  return {
    ...request,
    events,
    stage,
    cancelled,
    done,
    overdue,
    late,
    reworked,
    label: cancelled
      ? "취소"
      : done
        ? late
          ? "지연 완료"
          : "완료"
        : overdue
          ? "진행 지연"
          : SDLC_STAGES.find((s) => s.id === stage)?.title || "확인 필요",
  };
}
export function selectRequests(payload, filter = {}) {
  const end = validDay(filter.to) ? filter.to : payload.asOf;
  const asOf = end > payload.asOf ? payload.asOf : end;
  return (payload.requests || [])
    .filter(
      (r) =>
        r.createdAt <= asOf &&
        (!filter.project ||
          filter.project === "전체" ||
          r.project === filter.project) &&
        (!filter.person ||
          filter.person === "전체" ||
          r.participantId === filter.person) &&
        (!filter.type || filter.type === "전체" || r.type === filter.type),
    )
    .map((r) => requestAt(r, asOf))
    .filter(
      (r) =>
        !filter.from ||
        (r.done ? r.completedAt : r.cancelled ? r.cancelledAt : asOf) >=
          filter.from,
    );
}
export function performanceMetrics(rows, asOf) {
  const active = rows.filter((r) => !r.cancelled),
    completed = active.filter((r) => r.done);
  const eligible = completed.filter((r) => validDay(r.dueDate));
  const onTime = eligible.filter((r) => !r.late),
    ongoing = active.filter((r) => !r.done);
  const cycles = completed
    .map((r) => daysBetween(r.createdAt, r.completedAt))
    .filter((n) => n !== null && n >= 0);
  return {
    completed: completed.length,
    eligible: eligible.length,
    onTime: onTime.length,
    onTimeRate: ratio(onTime.length, eligible.length),
    missingDue: completed.length - eligible.length,
    late: eligible.length - onTime.length,
    ongoing: ongoing.length,
    overdue: ongoing.filter((r) => r.overdue).length,
    medianCycle: median(cycles),
    reworked: completed.filter((r) => r.reworked).length,
    reworkRate: ratio(
      completed.filter((r) => r.reworked).length,
      completed.length,
    ),
    cancelled: rows.length - active.length,
    asOf,
  };
}
export function stageDurations(rows) {
  return SDLC_STAGES.filter((s) => s.id !== "completed").map((stage) => {
    const visits = [];
    for (const r of rows.filter((r) => r.done && !r.cancelled)) {
      let total = 0,
        seen = false;
      for (let i = 0; i < r.events.length - 1; i++)
        if (r.events[i].stage === stage.id) {
          const d = daysBetween(r.events[i].at, r.events[i + 1].at);
          if (d !== null && d >= 0) {
            total += d;
            seen = true;
          }
        }
      if (seen) visits.push(total);
    }
    return { ...stage, median: median(visits), count: visits.length };
  });
}
export function weeklyTrend(rows, asOf) {
  const anchor = shiftDay(asOf, -27);
  return [0, 1, 2, 3].map((i) => {
    const from = shiftDay(anchor, i * 7),
      to = shiftDay(from, 6),
      list = rows.filter(
        (r) =>
          r.done &&
          !r.cancelled &&
          r.completedAt >= from &&
          r.completedAt <= to,
      );
    const eligible = list.filter((r) => validDay(r.dueDate));
    return {
      from,
      to,
      completed: list.length,
      late: eligible.filter((r) => r.late).length,
      onTime: eligible.filter((r) => !r.late).length,
      missingDue: list.length - eligible.length,
    };
  });
}
export function personMetrics(payload, rows, asOf) {
  return payload.participants
    .map((p) => ({
      ...p,
      ...performanceMetrics(
        rows.filter((r) => r.participantId === p.id),
        asOf,
      ),
    }))
    .filter((p) => p.completed || p.ongoing || p.cancelled);
}
