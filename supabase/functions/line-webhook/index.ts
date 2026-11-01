// LINE webhook: verifies X-Line-Signature, answers 3 commands via the Reply API (no Push).
import { createClient } from "npm:@supabase/supabase-js@2";
import { leaveFlex, type Row, SCHOOL, summaryFlex, thaiDate, thaiTime } from "./flex.ts";

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
  const summaryUrl = siteUrl ? siteUrl.replace(/\/?$/, "/") + "summary.html" : undefined;
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
        await reply(ev.replyToken, [summaryFlex(data, now, summaryUrl)], accessToken);
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
