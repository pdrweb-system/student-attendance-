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
  brand: "#1a5e1a",     // school green (header bar, progress bar)
  brandSoft: "#EAF4EA", // light green KPI panel
  track: "#D5E6D5",
  text: "#1F2A1F",
  sub: "#5F6B5F",
  muted: "#A3ABA3",
  good: "#1E7B34",
  warn: "#B7791F",
  bad: "#C0392B",
  badSoft: "#FDECEA",
  warnSoft: "#FFF4D6",
  waitSoft: "#EEF1F4",  // class not submitted yet, before the cutoff
  white: "#FFFFFF",
  headerSub: "#CFE8CF",
  // table
  headBg: "#D6E9FB",    // หัวตาราง: ฟ้า
  headText: "#1F4E79",
  headSub: "#4A6075",
  kgBg: "#EDE4F7",      // รวมอนุบาล: ม่วง
  kgRule: "#D6C8EA",
  priBg: "#FFF3BF",     // รวมประถม: เหลือง
  priRule: "#E8D98F",
  allBg: "#E2E5E9",     // รวมทั้งหมด: เทา
  allRule: "#C5CBD2",
  ruleGroup: "#B9C4CF", // table border and rules between เต็ม | มา | ขาด
  ruleCell: "#DDE3E9",  // rules between cells
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

// LINE limits one bubble to 30 KB of JSON; with 8 classes this card is ~27 KB.
//
// Table: every number sits in its own cell, with a light rule between cells and a darker
// rule between the groups:  ชั้น | เต็ม: ชาย หญิง รวม | มา: ชาย หญิง รวม | ขาด: ชาย หญิง รวม
// The class-name column has a fixed width and every row draws the same 9px of rules
// (rows that draw fewer add invisible ones), so all rows split the remaining width the
// same way and the vertical rules line up from the header to the last row.
// Class rows have a fixed height so the rules run unbroken; total rows grow to fit their
// two-line label (Thai text is drawn with taller lines on phones).
const NAME_W = "42px", NUM = 3, GROUP = 3 * NUM;
const ROW_H = "26px";

type CellOpt = { color?: string; bold?: boolean; size?: string; fit?: boolean };
// shrink-to-fit: if a phone's Thai font is wider than expected, LINE shrinks the text
// instead of cutting it off with "…" (best effort). Left off where the text can't
// overflow (1–2 digit class numbers) to keep the message small.
const cell = (text: string, flex: number, o: CellOpt = {}) => ({
  type: "text", text, flex, size: o.size ?? "xs", align: "center", gravity: "center", color: o.color ?? C.text,
  ...(o.fit === false ? {} : { adjustMode: "shrink-to-fit" }), ...(o.bold ? { weight: "bold" } : {}),
});
const rule = (color: string) => ({ type: "separator", color });

// Fixed-width first column. A label containing "\n" is shown on two lines.
const nameCell = (label: string, o: { color?: string; size?: string; bold?: boolean } = {}) => ({
  type: "box", layout: "vertical", width: NAME_W, flex: 0, justifyContent: "center", contents: [{
    type: "text", text: label, size: o.size ?? "xs", color: o.color ?? C.text, align: "center",
    ...(o.bold === false ? {} : { weight: "bold" }),
    ...(label.includes("\n") ? { wrap: true } : { adjustMode: "shrink-to-fit" }),
  }],
});

type GridOpt = { bg?: string; cellRule?: string; height?: string | null; boxed?: boolean; ghosts?: number };
// name | group | group | group with rules between them. `ghosts` adds invisible rules so a
// row that draws fewer rules (the "ยังไม่ลง" badge spans several cells) still lines up.
function gridRow(name: Row, groups: Row[][], o: GridOpt = {}) {
  const contents: Row[] = [name];
  for (const g of groups) {
    contents.push(rule(C.ruleGroup));
    g.forEach((c, i) => {
      if (i) contents.push(rule(o.cellRule ?? C.ruleCell));
      contents.push(c);
    });
  }
  for (let i = 0; i < (o.ghosts ?? 0); i++) contents.push(rule(o.bg ?? C.white));
  const height = o.height === undefined ? ROW_H : o.height;
  return {
    type: "box", layout: "horizontal", contents,
    ...(height ? { height } : { paddingTop: "5px", paddingBottom: "5px" }),
    ...(o.boxed ? { cornerRadius: "6px", borderWidth: "1px", borderColor: C.ruleGroup } : {}),
    ...(o.bg ? { backgroundColor: o.bg } : {}),
  };
}

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
  const ghost = rule(C.headBg); // invisible: group labels draw no cell rules
  const group = (t: string, color: string) => [ghost, h(t, GROUP, color), ghost];
  const subs = (totalColor: string) => [
    h("ชาย", NUM, C.headSub, "xxs"), rule(C.ruleCell), h("หญิง", NUM, C.headSub, "xxs"), rule(C.ruleCell),
    h("รวม", NUM, totalColor, "xxs"),
  ];
  return {
    type: "box", layout: "horizontal", backgroundColor: C.headBg,
    contents: [
      nameCell("ชั้น", { color: C.headText }),
      rule(C.ruleGroup),
      { type: "box", layout: "vertical", flex: 1, contents: [
        { type: "box", layout: "horizontal", height: "26px", contents: [
          ...group("เต็ม", C.headText), rule(C.ruleGroup), ...group("มา", C.good), rule(C.ruleGroup),
          ...group("ขาด", C.bad),
        ] },
        rule(C.ruleCell),
        { type: "box", layout: "horizontal", height: "22px", contents: [
          ...subs(C.headSub), rule(C.ruleGroup), ...subs(C.good), rule(C.ruleGroup), ...subs(C.bad),
        ] },
      ] },
    ],
  };
}

