const DATABASE = "tuip-on-evidence-v1";
const STORE = "files";
function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore(STORE, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        new Error(
          "원본 보관 공간을 열지 못했습니다. 브라우저 저장 권한을 확인해 주세요.",
        ),
      );
  });
}
export async function digestBlob(blob) {
  const hash = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
export async function storeEvidence(blob, metadata = {}) {
  const record = {
    ...metadata,
    id: crypto.randomUUID(),
    blob,
    digest: await digestBlob(blob),
    savedAt: new Date().toISOString(),
  };
  const db = await openDatabase();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(record);
      tx.oncomplete = resolve;
      tx.onabort = tx.onerror = () =>
        reject(
          new Error(
            "원본 저장에 실패했습니다. 저장 공간을 확인한 뒤 다시 제출해 주세요.",
          ),
        );
    });
  } finally {
    db.close();
  }
  return record;
}
export async function readEvidence(id) {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly"),
        request = tx.objectStore(STORE).get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(new Error("제출 원본을 읽지 못했습니다."));
    });
  } finally {
    db.close();
  }
}
export async function clearEvidence() {
  const db = await openDatabase();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      tx.oncomplete = resolve;
      tx.onabort = tx.onerror = reject;
    });
  } finally {
    db.close();
  }
}
