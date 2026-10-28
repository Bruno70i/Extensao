-- Cuidar+ · Script único de instalação (gerado de supabase/migrations)
-- Cole TUDO no SQL Editor do Supabase e clique em Run. Rode apenas uma vez.

-- Cuidar+ · Esquema do banco
-- Execute no SQL Editor do Supabase (ou via `supabase db push`).

-- Perfis (1:1 com auth.users) ---------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  role text not null default 'family' check (role in ('admin', 'nurse', 'family')),
  active boolean not null default true,
  must_change_password boolean not null default true,
  created_at timestamptz not null default now()
);

-- Residentes (idosos) -------------------------------------------------------
create table public.residents (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (btrim(full_name) <> ''),
  birth_date date,
  room text,
  allergies text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Vínculo familiar ↔ residente ---------------------------------------------
create table public.family_links (
  family_id uuid not null references public.profiles (id) on delete cascade,
  resident_id uuid not null references public.residents (id) on delete cascade,
  relationship text,
  primary key (family_id, resident_id)
);
create index family_links_resident_idx on public.family_links (resident_id);

-- Prescrições ---------------------------------------------------------------
create table public.prescriptions (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references public.residents (id),
  medication text not null check (btrim(medication) <> ''),
  dosage text not null check (btrim(dosage) <> ''),
  route text not null,
  times time[] not null check (cardinality(times) > 0),
  start_date date not null,
  end_date date,
  prescriber_name text not null check (btrim(prescriber_name) <> ''),
  prescriber_crm text not null check (btrim(prescriber_crm) <> ''),
  instructions text,
  active boolean not null default true,
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);
create index prescriptions_resident_active_idx on public.prescriptions (resident_id, active);

-- Registros de administração (imutáveis) -----------------------------------
create table public.administrations (
  id uuid primary key default gen_random_uuid(),
  prescription_id uuid not null references public.prescriptions (id),
  scheduled_for timestamptz not null,
  status text not null check (status in ('given', 'refused', 'missed')),
  reason text,
  notes text,
  recorded_by uuid not null references public.profiles (id) default auth.uid(),
  recorded_at timestamptz not null default now(),
  supersedes uuid references public.administrations (id),
  check (status = 'given' or coalesce(btrim(reason), '') <> '')
);
create index administrations_prescription_time_idx on public.administrations (prescription_id, scheduled_for);
-- Um único registro original por dose (evita duplicidade por toque duplo ou dois enfermeiros ao mesmo tempo)
create unique index administrations_one_per_dose on public.administrations (prescription_id, scheduled_for) where supersedes is null;
-- Cada registro só pode ser corrigido uma vez (a correção seguinte corrige a correção)
create unique index administrations_one_correction on public.administrations (supersedes) where supersedes is not null;

-- A correção precisa ser da mesma dose do registro corrigido
create or replace function public.check_supersedes()
returns trigger
language plpgsql
as $$
begin
  if new.supersedes is not null and not exists (
    select 1 from public.administrations a
    where a.id = new.supersedes
      and a.prescription_id = new.prescription_id
      and a.scheduled_for = new.scheduled_for
  ) then
    raise exception 'A correção deve se referir à mesma dose';
  end if;
  return new;
end;
$$;

create trigger administrations_check_supersedes
before insert on public.administrations
for each row execute function public.check_supersedes();

-- Quem registrou e quando são definidos pelo servidor (a auditoria não pode ser forjada)
create or replace function public.stamp_administration()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null then
    new.recorded_by := auth.uid();
    new.recorded_at := now();
  end if;
  return new;
end;
$$;

create trigger administrations_stamp
before insert on public.administrations
for each row execute function public.stamp_administration();

-- Cria o perfil automaticamente quando um usuário é criado no Auth ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1)),
    -- O papel vem do app_metadata, que só o servidor (service_role) consegue definir.
    -- Nunca use user_metadata aqui: qualquer pessoa pode preenchê-lo ao se cadastrar.
    case when new.raw_app_meta_data ->> 'role' in ('admin', 'nurse', 'family')
         then new.raw_app_meta_data ->> 'role' else 'family' end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- O Auth grava o app_metadata logo depois de criar o usuário: aplica o papel quando ele muda