// เต็ม / มา / ขาด cells; the รวม cell of each group is bold.
function numberGroups(a: Agg, bold: boolean, fit: boolean) {
  const n = (v: number, color: string, b = bold) => cell(String(v), NUM, { color, bold: b, fit });
  const absent = (v: number) => (v > 0 ? C.bad : C.text);
  return [
    [n(a.tm, C.sub), n(a.tf, C.sub), n(a.total, C.sub, true)],
    [n(a.mp, C.text), n(a.fp, C.text), n(a.present, C.good, true)],
    [n(a.ma, absent(a.ma)), n(a.fa, absent(a.fa)), n(a.absent, absent(a.absent), true)],
  ];
}

const classRow = (r: Row) => gridRow(nameCell(r.name), numberGroups(agg([r]), false, false));

function pendingRow(r: Row) {
  const tm = Number(r.total_male) || 0, tf = Number(r.total_female) || 0;
  const n = (v: number, b = false) => cell(String(v), NUM, { color: C.muted, bold: b, fit: false });
  // The badge covers มา + ขาด: 5 invisible rules stand in for the 4 cell rules + 1 group rule it hides.
  return gridRow(nameCell(r.name, { color: C.muted, bold: false }),
    [[n(tm), n(tf), n(tm + tf, true)], [badge("ยังไม่ลง", 2 * GROUP)]], { ghosts: 5 });
}

// Coloured total row; its cell rules are a darker shade of the row colour so they stay visible.
const totalRow = (label: string, a: Agg, bg: string, cellRule: string) =>
  gridRow(nameCell(label, { size: "xxs" }), numberGroups(a, true, true), { bg, cellRule, height: null, boxed: true });

const kv = (k: string, v: string, color: string = C.text) => ({
  type: "box", layout: "baseline", contents: [
    { type: "text", text: k, size: "xs", color: C.sub, flex: 0 },
    { type: "text", text: v, size: "sm", weight: "bold", align: "end", color, flex: 1 },
  ],
});

function progressBar(pct: number, color: string = C.brand) {
  const w = Math.min(100, Math.max(1, Math.round(pct)));
  return {
    type: "box", layout: "vertical", margin: "md", height: "8px", cornerRadius: "4px",
    backgroundColor: C.track,
    contents: [{
      type: "box", layout: "vertical", width: `${w}%`, height: "8px", cornerRadius: "4px",
      backgroundColor: color, contents: [{ type: "filler" }],
    }],
  };
}

