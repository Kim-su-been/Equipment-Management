import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import {
  randomUUID,
  randomBytes,
  createHash,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import { seed, PROJECTS } from "../src/data.js";
import { normalizeLegacyState } from "../src/migration.js";
export const digest = (value) =>
  createHash("sha256").update(value).digest("hex");
export const stableLegacyId = (project, id) => {
  const h = digest(`readyboard-v1:${project}:${id}`);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
export function migrateIds(input) {
  const data = normalizeLegacyState(input),
    idMap = {};
  for (const p of data.people)
    idMap[p.id] = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(p.id)
      ? p.id
      : stableLegacyId(p.project, p.id);
  data.people = data.people.map((p) => ({
    ...p,
    id: idMap[p.id],
    displayId: p.displayId || p.id,
    legacyId: p.legacyId || p.id,
  }));
  for (const key of ["messages", "notifications", "activity"])
    data[key] = (data[key] || []).map((item) => ({
      ...item,
      ...(item.personId
        ? { personId: idMap[item.personId] || item.personId }
        : {}),
    }));
  data.customTasks = (data.customTasks || []).map((t) => ({
    ...t,
    ...(t.personIds
      ? { personIds: t.personIds.map((id) => idMap[id] || id) }
      : {}),
  }));
  return { data, idMap };
}
export class Store {
  constructor(filename, { seedDemo = false, inviteKey } = {}) {
    mkdirSync(path.dirname(filename), { recursive: true });
    this.db = new DatabaseSync(filename);
    this.db.exec(
      "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;",
    );
    this.db
      .exec(`CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,name TEXT UNIQUE NOT NULL);
CREATE TABLE IF NOT EXISTS companies(id TEXT PRIMARY KEY,company_key TEXT UNIQUE NOT NULL,name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS people(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id),company_id TEXT REFERENCES companies(id),payload TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS app_state(id INTEGER PRIMARY KEY CHECK(id=1),payload TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,actor TEXT NOT NULL,expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS imports(id TEXT PRIMARY KEY,project TEXT NOT NULL,file_hash TEXT NOT NULL,filename TEXT NOT NULL,file BLOB NOT NULL,proposal TEXT,created_at TEXT NOT NULL,UNIQUE(project,file_hash));
CREATE TABLE IF NOT EXISTS import_rows(import_id TEXT NOT NULL REFERENCES imports(id),sheet_index INTEGER NOT NULL,row_number INTEGER NOT NULL,person_id TEXT NOT NULL REFERENCES people(id),review TEXT NOT NULL,PRIMARY KEY(import_id,sheet_index,row_number));
CREATE TABLE IF NOT EXISTS invitations(id TEXT PRIMARY KEY,person_id TEXT NOT NULL REFERENCES people(id),token_hash TEXT UNIQUE NOT NULL,encrypted_token TEXT NOT NULL,expires_at INTEGER NOT NULL,used_at INTEGER,revoked_at INTEGER,created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS files(id TEXT PRIMARY KEY,person_id TEXT NOT NULL REFERENCES people(id),task_id TEXT NOT NULL,name TEXT NOT NULL,mime TEXT NOT NULL,digest TEXT NOT NULL,bytes BLOB NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit_log(id TEXT PRIMARY KEY,person_id TEXT,actor TEXT NOT NULL,kind TEXT NOT NULL,payload TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS manual_batches(id TEXT PRIMARY KEY,result TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS legacy_archives(id TEXT PRIMARY KEY,payload TEXT NOT NULL,created_at TEXT NOT NULL);`);
    for (const [i, name] of PROJECTS.entries())
      this.db
        .prepare("INSERT OR IGNORE INTO projects(id,name) VALUES (?,?)")
        .run(`project-${i + 1}`, name);
    const keyfile = path.join(path.dirname(filename), "invitation.key");
    if (inviteKey) {
      this.key = createHash("sha256").update(inviteKey).digest();
    } else {
      if (!existsSync(keyfile))
        writeFileSync(keyfile, randomBytes(32), { mode: 0o600 });
      this.key = readFileSync(keyfile);
    }
    if (!this.db.prepare("SELECT id FROM app_state WHERE id=1").get()) {
      const data = seedDemo
        ? migrateIds(seed()).data
        : {
            people: [],
            messages: [],
            notifications: [],
            activity: [],
            customTasks: [],
            settings: { O08: "", O09: "", reminder: true },
          };
      this.transaction(() => this.save(data));
    }
  }
  transaction(fn) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  load() {
    const meta = this.db.prepare("SELECT * FROM app_state WHERE id=1").get();
    return {
      ...JSON.parse(meta.payload),
      people: this.db
        .prepare("SELECT payload,version FROM people ORDER BY rowid")
        .all()
        .map((r) => ({ ...JSON.parse(r.payload), recordVersion: r.version })),
      revision: meta.revision,
    };
  }
  save(input) {
    const data = normalizeLegacyState(input);
    for (const p of data.people) {
      if (!PROJECTS.includes(p.project))
        throw new Error("지원하지 않는 프로젝트입니다.");
      const project = this.db
        .prepare("SELECT id FROM projects WHERE name=?")
        .get(p.project);
      const companyKey = (p.company || "미확정")
        .trim()
        .replace(/\s+/g, " ")
        .toLowerCase();
      this.db
        .prepare(
          "INSERT OR IGNORE INTO companies(id,company_key,name)VALUES(?,?,?)",
        )
        .run(randomUUID(), companyKey, p.company || "미확정");
      const company = this.db
        .prepare("SELECT id FROM companies WHERE company_key=?")
        .get(companyKey);
      p.projectId = project.id;
      p.companyId = company.id;
      const current = this.db
        .prepare("SELECT payload,version FROM people WHERE id=?")
        .get(p.id);
      const payload = JSON.stringify({ ...p, recordVersion: undefined });
      const version = current
        ? current.version + (current.payload !== payload ? 1 : 0)
        : 1;
      this.db
        .prepare(
          "INSERT INTO people(id,project_id,company_id,payload,version)VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET project_id=excluded.project_id,company_id=excluded.company_id,payload=excluded.payload,version=excluded.version",
        )
        .run(p.id, project.id, company.id, payload, version);
    }
    const { people, revision, ...rest } = data;
    this.db
      .prepare(
        "INSERT INTO app_state(id,payload,revision)VALUES(1,?,1)ON CONFLICT(id)DO UPDATE SET payload=excluded.payload,revision=app_state.revision+1",
      )
      .run(JSON.stringify(rest));
  }
  audit(actor, kind, payload, personId = null) {
    this.db
      .prepare("INSERT INTO audit_log VALUES(?,?,?,?,?,?)")
      .run(
        randomUUID(),
        personId,
        actor.kind === "member" ? actor.personId : actor.scope || "PMO",
        kind,
        JSON.stringify(payload),
        new Date().toISOString(),
      );
  }
  encrypt(token) {
    const iv = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const encrypted = Buffer.concat([
      cipher.update(token, "utf8"),
      cipher.final(),
    ]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString(
      "base64",
    );
  }
  decrypt(value) {
    const b = Buffer.from(value, "base64"),
      decipher = createDecipheriv("aes-256-gcm", this.key, b.subarray(0, 12));
    decipher.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([
      decipher.update(b.subarray(28)),
      decipher.final(),
    ]).toString("utf8");
  }
  close() {
    this.db.close();
  }
}
export { inScope, viewState } from "../src/actor-scope.js";
