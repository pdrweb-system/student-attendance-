# ระบบลงสถิติมาเรียนประจำวัน — โรงเรียนวัดปรีดาราม (มณีศิริวรรณ)

GitHub Pages (`/web`) + Supabase (Postgres/RLS, Edge Functions, Auth) + LINE Reply API.
รายละเอียดการออกแบบ/กติกาสิทธิ์ดูใน [CLAUDE.md](CLAUDE.md)

## ตั้งค่าครั้งแรก
1. สร้าง Supabase project ใหม่ แล้วสร้างผู้ใช้แอดมิน (Authentication → Users)
2. รัน migration (`supabase db push` หรือผ่าน GitHub Action) แล้วเพิ่มแอดมิน:
   ```sql
   insert into public.admin_users (user_id) values ('<uid ของแอดมิน>');
   ```
3. ตั้ง secrets ของ Edge Functions (ห้าม commit):
   ```bash
   supabase secrets set LINE_CHANNEL_SECRET=... LINE_CHANNEL_ACCESS_TOKEN=... SITE_URL=https://<org>.github.io/<repo>/
   ```
4. GitHub → Settings
   - Secrets: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`
   - Variables: `SUPABASE_URL`, `SUPABASE_ANON_KEY` (publishable key เท่านั้น), `ADMIN_EMAIL`, `LIFF_ID` (ไม่บังคับ ดูด้านล่าง)
   - Pages → Source: GitHub Actions
5. LINE Developers: ตั้ง Webhook URL เป็น `https://<ref>.supabase.co/functions/v1/line-webhook` แล้วเชิญบอทเข้ากลุ่ม
6. เข้าหน้าแอดมิน → ตั้งจำนวนนักเรียนทั้งหมดแต่ละชั้น (จำเป็นก่อนที่ครูจะลงได้)

## LIFF (ไม่บังคับ): ให้หน้าลงสถิติปิดตัวเองหลังบันทึก
หลังครูกดบันทึก หน้าเว็บจะแสดง "บันทึกเสร็จสิ้น" แล้วพยายามปิดตัวเอง แต่เบราว์เซอร์ในแอป LINE
ยอมให้ปิดหน้าได้เฉพาะหน้าที่เปิดผ่าน LIFF เท่านั้น ถ้ายังไม่ตั้ง LIFF หน้าจะเปลี่ยนเป็นหน้าจอ
"บันทึกเสร็จสิ้น — ปิดหน้านี้ได้เลย" แทน

1. LINE Developers → provider เดียวกับบอท → Create a new channel → **LINE Login** (App type: Web app)
2. แท็บ **LIFF** → Add
   - Size: Full
   - Endpoint URL: `https://<org>.github.io/<repo>/` (หน้าลงสถิติ)
   - Scope: ไม่ต้องเลือก `chat_message.write` (ระบบไม่ได้ใช้ข้อมูลโปรไฟล์ ถ้าบังคับเลือกให้เลือกแค่ `profile`)
   - คัดลอก **LIFF ID** (รูปแบบ `1234567890-AbCdEfGh` ไม่ใช่ความลับ)
3. เปลี่ยนสถานะ channel LINE Login เป็น **Published** (ถ้ายังเป็น Developing จะใช้ได้เฉพาะผู้ดูแล/tester)
4. ใส่ LIFF ID ทั้งสองที่ แล้วรัน workflow ทั้งสองใหม่
   - GitHub → Variables → `LIFF_ID`
   - Supabase → Edge Functions → Secrets → `LIFF_ID` (ปุ่ม "ลงสถิติ" ในการ์ดเช็คสถิติจะเปิดผ่าน LIFF)
5. ลิงก์หน้าลงสถิติที่ให้ครูใช้ใน LINE: `https://liff.line.me/<LIFF_ID>`

## ส่งออก Excel
หน้า "สรุปวันนี้" (`summary.html`) มีปุ่ม **Excel รายวัน** (วันที่เลือก) และ **Excel ทั้งเดือน**
(ทุกวันในเดือนนั้นที่มีชั้นลงสถิติแล้ว 1 แผ่นงานต่อวัน) ไฟล์สร้างในเบราว์เซอร์ด้วย ExcelJS
(`web/export.js` โหลดเฉพาะตอนกดปุ่ม) ในแอป LINE อาจดาวน์โหลดไม่ได้ หน้าจะแสดงลิงก์ให้เปิดในเบราว์เซอร์

## หมายเหตุ
- เวลา "วันนี้"/เวลาตัดรอบ คำนวณใน DB (Asia/Bangkok) ทั้งหมด
- ครูเขียนได้ผ่าน `submit-attendance` เท่านั้น; แอดมินเขียนตรงผ่าน RLS (`admin_users`)
- `keepalive.yml` ping ทุก 3 วันกันโปรเจกต์ free-tier ถูก pause
