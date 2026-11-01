# ระบบลงสถิติมาเรียนประจำวัน — โรงเรียนวัดปรีดาราม (มณีศิริวรรณ)

> brief สำหรับเริ่มโปรเจคใหม่ใน Claude Code (คัดลอกเป็น `CLAUDE.md` ในรากของ repo ใหม่ได้เลย)
> **ไม่ใช้ Google Apps Script อีกต่อไป** — ย้ายเป็น GitHub Pages + Supabase

## 1. เป้าหมาย
ให้ครูลงจำนวนนักเรียนที่มาเรียนแต่ละวัน (แยกชาย/หญิง ต่อชั้น) แล้วระบบสรุปให้ผู้บริหาร/ครูดูได้ทันที
ทั้งผ่านเว็บและผ่านกลุ่ม LINE พร้อมเก็บประวัติเพื่อทำรายงานรายเดือน/รายภาคเรียน

## 2. ระบบเดิม (อ้างอิงเท่านั้น ไม่ต้องคงไว้)
- Google Form ต่อชั้น → Google Sheet → `IMPORTRANGE` รวมในไฟล์หลัก → ชีต `สรุป`/`report`/`report2`
- Apps Script (`code.gs`) เป็น LINE webhook:
  - **"สรุปสถิติ"** → สร้างรูปตารางสรุป (Slides → PNG) ส่งกลับ
  - **"เช็คสถิติ"** → ตอบข้อความหัวเรื่อง + วัน/เวลาไทย + ลิงก์ฟอร์ม
  - ข้อความที่มี **"ลาป่วย"** → Flex Message (หัวเขียว `#1a5e1a`, "ระบบการลาออนไลน์ โรงเรียนวัดปรีดาราม (มณีศิริวรรณ)", ปีงบประมาณ 2569: 1 เม.ย. 2569 – 30 ก.ย. 2569) ปุ่มไปที่ https://pdrweb-system.github.io/leavesystem/
- ชีต `Action` (แจ้งเตือนตามเวลา) **ไม่ย้ายมาระบบใหม่** — ตัดสินใจแล้วว่าไม่ใช้ Push
- ชั้นที่มี 8 ชั้น: อ.2 (1 ห้อง), อ.3, ป.1–ป.6
- จำนวนนักเรียนทั้งหมดแต่ละชั้นไม่เท่ากัน **เจ้าของกรอกเองในระบบใหม่** (ไม่ต้อง seed ค่าเดิม)

### ปัญหาของระบบเดิมที่ต้องแก้
1. ไม่มีประวัติ (ลบข้อมูลทุกวัน, ดึงแค่แถวล่าสุด) → รายงานย้อนหลังไม่ได้
2. จำนวนนักเรียนทั้งหมดฝังในสูตร ต้องแก้มือ
3. โทเคน LINE เก็บในชีตเป็นข้อความธรรมดา, webhook ไม่ตรวจลายเซ็น
4. รูปสรุปแชร์สาธารณะบน Drive และสะสมไม่ลบ
5. พึ่งหลายระบบต่อกัน (Form→Sheet→IMPORTRANGE→Slides→Drive→LINE) พังง่าย
6. ตอบ LINE ช้า (สร้างสไลด์ตอนรับ webhook) เสี่ยง reply token หมดอายุ

## 3. สถาปัตยกรรมใหม่
| ส่วน | เทคโนโลยี |
|---|---|
| Frontend | HTML/JS (หรือ Vite + vanilla/React) โฮสต์บน **GitHub Pages** |
| ฐานข้อมูล | **Supabase** Postgres + RLS (project ใหม่ที่เจ้าของสร้างเอง) |
| ครูลงสถิติ (ไม่ล็อกอิน) | Edge Function `submit-attendance` ตรวจ PIN ร่วม + กติกา แล้วเขียนด้วย service role |
| แอดมิน | **Supabase Auth** บัญชีเดียว (อีเมล+รหัสผ่าน) → แก้ข้อมูลย้อนหลัง, ตั้งค่า, เปิด/ปิดระบบ |
| LINE | Edge Function `line-webhook` ตรวจ `X-Line-Signature` ตอบด้วย **Reply API** ในกลุ่ม (ไม่ใช้ Push) |
| ตารางสรุปใน LINE | **Flex Message** สร้างจากข้อมูลโดยตรง (ไม่ต้องมี Slides/PNG/Drive) |
| CI/CD | GitHub Actions: deploy Pages, deploy Edge Functions, รัน migration |

