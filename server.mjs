import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
db.on("error", error => console.error(error));
const css = await readFile(new URL("./style.css", import.meta.url), "utf8");
await db.query(`CREATE TABLE IF NOT EXISTS study_records (
  id uuid PRIMARY KEY, owner uuid NOT NULL, subject text NOT NULL, day date NOT NULL,
  minutes integer NOT NULL CHECK (minutes BETWEEN 1 AND 1440), memo text NOT NULL
)`);
await db.query("CREATE INDEX IF NOT EXISTS study_records_owner_day ON study_records(owner, day DESC)");
const escape = value => String(value).replace(/[&<>"']/g, character => ({
  "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;",
})[character]);
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const messages = new Map([
  ["saved","学習記録を保存しました。"], ["deleted","学習記録を削除しました。"],
  ["invalid","入力内容を確認してください。学習時間は1〜1440分です。"],
]);
function page(entries, status) {
  const bySubject = new Map();
  let total = 0;
  for (const entry of entries) {
    total += entry.minutes;
    bySubject.set(entry.subject, (bySubject.get(entry.subject) ?? 0) + entry.minutes);
  }
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone:"Asia/Tokyo", dateStyle:"short" }).format(new Date());
  const subjects = [...bySubject].sort((a,b) => b[1]-a[1]).map(([subject,minutes]) =>
    `<li><div><span>${escape(subject)}</span><strong>${minutes} 分</strong></div><progress aria-label="${escape(subject)}の学習時間の割合" value="${minutes}" max="${total}"></progress></li>`).join("");
  const history = entries.map(entry => `<li><div><time datetime="${entry.day}">${entry.day.replaceAll("-","/")}</time><h3>${escape(entry.subject)}</h3><p>${escape(entry.memo)}</p></div><div class="record-actions"><strong>${entry.minutes} 分</strong><form method="post" action="/records"><input type="hidden" name="id" value="${entry.id}"><input type="hidden" name="action" value="delete"><button class="delete">削除</button></form></div></li>`).join("");
  const notice = messages.get(status);
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>まなびログ</title><link rel="stylesheet" href="/style.css"></head><body><main>
    <header class="hero"><div><h1>まなびログ</h1><p>日々の学習時間を記録して振り返る。</p></div><dl class="stats"><div><dt>合計学習時間</dt><dd>${total.toLocaleString("ja-JP")}<small> 分</small></dd></div><div><dt>記録した回数</dt><dd>${entries.length}<small> 回</small></dd></div></dl></header>
    ${notice ? `<p class="notice" role="status">${notice}</p>` : ""}
    <div class="dashboard"><section class="card"><h2>学習を記録</h2><form method="post" action="/records">
    <label>科目<input name="subject" maxlength="40" required placeholder="例 英語"></label><div class="fields">
    <label>学習日<input name="day" type="date" value="${today}" min="1900-01-01" required></label>
    <label>時間（分）<input name="minutes" type="number" min="1" max="1440" required placeholder="45"></label></div>
    <label>メモ（任意）<textarea name="memo" maxlength="200" rows="3"></textarea></label><button class="primary">記録を保存</button></form></section>
    <section class="card"><h2>科目別の学習時間</h2>${subjects ? `<ul class="subjects">${subjects}</ul>` : '<p class="empty">記録を追加すると、科目別の内訳が表示されます。</p>'}</section></div>
    <section class="card history"><h2>学習履歴</h2>${history ? `<ul>${history}</ul>` : '<p class="empty">学習履歴はまだありません。</p>'}</section>
    <footer>学習記録は同じブラウザーから確認できます。</footer></main></body></html>`;
}

createServer(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'self'; form-action 'self'; frame-ancestors 'none'");
  try {
    const url = new URL(req.url, "http://localhost");
    const rawOwner = (req.headers.cookie ?? "").match(/(?:^|;\s*)study_owner=([^;]*)/)?.[1];
    const owner = uuid.test(rawOwner ?? "") ? rawOwner : null;
    if (req.method === "GET" && url.pathname === "/style.css") {
      res.writeHead(200, { "Content-Type":"text/css; charset=utf-8" }).end(css);
      return;
    }
    if (req.method === "GET" && url.pathname === "/") {
      const entries = owner ? (await db.query("SELECT id, subject, day::text AS day, minutes, memo FROM study_records WHERE owner=$1 ORDER BY day DESC, id", [owner])).rows : [];
      res.writeHead(200, { "Content-Type":"text/html; charset=utf-8" }).end(page(entries, url.searchParams.get("status")));
      return;
    }
    if (req.method !== "POST" || url.pathname !== "/records") {
      res.writeHead(404).end();
      return;
    }
    const origin = process.env.RENDER_EXTERNAL_URL || `http://${req.headers.host}`;
    if (req.headers.origin !== origin || !req.headers["content-type"]?.startsWith("application/x-www-form-urlencoded")) {
      res.writeHead(403).end();
      return;
    }
    let body = "";
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 8192) { res.writeHead(413).end(); return; }
    }
    const form = new URLSearchParams(body);
    const redirect = status => res.writeHead(303, { Location:"/?status=" + status }).end();
    if (form.get("action") === "delete") {
      if (owner && uuid.test(form.get("id") ?? "")) {
        await db.query("DELETE FROM study_records WHERE owner=$1 AND id=$2", [owner, form.get("id")]);
      }
      return redirect("deleted");
    }
    const subject = form.get("subject")?.trim() ?? "";
    const day = form.get("day") ?? "";
    const minutes = Number(form.get("minutes"));
    const memo = form.get("memo")?.trim() ?? "";
    const date = new Date(day + "T00:00:00Z");
    if (!subject || subject.length > 40 || memo.length > 200 || !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
        day < "1900-01-01" || !Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== day ||
        !Number.isInteger(minutes) || minutes < 1 || minutes > 1440) return redirect("invalid");
    const id = owner ?? randomUUID();
    await db.query("INSERT INTO study_records VALUES ($1,$2,$3,$4,$5,$6)", [randomUUID(),id,subject,day,minutes,memo]);
    if (!owner) res.setHeader("Set-Cookie", `study_owner=${id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=31536000${origin.startsWith("https:") ? "; Secure" : ""}`);
    return redirect("saved");
  } catch (error) {
    console.error(error);
    res.writeHead(500, {"Content-Type":"text/plain; charset=utf-8"}).end("処理に失敗しました。時間をおいてお試しください。");
  }
}).listen(Number(process.env.PORT || 3000), "0.0.0.0");
