-- Optional extra line under the dates in the LINE "ลาป่วย" card (admin: ตั้งค่าวันลา).
alter table public.system_settings add column leave_note text;