Secrets (`LINE_CHANNEL_ACCESS_TOKEN`, `LINE_CHANNEL_SECRET`, `TEACHER_PIN`, service role key) เก็บใน Supabase secrets / GitHub Secrets เท่านั้น
**ห้าม commit ลง repo / ห้ามวางในแชต** — หน้าเว็บใช้เฉพาะ Project URL + publishable (anon) key

### 3.1 กติกาสิทธิ์ (ตัดสินใจแล้ว)
- **ครู**: ลงสถิติได้เฉพาะ **วันนี้ (เวลาไทย)** และ **ส่ง/แก้ไขกี่ครั้งก็ได้ แต่ระบบใช้เฉพาะข้อมูลที่ส่งล่าสุด** (upsert ทับของเดิม 1 แถวต่อชั้นต่อวัน) **ภายในเวลา 08:30 น. (Asia/Bangkok) ของทุกวัน** — หลังเวลานี้ครูลงหรือแก้ไม่ได้ ต้องให้แอดมินดำเนินการ
  - เวลาตัดรอบเก็บเป็นค่าตั้งค่า `teacher_cutoff_time` (ค่าเริ่มต้น 08:30) แอดมินปรับได้ ไม่ฝังในโค้ด
  - ตรวจเวลาที่ฝั่งเซิร์ฟเวอร์เท่านั้น (ใช้เวลาของเซิร์ฟเวอร์แปลงเป็น Asia/Bangkok ไม่เชื่อนาฬิกาเครื่องครู)
  - **เปิดช่วงลงเพิ่มชั่วคราว (extension)**: แอดมินกดเปิดให้ครูลง/แก้ของ "วันนี้" หลัง 08:30 ได้ถึงเวลาที่กำหนด (เช่น อีก 30 นาที / ถึง 10:00) เลือกได้ว่าเปิดให้ **ทุกชั้น** หรือ **เฉพาะบางชั้น** — หมดเวลาแล้วปิดเองอัตโนมัติ (ตรวจที่เซิร์ฟเวอร์ ไม่ต้องมี cron) ใช้ได้เฉพาะวันนี้ ย้อนหลังต้องให้แอดมินแก้เอง
  - ครูลงได้เมื่อ: ระบบเปิดอยู่ AND `att_date` = วันนี้ AND (เวลาตอนนี้ ≤ `teacher_cutoff_time` OR มี extension ที่ยังไม่หมดอายุและครอบคลุมชั้นนั้น)
  - ชั้นที่ไม่ได้ลงทันและไม่มี extension จะไม่มีข้อมูลของวันนั้นจนกว่าแอดมินกรอกให้ — สรุปและ LINE ต้องแสดงสถานะ "ยังไม่ลง" แยกจาก "มา 0 คน"
- **แอดมิน**: เพิ่ม/แก้/ลบข้อมูล **ย้อนหลังกี่วันก็ได้** ทุกชั้น
- **เปิด-ปิดระบบ**: แอดมินสลับสวิตช์ได้ (ใช้ช่วงปิดเทอม/วันหยุด ฯลฯ)
  - ปิด → `submit-attendance` ปฏิเสธพร้อมข้อความที่แอดมินตั้งไว้ (เช่น "ปิดภาคเรียน"), หน้าเว็บแสดงสถานะปิด, LINE "เช็คสถิติ" ตอบว่าระบบปิดอยู่
  - การอ่านสรุป/ประวัติยังใช้ได้ตามปกติ
  - *(ตีความจากคำสั่ง "เปิด-ปิดระบบ" = สวิตช์รวมทั้งระบบ; ถ้าต้องการแบบกำหนดเป็นช่วงวัน/ปิดรายชั้น ให้ขยายภายหลัง)*

