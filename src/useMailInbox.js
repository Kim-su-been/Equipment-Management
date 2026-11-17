import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api.js";
export default function useMailInbox(enabled) {
  const [inbox, setInbox] = useState(null),
    [error, setError] = useState(""),
    [syncing, setSyncing] = useState(false),
    [phase, setPhase] = useState(""),
    [alertIds, setAlertIds] = useState([]),
    [syncResult, setSyncResult] = useState(null),
    running = useRef(false);
  const accept = useCallback(
    (result) =>
      setInbox({
        provider: result.provider,
        settings: result.settings,
        requests: result.requests,
        messages: result.messages,
      }),
    [],
  );
  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      accept(await api("/api/mail/inbox"));
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }, [enabled, accept]);
  useEffect(() => {
    if (!enabled) return;
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [enabled, refresh]);
  const sync = async () => {
    if (running.current) return;
    running.current = true;
    setSyncing(true);
    setError("");
    setPhase("새 메일 확인 중");
    try {
      const collected = await api("/api/mail/sync", {
        method: "POST",
        body: { collectOnly: true },
      });
      accept(collected);
      setPhase("새 메일 분석 중");
      // Commit and paint the inbox before starting the actual analysis request.
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
      const analyzed = await api("/api/mail/sync", {
        method: "POST",
        body: { analyzeIds: collected.analysisIds },
      });
      const result = {
        ...analyzed,
        imported: collected.imported,
        duplicates: collected.duplicates,
        truncated: collected.truncated,
        skipped: collected.skipped,
      };
      result.relatedMessages = new Set(
        result.requests
          .filter((r) => result.created.includes(r.id))
          .map((r) => r.messageId),
      ).size;
      accept(result);
      setSyncResult(result);
      setAlertIds(result.created);
      return result;
    } catch (e) {
      setError(e.message);
      throw e;
    } finally {
      running.current = false;
      setSyncing(false);
      setPhase("");
    }
  };
  return {
    inbox,
    error,
    syncing,
    phase,
    alertIds,
    syncResult,
    refresh,
    sync,
    dismiss: () => setAlertIds([]),
    accept,
  };
}
