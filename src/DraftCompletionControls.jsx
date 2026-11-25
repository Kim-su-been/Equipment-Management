import React, { useState } from "react";
import { DRAFT_TASK_IDS } from "./work-procedures.js";
export default function DraftCompletionControls({ person, taskId, onRecord }) {
  const [busy, setBusy] = useState(false);
  if (!DRAFT_TASK_IDS.includes(taskId)) return null;
  const done = !!person.drafting?.[taskId]?.done;
  return (
    <div className="draft-record-controls">
      <span className={`work-badge ${done ? "green" : "gray"}`}>
        {done ? "기안 작성 완료" : "기안 작성 미완료"}
      </span>
      <button
        type="button"
        className="text-link"
        disabled={busy || person.registrationStatus === "pending_registration"}
        aria-label={`${person.name} · ${done ? "기안 완료 기록 취소" : "기안 작성 완료 기록"}`}
        onClick={async () => {
          setBusy(true);
          try {
            await onRecord({ taskId, personIds: [person.id], done: !done });
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "저장 중…" : done ? "기록 취소" : "기안 작성 완료로 기록"}
      </button>
    </div>
  );
}
