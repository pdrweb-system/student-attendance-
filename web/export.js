// Excel export for the summary page. ExcelJS (~1 MB) is loaded only when someone exports.
// The builder takes ExcelJS as a parameter and has no page dependencies, so it also runs in Node.

const EXCELJS_URL = "https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js";
const SCHOOL = "โรงเรียนวัดปรีดาราม (มณีศิริวรรณ)";
const FONT = "Tahoma"; // installed on Windows and macOS, renders Thai well

// Same colours as the table on the web page and in LINE (ARGB).
const C = {
  title: "FF1A5E1A", headBg: "FFD6E9FB", headText: "FF1F4E79", kgBg: "FFEDE4F7", priBg: "FFFFF3BF",
  allBg: "FFE2E5E9", ruleCell: "FFDDE3E9", ruleGroup: "FF8FA0B3", good: "FF1E7B34", bad: "FFC0392B",
  sub: "FF5F6B5F", text: "FF1F2A1F", muted: "FF7A847A",
};
const COLS = 11; // ชั้น | เต็ม ช ญ รวม | มา ช ญ รวม | ขาด ช ญ รวม | ร้อยละ
const GROUP_START = new Set([2, 5, 8, 11]); // columns that get the darker group rule on their left

const thaiDate = (d) => new Date(`${d}T00:00:00+07:00`).toLocaleDateString("th-TH-u-ca-buddhist",
  { timeZone: "Asia/Bangkok", dateStyle: "full" });
const thaiShort = (d) => new Date(`${d}T00:00:00+07:00`).toLocaleDateString("th-TH-u-ca-buddhist",
  { timeZone: "Asia/Bangkok", day: "numeric", month: "short" });
const thaiMonth = (d) => new Date(`${d}T00:00:00+07:00`).toLocaleDateString("th-TH-u-ca-buddhist",
  { timeZone: "Asia/Bangkok", month: "long", year: "numeric" });
