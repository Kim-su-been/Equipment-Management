import { DOCUMENT_LAYOUTS } from "./document-template-layouts.js";
const ASSETS = {
  O10: {
    pdfUrl: "/forms/security-pledge.pdf",
    imageUrl: "/forms/security-pledge.png",
  },
  O11: {
    pdfUrl: "/forms/privacy-consent.pdf",
    imageUrl: "/forms/privacy-consent.png",
  },
};
export function getDocumentTemplate(id) {
  return { ...DOCUMENT_LAYOUTS[id], ...ASSETS[id] };
}
export function fieldText(key, values, date) {
  if (key === "date") return date;
  if (key === "read" || key === "acknowledged") return values[key] ? "✓" : "";
  if (key === "consentAgree") return values.consent === "agree" ? "●" : "";
  if (key === "consentDisagree")
    return values.consent === "disagree" ? "●" : "";
  return values[key] || "";
}
export async function loadDocumentBackground(id) {
  const template = getDocumentTemplate(id);
  const response = await fetch(template.imageUrl);
  if (!response.ok)
    throw new Error("서약서 원본을 불러오지 못했습니다. 다시 시도해 주세요.");
  const blob = await response.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () =>
      reject(new Error("원본 이미지 읽기에 실패했습니다."));
    reader.readAsDataURL(blob);
  });
}
