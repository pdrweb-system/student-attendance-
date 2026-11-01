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
  grid: "#D9E4D9",      // vertical rules between column groups
  gridOnBrand: "#5F8F5F",
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

const fmtPct = (p: number | null) => (p == null ? "-" : p.toFixed(1));

type Agg = {
  tm: number; tf: number; // เต็ม ชาย / หญิง
  mp: number; fp: number; // มา ชาย / หญิง
  ma: number; fa: number; // ขาด ชาย / หญิง
  total: number; present: number; absent: number; pct: number | null;
};

function agg(group: Row[]): Agg {
  const sum = (k: string) => group.reduce((s, r) => s + (Number(r[k]) || 0), 0);
  const tm = sum("total_male"), tf = sum("total_female"), mp = sum("male_present"), fp = sum("female_present");
  const total = tm + tf, present = mp + fp;
  return { tm, tf, mp, fp, ma: tm - mp, fa: tf - fp, total, present, absent: total - present,
    pct: total ? (100 * present) / total : null };
}

// LINE limits one bubble to 30 KB of JSON; with 8 classes this card is ~23 KB.
// Table columns, identical in every row so they line up:
//   ชั้น | เต็ม: ชาย หญิง รวม | มา: ชาย หญิง รวม | ขาด: ชาย หญิง รวม
// Flex units: name 5 + 9 numbers x 3 = 32, plus a 1px rule between the groups.
// The name column is narrow, so the total rows put "รวม" on its own line.
const NAME = 5, NUM = 3, GROUP = 3 * NUM;
const ROW_H = "26px", TOTAL_ROW_H = "34px";

type CellOpt = { color?: string; bold?: boolean; size?: string };
// shrink-to-fit: if a phone's Thai font is wider than expected, LINE shrinks the text
// instead of cutting it off with "…" (best effort; ignored by very old LINE versions).
const cell = (text: string, flex: number, o: CellOpt = {}) => ({
  type: "text", text, flex, size: o.size ?? "xs", align: "center", gravity: "center",
  color: o.color ?? C.text, adjustMode: "shrink-to-fit", ...(o.bold ? { weight: "bold" } : {}),
});
const rule = (color: string = C.grid) => ({ type: "separator", color });

const tableRow = (contents: Row[], bg?: string, height = ROW_H) => ({
  type: "box", layout: "horizontal", height, cornerRadius: "6px",
  contents, ...(bg ? { backgroundColor: bg } : {}),
});

// Small rounded badge centred inside a cell spanning `flex` units.
const badge = (text: string, flex: number) => ({
  type: "box", layout: "horizontal", flex, justifyContent: "center", alignItems: "center",
  contents: [{
    type: "box", layout: "vertical", flex: 0, backgroundColor: C.badSoft, cornerRadius: "12px",
    paddingStart: "10px", paddingEnd: "10px", paddingTop: "1px", paddingBottom: "1px",
    contents: [{ type: "text", text, size: "xxs", color: C.bad, weight: "bold" }],
  }],
});

function tableHead() {
  const h = (t: string, flex: number, color: string, size = "xs") => cell(t, flex, { bold: true, size, color });
  const sub = (totalColor: string) =>
    [h("ชาย", NUM, C.sub, "xxs"), h("หญิง", NUM, C.sub, "xxs"), h("รวม", NUM, totalColor, "xxs")];
  return {
    type: "box", layout: "horizontal", backgroundColor: C.brandSoft, cornerRadius: "6px",
    contents: [
      h("ชั้น", NAME, C.brand),
      rule(),
      { type: "box", layout: "vertical", flex: 3 * GROUP, contents: [
        { type: "box", layout: "horizontal", height: "22px", contents: [
          h("เต็ม", GROUP, C.sub), rule(), h("มา", GROUP, C.good), rule(), h("ขาด", GROUP, C.bad),
        ] },
        { type: "box", layout: "horizontal", height: "20px", contents: [
          ...sub(C.sub), rule(), ...sub(C.good), rule(), ...sub(C.bad),
        ] },
      ] },
    ],
  };
}

