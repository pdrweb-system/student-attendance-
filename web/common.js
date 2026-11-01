import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
export const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;

export const $ = (s, r = document) => r.querySelector(s);
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export const fmtTime = (iso) =>
  new Date(iso).toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" });
export const fmtDate = (d) =>
  new Date(d + "T00:00:00+07:00").toLocaleDateString("th-TH-u-ca-buddhist", { timeZone: "Asia/Bangkok", dateStyle: "full" });

export function toast(msg, ok = true) {
  const t = document.createElement("div");
  t.className = "toast " + (ok ? "ok" : "err");
  t.textContent = msg;
  document.body.append(t);
  setTimeout(() => t.remove(), 4000);
}

export async function getStatus(classId = null) {
  const { data, error } = await sb.rpc("submit_status", { p_class: classId });
  if (error) throw error;
  return data;
}

export function statusBanner(st) {
  if (!st.accepting) return { cls: "err", text: `⛔ ${st.closed_message || "ระบบปิดอยู่"}` };
  if (!st.can_submit) return { cls: "warn", text: `หมดเวลาลงสถิติแล้ว (${st.cutoff_time} น.) กรุณาติดต่อแอดมิน` };
  return { cls: "ok", text: `ลงสถิติได้ถึง ${fmtTime(st.deadline)} น.${st.extended ? " (แอดมินเปิดช่วงลงเพิ่ม)" : ""}` };
}

export function nav(active) {
  return `<nav>
    <a href="index.html" class="${active === "index" ? "on" : ""}">ลงสถิติ</a>
    <a href="summary.html" class="${active === "summary" ? "on" : ""}">สรุปวันนี้</a>
    <a href="admin.html" class="${active === "admin" ? "on" : ""}">แอดมิน</a>
  </nav>`;
}
