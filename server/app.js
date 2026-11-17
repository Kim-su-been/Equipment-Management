import http from "node:http";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { Store, digest, migrateIds, inScope, viewState } from "./store.js";
import {
  readWorkbook,
  aiMapping,
  extractRows,
  validMapping,
  norm,
} from "./workbook.js";
import { parseBirth } from "./birth.js";
import { applyStatePatch } from "./permissions.js";
import { createPendingPerson } from "./personnel.js";
import { reschedulePreparation } from "../src/personnel-workflow.js";
import { createMailService } from "./mail/service.js";
import { PROJECTS, TASKS } from "../src/data.js";

export function createApplication(config) {
  const store = new Store(config.dbPath, {
      seedDemo: config.seedDemo,
      inviteKey: config.inviteKey,
    }),
    loginAttempts = new Map();
  const json = (res, status, body, headers = {}) => {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    });
    res.end(JSON.stringify(body));
  };
  const fail = (status, message) => {
    throw Object.assign(new Error(message), { status });
  };
  const actorOf = (req) => {
    const token = (req.headers.cookie || "")
      .split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("rb_session="))
      ?.slice(11);
    if (!token) return null;
    const row = store.db
      .prepare("SELECT actor,expires_at FROM sessions WHERE token_hash=?")
      .get(digest(token));
    return row && row.expires_at > Date.now() ? JSON.parse(row.actor) : null;
  };
  const requireActor = (req) =>
    actorOf(req) ||
    fail(401, "로그인 또는 유효한 개인 초대 링크가 필요합니다.");
  const staff = (req, pmo = false) => {
    const actor = requireActor(req);
    if (actor.kind !== "admin" || (pmo && actor.scope !== "PMO"))
      fail(403, "PMO에게만 허용된 작업입니다.");
    return actor;
  };
  const personFor = (actor, id) => {
    const person = store.load().people.find((p) => p.id === id);
    if (!person || !inScope(actor, person))
      fail(404, "인원 기록을 찾을 수 없습니다.");
    return person;
  };
  const body = async (req, max = 2 * 1024 * 1024) => {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > max) fail(413, "요청 파일이 허용 크기를 초과했습니다.");
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  };
  const readJson = async (req) => {
    try {
      return JSON.parse((await body(req)).toString() || "{}");
    } catch (e) {
      if (e.status) throw e;
      fail(400, "요청 JSON 형식이 올바르지 않습니다.");
    }
  };
  const cookie = (token, clear = false) =>
    `rb_session=${clear ? "" : token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : 86400}${config.secureCookies ? "; Secure" : ""}`;
  const session = (actor) => {
    const token = randomBytes(32).toString("base64url");
    store.db
      .prepare("INSERT INTO sessions VALUES(?,?,?)")
      .run(digest(token), JSON.stringify(actor), Date.now() + 86400000);
    return token;
  };
  const snapshot = (actor) => ({ actor, state: viewState(store, actor) });
  const invitation = (token) => {
    if (!/^[A-Za-z0-9_-]{40,60}$/.test(token))
      fail(404, "초대 링크가 올바르지 않습니다. PMO에 문의해 주세요.");
    const row = store.db
      .prepare("SELECT * FROM invitations WHERE token_hash=?")
      .get(digest(token));
    if (!row) fail(404, "초대 링크를 찾을 수 없습니다. PMO에 문의해 주세요.");
    if (row.revoked_at)
      fail(
        410,
        "재발급으로 종료된 초대 링크입니다. 최신 링크를 PMO에 요청해 주세요.",
      );
    if (row.used_at)
      fail(
        410,
        "이미 등록을 마친 링크입니다. PMO에 문의하거나 로그인된 브라우저에서 내 작업을 확인해 주세요.",
      );
    if (row.expires_at <= Date.now())
      fail(410, "초대 링크가 만료되었습니다. PMO에 재발급을 요청해 주세요.");
    const person = store.load().people.find((p) => p.id === row.person_id);
    if (!person || person.registrationStatus !== "pending_registration")
      fail(410, "이미 등록이 완료되었거나 종료된 등록 건입니다.");
    return { row, person };
  };
  const inviteUrl = (req, token) =>
    `${config.publicBaseUrl || `${req.socket.encrypted ? "https" : "http"}://${req.headers.host}`}/invite/${token}`;
  function importRowPreview(importId, project, rows) {
    const people = store.load().people.filter((p) => p.project === project);
    const nameCounts = new Map();
    for (const row of rows)
      nameCounts.set(norm(row.name), (nameCounts.get(norm(row.name)) || 0) + 1);
    return rows.map((row) => {
      const linked = store.db
        .prepare(
          "SELECT person_id FROM import_rows WHERE import_id=? AND sheet_index=? AND row_number=?",
        )
        .get(importId, row.sheetIndex, row.row);
      const candidates = people
        .filter((p) => norm(p.name) === norm(row.name))
        .map((p) => ({
          id: p.id,
          displayId: p.displayId,
          name: p.name,
          company: p.company,
          birthDate: p.birthDate || null,
          birthYear: p.birthYear || null,
          registrationStatus: p.registrationStatus,
        }));
      return {
        ...row,
        linkedPersonId: linked?.person_id || null,
        candidates,
        sameNameInFile: nameCounts.get(norm(row.name)) > 1,
        needsDecision:
          !linked &&
          (candidates.length > 0 || nameCounts.get(norm(row.name)) > 1),
        decision: linked
          ? "existing"
          : candidates.length || nameCounts.get(norm(row.name)) > 1
            ? ""
            : "new",
      };
    });
  }
  const mailService = createMailService(store, config);
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost"),
        parts = url.pathname.split("/").filter(Boolean);
      if (req.method !== "GET" && req.method !== "HEAD") {
        const origin = req.headers.origin;
        if (
          origin &&
          origin !== `http://${req.headers.host}` &&
          origin !== `https://${req.headers.host}` &&
          origin !== config.publicBaseUrl
        )
          fail(403, "동일 서비스에서만 변경할 수 있습니다.");
      }
      if (url.pathname.startsWith("/api/mail/")) {
        const actor = staff(req, true);
        return await mailService.handle({
          req,
          res,
          url,
          parts,
          actor,
          json,
          readJson,
          snapshot,
          fail,
        });
      }
      if (url.pathname === "/api/health")
        return json(res, 200, { ok: true, storage: "sqlite", schema: 1 });
      if (url.pathname === "/api/session" && req.method === "GET") {
        const actor = actorOf(req);
        return json(
          res,
          200,
          actor
            ? snapshot(actor)
            : { actor: null, loginOptions: Object.keys(config.passwords) },
        );
      }
      if (url.pathname === "/api/admin/login" && req.method === "POST") {
        const input = await readJson(req),
          scope = input.scope || "PMO",
          password = config.passwords[scope],
          ip = req.socket.remoteAddress || "unknown",
          attempt = loginAttempts.get(ip);
        if (attempt && attempt.count >= 8 && attempt.until > Date.now())
          fail(429, "로그인 시도가 많습니다. 잠시 후 다시 시도해 주세요.");
        const actual = String(input.password || "");
        if (
          !password ||
          actual.length > 256 ||
          !timingSafeEqual(
            Buffer.from(digest(actual)),
            Buffer.from(digest(password)),
          )
        ) {
          loginAttempts.set(ip, {
            count: (attempt?.until > Date.now() ? attempt.count : 0) + 1,
            until: Date.now() + 600000,
          });
          fail(401, "역할과 비밀번호를 확인해 주세요.");
        }
        loginAttempts.delete(ip);
        const actor = { kind: "admin", scope },
          token = session(actor);
        return json(res, 200, snapshot(actor), { "Set-Cookie": cookie(token) });
      }
      if (url.pathname === "/api/logout" && req.method === "POST") {
        const token = (req.headers.cookie || "")
          .split(";")
          .map((s) => s.trim())
          .find((s) => s.startsWith("rb_session="))
          ?.slice(11);
        if (token)
          store.db
            .prepare("DELETE FROM sessions WHERE token_hash=?")
            .run(digest(token));
        return json(res, 200, { ok: true }, { "Set-Cookie": cookie("", true) });
      }
      if (url.pathname === "/api/state" && req.method === "GET") {
        const actor = requireActor(req);
        return json(res, 200, snapshot(actor));
      }
      if (url.pathname === "/api/state" && req.method === "PATCH") {
        const actor = requireActor(req),
          input = await readJson(req);
        store.transaction(() =>
          applyStatePatch(store, actor, input.operations),
        );
        return json(res, 200, snapshot(actor));
      }
      if (url.pathname === "/api/imports" && req.method === "POST") {
        const actor = staff(req, true),
          project = url.searchParams.get("project");
        if (!PROJECTS.includes(project))
          fail(400, "프로젝트를 먼저 선택해 주세요.");
        const filename = decodeURIComponent(
          req.headers["x-file-name"] || "인력계획서.xlsx",
        );
        if (!/\.xlsx$/i.test(filename)) fail(400, ".xlsx 파일만 지원합니다.");
        const bytes = await body(req, 10 * 1024 * 1024),
          fileHash = digest(bytes),
          book = await readWorkbook(bytes);
        let found = store.db
          .prepare("SELECT * FROM imports WHERE project=? AND file_hash=?")
          .get(project, fileHash);
        let proposal;
        if (found) {
          proposal = JSON.parse(found.proposal);
        } else {
          proposal = await aiMapping(book, config);
          const id = randomUUID();
          store.db
            .prepare("INSERT INTO imports VALUES(?,?,?,?,?,?,?)")
            .run(
              id,
              project,
              fileHash,
              filename.slice(0, 180),
              bytes,
              JSON.stringify(proposal),
              new Date().toISOString(),
            );
          found = store.db.prepare("SELECT * FROM imports WHERE id=?").get(id);
          store.audit(actor, "import.upload", {
            importId: id,
            project,
            fileHash,
          });
        }
        return json(res, 200, {
          id: found.id,
          project,
          filename: found.filename,
          fileHash,
          proposal,
          sheets: book.sheets.map((s) => ({
            index: s.index,
            name: s.name,
            columns: s.columns,
            rows: s.rows.slice(0, 35),
          })),
          reuploaded: !!store.db
            .prepare("SELECT 1 FROM import_rows WHERE import_id=? LIMIT 1")
            .get(found.id),
        });
      }
      if (
        parts[0] === "api" &&
        parts[1] === "imports" &&
        parts[2] &&
        parts[3] === "preview" &&
        req.method === "POST"
      ) {
        staff(req, true);
        const input = await readJson(req),
          record = store.db
            .prepare("SELECT * FROM imports WHERE id=?")
            .get(parts[2]);
        if (!record) fail(404, "불러온 파일을 찾을 수 없습니다.");
        const book = await readWorkbook(record.file),
          mapping = validMapping(book, input.mapping),
          rows = extractRows(book, mapping);
        return json(res, 200, {
          mapping,
          rows: importRowPreview(record.id, record.project, rows),
        });
      }
      if (
        parts[0] === "api" &&
        parts[1] === "imports" &&
        parts[2] &&
        parts[3] === "commit" &&
        req.method === "POST"
      ) {
        const actor = staff(req, true),
          input = await readJson(req),
          record = store.db
            .prepare("SELECT * FROM imports WHERE id=?")
            .get(parts[2]);
        if (!record) fail(404, "불러온 파일을 찾을 수 없습니다.");
        if (input.mappingConfirmed !== true)
          fail(400, "시트·헤더·열 매핑을 확인해 주세요.");
        const book = await readWorkbook(record.file),
          sourceRows = extractRows(book, input.mapping),
          rows = importRowPreview(record.id, record.project, sourceRows),
          selected = input.rows;
        if (
          !Array.isArray(selected) ||
          !selected.length ||
          selected.length > 1000
        )
          fail(400, "확정할 행을 1~1,000개 선택해 주세요.");
        if (new Set(selected.map((r) => r.key)).size !== selected.length)
          fail(400, "동일한 행이 반복되었습니다.");
        const result = store.transaction(() => {
          const state = store.load(),
            created = [],
            linked = [],
            reused = [];
          for (const chosen of selected) {
            const source = rows.find((r) => r.key === chosen.key);
            if (!source) fail(400, "원본에 없는 행입니다.");
            if (source.linkedPersonId) {
              reused.push(source.linkedPersonId);
              continue;
            }
            const company = String(chosen.company ?? source.company).trim(),
              name = String(chosen.name ?? source.name).trim(),
              birth = parseBirth(chosen.birthRaw ?? source.birthRaw, {
                date1904: book.date1904,
              });
            if (
              !name ||
              !company ||
              name.length > 80 ||
              company.length > 100 ||
              birth.review === "오류"
            )
              fail(
                400,
                `${source.row}행의 이름·회사·생년월일을 확인해 주세요.`,
              );
            if (birth.review === "확인 필요" && chosen.reviewConfirmed !== true)
              fail(
                400,
                `${source.row}행의 생년월일 확인 대상을 확인해 주세요.`,
              );
            const candidates = state.people.filter(
              (p) =>
                p.project === record.project && norm(p.name) === norm(name),
            );
            if (!["new", "existing"].includes(chosen.decision))
              fail(
                400,
                `${source.row}행의 신규 등록 또는 기존 인원 연결을 선택해 주세요.`,
              );
            let person;
            if (chosen.decision === "existing") {
              person = state.people.find(
                (p) => p.id === chosen.personId && p.project === record.project,
              );
              if (!person) fail(400, "연결할 기존 인원을 선택해 주세요.");
              linked.push(person.id);
            } else {
              person = createPendingPerson(state, {
                project: record.project,
                company,
                name,
                birthRaw: birth.birthDate || birth.birthYear || "",
              });
              created.push(person.id);
            }
            const provenance = {
              importId: record.id,
              fileHash: record.file_hash,
              filename: record.filename,
              sheet: source.sheet,
              sheetIndex: source.sheetIndex,
              row: source.row,
              original: source.original,
              confirmed: {
                name,
                company,
                birthRaw: chosen.birthRaw ?? source.birthRaw,
              },
              decision: chosen.decision,
              at: new Date().toISOString(),
            };
            person.importSources = [
              ...(person.importSources || []),
              provenance,
            ];
            person.history.unshift({
              text: `인력계획서 ${source.sheet} ${source.row}행 ${chosen.decision === "existing" ? "기존 기록 연결" : "본인 등록 대기 생성"}`,
              date: new Date().toLocaleString("ko-KR"),
            });
            store.save(state);
            store.db
              .prepare("INSERT INTO import_rows VALUES(?,?,?,?,?)")
              .run(
                record.id,
                source.sheetIndex,
                source.row,
                person.id,
                JSON.stringify(provenance),
              );
            store.audit(actor, "import.confirm", provenance, person.id);
          }
          return { created, linked, reused };
        });
        return json(res, 200, { ...result, ...snapshot(actor) });
      }
      if (url.pathname === "/api/people" && req.method === "POST") {
        const actor = staff(req),
          input = await readJson(req);
        if (!/^[a-zA-Z0-9-]{10,100}$/.test(input.requestId || ""))
          fail(400, "등록 요청 ID가 필요합니다.");
        const previous = store.db
          .prepare("SELECT result FROM manual_batches WHERE id=?")
          .get(input.requestId);
        if (previous)
          return json(res, 200, {
            ...JSON.parse(previous.result),
            ...snapshot(actor),
          });
        if (
          !Array.isArray(input.rows) ||
          !input.rows.length ||
          input.rows.length > 100
        )
          fail(400, "등록할 인원은 1~100명이어야 합니다.");
        const result = store.transaction(() => {
          const state = store.load(),
            created = [];
          for (const row of input.rows) {
            if (
              !PROJECTS.includes(row.project) ||
              (actor.scope !== "PMO" && actor.scope !== row.project)
            )
              fail(403, "담당 프로젝트에만 등록할 수 있습니다.");
            const name = String(row.name || "").trim(),
              company = String(row.company || "").trim();
            if (!name || !company || name.length > 80 || company.length > 100)
              fail(400, "이름과 소속을 확인해 주세요.");
            const person = createPendingPerson(state, {
              ...row,
              name,
              company,
            });
            person.history.unshift({
              text: "주관사 수동 등록 · 본인 등록 대기",
              date: new Date().toLocaleString("ko-KR"),
            });
            created.push(person.id);
          }
          store.save(state);
          store.db
            .prepare("INSERT INTO manual_batches VALUES(?,?)")
            .run(input.requestId, JSON.stringify({ created }));
          store.audit(actor, "people.manual", { created });
          return { created };
        });
        return json(res, 201, { ...result, ...snapshot(actor) });
      }
      if (
        parts[0] === "api" &&
        parts[1] === "people" &&
        parts[2] &&
        parts[3] === "invitation"
      ) {
        const actor = staff(req, true),
          person = personFor(actor, parts[2]);
        if (req.method === "GET") {
          const row = store.db
            .prepare(
              "SELECT * FROM invitations WHERE person_id=? AND used_at IS NULL AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1",
            )
            .get(person.id);
          if (!row) return json(res, 200, { status: "none" });
          return json(res, 200, {
            status: row.expires_at > Date.now() ? "active" : "expired",
            expiresAt: new Date(row.expires_at).toISOString(),
            url:
              row.expires_at > Date.now()
                ? inviteUrl(req, store.decrypt(row.encrypted_token))
                : null,
          });
        }
        if (req.method === "POST") {
          if (person.registrationStatus !== "pending_registration")
            fail(
              409,
              "등록을 마친 인원에게는 새 등록 링크를 발급할 수 없습니다.",
            );
          const input = await readJson(req);
          const result = store.transaction(() => {
            const existing = store.db
              .prepare(
                "SELECT * FROM invitations WHERE person_id=? AND used_at IS NULL AND revoked_at IS NULL AND expires_at>? ORDER BY created_at DESC LIMIT 1",
              )
              .get(person.id, Date.now());
            if (existing && !input.reissue)
              return {
                status: "active",
                url: inviteUrl(req, store.decrypt(existing.encrypted_token)),
                expiresAt: new Date(existing.expires_at).toISOString(),
              };
            store.db
              .prepare(
                "UPDATE invitations SET revoked_at=? WHERE person_id=? AND used_at IS NULL AND revoked_at IS NULL",
              )
              .run(Date.now(), person.id);
            const token = randomBytes(32).toString("base64url"),
              expires = Date.now() + config.inviteTtlMs;
            store.db
              .prepare("INSERT INTO invitations VALUES(?,?,?,?,?,?,?,?)")
              .run(
                randomUUID(),
                person.id,
                digest(token),
                store.encrypt(token),
                expires,
                null,
                null,
                Date.now(),
              );
            store.audit(
              actor,
              input.reissue ? "invite.reissue" : "invite.issue",
              { expiresAt: new Date(expires).toISOString() },
              person.id,
            );
            return {
              status: "active",
              url: inviteUrl(req, token),
              expiresAt: new Date(expires).toISOString(),
            };
          });
          return json(res, 200, result);
        }
      }
      if (parts[0] === "api" && parts[1] === "invites" && parts[2]) {
        if (req.method === "GET") {
          const { person } = invitation(parts[2]);
          return json(res, 200, {
            person: {
              id: person.id,
              displayId: person.displayId,
              name: person.name,
              company: person.company,
              project: person.project,
              birthDate: person.birthDate || null,
              birthYear: person.birthYear || null,
              birthPrecision: person.birthPrecision || "unknown",
              phone: person.phone || "",
              start: person.start || "",
              end: person.end || "",
            },
            contact:
              "등록 기본 정보가 다르거나 링크 사용이 어려우면 링크를 전달한 PMO에 문의해 주세요.",
          });
        }
        if (req.method === "POST") {
          const input = await readJson(req);
          let saved;
          store.transaction(() => {
            const { row, person } = invitation(parts[2]);
            if (input.confirmed !== true)
              fail(400, "본인 기본 정보가 맞는지 확인해 주세요.");
            const birth = parseBirth(input.birthDate);
            if (birth.birthPrecision !== "date" || birth.review !== "정상")
              fail(400, "전체 생년월일을 확인해 주세요.");
            if (person.birthDate && person.birthDate !== birth.birthDate)
              fail(400, "기본 생년월일이 다릅니다. PMO에 문의해 주세요.");
            if (person.birthYear && person.birthYear !== birth.birthYear)
              fail(400, "계획서의 생년과 다릅니다. PMO에 문의해 주세요.");
            const phone = String(input.phone || "").replace(/[^\d]/g, "");
            if (!/^0\d{8,10}$/.test(phone))
              fail(400, "연락처를 확인해 주세요.");
            const start = String(input.start || ""),
              end = String(input.end || "");
            if (
              !/^\d{4}-\d{2}-\d{2}$/.test(start) ||
              !/^\d{4}-\d{2}-\d{2}$/.test(end) ||
              Number.isNaN(Date.parse(start)) ||
              Number.isNaN(Date.parse(end)) ||
              start > end ||
              new Date(start).toISOString().slice(0, 10) !== start ||
              new Date(end).toISOString().slice(0, 10) !== end
            )
              fail(400, "투입 예정 시작일과 종료일을 확인해 주세요.");
            const state = store.load(),
              target = state.people.find((p) => p.id === person.id);
            const previousStart = target.start;
            Object.assign(target, birth, {
              phone,
              start,
              end,
              registrationStatus: "registered",
              registeredAt: new Date().toISOString(),
              selfRegistered: true,
              profileRevision: (target.profileRevision || 1) + 1,
            });
            delete target.review;
            delete target.reason;
            target.birthReview = "정상";
            reschedulePreparation(state, target, previousStart, target.start);
            target.history.unshift({
              text: "개인 초대 링크로 본인 등록 완료",
              date: new Date().toLocaleString("ko-KR"),
            });
            store.save(state);
            store.db
              .prepare(
                "UPDATE invitations SET used_at=? WHERE person_id=? AND used_at IS NULL AND revoked_at IS NULL",
              )
              .run(Date.now(), person.id);
            store.audit(
              { kind: "member", personId: person.id },
              "registration.complete",
              { inviteId: row.id },
              person.id,
            );
            saved = target;
          });
          const actor = {
              kind: "member",
              personId: saved.id,
              project: saved.project,
            },
            token = session(actor);
          return json(res, 200, snapshot(actor), {
            "Set-Cookie": cookie(token),
          });
        }
      }
      if (url.pathname === "/api/files" && req.method === "POST") {
        const actor = requireActor(req),
          person = personFor(actor, url.searchParams.get("personId")),
          taskId = url.searchParams.get("taskId");
        if (!["O08", "O09", "O10", "O11"].includes(taskId))
          fail(400, "증빙 작업을 확인해 주세요.");
        if (person.registrationStatus !== "registered")
          fail(409, "본인 등록을 먼저 완료해 주세요.");
        const bytes = await body(req, 10 * 1024 * 1024),
          name = decodeURIComponent(req.headers["x-file-name"] || "증빙파일");
        if (!/\.(pdf|png|jpe?g|html)$/i.test(name))
          fail(400, "지원하지 않는 원본 형식입니다.");
        const id = randomUUID(),
          mime = {
            ".pdf": "application/pdf",
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".html": "text/html; charset=utf-8",
          }[path.extname(name).toLowerCase()],
          hash = digest(bytes),
          date = new Date().toISOString();
        store.db
          .prepare("INSERT INTO files VALUES(?,?,?,?,?,?,?,?)")
          .run(
            id,
            person.id,
            taskId,
            name.slice(0, 200),
            mime,
            hash,
            bytes,
            date,
          );
        return json(res, 201, {
          id,
          name,
          personId: person.id,
          taskId,
          digest: hash,
          savedAt: date,
        });
      }
      if (
        parts[0] === "api" &&
        parts[1] === "files" &&
        parts[2] &&
        req.method === "GET"
      ) {
        const actor = requireActor(req),
          record = store.db
            .prepare("SELECT * FROM files WHERE id=?")
            .get(parts[2]);
        if (!record) fail(404, "보관 원본을 찾을 수 없습니다.");
        personFor(actor, record.person_id);
        res.writeHead(200, {
          "Content-Type": record.mime,
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(record.name)}`,
          "Content-Security-Policy": "sandbox; default-src 'none'",
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "no-store",
          "X-File-Name": encodeURIComponent(record.name),
          "X-Person-Id": record.person_id,
          "X-Task-Id": record.task_id,
          "X-Digest": record.digest,
        });
        return res.end(Buffer.from(record.bytes));
      }
      if (url.pathname === "/api/migrate" && req.method === "POST") {
        const actor = staff(req, true),
          input = await readJson(req);
        const result = store.transaction(() => {
          if (!Array.isArray(input.people) || input.people.length > 1000)
            fail(400, "이전 명단 형식을 확인해 주세요.");
          const { data, idMap } = migrateIds(input),
            state = store.load();
          if (!state.people.length)
            state.settings = { ...state.settings, ...data.settings };
          if (input.seats || input.versions)
            store.db
              .prepare("INSERT OR IGNORE INTO legacy_archives VALUES(?,?,?)")
              .run(
                digest(JSON.stringify(input)),
                JSON.stringify({
                  seats: input.seats,
                  versions: input.versions,
                }),
                new Date().toISOString(),
              );
          for (const person of data.people) {
            if (
              !PROJECTS.includes(person.project) ||
              !person.name ||
              !person.company
            )
              fail(400, "이전 명단의 프로젝트·이름·소속을 확인해 주세요.");
            for (const file of Object.values(person.files || {}))
              if (
                file.storageId &&
                !store.db
                  .prepare("SELECT 1 FROM files WHERE id=?")
                  .get(file.storageId)
              ) {
                file.legacyStorageId = file.storageId;
                delete file.storageId;
              }
            if (!state.people.some((p) => p.id === person.id))
              state.people.push(person);
          }
          for (const key of ["messages", "notifications", "customTasks"])
            for (const item of data[key] || [])
              if (!state[key].some((x) => x.id === item.id))
                state[key].push(item);
          store.save(state);
          store.audit(actor, "legacy.migrate", {
            count: data.people.length,
            seatArchived: !!input.seats,
          });
          return { idMap };
        });
        return json(res, 200, { ...result, ...snapshot(actor) });
      }
      if (url.pathname.startsWith("/api/"))
        fail(404, "지원하지 않는 API입니다.");
      if (!["GET", "HEAD"].includes(req.method))
        fail(405, "지원하지 않는 요청입니다.");
      const relative = decodeURIComponent(url.pathname),
        base = path.resolve(config.staticRoot),
        target = path.resolve(base, `.${relative}`);
      if (!target.startsWith(`${base}${path.sep}`) && target !== base)
        fail(404, "파일을 찾을 수 없습니다.");
      let filename = target;
      try {
        const info = await stat(filename);
        if (!info.isFile()) filename = path.join(base, "index.html");
      } catch {
        filename = path.join(base, "index.html");
      }
      const content = await readFile(filename);
      const types = {
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript",
        ".css": "text/css",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".pdf": "application/pdf",
        ".woff2": "font/woff2",
      };
      res.writeHead(200, {
        "Content-Type":
          types[path.extname(filename)] || "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
      });
      res.end(req.method === "HEAD" ? undefined : content);
    } catch (error) {
      if (res.headersSent) {
        res.end();
        return;
      }
      json(res, error.status || 400, {
        error: error.status
          ? error.message
          : config.testMode
            ? error.message
            : "요청을 처리하지 못했습니다. 입력값과 파일을 확인해 주세요.",
      });
    }
  });
  return {
    server,
    store,
    close: async () => {
      await new Promise((resolve) => server.close(resolve));
      store.close();
    },
  };
}