// kind: "class" = one class, "sub" = รวมอนุบาล/รวมประถม, "grand" = รวมทั้งหมด
function dataRow(label: string, a: Agg, kind: "class" | "sub" | "grand", bg?: string) {
  const grand = kind === "grand", bold = kind !== "class";
  const fg = grand ? C.white : C.text;
  const full = grand ? C.white : C.sub;
  const absent = (n: number) => (grand ? C.white : n > 0 ? C.bad : fg);
  const r = () => rule(grand ? C.gridOnBrand : C.grid);
  const name = kind === "class"
    ? cell(label, NAME, { bold: true, color: fg })
    // two lines, e.g. "รวม\nอนุบาล" (wrapped text can't use shrink-to-fit)
    : { type: "text", text: label, flex: NAME, size: "xxs", weight: "bold", color: fg,
      align: "center", gravity: "center", wrap: true };
  return tableRow([
    name,
    r(),
    cell(String(a.tm), NUM, { bold, color: full }),
    cell(String(a.tf), NUM, { bold, color: full }),
    cell(String(a.total), NUM, { bold: true, color: full }),
    r(),
    cell(String(a.mp), NUM, { bold, color: fg }),
    cell(String(a.fp), NUM, { bold, color: fg }),
    cell(String(a.present), NUM, { bold: true, color: grand ? C.white : C.good }),
    r(),
    cell(String(a.ma), NUM, { bold, color: absent(a.ma) }),
    cell(String(a.fa), NUM, { bold, color: absent(a.fa) }),
    cell(String(a.absent), NUM, { bold: true, color: absent(a.absent) }),
  ], grand ? C.brand : bg, kind === "class" ? ROW_H : TOTAL_ROW_H);
}

function pendingRow(r: Row, bg?: string) {
  const tm = Number(r.total_male) || 0, tf = Number(r.total_female) || 0;
  return tableRow([
    cell(r.name, NAME, { color: C.muted }),
    rule(),
    cell(String(tm), NUM, { color: C.muted }),
    cell(String(tf), NUM, { color: C.muted }),
    cell(String(tm + tf), NUM, { color: C.muted, bold: true }),
    rule(),
    badge("ยังไม่ลง", 2 * GROUP),
  ], bg);
}

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
  const schoolTotal = rows.reduce((s, r) => s + (Number(r.total) || 0), 0);

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
          kv("ขาด", `${all.absent} คน`, all.absent ? C.bad : C.text),
          kv("ลงแล้ว", `${done.length}/${rows.length} ชั้น`, pending ? C.warn : C.good),
        ] },
      ] },
      ...(all.pct == null
        ? [{ type: "text", text: "ยังไม่มีชั้นใดลงสถิติวันนี้", size: "xs", color: C.sub, margin: "md", wrap: true }]
        : [progressBar(all.pct)]),
    ],
  };

  const classRows = rows.map((r, i) => {
    const bg = i % 2 ? C.zebra : undefined;
    return r.submitted ? dataRow(r.name, agg([r]), "class", bg) : pendingRow(r, bg);
  });

  // Only needed while some classes are pending; once all have submitted the grand-total row says it all.
  const notes = pending
    ? [{ type: "box", layout: "vertical", margin: "sm", paddingStart: "4px", paddingEnd: "4px", contents: [
      { type: "text", text: `* ยอดรวมนับเฉพาะชั้นที่ลงแล้ว · นักเรียนทั้งโรงเรียน ${schoolTotal} คน`,
        size: "xxs", color: C.sub, wrap: true },
    ] }]
    : [];

  return {
    type: "flex",
    altText: all.pct == null
      ? "สรุปสถิติมาเรียน: ยังไม่มีชั้นใดลงสถิติวันนี้"
      : `สรุปสถิติมาเรียน: มา ${all.present}/${all.total} คน (${fmtPct(all.pct)}%) ขาด ${all.absent} คน ลงแล้ว ${done.length}/${rows.length} ชั้น`,
    contents: {
      // mega = LINE's standard width that fits phone screens (giga overflows).
      type: "bubble", size: "mega",
      header: {
        type: "box", layout: "vertical", backgroundColor: C.brand, paddingAll: "14px", contents: [
          { type: "text", text: "สรุปสถิติมาเรียน", color: C.white, weight: "bold", size: "xl" },
          { type: "text", text: SCHOOL, color: C.headerSub, size: "xs", wrap: true },
          { type: "text", text: `📅 ${thaiDate(now)}`, color: C.white, size: "xs", margin: "sm", wrap: true },
        ],
      },
      body: {
        type: "box", layout: "vertical", paddingTop: "8px", paddingBottom: "8px", paddingStart: "4px",
        paddingEnd: "4px", contents: [
          { type: "box", layout: "vertical", paddingStart: "4px", paddingEnd: "4px", contents: [kpi] },
          { type: "box", layout: "vertical", margin: "md", contents: [tableHead(), ...classRows] },
          { type: "box", layout: "vertical", margin: "sm", spacing: "xs", contents: [
            dataRow("รวม\nอนุบาล", kg, "sub", C.brandSoft),
            dataRow("รวม\nประถม", pri, "sub", C.brandSoft),
            dataRow("รวม\nทั้งหมด", all, "grand"),
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