## 4. โครงข้อมูล (ร่าง)
```sql
create table classes (
  id          smallint primary key,
  name        text not null unique,        -- 'อ.2','อ.3','ป.1'..'ป.6'
  sort_order  smallint not null,
  active      boolean not null default true
);

-- จำนวนนักเรียนทั้งหมดต่อชั้น (แอดมินกรอก; เปลี่ยนได้ตามช่วงเวลา)
create table class_enrollment (
  class_id    smallint references classes(id),
  valid_from  date not null,
  male        smallint not null check (male >= 0),
  female      smallint not null check (female >= 0),
  primary key (class_id, valid_from)
);

create table attendance (
  id          bigint generated always as identity primary key,
  class_id    smallint not null references classes(id),
  att_date    date not null,                -- วันที่ตามเวลาไทย (Asia/Bangkok)
  male_present   smallint not null check (male_present >= 0),
  female_present smallint not null check (female_present >= 0),
  recorded_name  text,                      -- ครูพิมพ์ชื่อ (ไม่บังคับ; ไม่มี login)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by_admin boolean not null default false,
  unique (class_id, att_date)               -- 1 แถวต่อชั้นต่อวัน; ครูส่งซ้ำ = upsert (ใช้ค่าล่าสุด)
);

create table system_settings (              -- แถวเดียว
  id boolean primary key default true check (id),
  accepting_submissions boolean not null default true,   -- สวิตช์เปิด/ปิดระบบ
  closed_message text default 'ขณะนี้ระบบปิดการลงสถิติ',
  teacher_cutoff_time time not null default '08:30',     -- ครูลง/แก้ได้ถึงเวลานี้ (เวลาไทย)
  updated_at timestamptz not null default now()
);

create table submission_extensions (       -- แอดมินเปิดช่วงลงเพิ่มชั่วคราว
  id          bigint generated always as identity primary key,
  att_date    date not null,                -- ใช้ได้เฉพาะวันนี้ (เวลาไทย)
  class_id    smallint references classes(id),   -- null = ทุกชั้น
  open_until  timestamptz not null,         -- หมดเวลาแล้วปิดเอง
  note        text,
  created_at  timestamptz not null default now()
);

create table admin_audit_log (              -- (แนะนำ) บันทึกว่าแอดมินแก้อะไร
  id bigint generated always as identity primary key,
  at timestamptz default now(), action text, class_id smallint, att_date date, old jsonb, new jsonb
);
```
- view `v_attendance_daily`: รวมต่อวัน — มา/ไม่มา/ร้อยละ ต่อชั้นและทั้งโรงเรียน (ใช้จำนวนนักเรียนจาก `class_enrollment` ที่มีผล ณ วันนั้น)
- กติกา "จำนวนมา ≤ จำนวนนักเรียนทั้งหมด" ตรวจใน Edge Function และ trigger
- **RLS**: เปิดทุกตาราง
  - anon: **ไม่มีสิทธิ์เขียน**; อ่านได้เฉพาะ view สรุป + `system_settings` (ไม่มีข้อมูลรายบุคคลอยู่แล้ว)
  - ครูเขียนผ่าน `submit-attendance` เท่านั้น (ตรวจ PIN, `att_date` = วันนี้ตามเวลาไทย, **เวลาปัจจุบัน ≤ `teacher_cutoff_time` หรือมี `submission_extensions` ที่ยังไม่หมดอายุครอบคลุมชั้นนั้น**, ระบบเปิดอยู่, ค่า ≤ จำนวนนักเรียนทั้งหมด, จำกัดอัตราการเรียก) แล้ว **upsert** ทับข้อมูลเดิมของวันนี้
  - authenticated แอดมิน (เช็คจาก uid/role ของบัญชีแอดมิน) เขียน/แก้/ลบได้ทุกตาราง

