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
    case when new.raw_user_meta_data ->> 'role' in ('admin', 'nurse', 'family')
         then new.raw_user_meta_data ->> 'role' else 'family' end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Tempo real para os familiares acompanharem as doses ----------------------
alter publication supabase_realtime add table public.administrations;
