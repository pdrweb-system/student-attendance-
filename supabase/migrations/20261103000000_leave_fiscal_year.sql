-- Fiscal-year period shown in the LINE "ลาป่วย" card, editable by the admin.
alter table public.system_settings
  add column leave_year_label text not null default 'ปีงบประมาณ 2569',
  add column leave_start date not null default '2026-04-01',
  add column leave_end   date not null default '2026-09-30';