## 5. ฟีเจอร์
**MVP**
1. หน้าลงสถิติ (ครู): เลือกชั้น → กรอกชาย/หญิงที่มา (+ชื่อผู้กรอก ไม่บังคับ) → บันทึก; ถ้าชั้นนั้นลงแล้ววันนี้ให้แสดงค่าปัจจุบันเพื่อแก้ไขต่อได้; แสดงเวลาตัดรอบ (08:30) หรือเวลาที่แอดมินเปิดเพิ่ม พร้อมนับถอยหลัง; หลังตัดรอบ (และไม่มี extension) หรือระบบปิดให้ล็อกฟอร์มพร้อมข้อความ "ติดต่อแอดมิน"
2. หน้าสรุปวันนี้: ตารางทุกชั้น (ทั้งหมด/มา/ไม่มา/ร้อยละ) + ยอดรวมโรงเรียน
3. หน้าแอดมิน (ล็อกอิน): สวิตช์เปิด/ปิดระบบ, ตั้งเวลาตัดรอบของครู, ปุ่ม "เปิดช่วงลงเพิ่ม" (เลือกชั้น/ทุกชั้น + ถึงกี่โมง/อีกกี่นาที) พร้อมรายการที่กำลังเปิดอยู่และปุ่มปิดก่อนเวลา, กรอก/แก้จำนวนนักเรียนทั้งหมดแต่ละชั้น, แก้/เพิ่ม/ลบสถิติย้อนหลังได้ทุกวัน, ดู audit log
4. LINE กลุ่ม (Reply เท่านั้น): "สรุปสถิติ" (Flex ตาราง), "เช็คสถิติ" (สถานะวันนี้ + ชั้นที่ยังไม่ลง + ลิงก์หน้าเว็บ), "ลาป่วย" (Flex เดิม)

