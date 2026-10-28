-- Cuidar+ · Dados de exemplo para demonstração
-- Execute DEPOIS das migrations e DEPOIS de criar o primeiro admin (ver README).
-- Os registros de doses de hoje usam o primeiro admin como "quem registrou".

do $$
declare
  today date := (now() at time zone 'America/Sao_Paulo')::date;
  staff uuid;
  r_joao uuid := gen_random_uuid();
  r_maria uuid := gen_random_uuid();
  r_antonio uuid := gen_random_uuid();
  r_helena uuid := gen_random_uuid();
  p_losartana uuid := gen_random_uuid();
  p_metformina uuid := gen_random_uuid();
  p_levotiroxina uuid := gen_random_uuid();
  p_sinvastatina uuid := gen_random_uuid();
begin
  insert into public.residents (id, full_name, birth_date, room, allergies, notes) values
    (r_joao, 'João Batista Ferreira', '1941-03-12', '101', 'Dipirona', 'Hipertenso. Prefere tomar os remédios com água morna.'),
    (r_maria, 'Maria das Graças Souza', '1938-07-25', '102', null, 'Diabetes tipo 2.'),
    (r_antonio, 'Antônio Carlos Lima', '1945-11-02', '201', 'Penicilina', 'Usa andador.'),
    (r_helena, 'Helena Martins', '1936-01-19', '202', null, 'Hipotireoidismo.');

  insert into public.prescriptions (id, resident_id, medication, dosage, route, times, start_date, end_date, prescriber_name, prescriber_crm, instructions) values
    (p_losartana, r_joao, 'Losartana', '50 mg', 'Oral', array['08:00','20:00']::time[], today - 30, null, 'Dra. Ana Ribeiro', 'CRM-SP 123456', 'Tomar após as refeições.'),
    (gen_random_uuid(), r_joao, 'Ácido acetilsalicílico', '100 mg', 'Oral', array['12:00']::time[], today - 30, null, 'Dra. Ana Ribeiro', 'CRM-SP 123456', null),
    (p_metformina, r_maria, 'Metformina', '850 mg', 'Oral', array['07:30','19:30']::time[], today - 60, null, 'Dr. Paulo Mendes', 'CRM-SP 654321', 'Junto com o café da manhã e o jantar.'),
    (gen_random_uuid(), r_maria, 'Insulina NPH', '10 UI', 'Injetável', array['22:00']::time[], today - 60, null, 'Dr. Paulo Mendes', 'CRM-SP 654321', 'Aplicar no abdômen, alternando o local.'),
    (gen_random_uuid(), r_antonio, 'Amoxicilina', '500 mg', 'Oral', array['06:00','14:00','22:00']::time[], today - 6, today, 'Dra. Ana Ribeiro', 'CRM-SP 123456', 'Último dia do tratamento.'),
    (p_sinvastatina, r_antonio, 'Sinvastatina', '20 mg', 'Oral', array['21:00']::time[], today - 90, null, 'Dra. Ana Ribeiro', 'CRM-SP 123456', null),
    (p_levotiroxina, r_helena, 'Levotiroxina', '75 mcg', 'Oral', array['06:30']::time[], today - 120, null, 'Dr. Paulo Mendes', 'CRM-SP 654321', 'Em jejum, 30 min antes do café.'),
    (gen_random_uuid(), r_helena, 'Colírio de lubrificante', '1 gota', 'Tópica', array['09:00','21:00']::time[], today - 10, null, 'Dr. Paulo Mendes', 'CRM-SP 654321', 'Em cada olho.');

  select id into staff from public.profiles where role = 'admin' order by created_at limit 1;
  if staff is not null then
    insert into public.administrations (prescription_id, scheduled_for, status, reason, notes, recorded_by, recorded_at) values
      (p_levotiroxina, (today + time '06:30') at time zone 'America/Sao_Paulo', 'given', null, null, staff, (today + time '06:34') at time zone 'America/Sao_Paulo'),
      (p_metformina, (today + time '07:30') at time zone 'America/Sao_Paulo', 'given', null, 'Tomou com o café.', staff, (today + time '07:41') at time zone 'America/Sao_Paulo');
  end if;
end;
$$;
