// LINE webhook: verifies X-Line-Signature, answers 3 commands via the Reply API (no Push).
import { createClient } from "npm:@supabase/supabase-js@2";
import { checkFlex, leaveFlex, type Row, summaryFlex } from "./flex.ts";

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
  // optional LIFF app for the teacher page (opened this way, the page can close itself after saving)
  const liffId = Deno.env.get("LIFF_ID");
  const teacherUrl = liffId ? `https://liff.line.me/${liffId}` : undefined;
  const events: Row[] = JSON.parse(raw).events ?? [];

  for (const ev of events) {
    if (ev.type !== "message" || ev.message?.type !== "text" || !ev.replyToken) continue;
    const text: string = ev.message.text;
    const now = new Date();
    try {
      if (text.includes("ลาป่วย")) {
        const { data: period } = await supabase.from("system_settings")
          .select("leave_year_label, leave_start, leave_end").maybeSingle();
        await reply(ev.replyToken, [leaveFlex(period ?? {})], accessToken);
      } else if (text.includes("สรุปสถิติ")) {
        const { data, error } = await supabase.rpc("daily_summary");
        if (error) throw error;
        await reply(ev.replyToken, [summaryFlex(data, now, summaryUrl)], accessToken);
      } else if (text.includes("เช็คสถิติ")) {
        const [st, sum] = await Promise.all([supabase.rpc("submit_status"), supabase.rpc("daily_summary")]);
        if (st.error) throw st.error;
        if (sum.error) throw sum.error;
        await reply(ev.replyToken, [checkFlex(st.data, sum.data, now, siteUrl || undefined, teacherUrl)], accessToken);
      }
    } catch (e) {
      console.error(e);
    }
  }
  return new Response("ok");
});
