import React, { useEffect, useState } from "react";
import { api } from "./api.js";
export default function InvitationManager({
  Modal,
  people,
  personId,
  personIds,
  onClose,
}) {
  const [links, setLinks] = useState({}),
    [company, setCompany] = useState("전체 수행사"),
    [busy, setBusy] = useState(""),
    [message, setMessage] = useState("");
  const pending = people.filter(
    (p) =>
      p.registrationStatus === "pending_registration" &&
      (!personId || p.id === personId) &&
      (!personIds || personIds.includes(p.id)),
  );
  useEffect(() => {
    let active = true;
    Promise.all(
      pending.map(async (p) => [
        p.id,
        await api(`/api/people/${p.id}/invitation`),
      ]),
    )
      .then((items) => active && setLinks(Object.fromEntries(items)))
      .catch((e) => setMessage(e.message));
    return () => {
      active = false;
    };
  }, []);
  async function issue(p, reissue = false) {
    setBusy(p.id);
    setMessage("");
    try {
      const link = await api(`/api/people/${p.id}/invitation`, {
        method: "POST",
        body: { reissue },
      });
      setLinks((prev) => ({ ...prev, [p.id]: link }));
      setMessage(
        reissue
          ? "새 링크를 발급했습니다. 이전 링크는 종료되었습니다."
          : "초대 링크를 생성했습니다.",
      );
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy("");
    }
  }
  async function copy(value) {
    try {
      await navigator.clipboard.writeText(value);
      setMessage("복사했습니다. 메일 또는 메신저로 전달해 주세요.");
    } catch {
      setMessage("링크 입력란을 선택해 직접 복사해 주세요.");
    }
  }
  const visible = pending.filter(
    (p) => company === "전체 수행사" || p.company === company,
  );
  return (
    <Modal
      title="개인별 초대 링크"
      subtitle="수행사 담당자에게 소속 인원의 이름과 링크를 전달하세요."
      wide
      onClose={onClose}
    >
      <div className="invite-manager">
        <div className="info-note">
          개인 이메일 없이 전달할 수 있습니다. 링크는 한 명에게만 연결되며, 등록
          완료·재발급·유효기간 경과 시 사용할 수 없습니다. 링크 소지 여부로 등록
          권한을 확인하므로 본인에게만 전달해 주세요.
        </div>
        <div className="import-controls">
          <label>
            수행사별 보기
            <select
              aria-label="초대 수행사"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            >
              <option>전체 수행사</option>
              {[...new Set(pending.map((p) => p.company))].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <button
            className="btn"
            disabled={!visible.some((p) => links[p.id]?.url)}
            onClick={() =>
              copy(
                visible
                  .filter((p) => links[p.id]?.url)
                  .map(
                    (p) =>
                      `${p.company} / ${p.name} (${p.project} · ${p.displayId})\n${links[p.id].url}`,
                  )
                  .join("\n\n"),
              )
            }
          >
            보이는 이름·링크 일괄 복사
          </button>
        </div>
        {visible.length === 0 && (
          <p className="empty">본인 등록 대기 인원이 없습니다.</p>
        )}
        {visible.map((p) => (
          <section className="invitation-card" key={p.id}>
            <div>
              <h3>
                {p.name}{" "}
                <small>
                  {p.project} · {p.displayId}
                </small>
              </h3>
              <p>
                {p.company} ·{" "}
                {p.birthDate ||
                  (p.birthYear
                    ? `${p.birthYear}년 · 월/일 확인 필요`
                    : "생년월일 확인 필요")}{" "}
                · 본인 등록 대기
              </p>
            </div>
            <div className="invitation-actions">
              <button
                className="btn primary"
                disabled={busy === p.id}
                onClick={() => issue(p)}
              >
                {links[p.id]?.status === "active"
                  ? "현재 링크 확인"
                  : "초대 링크 생성"}
              </button>
              <button
                className="btn"
                disabled={
                  busy === p.id || !links[p.id] || links[p.id].status === "none"
                }
                onClick={() => issue(p, true)}
              >
                재발급
              </button>
            </div>
            {links[p.id]?.url && (
              <>
                <input
                  aria-label={`${p.name} 초대 링크`}
                  readOnly
                  value={links[p.id].url}
                  onFocus={(e) => e.target.select()}
                />
                <button className="btn" onClick={() => copy(links[p.id].url)}>
                  링크 복사
                </button>
              </>
            )}
            {links[p.id]?.expiresAt && (
              <small>
                유효기간:{" "}
                {new Date(links[p.id].expiresAt).toLocaleString("ko-KR")}{" "}
                {links[p.id].status === "expired" ? "· 만료됨" : ""}
              </small>
            )}
          </section>
        ))}
        {message && (
          <div className="info-note" role="status">
            {message}
          </div>
        )}
      </div>
    </Modal>
  );
}