create or replace function public.handle_user_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.raw_app_meta_data ->> 'role' in ('admin', 'nurse', 'family')
     and new.raw_app_meta_data ->> 'role' is distinct from old.raw_app_meta_data ->> 'role' then
    update public.profiles set role = new.raw_app_meta_data ->> 'role' where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_role_changed
after update of raw_app_meta_data on auth.users
for each row execute function public.handle_user_role_change();

-- Tempo real para os familiares acompanharem as doses ----------------------
alter publication supabase_realtime add table public.administrations;

-- Cuidar+ · Regras de acesso (Row Level Security)

-- Funções auxiliares ---------------------------------------------------------
create or replace function public.my_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select active from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_active_user() and public.my_role() in ('admin', 'nurse')
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_active_user() and public.my_role() = 'admin'
$$;

create or replace function public.is_family_of(resident uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_active_user() and exists (
    select 1 from public.family_links
    where family_id = auth.uid() and resident_id = resident
  )
$$;

-- O próprio usuário marca que já trocou a senha provisória
create or replace function public.mark_password_changed()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles set must_change_password = false where id = auth.uid()
$$;

-- O próprio usuário altera o nome exibido (sem poder mudar o próprio perfil de acesso)
create or replace function public.update_my_name(new_name text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles set full_name = btrim(new_name)
  where id = auth.uid() and btrim(new_name) <> ''
$$;

revoke execute on function public.mark_password_changed() from anon;
revoke execute on function public.update_my_name(text) from anon;

-- Ativa RLS ------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.residents enable row level security;
alter table public.family_links enable row level security;
alter table public.prescriptions enable row level security;
alter table public.administrations enable row level security;

-- profiles -------------------------------------------------------------------
create policy profiles_select on public.profiles
for select to authenticated
using (
  id = auth.uid()
  or public.is_admin()
  or (public.is_active_user() and role in ('admin', 'nurse'))
);

create policy profiles_admin_update on public.profiles
for update to authenticated
using (public.is_admin())
with check (public.is_admin());

-- residents ------------------------------------------------------------------
create policy residents_staff_select on public.residents
for select to authenticated using (public.is_staff());

create policy residents_family_select on public.residents
for select to authenticated using (public.is_family_of(id));

create policy residents_staff_insert on public.residents
for insert to authenticated with check (public.is_staff());

create policy residents_staff_update on public.residents
for update to authenticated using (public.is_staff()) with check (public.is_staff());

-- family_links ---------------------------------------------------------------
create policy family_links_admin_all on public.family_links
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy family_links_own_select on public.family_links
for select to authenticated using (family_id = auth.uid() and public.is_active_user());

-- prescriptions --------------------------------------------------------------
create policy prescriptions_staff_select on public.prescriptions
for select to authenticated using (public.is_staff());

create policy prescriptions_family_select on public.prescriptions
for select to authenticated using (public.is_family_of(resident_id));

create policy prescriptions_staff_insert on public.prescriptions
for insert to authenticated with check (public.is_staff());

create policy prescriptions_staff_update on public.prescriptions
for update to authenticated using (public.is_staff()) with check (public.is_staff());

-- administrations (sem update/delete: registros são imutáveis) --------------
create policy administrations_staff_select on public.administrations
for select to authenticated using (public.is_staff());

create policy administrations_family_select on public.administrations
for select to authenticated using (
  exists (
    select 1 from public.prescriptions p
    where p.id = prescription_id and public.is_family_of(p.resident_id)
  )
);

create policy administrations_staff_insert on public.administrations
for insert to authenticated
with check (public.is_staff() and recorded_by = auth.uid());
