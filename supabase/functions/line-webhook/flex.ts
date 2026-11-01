// Flex Message builders for the LINE webhook.
// Pure functions (no Deno APIs) so they can be rendered and checked with Node too.

export const SCHOOL = "โรงเรียนวัดปรีดาราม (มณีศิริวรรณ)";
export const LEAVE_URL = "https://pdrweb-system.github.io/leavesystem/";

// deno-lint-ignore no-explicit-any
export type Row = Record<string, any>;

export const thaiDate = (d: Date) =>
  new Intl.DateTimeFormat("th-TH-u-ca-buddhist", { timeZone: "Asia/Bangkok", dateStyle: "full" }).format(d);
export const thaiTime = (d: Date) =>
  new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" }).format(d);

const C = {
  brand: "#1a5e1a",     // school green (header, grand total, progress bar)
  brandSoft: "#EAF4EA", // light green panels
  zebra: "#F6F9F6",
  track: "#D5E6D5",
  text: "#1F2A1F",
  sub: "#5F6B5F",
  muted: "#A3ABA3",
  good: "#1E7B34",
  warn: "#B7791F",
  bad: "#C0392B",
  badSoft: "#FDECEA",
  white: "#FFFFFF",
  headerSub: "#CFE8CF",
};

// Attendance-rate colour: >= 90% green, >= 80% amber, otherwise red.
const rateColor = (p: number | null) => (p == null ? C.muted : p >= 90 ? C.good : p >= 80 ? C.warn : C.bad);
const fmtPct = (p: number | null) => (p == null ? "-" : p.toFixed(1));

function agg(group: Row[]) {
  const total = group.reduce((s, r) => s + r.total, 0);
  const present = group.reduce((s, r) => s + r.present, 0);
  return { total, present, absent: total - present, pct: total ? (100 * present) / total : null };
}

// Every table row uses the same columns (ชั้น | ทั้งหมด | มา | ไม่มา | %) and the same
// horizontal padding, so the columns line up. Flex units: 3 + 2 + 2 + 2 + 2 = 11.
const cell = (text: string, flex: number, o: { color?: string; bold?: boolean; size?: string } = {}) => ({
  type: "text", text, flex, size: o.size ?? "sm", align: "center", gravity: "center",
  color: o.color ?? C.text, weight: o.bold ? "bold" : "regular",
});

const tableRow = (contents: Row[], bg?: string) => ({
  type: "box", layout: "horizontal", contents,
  paddingTop: "5px", paddingBottom: "5px", paddingStart: "2px", paddingEnd: "2px", cornerRadius: "6px",
  ...(bg ? { backgroundColor: bg } : {}),
});

// Small rounded badge centred inside a cell spanning `flex` units.
const badge = (text: string, flex: number) => ({
  type: "box", layout: "horizontal", flex, justifyContent: "center", alignItems: "center",
  contents: [{
    type: "box", layout: "vertical", flex: 0, backgroundColor: C.badSoft, cornerRadius: "12px",
    paddingStart: "10px", paddingEnd: "10px", paddingTop: "2px", paddingBottom: "2px",
    contents: [{ type: "text", text, size: "xs", color: C.bad, weight: "bold" }],
  }],
});

const kv = (k: string, v: string, color: string = C.text) => ({
  type: "box", layout: "baseline", contents: [
    { type: "text", text: k, size: "xs", color: C.sub, flex: 0 },
    { type: "text", text: v, size: "sm", weight: "bold", align: "end", color, flex: 1 },
  ],
});

function progressBar(pct: number) {
  const w = Math.min(100, Math.max(1, Math.round(pct)));
  return {
    type: "box", layout: "vertical", margin: "md", height: "8px", cornerRadius: "4px",
    backgroundColor: C.track,
    contents: [{
      type: "box", layout: "vertical", width: `${w}%`, height: "8px", cornerRadius: "4px",
      backgroundColor: C.brand, contents: [{ type: "filler" }],
    }],
  };
}

