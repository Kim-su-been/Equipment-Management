import { chromium } from "playwright-core";
import { mkdir, writeFile, readFile, chmod } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
const documents = [
  {
    id: "O10",
    slug: "security-pledge",
    title: "보 안 서 약 서",
    code: "RB-SEC-01",
    intro:
      "본인은 아래 프로젝트에 참여함에 있어 업무상 알게 된 정보를 보호하고 다음 사항을 성실히 준수할 것을 서약합니다.",
    clauses: [
      [
        "비밀정보의 보호",
        "프로젝트 수행 중 알게 된 업무자료, 시스템 정보, 소스코드 및 개인정보 등 비공개 정보를 승인 없이 외부에 공개하거나 제공하지 않겠습니다.",
      ],
      [
        "목적 외 사용 금지",
        "업무자료와 개인정보는 허가된 업무 목적과 범위에서만 사용하며, 사적 이용·무단 복제·외부 저장을 하지 않겠습니다.",
      ],
      [
        "계정 및 접근권한 관리",
        "본인에게 부여된 계정과 접근권한을 다른 사람에게 공유하거나 양도하지 않고, 정해진 보안 절차를 준수하겠습니다.",
      ],
      [
        "보안사고의 보고",
        "자료 유출·분실 또는 보안사고의 징후를 발견하면 지체 없이 프로젝트 담당자에게 알리고 필요한 조치에 협조하겠습니다.",
      ],
      [
        "자료 반납 및 삭제",
        "참여 종료 또는 담당자의 요청 시 지급받은 자료·장비·접근수단을 반납하고, 승인된 보관 기준에 따라 업무자료를 정리하겠습니다.",
      ],
      [
        "의무의 지속",
        "프로젝트 참여 종료 이후에도 관련 법령과 계약에서 정한 비밀유지 의무를 준수하겠습니다.",
      ],
    ],
  },
  {
    id: "O11",
    slug: "privacy-consent",
    title: "개인정보 수집·이용 동의서",
    code: "RB-PRI-01",
    intro:
      "프로젝트 인력 투입과 업무 준비를 위하여 아래와 같이 개인정보를 수집·이용하고자 합니다. 안내 내용을 확인한 뒤 동의 여부를 표시해 주시기 바랍니다.",
    clauses: [
      [
        "수집·이용 목적",
        "프로젝트 참여 인원 확인, 교육 이수 및 서류 제출 관리, 계정·출입 준비와 관련 안내",
      ],
      [
        "수집 항목",
        "성명, 소속 수행사, 소속 프로젝트, 업무용 연락처, 투입 예정 시작일 및 종료일",
      ],
      [
        "보유·이용 기간",
        "본 예시는 운영 전 검토용 양식입니다. 실제 보유기간과 파기 기준은 주관사의 운영 정책에 따라 확정하여 고지해야 합니다.",
      ],
      [
        "동의 거부에 관한 안내",
        "개인정보 수집·이용에 동의하지 않을 수 있으며, 거부 시 필요한 후속 절차와 업무 준비 가능 범위를 담당자가 안내합니다.",
      ],
    ],
  },
];
const css = `@page{size:A4;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;background:white}body{font-family:'Noto Sans CJK KR','Malgun Gothic',sans-serif;font-size:13px;color:#172d3c}.sheet{width:210mm;height:297mm;padding:52px 59px;position:relative;overflow:hidden}.code{font-size:10px;color:#5b7180;letter-spacing:1px}.title{text-align:center;font-size:27px;letter-spacing:2px;margin:24px 0 8px;font-weight:700}.subtitle{text-align:center;font-size:12px;color:#576774;margin-bottom:23px}.intro{font-size:13px;line-height:1.9;margin:0 0 20px}table{border-collapse:collapse;width:100%;font-size:13px}th,td{border:1px solid #8b9eac;padding:7px 9px;vertical-align:middle}th{background:#f0f3f5;width:94px;font-weight:600;white-space:nowrap}td{width:240px}.slot{display:inline-block;height:28px;vertical-align:middle;width:100%;position:relative}.period{display:flex;align-items:center;gap:12px}.period .slot{width:190px}.clauses{margin-top:21px}.clauses h2{font-size:14px;border-bottom:1px solid #9eafb9;padding-bottom:9px;margin:0 0 11px}.clause{font-size:12.5px;line-height:1.85;margin:0 0 9px}.clause strong{font-size:12.5px}.confirm{display:flex;align-items:center;gap:9px;font-size:12.5px;line-height:1.8;margin-top:14px}.check{width:17px;height:17px;display:inline-block;border:1px solid #748895;flex-shrink:0}.options{margin:18px 0;padding:13px;border:1px solid #9eafb9}.options .choice{display:inline-flex;gap:8px;align-items:center;margin-right:32px;font-size:13px}.options .check{border-radius:50%}.sign-area{margin-top:26px;text-align:right}.sign-date{display:flex;align-items:center;gap:10px;justify-content:flex-end;font-size:13px;margin-bottom:10px}.sign-date .slot{width:155px}.sign-line{display:flex;align-items:center;justify-content:flex-end;gap:13px;font-size:14px}.sign-line .slot{width:225px;height:35px;border-bottom:1px solid #8b9eac}.footer{position:absolute;bottom:36px;left:59px;right:59px;font-size:9.5px;color:#657886;border-top:1px solid #bcc9d2;padding-top:10px;line-height:1.8}.page-number{position:absolute;bottom:17px;left:0;right:0;text-align:center;font-size:9px;color:#7e8e98}`;
const slot = (key) => `<span class="slot" data-field="${key}"></span>`;
const layouts = {};
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
try {
  await mkdir(path.join(root, "public/forms"), { recursive: true });
  for (const document of documents) {
    const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><title>${document.title}</title><style>${css}</style><body><article class="sheet"><div class="code">${document.code} · 일반형 예시 v1.0</div><h1 class="title">${document.title}</h1><div class="subtitle">프로젝트 참여자용</div><p class="intro">${document.intro}</p><table><tr><th>성명</th><td>${slot("name")}</td><th>소속 수행사</th><td>${slot("company")}</td></tr><tr><th>프로젝트</th><td>${slot("project")}</td><th>연락처</th><td>${slot("phone")}</td></tr><tr><th>투입 예정 기간</th><td colspan="3"><div class="period">${slot("start")}<span>~</span>${slot("end")}</div></td></tr></table><section class="clauses"><h2>${document.id === "O10" ? "보안 준수 사항" : "개인정보 수집·이용 안내"}</h2>${document.clauses.map(([title, text], i) => `<p class="clause"><strong>${i + 1}. ${title}</strong><br>${text}</p>`).join("")}</section><div class="confirm"><span class="check" data-field="read"></span><span>위 중요 조항을 모두 읽었습니다.</span></div>${document.id === "O11" ? `<div class="options"><span class="choice"><span class="check" data-field="consentAgree"></span>동의함</span><span class="choice"><span class="check" data-field="consentDisagree"></span>동의하지 않음</span></div>` : ""}<div class="confirm"><span class="check" data-field="acknowledged"></span><span>본인이 직접 작성했으며 기재한 내용과 확인 항목을 검토했습니다.</span></div><div class="sign-area"><div class="sign-date">작성일 ${slot("date")}</div><div class="sign-line">서약인 ${slot("signature")}<span>(서명)</span></div></div><div class="footer">일반적인 프로젝트 서류 구성을 참고한 예시 양식입니다. 특정 기관의 공식 배포본이나 법률 검토를 완료한 서식이 아닙니다.<br>실제 운영 시 주관사의 양식·처리 기준을 확인하여 사용해 주세요.</div><div class="page-number">1 / 1</div></article></body></html>`;
    await writeFile(path.join(root, `templates/${document.slug}.html`), html);
    const page = await browser.newPage({
      viewport: { width: 794, height: 1123 },
    });
    await page.setContent(html, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    const geometry = await page.evaluate(() => {
      const sheet = document.querySelector(".sheet"),
        s = sheet.getBoundingClientRect();
      return Object.fromEntries(
        [...sheet.querySelectorAll("[data-field]")].map((el) => {
          const r = el.getBoundingClientRect();
          return [
            el.dataset.field,
            {
              x: ((r.x - s.x) / s.width) * 100,
              y: ((r.y - s.y) / s.height) * 100,
              w: (r.width / s.width) * 100,
              h: (r.height / s.height) * 100,
            },
          ];
        }),
      );
    });
    const pdf = path.join(root, `public/forms/${document.slug}.pdf`);
    await page.pdf({
      path: pdf,
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
    });
    await page.close();
    const info = execFileSync("pdfinfo", [pdf], { encoding: "utf8" });
    if (!/Pages:\s+1\b/.test(info))
      throw new Error(`${document.slug}: expected one PDF page`);
    execFileSync("pdftoppm", [
      "-png",
      "-singlefile",
      "-scale-to",
      "1600",
      pdf,
      path.join(root, `public/forms/${document.slug}`),
    ]);
    await chmod(pdf, 0o644);
    await chmod(path.join(root, `public/forms/${document.slug}.png`), 0o644);
    layouts[document.id] = {
      id: document.id,
      slug: document.slug,
      title: document.title.replaceAll(" ", ""),
      version: "1.0",
      width: 794,
      height: 1123,
      digest: createHash("sha256")
        .update(await readFile(pdf))
        .digest("hex"),
      fields: geometry,
      clauses: document.clauses.map(([title, text]) => `${title}: ${text}`),
    };
  }
  await writeFile(
    path.join(root, "src/document-template-layouts.js"),
    `// Generated by scripts/build-document-templates.mjs from the source PDF layout.\nexport const DOCUMENT_LAYOUTS = ${JSON.stringify(layouts, null, 2)};\n`,
  );
  console.log(
    "Generated two one-page PDF originals, faithful PNG previews and field coordinates.",
  );
} finally {
  await browser.close();
}
