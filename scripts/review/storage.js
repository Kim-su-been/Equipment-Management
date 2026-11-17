const NAME = "readyboard-offline-v1";
const requestResult = (request) =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
export async function openLocalWorkspace() {
  try {
    const request = indexedDB.open(NAME, 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("workspace");
    const db = await requestResult(request);
    return {
      kind: "IndexedDB",
      read: () =>
        requestResult(
          db.transaction("workspace").objectStore("workspace").get("current"),
        ),
      write: (value) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction("workspace", "readwrite");
          tx.objectStore("workspace").put(value, "current");
          tx.oncomplete = resolve;
          tx.onerror = () =>
            reject(
              new Error(
                "브라우저 저장 공간이 부족하거나 저장이 제한되었습니다. 백업 후 공간을 확보해 주세요.",
              ),
            );
          tx.onabort = () =>
            reject(
              new Error(
                "브라우저 저장을 완료하지 못했습니다. 변경사항은 반영하지 않았습니다.",
              ),
            );
        }),
    };
  } catch {
    return { kind: "memory", read: async () => null, write: async () => {} };
  }
}
export async function packBackup(value) {
  if (value instanceof Blob) {
    const bytes = new Uint8Array(await value.arrayBuffer());
    let text = "";
    for (let i = 0; i < bytes.length; i += 16384)
      text += String.fromCharCode(...bytes.subarray(i, i + 16384));
    return { __readyboardType: "blob", mime: value.type, data: btoa(text) };
  }
  if (value instanceof Date)
    return { __readyboardType: "date", value: value.toISOString() };
  if (Array.isArray(value)) return Promise.all(value.map(packBackup));
  if (value && typeof value === "object") {
    const entries = await Promise.all(
      Object.entries(value).map(async ([k, v]) => [k, await packBackup(v)]),
    );
    return Object.fromEntries(entries);
  }
  return value;
}
export function unpackBackup(value) {
  if (value?.__readyboardType === "blob")
    return new Blob(
      [Uint8Array.from(atob(value.data), (c) => c.charCodeAt(0))],
      { type: value.mime },
    );
  if (value?.__readyboardType === "date") return new Date(value.value);
  if (Array.isArray(value)) return value.map(unpackBackup);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([k]) => !["__proto__", "constructor", "prototype"].includes(k))
        .map(([k, v]) => [k, unpackBackup(v)]),
    );
  return value;
}