export function summaryFlex(rows: Row[], now: Date, summaryUrl?: string) {
  const done = rows.filter((r) => r.submitted);
  const pending = rows.length - done.length;
  const all = agg(done);
  const kg = agg(done.filter((r) => String(r.name).startsWith("อ.")));
  const pri = agg(done.filter((r) => String(r.name).startsWith("ป.")));
  const schoolTotal = rows.reduce((s, r) => s + r.total, 0);

  const kpi = {
    type: "box", layout: "vertical", backgroundColor: C.brandSoft, cornerRadius: "12px", paddingAll: "12px",
    contents: [
      { type: "box", layout: "horizontal", alignItems: "center", spacing: "md", contents: [
        { type: "box", layout: "vertical", flex: 1, contents: [
          { type: "text", text: "มาเรียนวันนี้", size: "xs", color: C.sub },
          { type: "text", text: all.pct == null ? "-" : `${fmtPct(all.pct)}%`, size: "xxl", weight: "bold",
            color: all.pct == null ? C.muted : C.brand },
        ] },
        { type: "box", layout: "vertical", flex: 1, spacing: "xs", contents: [
          kv("มา", `${all.present} คน`, C.good),
          kv("ไม่มา", `${all.absent} คน`, all.absent ? C.bad : C.text),
          kv("ลงแล้ว", `${done.length}/${rows.length} ชั้น`, pending ? C.warn : C.good),
        ] },
      ] },
      ...(all.pct == null
        ? [{ type: "text", text: "ยังไม่มีชั้นใดลงสถิติวันนี้", size: "xs", color: C.sub, margin: "md", wrap: true }]
        : [progressBar(all.pct)]),
    ],
  };

  const head = tableRow([
    cell("ชั้น", 3, { bold: true, size: "xs", color: C.brand }),
    cell("ทั้งหมด", 2, { bold: true, size: "xs", color: C.brand }),
    cell("มา", 2, { bold: true, size: "xs", color: C.brand }),
    cell("ไม่มา", 2, { bold: true, size: "xs", color: C.brand }),
    cell("%", 2, { bold: true, size: "xs", color: C.brand }),
  ], C.brandSoft);

  const classRows = rows.map((r, i) => tableRow(
    r.submitted
      ? [
        cell(r.name, 3, { bold: true }),
        cell(String(r.total), 2),
        cell(String(r.present), 2),
        cell(String(r.absent), 2, { color: r.absent ? C.bad : C.text }),
        cell(fmtPct(r.pct), 2, { bold: true, color: rateColor(r.pct) }),
      ]
      : [
        cell(r.name, 3, { color: C.muted }),
        cell(String(r.total), 2, { color: C.muted }),
        badge("ยังไม่ลง", 6),
      ],
    i % 2 ? C.zebra : undefined,
  ));

  const sumRow = (label: string, a: ReturnType<typeof agg>, grand = false) => {
    const fg = grand ? C.white : C.text;
    return tableRow([
      cell(label, 3, { bold: true, color: fg }),
      cell(String(a.total), 2, { bold: true, color: fg }),
      cell(String(a.present), 2, { bold: true, color: fg }),
      cell(String(a.absent), 2, { bold: true, color: fg }),
      cell(fmtPct(a.pct), 2, { bold: true, color: grand ? C.white : rateColor(a.pct) }),
    ], grand ? C.brand : C.brandSoft);
  };

  // Only needed while some classes are pending; once all have submitted the grand-total row says it all.
  const notes = pending
    ? [{ type: "text", text: `* ยอดรวมนับเฉพาะชั้นที่ลงแล้ว · นักเรียนทั้งโรงเรียน ${schoolTotal} คน`,
      size: "xxs", color: C.sub, wrap: true, margin: "sm" }]
    : [];

  return {
    type: "flex",
    altText: all.pct == null
      ? "สรุปสถิติมาเรียน: ยังไม่มีชั้นใดลงสถิติวันนี้"
      : `สรุปสถิติมาเรียน: มา ${all.present}/${all.total} คน (${fmtPct(all.pct)}%) ลงแล้ว ${done.length}/${rows.length} ชั้น`,
    contents: {
      type: "bubble", size: "mega",
      header: {
        type: "box", layout: "vertical", backgroundColor: C.brand, paddingAll: "14px", contents: [
          { type: "text", text: "สรุปสถิติมาเรียน", color: C.white, weight: "bold", size: "xl" },
          { type: "text", text: SCHOOL, color: C.headerSub, size: "xs", wrap: true },
          { type: "text", text: `📅 ${thaiDate(now)}`, color: C.white, size: "xs", margin: "sm", wrap: true },
        ],
      },
      body: {
        type: "box", layout: "vertical", paddingAll: "12px", contents: [
          kpi,
          { type: "box", layout: "vertical", margin: "md", contents: [head, ...classRows] },
          { type: "box", layout: "vertical", margin: "sm", spacing: "xs", contents: [
            sumRow("รวมอนุบาล", kg),
            sumRow("รวมประถม", pri),
            sumRow("รวมทั้งหมด", all, true),
          ] },
          ...notes,
        ],
      },
      footer: {
        type: "box", layout: "vertical", spacing: "xs", paddingAll: "10px", contents: [
          ...(summaryUrl
            ? [{ type: "button", style: "primary", color: C.brand, height: "sm",
              action: { type: "uri", label: "ดูสรุปบนเว็บ", uri: summaryUrl } }]
            : []),
          { type: "text", text: `ข้อมูล ณ ${thaiTime(now)} น.`, size: "xxs", color: C.muted, align: "center" },
        ],
      },
      styles: { footer: { separator: true } },
    },
  };
}

export function leaveFlex() {
  return {
    type: "flex", altText: "ระบบการลาออนไลน์",
    contents: {
      type: "bubble",
      header: { type: "box", layout: "vertical", backgroundColor: C.brand, contents: [
        { type: "text", text: "ระบบการลาออนไลน์", color: C.white, weight: "bold", size: "lg" },
        { type: "text", text: SCHOOL, color: "#d8f0d8", size: "xs", wrap: true },
      ] },
      body: { type: "box", layout: "vertical", spacing: "sm", contents: [
        { type: "text", text: "ปีงบประมาณ 2569", weight: "bold" },
        { type: "text", text: "1 เม.ย. 2569 – 30 ก.ย. 2569", size: "sm", color: "#555555" },
      ] },
      footer: { type: "box", layout: "vertical", contents: [
        { type: "button", style: "primary", color: C.brand,
          action: { type: "uri", label: "ไปที่ระบบการลา", uri: LEAVE_URL } },
      ] },
    },
  };
}
