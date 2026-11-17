import { useState } from "react";
import { Download, FileText, History } from "lucide-react";
import { TASKS, STATUS, canManage } from "./data.js";
import { readEvidence, digestBlob } from "./evidence-store.js";
import { makeZip, safeFilename } from "./archive.js";

export function evidenceEntries(people, includeHistory = false) {
  return people.flatMap((p) =>
    ["O08", "O09", "O10", "O11"].flatMap((taskId) => {
      const latest = p.files[taskId];
      if (!latest) return [];
      const versions =
        includeHistory && p.fileHistory?.[taskId]?.length
          ? p.fileHistory[taskId]
          : includeHistory && p.submissions?.[taskId]?.length
            ? p.submissions[taskId].map((s) => ({
                ...s,
                name: s.filename,
                online: true,
              }))
            : [{ ...latest, version: latest.version || 1 }];
      return versions.map((file) => ({
        personId: p.id,
        project: p.project,
        person: p,
        taskId,
        file,
        key: file.storageId || `demo:${p.id}:${taskId}`,
        status: p.tasks[taskId],
      }));
    }),
  );
}
export async function downloadEvidenceArchive(
  data,
  scope,
  keys,
  includeHistory = false,
) {
  const allowed = data.people.filter((p) => canManage(scope, p));
  const entries = evidenceEntries(allowed, includeHistory);
  const unique = [...new Set(keys)];
  if (!unique.length || unique.length > 100)
    throw new Error("원본이 있는 파일을 1~100개 선택해 주세요.");
  const files = [],
    manifest = [];
  let size = 0;
  for (const key of unique) {
    const entry = entries.find((e) => e.key === key);
    if (!entry?.file.storageId)
      throw new Error("권한이 없거나 원본이 보관되지 않은 파일입니다.");
    const stored = await readEvidence(entry.file.storageId);
    if (
      !stored ||
      stored.personId !== entry.personId ||
      stored.taskId !== entry.taskId
    )
      throw new Error("제출 원본을 찾을 수 없습니다. 다시 제출해 주세요.");
    if ((await digestBlob(stored.blob)) !== entry.file.digest)
      throw new Error("원본 무결성 확인에 실패했습니다.");
    size += stored.blob.size;
    if (size > 200 * 1024 * 1024)
      throw new Error("한 번에 200MB 이하로 선택해 주세요.");
    const name = `${safeFilename(entry.project)}/${safeFilename(entry.personId)}_v${entry.file.version || 1}/${safeFilename(stored.name)}`;
    files.push({
      name,
      bytes: new Uint8Array(await stored.blob.arrayBuffer()),
    });
    manifest.push({
      project: entry.project,
      personId: entry.personId,
      name: entry.person.name,
      task: entry.taskId,
      taskTitle: TASKS.find((t) => t.id === entry.taskId).title,
      file: name,
      version: entry.file.version || 1,
      templateVersion: entry.file.templateVersion || null,
      submittedAt: entry.file.submittedAt || entry.file.date,
      digest: entry.file.digest,
      status: STATUS[entry.status]?.[0] || entry.status,
      verification: entry.file.online
        ? "시연 본인확인 · 실제 인증 미연동"
        : "외부 파일 업로드",
      reviewStateIsCurrent: true,
    });
  }
  files.push({
    name: "제출현황.json",
    bytes: new TextEncoder().encode(
      JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          scope,
          note: "검토 상태는 내보내기 시점의 현재 작업 상태입니다. 초기 가상 제출본은 원본이 없어 포함하지 않습니다.",
          files: manifest,
        },
        null,
        2,
      ),
    ),
  });
  return makeZip(files);
}
export default function EvidenceManager({
  data,
  scope,
  onDownload,
  onOpen,
  onNotify,
}) {
  const [type, setType] = useState("전체"),
    [project, setProject] = useState("전체"),
    [status, setStatus] = useState("전체"),
    [query, setQuery] = useState(""),
    [history, setHistory] = useState(false),
    [selection, setSelection] = useState([]),
    [busy, setBusy] = useState(false);
  const people = data.people.filter((p) => canManage(scope, p));
  const entries = evidenceEntries(people, history)
    .sort(
      (a, b) =>
        Number(!!b.file.storageId) - Number(!!a.file.storageId) ||
        String(b.file.submittedAt || b.file.date || "").localeCompare(
          String(a.file.submittedAt || a.file.date || ""),
        ),
    )
    .filter(
      (r) =>
        (type === "전체" || r.taskId === type) &&
        (project === "전체" || r.project === project) &&
        (status === "전체" || r.status === status) &&
        (!query ||
          `${r.person.name} ${r.personId} ${r.file.name}`
            .toLowerCase()
            .includes(query.toLowerCase())),
    );
  const available = entries.slice(0, 100).filter((r) => r.file.storageId),
    keys = selection.filter((key) => available.some((r) => r.key === key));
  const clear = () => setSelection([]);
  return (
    <section className="card evidence-manager">
      <div className="card-heading">
        <div>
          <h2>
            <FileText size={18} />
            제출 원본 보관함
          </h2>
          <p>
            온라인 서류와 업로드 원본을 버전별로 관리하고 ZIP으로 내려받습니다.
          </p>
        </div>
        <button
          className="btn primary"
          disabled={!keys.length || busy}
          onClick={async () => {
            setBusy(true);
            try {
              const blob = await downloadEvidenceArchive(
                data,
                scope,
                keys,
                history,
              );
              onDownload(blob, `레디보드_제출서류_${scope}.zip`);
              onNotify(`${keys.length}개 원본과 제출현황을 다운로드했습니다.`);
            } catch (e) {
              onNotify(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Download size={16} />
          {busy ? "묶는 중…" : `선택 다운로드 (${keys.length})`}
        </button>
      </div>
      <div className="evidence-filters">
        <input
          aria-label="원본 보관함 검색"
          value={query}
          placeholder="이름·인원 ID·파일명 검색"
          onChange={(e) => {
            setQuery(e.target.value);
            clear();
          }}
        />
        {scope === "PMO" && (
          <select
            aria-label="원본 프로젝트"
            value={project}
            onChange={(e) => {
              setProject(e.target.value);
              clear();
            }}
          >
            <option value="전체">전체 프로젝트</option>
            <option>SFA</option>
            <option>그룹웨어</option>
          </select>
        )}
        <select
          aria-label="원본 서류 종류"
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            clear();
          }}
        >
          <option value="전체">전체 서류·수료증</option>
          {["O08", "O09", "O10", "O11"].map((id) => (
            <option key={id} value={id}>
              {TASKS.find((t) => t.id === id).title}
            </option>
          ))}
        </select>
        <select
          aria-label="원본 처리 상태"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            clear();
          }}
        >
          <option value="전체">전체 상태</option>
          {["review", "done", "fix", "ai", "error"].map((s) => (
            <option key={s} value={s}>
              {STATUS[s][0]}
            </option>
          ))}
        </select>
        <label>
          <input
            type="checkbox"
            checked={history}
            onChange={(e) => {
              setHistory(e.target.checked);
              clear();
            }}
          />
          <History size={15} />
          이전 제출 버전 포함
        </label>
      </div>
      <div className="evidence-selection">
        <label>
          <input
            type="checkbox"
            aria-label="다운로드 가능한 원본 전체 선택"
            disabled={!available.length}
            checked={!!available.length && keys.length === available.length}
            onChange={(e) =>
              setSelection(e.target.checked ? available.map((r) => r.key) : [])
            }
          />
          원본 {available.length}개 선택 가능 ·{" "}
          {entries.length - available.length}개 가상 자료
        </label>
        <span>
          {globalThis.__READYBOARD_OFFLINE__
            ? "브라우저 원본 보관"
            : "서버 원본 보관"}
        </span>
      </div>
      <div className="evidence-list">
        {entries.slice(0, 100).map((r) => (
          <div className="evidence-row" key={r.key}>
            <input
              aria-label={`${r.personId} ${r.taskId} v${r.file.version || 1} 원본 선택`}
              type="checkbox"
              disabled={!r.file.storageId}
              checked={keys.includes(r.key)}
              onChange={(e) =>
                setSelection(
                  e.target.checked
                    ? [...keys, r.key]
                    : keys.filter((key) => key !== r.key),
                )
              }
            />
            <div>
              <strong>
                {r.person.name || r.personId} ·{" "}
                {TASKS.find((t) => t.id === r.taskId).title}
              </strong>
              <span>
                {r.project} · {r.personId} · v{r.file.version || 1} ·{" "}
                {r.file.name}
              </span>
            </div>
            <span
              className={`subtle-tag ${!r.file.storageId ? "unavailable" : ""}`}
            >
              {r.file.storageId
                ? r.file.online
                  ? "온라인 원본"
                  : "파일 원본"
                : "초기 가상 자료 · 원본 없음"}
            </span>
            <button
              className="text-link"
              onClick={() => onOpen(r.personId, r.taskId)}
            >
              검토 보기
            </button>
          </div>
        ))}
        {!entries.length && (
          <p className="empty">조건에 맞는 제출 원본이 없습니다.</p>
        )}
        {entries.length > 100 && (
          <p className="info-note">
            처음 100개를 표시합니다. 검색·필터로 범위를 좁혀 주세요.
          </p>
        )}
      </div>
    </section>
  );
}
