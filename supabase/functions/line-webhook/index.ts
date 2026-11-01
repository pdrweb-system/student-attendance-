// LINE webhook: verifies X-Line-Signature, answers 3 commands via the Reply API (no Push).
import { createClient } from "npm:@supabase/supabase-js@2";

const LEAVE_URL = "https://pdrweb-system.github.io/leavesystem/";
const SCHOOL = "โรงเรียนวัดปรีดาราม (มณีศิริวรรณ)";

async function verifySignature(raw: string, signature: string | null, secret: string): Promise<boolean> {
  if (!signature) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)));
  const expected = btoa(String.fromCharCode(...mac));
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

const thaiDate = (d: Date) =>
  new Intl.DateTimeFormat("th-TH-u-ca-buddhist", { timeZone: "Asia/Bangkok", dateStyle: "full" }).format(d);
const thaiTime = (d: Date) =>
  new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" }).format(d);

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

const cell = (text: string, flex: number, opts: Row = {}) => ({
  type: "text", text, flex, size: "sm", align: opts.align ?? "end", color: opts.color ?? "#333333",
  weight: opts.weight ?? "regular", wrap: false,
});

function summaryFlex(rows: Row[], now: Date) {
  const sub = rows.filter((r) => r.submitted);
  const tot = rows.reduce((s, r) => s + r.total, 0);
  const subTot = sub.reduce((s, r) => s + r.total, 0);
  const pres = sub.reduce((s, r) => s + r.present, 0);
  const header = {
    type: "box", layout: "baseline", spacing: "sm", contents: [
      cell("ชั้น", 2, { align: "start", weight: "bold" }), cell("ทั้งหมด", 2, { weight: "bold" }),
      cell("มา", 2, { weight: "bold" }), cell("ไม่มา", 2, { weight: "bold" }), cell("%", 2, { weight: "bold" }),
    ],
  };
  const lines = rows.map((r) => ({
    type: "box", layout: "baseline", spacing: "sm",
    contents: r.submitted
      ? [cell(r.name, 2, { align: "start" }), cell(String(r.total), 2), cell(String(r.present), 2),
         cell(String(r.absent), 2), cell(r.pct == null ? "-" : String(r.pct), 2)]
      : [cell(r.name, 2, { align: "start", color: "#999999" }), cell(String(r.total), 2, { color: "#999999" }),
         cell("ยังไม่ลง", 6, { color: "#c0392b" })],
  }));
  const pct = subTot ? (100 * pres / subTot).toFixed(1) : "-";
  return {
    type: "flex", altText: "สรุปสถิติมาเรียนวันนี้",
    contents: {
      type: "bubble", size: "mega",
      header: { type: "box", layout: "vertical", backgroundColor: "#1a5e1a", contents: [
        { type: "text", text: "สรุปสถิติมาเรียน", color: "#ffffff", weight: "bold", size: "lg" },
        { type: "text", text: thaiDate(now), color: "#d8f0d8", size: "xs" },
      ] },
      body: { type: "box", layout: "vertical", spacing: "sm", contents: [
        header, { type: "separator" }, ...lines, { type: "separator" },
        { type: "box", layout: "baseline", spacing: "sm", contents: [
          cell("รวม", 2, { align: "start", weight: "bold" }), cell(String(subTot), 2, { weight: "bold" }),
          cell(String(pres), 2, { weight: "bold" }), cell(String(subTot - pres), 2, { weight: "bold" }),
          cell(pct, 2, { weight: "bold" }),
        ] },
        { type: "text", size: "xxs", color: "#888888", wrap: true,
          text: `รวมเฉพาะชั้นที่ลงแล้ว ${sub.length}/${rows.length} ชั้น (นักเรียนทั้งโรงเรียน ${tot} คน)` },
      ] },
    },
  };
}

function leaveFlex() {
  return {
    type: "flex", altText: "ระบบการลาออนไลน์",
    contents: {
      type: "bubble",
      header: { type: "box", layout: "vertical", backgroundColor: "#1a5e1a", contents: [
        { type: "text", text: "ระบบการลาออนไลน์", color: "#ffffff", weight: "bold", size: "lg" },
        { type: "text", text: SCHOOL, color: "#d8f0d8", size: "xs", wrap: true },
      ] },
      body: { type: "box", layout: "vertical", spacing: "sm", contents: [
        { type: "text", text: "ปีงบประมาณ 2569", weight: "bold" },
        { type: "text", text: "1 เม.ย. 2569 – 30 ก.ย. 2569", size: "sm", color: "#555555" },
      ] },
      footer: { type: "box", layout: "vertical", contents: [
        { type: "button", style: "primary", color: "#1a5e1a",
          action: { type: "uri", label: "ไปที่ระบบการลา", uri: LEAVE_URL } },
      ] },
    },
  };
}

async function reply(token: string, messages: Row[], accessToken: string) {
  const res = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ replyToken: token, messages }),
  });
  if (!res.ok) console.error("LINE reply failed", res.status, await res.text());
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok");
  const secret = Deno.env.get("LINE_CHANNEL_SECRET");
  const accessToken = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN");
  if (!secret || !accessToken) return new Response("not configured", { status: 500 });

  const raw = await req.text();
  if (!(await verifySignature(raw, req.headers.get("x-line-signature"), secret))) {
    return new Response("invalid signature", { status: 401 });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const siteUrl = Deno.env.get("SITE_URL") ?? "";
  const events: Row[] = JSON.parse(raw).events ?? [];

  for (const ev of events) {
    if (ev.type !== "message" || ev.message?.type !== "text" || !ev.replyToken) continue;
    const text: string = ev.message.text;
    const now = new Date();
    try {
      if (text.includes("ลาป่วย")) {
        await reply(ev.replyToken, [leaveFlex()], accessToken);
      } else if (text.includes("สรุปสถิติ")) {
        const { data, error } = await supabase.rpc("daily_summary");
        if (error) throw error;
        await reply(ev.replyToken, [summaryFlex(data, now)], accessToken);
      } else if (text.includes("เช็คสถิติ")) {
        const [{ data: st }, { data: rows }] = await Promise.all([
          supabase.rpc("submit_status"), supabase.rpc("daily_summary"),
        ]);
        const pending = (rows as Row[]).filter((r) => !r.submitted).map((r) => r.name);
        let msg = `📋 ตรวจสอบสถิติมาเรียน ${SCHOOL}\n${thaiDate(now)} เวลา ${thaiTime(now)} น.\n`;
        if (!st.accepting) msg += `\n⛔ ${st.closed_message ?? "ระบบปิดอยู่"}`;
        else {
          msg += pending.length ? `\nยังไม่ลง (${pending.length} ชั้น): ${pending.join(", ")}` : "\n✅ ลงครบทุกชั้นแล้ว";
          msg += st.can_submit
            ? `\nลงได้ถึง ${thaiTime(new Date(st.deadline))} น.`
            : `\nหมดเวลาลงของครูแล้ว (${st.cutoff_time} น.) ติดต่อแอดมิน`;
        }
        if (siteUrl) msg += `\n\nลงสถิติ/ดูสรุป: ${siteUrl}`;
        await reply(ev.replyToken, [{ type: "text", text: msg }], accessToken);
      }
    } catch (e) {
      console.error(e);
    }
  }
  return new Response("ok");
});
