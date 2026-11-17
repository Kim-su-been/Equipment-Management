export async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body && !(options.body instanceof Blob)
        ? { "Content-Type": "application/json" }
        : {}),
      ...options.headers,
    },
    body:
      options.body &&
      !(options.body instanceof Blob) &&
      typeof options.body !== "string"
        ? JSON.stringify(options.body)
        : options.body,
  });
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(
      "서버 응답을 확인할 수 없습니다. 레디보드 서버를 실행해 주세요.",
    );
  }
  if (!response.ok) {
    const error = new Error(result.error || "요청을 처리하지 못했습니다.");
    error.status = response.status;
    throw error;
  }
  return result;
}
export const refreshSession = () =>
  window.dispatchEvent(new Event("readyboard:session"));
