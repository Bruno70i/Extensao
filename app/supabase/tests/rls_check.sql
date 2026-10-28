-- Cuidar+ · Verificação das regras de acesso
-- Como usar: substitua os UUIDs abaixo (Authentication → Users) e rode cada bloco
-- separadamente no SQL Editor. Cada bloco termina em ROLLBACK: nada é alterado.
--   FAMILY_ID   = um familiar vinculado a exatamente 1 residente
--   NURSE_ID    = um enfermeiro ativo
--   OTHER_RES   = id de um residente NÃO vinculado ao familiar

-- 1) Familiar só enxerga o residente vinculado ------------------------------
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"FAMILY_ID","role":"authenticated"}';
select count(*) as residentes_visiveis from public.residents;            -- esperado: 1
select count(*) as residente_de_outro from public.residents where id = 'OTHER_RES'; -- esperado: 0
select count(*) as familiares_visiveis from public.profiles where role = 'family'; -- esperado: 1 (ele mesmo)
rollback;

-- 2) Familiar não consegue registrar dose ------------------------------------
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"FAMILY_ID","role":"authenticated"}';
insert into public.administrations (prescription_id, scheduled_for, status)
select id, now(), 'given' from public.prescriptions limit 1;              -- esperado: ERRO (violates row-level security)
rollback;

-- 3) Ninguém altera ou apaga registros de doses ------------------------------
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"NURSE_ID","role":"authenticated"}';
delete from public.administrations;                                       -- esperado: DELETE 0
update public.administrations set status = 'missed';                      -- esperado: UPDATE 0
rollback;

-- 4) Usuário desativado não vê nada ------------------------------------------
begin;
update public.profiles set active = false where id = 'FAMILY_ID';
set local role authenticated;
set local request.jwt.claims = '{"sub":"FAMILY_ID","role":"authenticated"}';
select count(*) as residentes_visiveis from public.residents;            -- esperado: 0
rollback;

-- 5) Enfermeiro não pode registrar dose em nome de outra pessoa -------------
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"NURSE_ID","role":"authenticated"}';
insert into public.administrations (prescription_id, scheduled_for, status, recorded_by)
select id, now(), 'given', 'FAMILY_ID' from public.prescriptions limit 1; -- esperado: ERRO (violates row-level security)
rollback;

-- 6) Não é possível registrar a mesma dose duas vezes ------------------------
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"NURSE_ID","role":"authenticated"}';
insert into public.administrations (prescription_id, scheduled_for, status)
select id, date_trunc('minute', now()), 'given' from public.prescriptions order by id limit 1;
insert into public.administrations (prescription_id, scheduled_for, status)
select id, date_trunc('minute', now()), 'given' from public.prescriptions order by id limit 1; -- esperado: ERRO (duplicate key)
rollback;
