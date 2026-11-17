import { createHash } from "node:crypto";
import { demoMails, MOCK_FOLDER } from "./fixtures.js";
export const sha = (value) => createHash("sha256").update(value).digest("hex");
export function splitReply(body) {
  const text = String(body || "").replace(/\r\n?/g, "\n");
  const lines = text.split("\n");
  const boundary = lines.findIndex((line) =>
    /^\s*(?:>+|[-_]{2,}\s*(?:Original Message|원본\s*메시지|전달.*메시지)|On .+wrote:|.*(?:님이|님께서).*(?:작성|보냈).*:|보낸\s*사람\s*:|From\s*:)/i.test(
      line,
    ),
  );
  return {
    latestBody: (boundary < 0
      ? text
      : lines.slice(0, boundary).join("\n")
    ).trim(),
    quotedBody: boundary < 0 ? "" : lines.slice(boundary).join("\n").trim(),
  };
}
export function mailProviderInfo(config) {
  const provider = config.mailProvider || "mock";
  if (provider === "mock")
    return {
      provider: "mock",
      label: "가상 메일함",
      configured: true,
      actual: false,
      notice: "가상 메일 · 외부 메일함에 연결하지 않습니다.",
    };
  if (provider !== "imap")
    return {
      provider,
      label: "미지원 제공자",
      configured: false,
      actual: false,
      notice: "확인된 IMAP 연결 또는 가상 메일함을 설정해 주세요.",
    };
  const configured = !!(
    config.mailHost &&
    config.mailUser &&
    (config.mailPassword || config.mailAccessToken)
  );
  return {
    provider: "imap",
    label: "IMAP 읽기 전용",
    configured,
    actual: true,
    notice: configured
      ? "지정 폴더를 읽기 전용으로 조회합니다."
      : "메일 서버·계정·인증 정보가 필요합니다. 비밀값은 서버 환경변수에서 설정하세요.",
  };
}
export function defaultMailSettings(config) {
  return {
    folder:
      config.mailFolder ||
      ((config.mailProvider || "mock") === "mock" ? MOCK_FOLDER : "INBOX"),
    search: config.mailSearch || "",
    since: config.mailSince || "",
  };
}
export async function readMailbox(config, settings, people = []) {
  const info = mailProviderInfo(config);
  if (!info.configured) throw new Error(info.notice);
  if (config.mailRead) return config.mailRead(settings);
  if (info.provider === "mock")
    return {
      mailboxId: "mock:readyboard",
      messages: demoMails(people)
        .filter(
          (m) =>
            m.folder === settings.folder &&
            (!settings.search ||
              `${m.subject}\n${m.body}`
                .toLowerCase()
                .includes(settings.search.toLowerCase())) &&
            inMailSince(m.receivedAt, settings.since),
        )
        .map((m) => ({ ...m, source: "mock" })),
      truncated: false,
    };
  const { ImapFlow } = await import("imapflow");
  const client = new ImapFlow({
    host: config.mailHost,
    port: config.mailPort || 993,
    secure: true,
    auth: {
      user: config.mailUser,
      ...(config.mailAccessToken
        ? { accessToken: config.mailAccessToken }
        : { pass: config.mailPassword }),
    },
    logger: false,
    emitLogs: false,
    connectionTimeout: 12000,
    greetingTimeout: 12000,
    socketTimeout: 20000,
  });
  try {
    await client.connect();
    const lock = await client.getMailboxLock(settings.folder, {
      readOnly: true,
    });
    try {
      const query = {
        all: true,
        ...(settings.search ? { text: settings.search } : {}),
        ...(settings.since
          ? { since: new Date(`${settings.since}T00:00:00+09:00`) }
          : {}),
      };
      const uids = await client.search(query, { uid: true }),
        ids = uids.slice(-50),
        messages = [];
      let skipped = 0;
      const metadata = ids.length
        ? await client.fetchAll(ids, { uid: true, size: true }, { uid: true })
        : [];
      for (const meta of metadata) {
        if (meta.size > 1024 * 1024) {
          skipped++;
          continue;
        }
        const item = await client.fetchOne(
          String(meta.uid),
          { source: true, internalDate: true },
          { uid: true },
        );
        if (!item?.source || item.source.length > 1024 * 1024) {
          skipped++;
          continue;
        }
        const parsed = await parseMailboxMessage(item.source, {
          uid: meta.uid,
          uidValidity: client.mailbox.uidValidity,
          folder: settings.folder,
          internalDate: item.internalDate,
        });
        if (inMailSince(parsed.receivedAt, settings.since))
          messages.push(parsed);
      }
      return {
        mailboxId: `imap:${sha(`${config.mailHost.toLowerCase()}:${config.mailUser}`).slice(0, 24)}`,
        messages,
        truncated: uids.length > 50,
        skipped,
      };
    } finally {
      lock.release();
    }
  } catch {
    throw new Error(
      "메일함 읽기에 실패했습니다. 서버 주소·인증·폴더·네트워크 허용 범위를 확인해 주세요.",
    );
  } finally {
    try {
      await client.logout();
    } catch {
      client.close();
    }
  }
}

export function inMailSince(receivedAt, since) {
  return (
    !since || Date.parse(receivedAt) >= Date.parse(`${since}T00:00:00+09:00`)
  );
}
export async function parseMailboxMessage(
  source,
  { uid, uidValidity, folder, internalDate },
) {
  const { simpleParser } = await import("mailparser"),
    parsed = await simpleParser(source, {
      skipImageLinks: true,
      skipHtmlToText: false,
    });
  const text =
    parsed.text ||
    String(parsed.html || "")
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]*>/g, " ");
  const id =
    parsed.messageId ||
    `uid:${encodeURIComponent(folder)}:${uidValidity}:${uid}`;
  const rootReference = Array.isArray(parsed.references)
    ? parsed.references[0]
    : parsed.references;
  return {
    id,
    threadId: rootReference || parsed.inReplyTo || id,
    inReplyTo: parsed.inReplyTo || null,
    subject: parsed.subject || "(제목 없음)",
    receivedAt: new Date(
      internalDate || parsed.date || Date.now(),
    ).toISOString(),
    from: parsed.from?.text || "",
    body: text.slice(0, 100000),
    source: "imap",
  };
}
