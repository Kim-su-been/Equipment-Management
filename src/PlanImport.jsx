import React, { useState } from "react";
import { api } from "./api.js";
import { parseBirth } from "./birth.js";
const emptyMapping = {
  sheetIndex: 0,
  headerRow: 1,
  company: 1,
  name: 2,
  birth: 3,
};
export default function PlanImport({
  Modal,
  initialProject,
  people = [],
  onClose,
  onComplete,
}) {
  const [project, setProject] = useState(initialProject),
    [upload, setUpload] = useState(null),
    [mapping, setMapping] = useState(emptyMapping),
    [rows, setRows] = useState(null),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [rowFilter, setRowFilter] = useState("all");
  async function run(fn) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const sheet = upload?.sheets.find(
    (s) => s.index === Number(mapping.sheetIndex),
  );
  function changeMap(key, value) {
    setMapping({ ...mapping, [key]: Number(value) });
    setRows(null);
    setConfirmed(false);
  }
  const selected = rows?.filter((r) => r.selected) || [];
  const serverMapping = {
    sheet: mapping.sheetIndex,
    headerRow: mapping.headerRow,
    columns: {
      company: mapping.company,
      name: mapping.name,
      birth: mapping.birth,
    },
  };
  return (
    <Modal
      title="인력계획서 불러오기"
      subtitle="원본 확인 → 열 매핑 → 행 검토 → 본인 등록 대기"
      wide
      onClose={onClose}
    >
      <div className="import-flow">
        <ol className="import-steps" aria-label="인력계획서 등록 단계">
          {["파일 선택", "추출 결과 확인", "등록"].map((label, i) => (
            <li
              key={label}
              className={(rows ? 2 : upload ? 1 : 0) === i ? "active" : ""}
              aria-current={
                (rows ? 2 : upload ? 1 : 0) === i ? "step" : undefined
              }
            >
              {i + 1}. {label}
            </li>
          ))}
        </ol>
        <div className="info-note">
          확정한 행만 저장합니다. 같은 이름만으로 기존 인원을 병합하지 않습니다.
          개인별 추가 정보는 초대 링크에서 입력합니다.
        </div>
        <div className="import-controls">
          <label>
            프로젝트
            <select
              aria-label="불러오기 프로젝트"
              disabled={busy || !!upload}
              value={project}
              onChange={(e) => setProject(e.target.value)}
            >
              <option>SFA</option>
              <option>그룹웨어</option>
            </select>
          </label>
          <label className="file-picker">
            .xlsx 인력계획서
            <input
              aria-label="인력계획서 파일"
              type="file"
              accept=".xlsx"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files[0];
                if (!file) return;
                run(async () => {
                  const result = await api(
                    `/api/imports?project=${encodeURIComponent(project)}`,
                    {
                      method: "POST",
                      body: file,
                      headers: { "X-File-Name": encodeURIComponent(file.name) },
                    },
                  );
                  setUpload(result);
                  setMapping({
                    sheetIndex: result.proposal.sheet ?? 0,
                    headerRow: result.proposal.headerRow ?? 1,
                    ...result.proposal.columns,
                  });
                  setRows(null);
                  setConfirmed(false);
                });
                e.target.value = "";
              }}
            />
          </label>
        </div>
        {upload && (
          <>
            <div className="mapping-notice" role="status">
              <strong>
                {upload.filename} {upload.reuploaded ? "· 이전 확정 파일" : ""}
              </strong>
              <p>{upload.proposal.notice}</p>
              <p>
                {globalThis.__READYBOARD_OFFLINE__
                  ? "HTML 시연은 브라우저에서 열 이름으로 매핑을 제안하며 외부 AI로 데이터를 전송하지 않습니다. 아래 값은 원본 셀에서 추출합니다."
                  : "AI에는 구조와 마스킹한 샘플만 전송하며, 아래 값은 원본 셀에서 추출합니다."}
              </p>
            </div>
            <div className="mapping-grid">
              <label>
                데이터 시트
                <select
                  aria-label="데이터 시트"
                  value={mapping.sheetIndex}
                  onChange={(e) => changeMap("sheetIndex", e.target.value)}
                >
                  {upload.sheets.map((s) => (
                    <option key={s.index} value={s.index}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                헤더 행
                <input
                  aria-label="헤더 행"
                  type="number"
                  min="1"
                  max="2000"
                  value={mapping.headerRow}
                  onChange={(e) => changeMap("headerRow", e.target.value)}
                />
              </label>
              {[
                ["company", "소속회사 열"],
                ["name", "이름 열"],
                ["birth", "생년월일 열"],
              ].map(([key, label]) => (
                <label key={key}>
                  {label}
                  <select
                    aria-label={label}
                    value={mapping[key] || ""}
                    onChange={(e) => changeMap(key, e.target.value)}
                  >
                    <option value="">직접 선택</option>
                    {Array.from({ length: sheet?.columns || 3 }, (_, i) => (
                      <option key={i} value={i + 1}>
                        {i + 1}열 ·{" "}
                        {String(
                          sheet?.rows.find(
                            (r) => r.row === Number(mapping.headerRow),
                          )?.cells[i] ?? "빈 헤더",
                        )}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <details className="source-preview">
              <summary>원본 시트 확인 (처음 12행)</summary>
              <div className="import-table-wrap">
                <table>
                  <tbody>
                    {sheet?.rows.slice(0, 12).map((r) => (
                      <tr key={r.row}>
                        <th>{r.row}행</th>
                        {r.cells.map((v, i) => (
                          <td key={i}>{String(v ?? "")}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
            <button
              className="btn primary"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const result = await api(
                    `/api/imports/${upload.id}/preview`,
                    { method: "POST", body: { mapping: serverMapping } },
                  );
                  setRows(
                    result.rows.map((r) => ({
                      ...r,
                      selected: r.review !== "오류",
                      reviewConfirmed: false,
                      personId: r.linkedPersonId || "",
                    })),
                  );
                  setConfirmed(false);
                })
              }
            >
              매핑 적용 · 미리보기
            </button>
          </>
        )}
        {rows && (
          <>
            <div className="section-heading">
              <h3>등록 미리보기 · {rows.length}행</h3>
              <span>{selected.length}행 선택</span>
            </div>
            <p className="muted">
              값을 수정하거나 제외할 수 있습니다. 생년만 있는 경우 월·일을
              만들지 않으며 본인 등록 시 확인합니다.
            </p>
            <div
              className="import-review-filters"
              role="group"
              aria-label="추출 행 검토 필터"
            >
              {[
                ["all", "전체"],
                ["error", "누락·오류"],
                ["duplicate", "중복 의심"],
                ["review", "확인 필요"],
                ["excluded", "제외됨"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  aria-pressed={rowFilter === id}
                  onClick={() => setRowFilter(id)}
                >
                  {label}{" "}
                  {
                    rows.filter(
                      (r) =>
                        id === "all" ||
                        (id === "error" && r.review === "오류") ||
                        (id === "duplicate" &&
                          (r.candidates.length || r.sameNameInFile)) ||
                        (id === "review" && r.review !== "정상") ||
                        (id === "excluded" && !r.selected),
                    ).length
                  }
                </button>
              ))}
            </div>
            <div className="import-table-wrap">
              <table className="import-table">
                <thead>
                  <tr>
                    <th>등록</th>
                    <th>원본 위치</th>
                    <th>소속회사</th>
                    <th>이름</th>
                    <th>생년월일 / 생년</th>
                    <th>검토 및 연결</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, index) => {
                    if (!(
                      rowFilter === "all" ||
                      (rowFilter === "error" && r.review === "오류") ||
                      (rowFilter === "duplicate" &&
                        (r.candidates.length || r.sameNameInFile)) ||
                      (rowFilter === "review" && r.review !== "정상") ||
                      (rowFilter === "excluded" && !r.selected)
                    ))
                      return null;
                    const update = (patch) =>
                      setRows((prev) =>
                        prev.map((v, i) => {
                          if (i !== index) return v;
                          const next = { ...v, ...patch },
                            birth = parseBirth(next.birthRaw),
                            issues = [];
                          if (!next.name.trim() || next.name.length > 80)
                            issues.push("이름을 확인해 주세요.");
                          if (!next.company.trim() || next.company.length > 100)
                            issues.push("소속회사를 확인해 주세요.");
                          return {
                            ...next,
                            ...birth,
                            review: issues.length ? "오류" : birth.review,
                            reason: issues.length
                              ? issues.join(" ")
                              : birth.reason,
                          };
                        }),
                      );
                    return (
                      <tr key={r.key} className={!r.selected ? "excluded" : ""}>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`${r.row}행 등록`}
                            checked={r.selected}
                            onChange={(e) =>
                              update({ selected: e.target.checked })
                            }
                          />
                        </td>
                        <td>
                          {r.sheet}
                          <br />
                          {r.row}행
                        </td>
                        <td>
                          <input
                            aria-label={`${r.row}행 회사`}
                            value={r.company}
                            onChange={(e) =>
                              update({ company: e.target.value })
                            }
                          />
                        </td>
                        <td>
                          <input
                            aria-label={`${r.row}행 이름`}
                            value={r.name}
                            onChange={(e) =>
                              update({
                                name: e.target.value,
                                candidates: people.filter(
                                  (p) =>
                                    p.project === project &&
                                    String(p.name)
                                      .replace(/[\s_\-()（）]/g, "")
                                      .toLowerCase() ===
                                      e.target.value
                                        .replace(/[\s_\-()（）]/g, "")
                                        .toLowerCase(),
                                ),
                                decision: "",
                                personId: "",
                              })
                            }
                          />
                        </td>
                        <td>
                          <input
                            aria-label={`${r.row}행 생년월일`}
                            value={String(r.birthRaw ?? "")}
                            onChange={(e) =>
                              update({
                                birthRaw: e.target.value,
                                ...parseBirth(e.target.value),
                                reviewConfirmed: false,
                              })
                            }
                          />
                          <small>
                            {r.birthPrecision === "year"
                              ? "생년만 있음 · 월/일 확인 필요"
                              : r.reason || r.review}
                          </small>
                        </td>
                        <td>
                          {r.linkedPersonId ? (
                            <strong className="success-text">
                              이미 확정됨 · 재사용
                            </strong>
                          ) : (
                            <>
                              <select
                                aria-label={`${r.row}행 등록 방식`}
                                value={r.decision}
                                onChange={(e) =>
                                  update({ decision: e.target.value })
                                }
                              >
                                <option value="">중복 의심 · 선택 필요</option>
                                <option value="new">
                                  신규 등록 (별도 인원)
                                </option>
                                {r.candidates.length > 0 && (
                                  <option value="existing">
                                    기존 인원 연결
                                  </option>
                                )}
                              </select>
                              {r.decision === "existing" && (
                                <select
                                  aria-label={`${r.row}행 기존 인원`}
                                  value={r.personId}
                                  onChange={(e) =>
                                    update({ personId: e.target.value })
                                  }
                                >
                                  <option value="">연결할 인원 선택</option>
                                  {r.candidates.map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.displayId} · {p.name} · {p.company} ·{" "}
                                      {p.birthDate ||
                                        p.birthYear ||
                                        "생년 미확인"}
                                    </option>
                                  ))}
                                </select>
                              )}
                              {(r.review !== "정상" || r.sameNameInFile) && (
                                <label className="review-confirm">
                                  <input
                                    type="checkbox"
                                    checked={r.reviewConfirmed}
                                    onChange={(e) =>
                                      update({
                                        reviewConfirmed: e.target.checked,
                                      })
                                    }
                                  />
                                  확인 필요 사항 검토함
                                </label>
                              )}
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <label className="review-confirm">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              시트·헤더·열 매핑과 선택한 행을 확인했습니다.
            </label>
            <div className="form-actions">
              <button className="btn" onClick={onClose}>
                취소
              </button>
              <button
                className="btn primary"
                disabled={busy || !confirmed || !selected.length}
                onClick={() =>
                  run(async () => {
                    const result = await api(
                      `/api/imports/${upload.id}/commit`,
                      {
                        method: "POST",
                        body: {
                          mapping: serverMapping,
                          mappingConfirmed: confirmed,
                          rows: selected,
                        },
                      },
                    );
                    onComplete(result.state);
                  })
                }
              >
                {busy ? "처리 중…" : `${selected.length}행 확정 · 저장`}
              </button>
            </div>
          </>
        )}
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        {busy && <p role="status">파일을 처리하고 있습니다…</p>}
      </div>
    </Modal>
  );
}
