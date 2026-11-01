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
   - Variables: `SUPABASE_URL`, `SUPABASE_ANON_KEY` (publishable key เท่านั้น)
   - Pages → Source: GitHub Actions
5. LINE Developers: ตั้ง Webhook URL เป็น `https://<ref>.supabase.co/functions/v1/line-webhook` แล้วเชิญบอทเข้ากลุ่ม
6. เข้าหน้าแอดมิน → ตั้งจำนวนนักเรียนทั้งหมดแต่ละชั้น (จำเป็นก่อนที่ครูจะลงได้)

## หมายเหตุ
- เวลา "วันนี้"/เวลาตัดรอบ คำนวณใน DB (Asia/Bangkok) ทั้งหมด
- ครูเขียนได้ผ่าน `submit-attendance` เท่านั้น; แอดมินเขียนตรงผ่าน RLS (`admin_users`)
- `keepalive.yml` ping ทุก 3 วันกันโปรเจกต์ free-tier ถูก pause
