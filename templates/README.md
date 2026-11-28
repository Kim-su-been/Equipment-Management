# 파트너360 일반형 예시 양식

사용자가 별도 사내 원본 없이 일반적인 양식을 요청하여, 프로젝트 참여자용 보안서약서와 개인정보 수집·이용 동의서 예시를 구성했습니다. 특정 기관의 공식 배포 양식이나 법률 검토 완료 서식이 아닙니다.

- PDF 원본: `public/forms/security-pledge.pdf`, `public/forms/privacy-consent.pdf`
- 원본 렌더링 PNG: 같은 경로의 `.png` 파일. 수행사 화면은 이 미리보기를 원본 비율 그대로 표시합니다.
- 입력 위치·원본 해시: `src/document-template-layouts.js`
- 작성 UI: `src/OriginalDocument.jsx`
- 원본 내용과 레이아웃의 기준: `scripts/build-document-templates.mjs`

`npm run build:forms`는 HTML 원형, PDF, PNG와 필드 좌표를 함께 생성합니다. 개발 환경의 Playwright·Chromium과 Poppler(`pdfinfo`, `pdftoppm`)가 필요합니다. `templates/*.html`은 생성 결과입니다. 사용자는 별도 도구 없이 배포된 HTML/ZIP을 열 수 있습니다.

원본 PDF를 실제로 렌더링하여 미리보기를 생성하고, 동일한 원형의 필드 좌표를 사용하므로 원본과 입력 위치를 따로 맞추지 않습니다. 재생성 시 PDF 해시와 좌표도 함께 갱신하고 화면·제출 검증을 다시 확인하세요.

양식에는 이메일·업무 역할을 요구하지 않습니다. 개인정보 동의 거부도 선택할 수 있으며, 동의 여부와 제출 내용의 최종 확인은 담당자가 수행합니다. 시연 본인확인 절차를 실제 본인인증 또는 전자서명으로 표시하지 않습니다.
