import { api } from "./api.js";
export async function digestBlob(blob) {
  const hash = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(hash), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
export async function storeEvidence(blob, metadata = {}) {
  const record = await api(
    `/api/files?personId=${encodeURIComponent(metadata.personId)}&taskId=${encodeURIComponent(metadata.taskId)}`,
    {
      method: "POST",
      body: blob,
      headers: {
        "Content-Type": blob.type || "application/octet-stream",
        "X-File-Name": encodeURIComponent(metadata.name || "서류.html"),
      },
    },
  );
  return { ...metadata, ...record, blob };
}
export async function readEvidence(id) {
  const res = await fetch(`/api/files/${encodeURIComponent(id)}`, {
    credentials: "same-origin",
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.json();
    throw new Error(body.error || "서버 원본을 읽지 못했습니다.");
  }
  return {
    id,
    blob: await res.blob(),
    name: decodeURIComponent(res.headers.get("X-File-Name") || ""),
    personId: res.headers.get("X-Person-Id"),
    taskId: res.headers.get("X-Task-Id"),
    digest: res.headers.get("X-Digest"),
  };
}
export async function clearEvidence() {
  throw new Error("서버 원본은 브라우저에서 일괄 삭제하지 않습니다.");
}
