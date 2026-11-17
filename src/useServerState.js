import { useState, useRef, useEffect, useCallback } from "react";
import { api } from "./api.js";
import { statePatch } from "./state-patch.js";
export default function useServerState(initialState) {
  const [data, setData] = useState(initialState),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const ref = useRef(initialState),
    queue = useRef(Promise.resolve()),
    pending = useRef(0),
    alive = useRef(true);
  const accept = useCallback((state) => {
    ref.current = state;
    if (alive.current) setData(state);
  }, []);
  const refresh = useCallback(async () => {
    if (pending.current) return;
    try {
      const result = await api("/api/state");
      if (alive.current && result.state.revision !== ref.current.revision)
        accept(result.state);
    } catch (e) {
      if (alive.current) setError(e.message);
    }
  }, [accept]);
  useEffect(() => {
    alive.current = true;
    const timer = setInterval(refresh, 2000);
    const focus = () => refresh();
    window.addEventListener("focus", focus);
    return () => {
      alive.current = false;
      clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, [refresh]);
  const mutate = (recipe) => {
    pending.current++;
    setSaving(true);
    setError("");
    const action = queue.current
      .catch(() => {})
      .then(async () => {
        const before = ref.current,
          next = structuredClone(before);
        recipe(next);
        const operations = statePatch(before, next);
        if (!operations.length) return;
        accept(next);
        try {
          const result = await api("/api/state", {
            method: "PATCH",
            body: { operations },
          });
          accept(result.state);
        } catch (e) {
          try {
            accept((await api("/api/state")).state);
          } catch {}
          setError(e.message);
          throw e;
        }
      })
      .finally(() => {
        pending.current--;
        if (alive.current) setSaving(pending.current > 0);
      });
    queue.current = action;
    action.catch(() => {});
    return action;
  };
  return {
    data,
    mutate,
    refresh,
    accept,
    saving,
    error,
    clearError: () => setError(""),
  };
}
