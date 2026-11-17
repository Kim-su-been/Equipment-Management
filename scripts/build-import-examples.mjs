import ExcelJS from "exceljs";
import { mkdir } from "node:fs/promises";
await mkdir("public/examples", { recursive: true });
const a = new ExcelJS.Workbook(),
  sa = a.addWorksheet("인력명단");
sa.addRow(["소속회사", "이름", "생년월일"]);
sa.addRow(["샘플테크", "김하늘", "1994-03-14"]);
sa.addRow(["샘플시스템", "이준서", "1991-08-21"]);
sa.columns.forEach((c) => (c.width = 24));
await a.xlsx.writeFile("public/examples/인력계획서_A.xlsx");
const b = new ExcelJS.Workbook(),
  sb = b.addWorksheet("계약인력");
sb.mergeCells("A1:D1");
sb.getCell("A1").value = "2026 프로젝트 계약 인력 계획";
sb.addRow([]);
sb.addRow(["순번", "업체명", "투입인력", "생년"]);
sb.addRow([1, "다온정보", "박서연", 1996]);
sb.addRow([2, "다온정보", "박서연", 1998]);
sb.columns.forEach((c) => (c.width = 24));
await b.xlsx.writeFile("public/examples/인력계획서_B.xlsx");
const mail = new ExcelJS.Workbook(),
  mailSheet = mail.addWorksheet("메일검토기준");
mailSheet.addRow(["소속회사", "이름", "생년월일"]);
mailSheet.addRow(["샘플테크", "김민수", "1990-01-01"]);
mailSheet.columns.forEach((c) => (c.width = 24));
await mail.xlsx.writeFile("public/examples/메일검토_기준인력.xlsx");
