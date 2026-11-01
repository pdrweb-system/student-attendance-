// Teacher submission endpoint: checks shared PIN + rate limit, then calls the
// submit_attendance RPC (which enforces date, cutoff, open/closed, enrollment).
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a), eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, message: "Method not allowed" }, 405);

  const pin = Deno.env.get("TEACHER_PIN");
  if (!pin) return json({ ok: false, message: "ระบบยังไม่ได้ตั้งค่า PIN" }, 500);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ ok: false, message: "ข้อมูลไม่ถูกต้อง" }, 400); }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  const { data: allowed } = await supabase.rpc("check_rate_limit", { p_key: `submit:${ip}`, p_max: 30, p_window_seconds: 600 });
  if (allowed === false) return json({ ok: false, message: "ส่งข้อมูลบ่อยเกินไป กรุณารอสักครู่" }, 429);

  if (typeof body.pin !== "string" || !safeEqual(body.pin, pin)) {
    return json({ ok: false, code: "BAD_PIN", message: "PIN ไม่ถูกต้อง" }, 401);
  }

  const classId = Number(body.class_id), male = Number(body.male_present), female = Number(body.female_present);
  if (![classId, male, female].every(Number.isInteger) || male < 0 || female < 0 || male > 1000 || female > 1000) {
    return json({ ok: false, code: "BAD_VALUE", message: "กรุณากรอกจำนวนเป็นจำนวนเต็มไม่ติดลบ" }, 400);
  }
  const name = typeof body.recorded_name === "string" ? body.recorded_name.slice(0, 60) : null;

  const { data, error } = await supabase.rpc("submit_attendance", {
    p_class: classId, p_male: male, p_female: female, p_name: name,
  });
  if (error) {
    console.error(error);
    return json({ ok: false, message: "บันทึกไม่สำเร็จ" }, 500);
  }
  return json(data, data.ok ? 200 : 422);
});