**ต่อยอด**
- รายงานรายเดือน/ภาคเรียน, กราฟแนวโน้ม, export Excel/PDF
- ปิดระบบเป็นช่วงวันหรือรายชั้น / ปฏิทินวันหยุด
- ผูกกับระบบลา (https://pdrweb-system.github.io/leavesystem/)

## 6. โครงโฟลเดอร์ repo ที่แนะนำ
```
/web                 # frontend (GitHub Pages): หน้าครู, หน้าสรุป, หน้าแอดมิน
/supabase
  /migrations        # SQL schema + RLS
  /functions
    /submit-attendance  # รับข้อมูลครู ตรวจ PIN + กติกา + สถานะเปิด/ปิด
    /line-webhook       # ตรวจลายเซ็น, 3 คำสั่ง, ตอบ Reply + Flex
/.github/workflows   # deploy pages + functions
CLAUDE.md
```

## 7. ลำดับงานที่แนะนำ
1. สร้าง repo + เชื่อม Supabase project ใหม่ → migration ตาราง/RLS/view + สร้างบัญชีแอดมิน
2. `submit-attendance` + หน้าครู + หน้าสรุปวันนี้
3. หน้าแอดมิน (เปิด/ปิดระบบ, จำนวนนักเรียน, แก้ย้อนหลัง, audit log)
4. `line-webhook` (ตรวจลายเซ็น, 3 คำสั่ง, Flex) → ตั้ง webhook URL ใน LINE Developers และเชิญบอทเข้ากลุ่ม
5. GitHub Actions deploy; ทดลองกับครู 1–2 ชั้นก่อนเปิดทั้งโรงเรียน
6. รายงานรายเดือน/ภาคเรียน

## 8. ข้อควรระวัง
- Supabase แพ็กเกจฟรีจะ **pause เมื่อไม่มีการใช้งาน ~7 วัน** (ปิดเทอมเสี่ยง; โดยเฉพาะเมื่อแอดมินปิดระบบ) → ตั้ง cron ping จาก GitHub Actions หรือใช้แพ็กเกจ Pro
- Reply token ใช้ได้ครั้งเดียวและหมดอายุเร็ว → `line-webhook` ต้องตอบทันที (ข้อมูลคำนวณจาก view จึงไม่หนัก)
- PIN ร่วมของครูไม่ใช่การยืนยันตัวตน: ป้องกันคนนอก ไม่ได้บอกว่าใครกรอก → เปลี่ยน PIN เป็นระยะ (เก็บเป็น secret ไม่ใส่ในโค้ดหน้าเว็บ)
- ข้อมูลเป็นจำนวนรวมรายชั้น ไม่มีชื่อนักเรียน (ลดความเสี่ยงข้อมูลส่วนบุคคล) — ถ้าอนาคตเก็บรายบุคคลต้องทบทวน RLS ใหม่
- ใช้ `Asia/Bangkok` ทุกที่ที่คำนวณ "วันนี้"

## 9. สถานะการตัดสินใจ
**ตัดสินใจแล้ว**
1. อ.2 มี 1 ห้อง (รวม 8 ชั้น) · 2. เจ้าของกรอกจำนวนนักเรียนเอง · 3. ครูไม่ล็อกอิน · 4. LINE กลุ่ม + Reply API เท่านั้น **ไม่ใช้ Push/แจ้งเตือนอัตโนมัติ** · 5. Supabase project ใหม่ เจ้าของสร้างเอง · 6. ครูลงได้เฉพาะวันนี้ แก้กี่ครั้งก็ได้ (ใช้ค่าล่าสุด) **ภายใน 08:30 น. ทุกวัน** (แอดมินเปิดช่วงลงเพิ่มชั่วคราวได้ ทั้งทุกชั้นหรือบางชั้น); หลังจากนั้นและข้อมูลย้อนหลัง **แก้ได้เฉพาะแอดมิน ไม่จำกัดย้อนหลัง** · 7. แอดมินเปิด/ปิดระบบได้

**ข้อเสนอของผู้เขียน brief (ยังไม่ได้ยืนยัน)**
- แอดมินล็อกอินด้วย Supabase Auth บัญชีเดียว (แทน PIN) เพราะต้องแก้ข้อมูลย้อนหลังได้ทุกวัน
- เก็บ audit log การแก้ไขของแอดมิน

## 10. อัปเดตหลัง brief
- ตัดช่อง "ชื่อผู้กรอก" และ "PIN ครู" ออกจากหน้าครูและ `submit-attendance` (ไม่ใช้ `TEACHER_PIN` อีกต่อไป); ป้องกันด้วย rate limit + กติกาเวลา/ระบบเปิด-ปิดฝั่ง DB เท่านั้น
- แยกหน้าครู (`index.html`, `summary.html`) ออกจากหน้าแอดมิน (`admin.html`) ไม่มีลิงก์ข้ามกัน
- หน้าครู (ออกแบบใหม่): เลือกชั้นด้วยปุ่ม (ไม่มีชั้นเลือกไว้ล่วงหน้า แต่จำชั้นล่าสุดของเครื่องไว้ใน localStorage),
  ตัวนับ ชาย/หญิง มีปุ่ม −/+ และ "มาครบทุกคน", แถบสรุป + ปุ่มบันทึกติดด้านล่าง, การ์ดสถานะพร้อมนับถอยหลังถึงเวลาตัดรอบ;
  ทุกหน้าโหลดฟอนต์ Sarabun จาก Google Fonts
- หน้าครู: กดบันทึก → SweetAlert2 loading → "บันทึกเสร็จสิ้น" → ปิดหน้าอัตโนมัติ
  (ในแอป LINE ปิดได้จริงเมื่อเปิดผ่าน LIFF: ตั้ง `LIFF_ID` ทั้งใน GitHub Variables และ Supabase secrets;
  ถ้าปิดไม่ได้จะแสดงหน้าจอ "บันทึกเสร็จสิ้น — ปิดหน้านี้ได้เลย")
- LINE: "สรุปสถิติ" และ "เช็คสถิติ" เป็น Flex ทั้งคู่ (`supabase/functions/line-webhook/flex.ts`, ขนาด bubble `mega` ให้พอดีจอมือถือ)
