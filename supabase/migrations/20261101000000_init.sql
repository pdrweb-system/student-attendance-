-- Student attendance: schema, RLS, RPCs, views
-- All "today / now" logic is computed server-side in Asia/Bangkok.

create table public.classes (
  id          smallint primary key,
  name        text not null unique,
  sort_order  smallint not null,
  active      boolean not null default true
);

insert into public.classes (id, name, sort_order) values
  (1,'อ.2',1),(2,'อ.3',2),(3,'ป.1',3),(4,'ป.2',4),
  (5,'ป.3',5),(6,'ป.4',6),(7,'ป.5',7),(8,'ป.6',8);

create table public.class_enrollment (
  class_id    smallint not null references public.classes(id),
  valid_from  date not null,
  male        smallint not null check (male >= 0),
  female      smallint not null check (female >= 0),
  primary key (class_id, valid_from)
);

create table public.attendance (
  id             bigint generated always as identity primary key,
  class_id       smallint not null references public.classes(id),
  att_date       date not null,
  male_present   smallint not null check (male_present >= 0),
  female_present smallint not null check (female_present >= 0),
  recorded_name  text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  updated_by_admin boolean not null default false,
  unique (class_id, att_date)
);

create table public.system_settings (
  id boolean primary key default true check (id),
  accepting_submissions boolean not null default true,
  closed_message text default 'ขณะนี้ระบบปิดการลงสถิติ',
  teacher_cutoff_time time not null default '08:30',
  updated_at timestamptz not null default now()
);
insert into public.system_settings default values;

create table public.submission_extensions (
  id          bigint generated always as identity primary key,
  att_date    date not null,
  class_id    smallint references public.classes(id), -- null = all classes
  open_until  timestamptz not null,
  note        text,
  created_at  timestamptz not null default now()
);

create table public.admin_audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  action text,
  class_id smallint,
  att_date date,
  old jsonb,
  new jsonb
);

-- Admin accounts (insert your Supabase Auth user id after creating the account)
create table public.admin_users (user_id uuid primary key references auth.users(id) on delete cascade);

-- Simple rate limiting for the teacher endpoint
create table public.rate_limit_events (
  id bigint generated always as identity primary key,
  key text not null,
  at timestamptz not null default now()
);
create index on public.rate_limit_events (key, at);

-- ---------------------------------------------------------------- helpers
create function public.th_today() returns date
language sql stable as $$ select (now() at time zone 'Asia/Bangkok')::date $$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid())
$$;

create function public.enrollment_at(p_class smallint, p_date date)
returns public.class_enrollment
language sql stable security definer set search_path = public as $$
  select * from public.class_enrollment
  where class_id = p_class and valid_from <= p_date
  order by valid_from desc limit 1
$$;

-- ---------------------------------------------------------------- triggers
create function public.attendance_before() returns trigger
language plpgsql as $$
declare e public.class_enrollment;
begin
  e := public.enrollment_at(new.class_id, new.att_date);
  if e.class_id is null then
    raise exception 'NO_ENROLLMENT: ยังไม่ได้ตั้งจำนวนนักเรียนทั้งหมดของชั้นนี้';
  end if;
  if new.male_present > e.male or new.female_present > e.female then
    raise exception 'EXCEEDS_ENROLLMENT: จำนวนที่มามากกว่าจำนวนนักเรียนทั้งหมด (ชาย %, หญิง %)', e.male, e.female;
  end if;
  new.updated_at := now();
  new.updated_by_admin := (auth.uid() is not null);
  return new;
end $$;
create trigger attendance_before before insert or update on public.attendance
  for each row execute function public.attendance_before();

create function public.audit_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return coalesce(new, old); end if; -- only log admin edits
  insert into public.admin_audit_log (action, class_id, att_date, old, new)
  values (
    tg_op || ' ' || tg_table_name,
    coalesce((to_jsonb(new)->>'class_id')::smallint, (to_jsonb(old)->>'class_id')::smallint),
    coalesce((to_jsonb(new)->>'att_date')::date, (to_jsonb(old)->>'att_date')::date),
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end);
  return coalesce(new, old);
