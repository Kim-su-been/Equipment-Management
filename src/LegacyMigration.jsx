import React, { useState } from "react";
import { api } from "./api.js";
import { readEvidence as readLegacy } from "./legacy-storage.js";
import { storeEvidence } from "./evidence-store.js";
import { statePatch } from "./state-patch.js";
export default function LegacyMigration({ onComplete }) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  let old;
  try {
    old = JSON.parse(localStorage.getItem("tuip-on-demo-v1"));
  } catch {}
  if (!old?.people?.length) return null;
  return (
    <div className="legacy-migration">
      <p>
        이 브라우저에 이전 인원 {old.people.length}명의 데이터가 있습니다.
        서버로 가져오면 다른 브라우저에서도 확인할 수 있습니다.
      </p>
      <button
        className="btn"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const result = await api("/api/migrate", {
              method: "POST",
              body: old,
            });
            let current = result.state,
              missing = 0;
            for (const person of current.people) {
              for (const [taskId, file] of Object.entries(person.files || {})) {
                if (!file.legacyStorageId || file.storageId) continue;
                const record = await readLegacy(file.legacyStorageId);
                if (!record?.blob) {
                  missing++;
                  continue;
                }
                const stored = await storeEvidence(record.blob, {
                  personId: person.id,
                  taskId,
                  name: file.name || record.name,
                });
                const next = structuredClone(current),
                  target = next.people.find((p) => p.id === person.id);
                Object.assign(target.files[taskId], {
                  storageId: stored.id,
                  digest: stored.digest,
                });
                for (const entry of target.fileHistory?.[taskId] || [])
                  if (entry.storageId === file.legacyStorageId) {
                    entry.storageId = stored.id;
                    entry.digest = stored.digest;
                  }
                for (const entry of target.submissions?.[taskId] || [])
                  if (entry.storageId === file.legacyStorageId) {
                    entry.storageId = stored.id;
                    entry.digest = stored.digest;
                  }
                const saved = await api("/api/state", {
                  method: "PATCH",
                  body: { operations: statePatch(current, next) },
                });
                current = saved.state;
              }
            }
            onComplete(current);
            setMessage(
              `이전 데이터를 가져왔습니다.${missing ? ` 원본 ${missing}개는 이전 브라우저 보관함에 없어 재제출이 필요합니다.` : ""}`,
            );
          } catch (e) {
            setMessage(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "가져오는 중…" : "이전 브라우저 데이터 가져오기"}
      </button>
      {message && <p role="status">{message}</p>}
    </div>
  );
}
