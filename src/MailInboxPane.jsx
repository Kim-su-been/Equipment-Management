import React, { useEffect, useState } from "react";
import { Mail, ArrowRight } from "lucide-react";
import { api } from "./api.js";
const time = (v) =>
  new Date(v).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
export default function MailInboxPane({ inbox, onReview }) {
  const [selected, setSelected] = useState(null),
    [body, setBody] = useState(null),
    [error, setError] = useState("");
  const messages = inbox?.messages || [];
  useEffect(() => {
    if (!selected && messages.length) setSelected(messages[0].id);
  }, [messages, selected]);
  useEffect(() => {
    let active = true;
    setBody(null);
    setError("");
    if (selected)
      api(`/api/mail/messages/${selected}`)
        .then((r) => {
          if (active) setBody(r.message);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [selected, messages.find((m) => m.id === selected)?.analysisState]);
  const requests =
    inbox?.requests.filter((r) => r.messageId === selected) || [];
  return (
    <section className="card inbox-layout">
      <div className="inbox-list" aria-label="받은 메일 목록">
        <div className="inbox-list-heading">
          받은 메일 <b>{messages.length}</b>
        </div>
        {!messages.length && (
          <div className="empty">
            <Mail size={32} />
            <h3>받은 메일이 없습니다</h3>
            <p>새 메일 확인을 눌러 메일을 가져오세요.</p>
          </div>
        )}
        {messages.map((m) => {
          const pending = inbox.requests.some(
            (r) => r.messageId === m.id && r.status === "pending",
          );
          return (
            <button
              key={m.id}
              data-inbox-message={m.id}
              aria-pressed={selected === m.id}
              className={`inbox-item ${selected === m.id ? "selected" : ""}`}
              onClick={() => setSelected(m.id)}
            >
              <span className="inbox-item-meta">
                <b>{m.from || "발신자 정보 없음"}</b>
                <time>{time(m.receivedAt)}</time>
              </span>
              <strong>{m.subject}</strong>
              <span className="inbox-preview">{m.preview}</span>
              <span>
                {pending ? (
                  <em className="mail-status pending">검토 필요</em>
                ) : m.analysisState === "pending" ? (
                  <em className="mail-status">분석 대기</em>
                ) : m.analysisState === "error" ? (
                  <em className="mail-needs-review">분석 실패 · 재시도 필요</em>
                ) : m.requestCount > 0 ? (
                  <em className="mail-status applied">요청 검토함 보관</em>
                ) : (
                  <span className="inbox-ordinary">일반 메일</span>
                )}
              </span>
            </button>
          );
        })}
      </div>
      <article className="inbox-body" aria-label="메일 본문">
        {error ? (
          <p role="alert">{error}</p>
        ) : body ? (
          <>
            <span className="mail-origin">
              {body.source === "mock" ? "가상 메일" : "연결된 메일함"}
            </span>
            <h2>{body.subject}</h2>
            <p className="inbox-from">
              {body.from}
              <br />
              {time(body.receivedAt)}
            </p>
            <pre>{body.latestBody}</pre>
            {body.quotedBody && (
              <details>
                <summary>이전 인용문</summary>
                <pre>{body.quotedBody}</pre>
              </details>
            )}
            {requests.length > 0 && (
              <button
                className="btn primary"
                onClick={() => onReview(requests.map((r) => r.id))}
              >
                AI 검토 열기 <ArrowRight size={16} />
              </button>
            )}
            <p className="inbox-analysis-note">
              {body.analysisNotice ||
                (body.analysisState === "pending"
                  ? "새 메일 분석 대기 중입니다."
                  : "")}
            </p>
          </>
        ) : (
          <div className="empty">
            <Mail size={36} />
            <p>
              {selected
                ? "본문을 불러오는 중…"
                : "메일을 선택하면 전체 본문이 표시됩니다."}
            </p>
          </div>
        )}
      </article>
    </section>
  );
}