const thaiStamp = (t) => t.toLocaleString("th-TH-u-ca-buddhist",
  { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" });
const yearBE = (d) => Number(d.slice(0, 4)) + 543;

export const fileNameDay = (d) => `สรุปสถิติมาเรียน_${d.slice(8, 10)}-${d.slice(5, 7)}-${yearBE(d)}.xlsx`;
export const fileNameMonth = (d) => `สรุปสถิติมาเรียน_${thaiMonth(d).replace(/\s+/g, "_")}.xlsx`;

// เต็ม / มา / ขาด split by ชาย-หญิง, for one class or a group of submitted classes.
function sums(rows) {
  const sum = (k) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
  const tm = sum("total_male"), tf = sum("total_female"), mp = sum("male_present"), fp = sum("female_present");
  const total = tm + tf, present = mp + fp;
  return { tm, tf, total, mp, fp, present, ma: tm - mp, fa: tf - fp, absent: total - present,
    rate: total ? present / total : null };
}

function addDaySheet(wb, date, rows, now) {
  const ws = wb.addWorksheet(thaiShort(date), {
    views: [{ state: "frozen", ySplit: 6 }],
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      horizontalCentered: true, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 } },
  });
  ws.columns = [{ width: 13 }, ...Array.from({ length: 9 }, () => ({ width: 7.5 })), { width: 9 }];
  const font = (o = {}) => ({ name: FONT, size: 11, color: { argb: C.text }, ...o });
  const rule = (col) => ({ style: "thin", color: { argb: col } });
  const border = (col) => ({
    top: rule(C.ruleCell), bottom: rule(C.ruleCell), right: rule(col === COLS ? C.ruleGroup : C.ruleCell),
    left: rule(GROUP_START.has(col) || col === 1 ? C.ruleGroup : C.ruleCell),
  });
  const put = (r, col, value, o = {}) => {
    const cell = ws.getCell(r, col);
    cell.value = value;
    cell.font = font(o.font);
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: !!o.wrap };
    cell.border = border(col);
    if (o.fill) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: o.fill } };
    if (o.numFmt) cell.numFmt = o.numFmt;
    return cell;
  };

  // Title block (rows 1–3)
  const title = (r, text, f) => {
    ws.mergeCells(r, 1, r, COLS);
    const cell = ws.getCell(r, 1);
    cell.value = text;
    cell.font = font(f);
    cell.alignment = { horizontal: "center", vertical: "middle" };
  };
  title(1, "สรุปสถิติมาเรียนประจำวัน", { size: 16, bold: true, color: { argb: C.title } });
  title(2, SCHOOL, { size: 12 });
  title(3, thaiDate(date), { size: 12, bold: true });
  ws.getRow(1).height = 26;

  // Header (rows 5–6): blue, like the web page
  const head = { fill: C.headBg, font: { bold: true, color: { argb: C.headText } } };
  for (let col = 1; col <= COLS; col++) { put(5, col, null, head); put(6, col, null, head); }
  ws.mergeCells("A5:A6"); ws.mergeCells("B5:D5"); ws.mergeCells("E5:G5"); ws.mergeCells("H5:J5"); ws.mergeCells("K5:K6");
  put(5, 1, "ชั้น", head);
  put(5, 2, "เต็ม", head);
  put(5, 5, "มา", { ...head, font: { bold: true, color: { argb: C.good } } });
  put(5, 8, "ขาด", { ...head, font: { bold: true, color: { argb: C.bad } } });
  put(5, 11, "ร้อยละ", head);
  ["ชาย", "หญิง", "รวม", "ชาย", "หญิง", "รวม", "ชาย", "หญิง", "รวม"].forEach((t, i) => put(6, i + 2, t, head));
  ws.getRow(5).height = 20; ws.getRow(6).height = 20;

  // One row of numbers (a class, or a total row with its own colour)
  const numbers = (r, label, a, fill = null) => {
    const bold = !!fill;
    const absent = (n) => ({ bold, color: { argb: n > 0 ? C.bad : C.text } });
    put(r, 1, label, { fill, font: { bold: true } });
    put(r, 2, a.tm, { fill, font: { bold, color: { argb: C.sub } } });
    put(r, 3, a.tf, { fill, font: { bold, color: { argb: C.sub } } });
    put(r, 4, a.total, { fill, font: { bold: true, color: { argb: C.sub } } });
    put(r, 5, a.mp, { fill, font: { bold } });
    put(r, 6, a.fp, { fill, font: { bold } });
    put(r, 7, a.present, { fill, font: { bold: true, color: { argb: C.good } } });
    put(r, 8, a.ma, { fill, font: absent(a.ma) });
    put(r, 9, a.fa, { fill, font: absent(a.fa) });
    put(r, 10, a.absent, { fill, font: { ...absent(a.absent), bold: true } });
    put(r, 11, a.rate ?? "-", { fill, font: { bold }, numFmt: "0.0%" });
  };

  let r = 7;
  for (const row of rows) {
    if (row.submitted) numbers(r, row.name, sums([row]));
    else {
      // not submitted yet: show the class size, mark the rest "ยังไม่ลง" (not "มา 0 คน")
      const tm = Number(row.total_male) || 0, tf = Number(row.total_female) || 0;
      put(r, 1, row.name, { font: { color: { argb: C.muted } } });
      put(r, 2, tm, { font: { color: { argb: C.muted } } });
      put(r, 3, tf, { font: { color: { argb: C.muted } } });
      put(r, 4, tm + tf, { font: { bold: true, color: { argb: C.muted } } });
      for (let col = 5; col <= COLS; col++) put(r, col, null);
      ws.mergeCells(r, 5, r, COLS);
      put(r, 5, "ยังไม่ลง", { font: { bold: true, color: { argb: C.bad } } });
    }
    ws.getRow(r).height = 19;
    r++;
  }
  const done = rows.filter((x) => x.submitted);
  const totals = [
    ["รวมอนุบาล", done.filter((x) => String(x.name).startsWith("อ.")), C.kgBg],
    ["รวมประถม", done.filter((x) => String(x.name).startsWith("ป.")), C.priBg],
    ["รวมทั้งหมด", done, C.allBg],
  ];
  for (const [label, group, fill] of totals) { numbers(r, label, sums(group), fill); ws.getRow(r).height = 20; r++; }

  r++;
  ws.mergeCells(r, 1, r, COLS);
  const note = ws.getCell(r, 1);
  note.value = `* ยอดรวมนับเฉพาะชั้นที่ลงแล้ว ${done.length}/${rows.length} ชั้น · ส่งออกเมื่อ ${thaiStamp(now)} น.`;
  note.font = font({ size: 9, italic: true, color: { argb: C.muted } });
  note.alignment = { horizontal: "left" };
  ws.pageSetup.printArea = `A1:K${r}`;
}

// days: [{ date: "YYYY-MM-DD", rows: daily_summary() rows }], one sheet per day.
export function buildWorkbook(ExcelJS, days, now = new Date()) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "ระบบลงสถิติมาเรียน";
  wb.created = now;
  for (const { date, rows } of days) addDaySheet(wb, date, rows, now);
  return wb;
}

let loading = null;
export function loadExcelJS() {
  if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
  loading ??= new Promise((ok, fail) => {
    const s = document.createElement("script");
    s.src = EXCELJS_URL;
    s.onload = () => ok(window.ExcelJS);
    s.onerror = () => { loading = null; fail(new Error("โหลดตัวสร้างไฟล์ Excel ไม่สำเร็จ")); };
    document.head.append(s);
  });
  return loading;
}

export async function download(wb, fileName) {
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf],
    { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: fileName });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