// Green title bar shared by the summary and check cards.
function cardHeader(title: string, line: string, line2?: string) {
  return {
    type: "box", layout: "vertical", backgroundColor: C.brand, paddingAll: "14px", contents: [
      { type: "text", text: title, color: C.white, weight: "bold", size: "xl" },
      { type: "text", text: SCHOOL, color: C.headerSub, size: "xs", wrap: true },
      { type: "text", text: line, color: C.white, size: "xs", margin: "sm", wrap: true },
      ...(line2 ? [{ type: "text", text: line2, color: C.white, size: "xs", wrap: true }] : []),
    ],
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

  const classRows = rows.map((r) => (r.submitted ? classRow(r) : pendingRow(r)));
  // header + class rows in one bordered table; a line under every row
  const table = {
    type: "box", layout: "vertical", margin: "md", borderWidth: "1px", borderColor: C.ruleGroup, cornerRadius: "6px",
    contents: [tableHead(), rule(C.ruleGroup), ...classRows.flatMap((row, i) => (i ? [rule(C.ruleCell), row] : [row]))],
  };
  const totals = {
    type: "box", layout: "vertical", margin: "sm", spacing: "xs", contents: [
      totalRow("รวม\nอนุบาล", kg, C.kgBg, C.kgRule),
      totalRow("รวม\nประถม", pri, C.priBg, C.priRule),
      totalRow("รวม\nทั้งหมด", all, C.allBg, C.allRule),
    ],
  };

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
      header: cardHeader("สรุปสถิติมาเรียน", `📅 ${thaiDate(now)}`),
      body: {
        type: "box", layout: "vertical", paddingTop: "8px", paddingBottom: "8px", paddingStart: "4px",
        paddingEnd: "4px", contents: [
          { type: "box", layout: "vertical", paddingStart: "4px", paddingEnd: "4px", contents: [kpi] },
          table,
          totals,
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

// ---------------------------------------------------------------- เช็คสถิติ

// submit_status() result: can_submit, reason, accepting, closed_message, cutoff_time, deadline, extended
// deno-lint-ignore no-explicit-any
export type Status = Record<string, any>;

const timeLeft = (ms: number) => {
  const m = Math.max(1, Math.ceil(ms / 60000));
  if (m < 60) return `อีก ${m} นาที`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `อีก ${h} ชม. ${r} นาที` : `อีก ${h} ชม.`;
};

// Who has submitted today, whether teachers can still submit, and buttons to the web pages.
// teacherUrl: the LIFF link to the teacher page when a LIFF app is set up (lets the page close
// itself after saving); otherwise the button opens the site directly.
export function checkFlex(st: Status, rows: Row[], now: Date, siteUrl?: string, teacherUrl?: string) {
  const base = siteUrl ? siteUrl.replace(/\/?$/, "/") : undefined;
  const done = rows.filter((r) => r.submitted);
  const waiting = rows.filter((r) => !r.submitted);
  const open = !!st.accepting;
  const canSubmit = open && !!st.can_submit;
  const late = open && !canSubmit; // past the cutoff and no extension
  const deadline = st.deadline ? new Date(st.deadline) : null;

  type Line = { text: string; size?: string; color?: string };
  let banner: { bg: string; color: string; title: string; lines: Line[] };
  if (!open) {
    banner = { bg: C.badSoft, color: C.bad, title: "⛔ ปิดรับการลงสถิติ",
      lines: [{ text: st.closed_message || "ระบบปิดอยู่" }] };
  } else if (!waiting.length) {
    banner = { bg: C.brandSoft, color: C.good, title: "✅ ลงครบทุกชั้นแล้ว",
      lines: canSubmit && deadline ? [{ text: `แก้ไขได้ถึง ${thaiTime(deadline)} น.` }] : [] };
  } else if (canSubmit && deadline) {
    banner = { bg: C.brandSoft, color: C.good, title: "🟢 เปิดรับการลงสถิติ", lines: [
      { text: `ลงได้ถึง ${thaiTime(deadline)} น. · ${timeLeft(deadline.getTime() - now.getTime())}` },
      ...(st.extended ? [{ text: "แอดมินเปิดช่วงลงเพิ่ม", size: "xs", color: C.sub }] : []),
    ] };
  } else {
    banner = { bg: C.warnSoft, color: C.warn, title: "⏰ หมดเวลาลงสถิติแล้ว",
      lines: [{ text: `ปิดรับเมื่อ ${st.cutoff_time} น.` }] };
  }
  const bannerBox = {
    type: "box", layout: "vertical", backgroundColor: banner.bg, cornerRadius: "10px", paddingAll: "12px",
    spacing: "xs", contents: [
      { type: "text", text: banner.title, size: "md", weight: "bold", color: banner.color, wrap: true },
      ...banner.lines.map((l) => ({ type: "text", text: l.text, size: l.size ?? "sm", color: l.color ?? C.text, wrap: true })),
    ],
  };

  // one chip per class, 4 per row: ✓ + time when submitted; "ยังไม่ลง" grey before the cutoff, red after
  const chip = (r: Row) => {
    const ok = !!r.submitted;
    const fg = ok ? C.good : late ? C.bad : C.sub;
    return {
      type: "box", layout: "vertical", flex: 1, cornerRadius: "8px", paddingTop: "6px", paddingBottom: "6px",
      backgroundColor: ok ? C.brandSoft : late ? C.badSoft : C.waitSoft, contents: [
        { type: "text", text: r.name, size: "sm", weight: "bold", align: "center", color: ok ? C.text : fg },
        { type: "text", text: ok ? (r.updated_at ? `✓ ${thaiTime(new Date(r.updated_at))}` : "✓ ลงแล้ว") : "ยังไม่ลง",
          size: "xxs", weight: "bold", align: "center", color: fg },
      ],
    };
  };
  const chipRows: Row[] = [];
  for (let i = 0; i < rows.length; i += 4) {
    const cells: Row[] = rows.slice(i, i + 4).map(chip);
    while (cells.length < 4) cells.push({ type: "filler" });
    chipRows.push({ type: "box", layout: "horizontal", spacing: "sm", contents: cells });
  }
  const progressColor = waiting.length ? (late ? C.bad : C.warn) : C.good;
  const details = open
    ? [
      { type: "box", layout: "baseline", margin: "lg", contents: [
        { type: "text", text: "ลงแล้ว", size: "sm", color: C.sub, flex: 0 },
        { type: "text", text: `${done.length}/${rows.length} ชั้น`, size: "sm", weight: "bold", align: "end",
          color: progressColor, flex: 1 },
      ] },
      progressBar(rows.length ? (100 * done.length) / rows.length : 0, waiting.length && late ? C.bad : C.brand),
      { type: "box", layout: "vertical", margin: "lg", spacing: "sm", contents: chipRows },
      ...(waiting.length
        ? [{ type: "text", size: "xs", color: C.sub, wrap: true, margin: "md",
          text: canSubmit
            ? (base ? "ครูประจำชั้นที่ยังไม่ลง กดปุ่ม \"ลงสถิติ\" ด้านล่าง" : "ครูประจำชั้นที่ยังไม่ลง กรุณาลงสถิติในหน้าเว็บ")
            : "ชั้นที่ยังไม่ลง ติดต่อแอดมินเพื่อเปิดช่วงลงเพิ่ม หรือให้แอดมินกรอกแทน" }]
        : []),
    ]
    : [];

  const buttons = base
    ? [
      ...(canSubmit
        ? [{ type: "button", style: "primary", color: C.brand, height: "sm", flex: 1,
          action: { type: "uri", label: "ลงสถิติ", uri: teacherUrl ?? base } }]
        : []),
      { type: "button", style: canSubmit ? "secondary" : "primary", color: canSubmit ? C.brandSoft : C.brand,
        height: "sm", flex: 1, action: { type: "uri", label: "ดูสรุป", uri: `${base}summary.html` } },
    ]
    : [];

  return {
    type: "flex",
    altText: !open
      ? "เช็คสถิติ: ปิดรับการลงสถิติ"
      : waiting.length
      ? `เช็คสถิติ: ลงแล้ว ${done.length}/${rows.length} ชั้น · ยังไม่ลง ${waiting.map((r) => r.name).join(" ")}`
      : "เช็คสถิติ: ลงครบทุกชั้นแล้ว",
    contents: {
      type: "bubble", size: "mega",
      header: cardHeader("เช็คสถิติ", `📅 ${thaiDate(now)}`, `🕒 เวลา ${thaiTime(now)} น.`),
      body: { type: "box", layout: "vertical", paddingAll: "12px", contents: [bannerBox, ...details] },
      ...(buttons.length
        ? {
          footer: { type: "box", layout: "horizontal", spacing: "sm", paddingAll: "10px", contents: buttons },
          styles: { footer: { separator: true } },
        }
        : {}),
    },
  };
}

// Fiscal-year period from system_settings (admin page); defaults match the original card.
export type LeavePeriod = { leave_year_label?: string; leave_start?: string; leave_end?: string };
const shortThai = (d: string) => new Date(`${d}T00:00:00+07:00`).toLocaleDateString("th-TH-u-ca-buddhist",
  { timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "numeric" });

export function leaveFlex(p: LeavePeriod = {}) {
  const label = p.leave_year_label || "ปีงบประมาณ 2569";
  const period = p.leave_start && p.leave_end
    ? `${shortThai(p.leave_start)} – ${shortThai(p.leave_end)}` : "1 เม.ย. 2569 – 30 ก.ย. 2569";
  return {
    type: "flex", altText: "ระบบการลาออนไลน์",
    contents: {
      type: "bubble",
      header: { type: "box", layout: "vertical", backgroundColor: C.brand, contents: [
        { type: "text", text: "ระบบการลาออนไลน์", color: C.white, weight: "bold", size: "lg" },
        { type: "text", text: SCHOOL, color: "#d8f0d8", size: "xs", wrap: true },
      ] },
      body: { type: "box", layout: "vertical", spacing: "sm", contents: [
        { type: "text", text: label, weight: "bold", wrap: true },
        { type: "text", text: period, size: "sm", color: "#555555", wrap: true },
      ] },
      footer: { type: "box", layout: "vertical", contents: [
        { type: "button", style: "primary", color: C.brand,
          action: { type: "uri", label: "ไปที่ระบบการลา", uri: LEAVE_URL } },
      ] },
    },
  };
}
