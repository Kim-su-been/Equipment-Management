import { useState, useEffect } from "react";
import {
  Building2,
  UserRound,
  ArrowRight,
  ShieldCheck,
  Link2,
  RefreshCw,
} from "lucide-react";
import { api } from "./api.js";
import BrandCharacters from "./BrandCharacters.jsx";
import SelfRegistration from "./SelfRegistration.jsx";
export function ContinueRegistration({ onClose }) {
  const [link, setLink] = useState(""),
    [error, setError] = useState("");
  return (
    <div className="access-continue">
      <h2>내 등록 이어하기</h2>
      <p>
        PMO 또는 수행사 담당자에게 받은 개인 초대 링크로 등록을 시작해 주세요.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          try {
            const url = new URL(link, location.origin);
            if (
              url.origin !== location.origin ||
              !/^\/invite\/[A-Za-z0-9_-]{40,60}$/.test(url.pathname)
            )
              throw new Error(
                "현재 서비스에서 발급한 개인 링크를 입력해 주세요.",
              );
            location.assign(url.pathname);
          } catch (e) {
            setError(e.message);
          }
        }}
      >
        <label className="field">
          <span>개인 초대 링크</span>
          <input
            required
            type="text"
            value={link}
            placeholder="https://서비스주소/invite/..."
            onChange={(e) => setLink(e.target.value)}
          />
        </label>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        <button className="btn primary">
          <Link2 size={16} />
          초대 링크 열기
        </button>
        {onClose && (
          <button className="btn" type="button" onClick={onClose}>
            닫기
          </button>
        )}
      </form>
      <p className="info-note">
        링크가 없거나 기본 정보가 다르면 PMO에 문의해 주세요. 이 화면에서 새
        인원을 직접 만들지 않습니다.
      </p>
    </div>
  );
}
export default function AccessPortal({ resource, onLogin, onReload, error }) {
  const [role, setRole] = useState(resource?.loginOptions?.[0] || "PMO"),
    [password, setPassword] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState("admin");
  return (
    <main className="access-page">
      <section className="access-brand">
        <span className="eyebrow">READYBOARD</span>
        <h1>레디보드</h1>
        <h2>
          사람과 프로젝트의
          <br />
          준비를 연결합니다.
        </h2>
        <p>
          인력계획서부터 개인 초대와 투입 준비까지, 같은 기록으로 이어갑니다.
        </p>
        <BrandCharacters label="프로젝트의 시작을 응원하는 캐릭터들" />
      </section>
      <section className="access-panel">
        <div className="tabs">
          <button
            className={tab === "admin" ? "active" : ""}
            onClick={() => setTab("admin")}
          >
            <Building2 size={16} />
            주관사 로그인
          </button>
          <button
            className={tab === "member" ? "active" : ""}
            onClick={() => setTab("member")}
          >
            <UserRound size={16} />내 등록 이어하기
          </button>
        </div>
        {error ? (
          <div className="notice error">
            <div>
              <strong>서버 연결이 필요합니다.</strong>
              <p>{error}</p>
              <p>
                프로젝트 폴더에서 환경변수를 설정하고 npm run dev 또는 npm
                start로 실행해 주세요. HTML 파일만으로 서버 등록을 진행할 수
                없습니다.
              </p>
              <button className="btn" onClick={onReload}>
                <RefreshCw size={15} />
                다시 연결
              </button>
            </div>
          </div>
        ) : tab === "member" ? (
          <ContinueRegistration />
        ) : (
          <>
            <h2>주관사 워크스페이스</h2>
            <p>권한이 있는 프로젝트의 명단과 준비 상태를 관리합니다.</p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setMessage("");
                try {
                  onLogin(
                    await api("/api/admin/login", {
                      method: "POST",
                      body: { scope: role, password },
                    }),
                  );
                } catch (e) {
                  setMessage(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label className="field">
                <span>관리 역할</span>
                <select
                  aria-label="로그인 역할"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                >
                  {(resource?.loginOptions || ["PMO"]).map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>관리자 비밀번호</span>
                <input
                  required
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              {message && (
                <p className="notice error" role="alert">
                  {message}
                </p>
              )}
              <button className="btn primary" disabled={busy}>
                {busy ? "확인 중…" : "로그인"}
                <ArrowRight size={16} />
              </button>
            </form>
            <div className="info-note">
              <ShieldCheck size={17} />
              서버에서 역할과 프로젝트 범위를 확인합니다.
            </div>
          </>
        )}
      </section>
    </main>
  );
}
export function InvitePortal({ token, onComplete }) {
  const [person, setPerson] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(true);
  useEffect(() => {
    let alive = true;
    api(`/api/invites/${encodeURIComponent(token)}`)
      .then((result) => {
        if (alive) setPerson(result.person);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setBusy(false);
      });
    return () => {
      alive = false;
    };
  }, [token]);
  return (
    <main className="invitation-page">
      <header>
        <span className="invitation-logo">R</span>
        <strong>레디보드</strong>
        <span>개인 초대 등록</span>
      </header>
      {busy ? (
        <section className="card access-loading">
          초대 링크를 확인하고 있습니다.
        </section>
      ) : error ? (
        <section className="card invitation-error">
          <ShieldCheck size={36} />
          <h1>등록 링크를 확인해 주세요</h1>
          <p role="alert">{error}</p>
          <p>링크를 전달한 PMO 또는 수행사 담당자에게 문의해 주세요.</p>
          <a className="btn primary" href="/">
            내 등록 이어하기 / 로그인
          </a>
        </section>
      ) : (
        <SelfRegistration
          person={person}
          onComplete={onComplete}
          token={token}
        />
      )}
    </main>
  );
}
