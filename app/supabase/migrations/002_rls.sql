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
