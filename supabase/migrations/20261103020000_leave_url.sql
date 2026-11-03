-- Link of the "ไปที่ระบบการลา" button in the LINE "ลาป่วย" card (admin: ตั้งค่าวันลา).
alter table public.system_settings
  add column leave_url text default 'https://pdrweb-system.github.io/leavesystem/';