end $$;
create trigger audit_attendance after insert or update or delete on public.attendance
  for each row execute function public.audit_change();
create trigger audit_enrollment after insert or update or delete on public.class_enrollment
  for each row execute function public.audit_change();
create trigger audit_settings after update on public.system_settings
  for each row execute function public.audit_change();
create trigger audit_extensions after insert or delete on public.submission_extensions
  for each row execute function public.audit_change();

-- ---------------------------------------------------------------- RPCs
-- Whether teachers may submit right now (optionally for one class).
create function public.submit_status(p_class smallint default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  s public.system_settings;
  today date := public.th_today();
  cutoff timestamptz;
  ext timestamptz;
  deadline timestamptz;
  ok boolean;
  why text;
begin
  select * into s from public.system_settings where id;
  cutoff := (today + s.teacher_cutoff_time) at time zone 'Asia/Bangkok';
  select max(open_until) into ext from public.submission_extensions
   where att_date = today and open_until > now()
     and (p_class is null or class_id is null or class_id = p_class);
  deadline := greatest(cutoff, coalesce(ext, cutoff));
  if not s.accepting_submissions then ok := false; why := 'SYSTEM_CLOSED';
  elsif now() > deadline then ok := false; why := 'AFTER_CUTOFF';
  else ok := true; why := null; end if;
  return jsonb_build_object(
    'can_submit', ok, 'reason', why,
    'accepting', s.accepting_submissions, 'closed_message', s.closed_message,
    'cutoff_time', to_char(s.teacher_cutoff_time, 'HH24:MI'),
    'deadline', deadline, 'extended', ext is not null and ext > cutoff,
    'today', today, 'now', now());
end $$;

-- Teacher write path. Only callable by the Edge Function (service_role).
create function public.submit_attendance(p_class smallint, p_male int, p_female int, p_name text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare st jsonb; today date := public.th_today(); e public.class_enrollment; r public.attendance;
begin
  if not exists (select 1 from public.classes where id = p_class and active) then
    return jsonb_build_object('ok', false, 'code', 'BAD_CLASS', 'message', 'ไม่พบชั้นเรียน');
  end if;
  st := public.submit_status(p_class);
  if not (st->>'can_submit')::boolean then
    return jsonb_build_object('ok', false, 'code', st->>'reason',
      'message', case st->>'reason'
        when 'SYSTEM_CLOSED' then coalesce(st->>'closed_message', 'ระบบปิดอยู่')
        else 'หมดเวลาลงสถิติแล้ว (' || (st->>'cutoff_time') || ' น.) กรุณาติดต่อแอดมิน' end);
  end if;
  if p_male < 0 or p_female < 0 then
    return jsonb_build_object('ok', false, 'code', 'BAD_VALUE', 'message', 'จำนวนต้องไม่ติดลบ');
  end if;
  e := public.enrollment_at(p_class, today);
  if e.class_id is null then
    return jsonb_build_object('ok', false, 'code', 'NO_ENROLLMENT', 'message', 'ยังไม่ได้ตั้งจำนวนนักเรียนทั้งหมดของชั้นนี้ กรุณาติดต่อแอดมิน');
  end if;
  if p_male > e.male or p_female > e.female then
    return jsonb_build_object('ok', false, 'code', 'EXCEEDS_ENROLLMENT',
      'message', format('จำนวนที่มามากกว่านักเรียนทั้งหมด (ชาย %s, หญิง %s)', e.male, e.female));
  end if;
  insert into public.attendance (class_id, att_date, male_present, female_present, recorded_name)
  values (p_class, today, p_male, p_female, nullif(trim(p_name), ''))
  on conflict (class_id, att_date) do update
    set male_present = excluded.male_present, female_present = excluded.female_present,
        recorded_name = excluded.recorded_name
  returning * into r;
  return jsonb_build_object('ok', true, 'attendance', to_jsonb(r));
end $$;

create function public.check_rate_limit(p_key text, p_max int, p_window_seconds int)
returns boolean
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from public.rate_limit_events where at < now() - interval '1 day';
  select count(*) into n from public.rate_limit_events
   where key = p_key and at > now() - make_interval(secs => p_window_seconds);
  if n >= p_max then return false; end if;
  insert into public.rate_limit_events (key) values (p_key);
  return true;
end $$;

-- Per-class summary for a date, including classes that have not submitted.
create function public.daily_summary(p_date date default null)
returns table (
  class_id smallint, name text, sort_order smallint,
  total_male int, total_female int, total int,
  submitted boolean, male_present int, female_present int, present int,
  absent int, pct numeric, recorded_name text, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  with d as (select coalesce(p_date, public.th_today()) as dt)
  select c.id, c.name, c.sort_order,
         coalesce(e.male,0)::int, coalesce(e.female,0)::int, (coalesce(e.male,0)+coalesce(e.female,0))::int,
         a.id is not null,
         a.male_present::int, a.female_present::int,
         (a.male_present + a.female_present)::int,
         case when a.id is null then null else (coalesce(e.male,0)+coalesce(e.female,0)) - (a.male_present + a.female_present) end,
         case when a.id is null or coalesce(e.male,0)+coalesce(e.female,0) = 0 then null
              else round(100.0 * (a.male_present + a.female_present) / (e.male + e.female), 1) end,
         a.recorded_name, a.updated_at
  from public.classes c
  cross join d
  left join lateral (select * from public.enrollment_at(c.id, d.dt)) e on e.class_id is not null
  left join public.attendance a on a.class_id = c.id and a.att_date = d.dt
  where c.active
  order by c.sort_order
$$;

-- Aggregated history views (no personal data)
create view public.v_attendance_daily as
select a.att_date, a.class_id, c.name as class_name,
       e.male + e.female as total,
       a.male_present, a.female_present,
       a.male_present + a.female_present as present,
       (e.male + e.female) - (a.male_present + a.female_present) as absent,
       round(100.0 * (a.male_present + a.female_present) / nullif(e.male + e.female, 0), 1) as pct
from public.attendance a
join public.classes c on c.id = a.class_id
cross join lateral public.enrollment_at(a.class_id, a.att_date) e;

create view public.v_attendance_school_daily as
select att_date,
       count(*) as classes_submitted,
       sum(total) as total, sum(present) as present, sum(absent) as absent,
       round(100.0 * sum(present) / nullif(sum(total), 0), 1) as pct
from public.v_attendance_daily
group by att_date;

-- ---------------------------------------------------------------- RLS
alter table public.classes               enable row level security;
alter table public.class_enrollment      enable row level security;
alter table public.attendance            enable row level security;
alter table public.system_settings       enable row level security;
alter table public.submission_extensions enable row level security;
alter table public.admin_audit_log       enable row level security;
alter table public.admin_users           enable row level security;
alter table public.rate_limit_events     enable row level security;

create policy classes_read     on public.classes         for select to anon, authenticated using (true);
create policy settings_read    on public.system_settings for select to anon, authenticated using (true);

create policy classes_admin    on public.classes               for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy enroll_admin     on public.class_enrollment      for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy att_admin        on public.attendance            for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy settings_admin   on public.system_settings       for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy ext_admin        on public.submission_extensions for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy audit_admin      on public.admin_audit_log       for select to authenticated using (public.is_admin());
create policy admin_users_self on public.admin_users           for select to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------- grants
revoke all on function public.submit_attendance(smallint,int,int,text) from public, anon, authenticated;
revoke all on function public.check_rate_limit(text,int,int)          from public, anon, authenticated;
grant execute on function public.submit_attendance(smallint,int,int,text) to service_role;
grant execute on function public.check_rate_limit(text,int,int)          to service_role;

grant execute on function public.submit_status(smallint)  to anon, authenticated;
grant execute on function public.daily_summary(date)      to anon, authenticated;
grant execute on function public.th_today()               to anon, authenticated;
grant select on public.v_attendance_daily, public.v_attendance_school_daily to anon, authenticated;
