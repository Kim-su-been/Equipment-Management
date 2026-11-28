import { useEffect, useState, useCallback } from "react";
import { api } from "./api.js";
import App from "./App.jsx";
import AccessPortal, { InvitePortal } from "./AccessPortal.jsx";
export default function AppRoot() {
  const [resource, setResource] = useState(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [invite, setInvite] = useState(
      () =>
        location.pathname.match(/^\/invite\/([A-Za-z0-9_-]+)$/)?.[1] || null,
    );
  const reload = useCallback(async () => {
    setError("");
    try {
      setResource(await api("/api/session"));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    reload();
    window.addEventListener("readyboard:session", reload);
    return () => window.removeEventListener("readyboard:session", reload);
  }, [reload]);
  const complete = (result) => {
    setInvite(null);
    setResource(result);
  };
  if (invite) return <InvitePortal token={invite} onComplete={complete} />;
  if (loading)
    return (
      <div className="access-loading">파트너360 서버에 연결하고 있습니다.</div>
    );
  if (!resource?.actor || error)
    return (
      <AccessPortal
        resource={resource}
        error={error}
        onReload={reload}
        onLogin={setResource}
      />
    );
  return (
    <App
      key={`${resource.actor.kind}-${resource.actor.personId || resource.actor.scope}`}
      initialState={resource.state}
      actor={resource.actor}
      onLogout={async () => {
        await api("/api/logout", { method: "POST" });
        setResource({ actor: null, loginOptions: ["PMO", "SFA", "그룹웨어"] });
      }}
    />
  );
}
