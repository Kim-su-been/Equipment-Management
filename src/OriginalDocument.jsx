import { useState } from "react";
import { Download, ZoomIn } from "lucide-react";
import { getDocumentTemplate, fieldText } from "./document-templates.js";
import { todayLocal } from "./onboarding.js";
const labels = {
  phone: "연락처 *",
  signature: "본인 입력 서명 *",
  read: "위 중요 조항을 모두 읽었습니다. *",
  acknowledged: "작성 내용과 확인 항목을 검토했습니다. *",
  consentAgree: "동의함",
  consentDisagree: "동의하지 않음",
};
const sections = {
  phone: "profile",
  read: "clauses",
  acknowledged: "clauses",
  consentAgree: "clauses",
  consentDisagree: "clauses",
  signature: "signature",
};
export default function OriginalDocument({
  id,
  values,
  editable,
  active,
  onChange,
  onActive,
  rootRef,
  date,
  lockedPhone = false,
}) {
  const template = getDocumentTemplate(id),
    [zoom, setZoom] = useState(100);
  const [failed, setFailed] = useState(false);
  return (
    <div className="original-document" ref={rootRef}>
      <div className="original-document-tools">
        <span>일반형 예시 원본 · A4 1장</span>
        <label>
          <ZoomIn size={15} />
          <select
            aria-label="서약서 확대"
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          >
            {[100, 125, 150, 175].map((value) => (
              <option key={value} value={value}>
                {value}%
              </option>
            ))}
          </select>
        </label>
        <a
          href={template.pdfUrl}
          download={`레디보드_${template.title}_원본예시.pdf`}
        >
          <Download size={14} />
          원본 PDF
        </a>
      </div>
      {failed && (
        <p className="notice error" role="alert">
          원본 미리보기를 불러오지 못했습니다. 원본 PDF로 내용을 확인하고 다시
          열어 주세요.
        </p>
      )}
      <div className="original-document-scroll">
        <div
          className="original-document-page"
          style={{
            width: `${zoom}%`,
            aspectRatio: `${template.width}/${template.height}`,
          }}
        >
          <img
            className="original-document-image"
            src={template.imageUrl}
            alt={`${template.title} 일반형 예시 원본`}
            onError={() => setFailed(true)}
          />
          {Object.entries(template.fields).map(([key, rect]) => {
            const entry =
              editable && key in labels && !(key === "phone" && lockedPhone);
            const value = fieldText(key, values, date || todayLocal());
            const style = {
              left: `${rect.x}%`,
              top: `${rect.y}%`,
              width: `${rect.w}%`,
              height: `${rect.h}%`,
            };
            if (!entry)
              return (
                <span
                  key={key}
                  className={`original-prefill ${["read", "acknowledged", "consentAgree", "consentDisagree"].includes(key) ? "check-value" : ""}`}
                  style={style}
                  aria-label={`자동 입력 ${key}`}
                  data-field={key}
                  title={value}
                >
                  {value}
                </span>
              );
            const check = ["read", "acknowledged"].includes(key),
              radio = key.startsWith("consent");
            return (
              <span
                key={key}
                className={`original-entry ${active === sections[key] ? "current" : ""} ${check || radio ? "check-entry" : ""}`}
                data-input-field={key}
                style={style}
              >
                {check || radio ? (
                  <input
                    aria-label={labels[key]}
                    name={radio ? "consent" : key}
                    type={radio ? "radio" : "checkbox"}
                    checked={
                      radio
                        ? values.consent ===
                          (key === "consentAgree" ? "agree" : "disagree")
                        : !!values[key]
                    }
                    onFocus={() => onActive(sections[key])}
                    onChange={(e) =>
                      onChange(
                        radio ? "consent" : key,
                        radio
                          ? key === "consentAgree"
                            ? "agree"
                            : "disagree"
                          : e.target.checked,
                      )
                    }
                  />
                ) : (
                  <input
                    aria-label={labels[key]}
                    name={key}
                    type={key === "phone" ? "tel" : "text"}
                    value={values[key]}
                    maxLength={key === "phone" ? 20 : 80}
                    placeholder={
                      key === "signature" ? "성명 입력" : "연락처 입력"
                    }
                    onFocus={() => onActive(sections[key])}
                    onChange={(e) => onChange(key, e.target.value)}
                  />
                )}
              </span>
            );
          })}
        </div>
      </div>
      <details className="original-document-text">
        <summary>원문 내용 텍스트로 확인</summary>
        {template.clauses.map((text) => (
          <p key={text}>{text}</p>
        ))}
      </details>
    </div>
  );
}
