# Cuidar+ · Gestão de medicamentos para clínica de idosos

Projeto de **Atividade de Extensão (UNIP)**, na ação "Desenvolvimento de aplicativos/software/website para a comunidade" (Prestação de serviços), alinhado ao ODS 3 (Saúde e bem-estar).

O site permite que:

- **a enfermagem** cadastre residentes, transcreva as prescrições médicas e registre cada dose aplicada (ou recusada, ou não aplicada, com motivo);
- **os familiares** acompanhem em tempo real as medicações do seu idoso;
- **o administrador** gerencie usuários, vínculos familiar ↔ residente e consulte a auditoria de todos os registros.

Especificação: [`../docs/superpowers/specs/2026-10-28-gestao-medicamentos-design.md`](../docs/superpowers/specs/2026-10-28-gestao-medicamentos-design.md)

## Tecnologias

React 18 + Vite + TypeScript · React Router · Supabase (Postgres, Auth, Row Level Security, Realtime, Edge Functions) · Vitest · hospedagem na Vercel.

## Estrutura

```
src/
  lib/          regras puras (agenda, validações, datas) + acesso ao Supabase (api.ts)
  components/   botões, selos de status, layout, linha do tempo
  pages/        auth, nurse (Hoje), residents, family, admin
supabase/
  migrations/   001_schema.sql (tabelas) · 002_rls.sql (regras de acesso)
  setup.sql     as duas migrations juntas, para colar no SQL Editor
  seed.sql      residentes e prescrições de exemplo
  functions/admin-users/   criar usuário, redefinir senha, ativar/desativar
  tests/        testes das regras de acesso (rls.test.ts) e roteiro manual (rls_check.sql)
scripts/dev-users.mjs      usuários de teste para o Supabase LOCAL
```

## Rodar no computador (desenvolvimento)

Pré-requisitos: Node 20+ e Docker Desktop aberto.

```bash
npm install
npx supabase start          # sobe o Supabase local (aplica migrations e seed)
node scripts/dev-users.mjs  # cria admin, enfermeira e familiar de teste
npx supabase functions serve   # em outro terminal: Edge Function admin-users
npm run dev                 # http://localhost:5173
```

Usuários de teste (somente no ambiente local): `admin@cuidar.test`, `ana@cuidar.test` (enfermagem), `carla@cuidar.test` (familiar), senha `teste1234`.

Testes: `npm test` (agenda, validações e regras RLS num Postgres embutido).

## Publicar (Supabase + Vercel)

1. **Banco:** no painel do Supabase, abra **SQL Editor**, cole o conteúdo de `supabase/setup.sql` e clique em **Run**.
2. **Cadastro público desligado:** Authentication → Sign In / Providers → desative **Allow new users to sign up**.
3. **URL do site:** Authentication → URL Configuration → *Site URL* = endereço da Vercel (ex.: `https://cuidar.vercel.app`) e adicione `https://cuidar.vercel.app/redefinir-senha` em *Redirect URLs*.
4. **Primeiro admin:** Authentication → Users → **Add user** (e-mail e senha, marque *Auto Confirm*). Depois, no SQL Editor:
   ```sql
   update public.profiles set role = 'admin', must_change_password = false
   where id = (select id from auth.users where email = 'SEU_EMAIL');
   ```
5. **(Opcional) Dados de exemplo:** cole `supabase/seed.sql` no SQL Editor.
6. **Edge Function:**
   ```bash
   npx supabase login
   npx supabase link --project-ref SEU_PROJECT_REF
   npx supabase functions deploy admin-users --no-verify-jwt
   ```
   Pelo painel: Edge Functions → Deploy a new function → Via Editor, cole `supabase/functions/admin-users/index.ts`, nome `admin-users`. Depois, em **Settings** da função, desligue **Verify JWT with legacy secret** (a função já valida o usuário e o papel de admin no código).
   ```
7. **Vercel:** importe o repositório, *Root Directory* = `app`, e configure as variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (Settings → API no Supabase). A chave **service_role nunca** vai para a Vercel nem para o código.

## Regras importantes

- Quem prescreve é o **médico**: toda prescrição registra o médico e o CRM; a enfermagem transcreve e administra.
- Uma dose fica **atrasada** 30 minutos após o horário previsto.
- **Registros de doses não podem ser alterados nem apagados** (garantido pelo banco). Uma correção cria um novo registro ligado ao anterior, e a auditoria mostra os dois.
- Prescrições e residentes não são apagados, apenas encerrados ou desativados.
- Cada familiar só enxerga os residentes vinculados a ele pelo admin. Usuário desativado não consegue entrar nem ler dados.

## Para o Relatório Síntese da extensão

- **Relato:** quantas pessoas da equipe e quantos familiares passaram a usar o sistema; quantos residentes estão cadastrados (o Painel do admin mostra esses números).
- **Resultados:** % de doses registradas no dia, redução de doses esquecidas (compare a lista "Atrasadas" ao longo das semanas), depoimentos de enfermeiros e familiares.
- **Comprovação:** fotos do treinamento com a equipe, prints das telas (sem dados reais de pacientes) e a Carta de Apresentação assinada pela clínica.
- **Atenção à LGPD:** em fotos e prints use os dados de exemplo, nunca dados reais dos residentes.
