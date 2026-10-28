# Gestão de Medicamentos (Clínica de Idosos) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Site responsivo em que enfermeiros registram prescrições e doses, familiares acompanham em tempo real e o admin gerencia usuários.

**Architecture:** SPA React (Vite + TypeScript) conversando direto com o Supabase. A segurança fica no banco (RLS); operações privilegiadas de usuários ficam numa Edge Function. A agenda do dia é uma função pura no frontend (`buildSchedule`), testada com Vitest.

**Tech Stack:** React 18, Vite 5, TypeScript, React Router 6, @supabase/supabase-js 2, Vitest, lucide-react (ícones), CSS puro com variáveis (sem framework de UI). Supabase (Postgres, Auth, Realtime, Edge Functions em Deno). Deploy: Vercel.

**Spec:** `docs/superpowers/specs/2026-10-28-gestao-medicamentos-design.md`

## Global Constraints

- Projeto em `D:\github\Extensao\app`. Toda a interface em português (Brasil).
- Fuso fixo `America/Sao_Paulo` (UTC−03:00, sem horário de verão desde 2019) — montar instantes com offset `-03:00`, nunca com o fuso do aparelho.
- Tolerância de atraso: constante `LATE_TOLERANCE_MIN = 30`.
- Status de registro: `given` (Aplicada), `refused` (Recusou), `missed` (Não foi aplicada). Status de agenda adiciona `pending` (Pendente) e `late` (Atrasada).
- Cores: fundo `#F7F9FA`, cartões `#FFFFFF`, destaque `#0F766E`; contraste AA; fonte base 17px no celular; alvos de toque ≥ 48px; status sempre com cor + ícone + texto.
- Navegação com no máximo 4 itens por perfil (barra inferior < 768px, lateral ≥ 768px).
- `administrations` nunca recebe UPDATE/DELETE; correção = novo registro com `supersedes`.
- Prescrições e residentes nunca são apagados (apenas `active = false`).
- A service role key só existe na Edge Function; o frontend usa apenas `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
- Cadastro público desativado no Supabase.
- Pré-requisito do usuário: criar um projeto gratuito no Supabase e informar URL + anon key em `app/.env.local` (o agente não cria contas).

## Review Focus

1. Dose às 23:30 vista por um aparelho em outro fuso ou após a meia-noite — deve continuar no dia correto de São Paulo (teste em Task 2).
2. Toque duplo em "Aplicada" — deve gerar um único registro (botão desabilitado durante envio; teste em Task 6).
3. Prescrição com `end_date` igual a hoje — doses de hoje aparecem; amanhã não (teste em Task 2).
4. Correção de um registro — a agenda mostra o status mais recente, não o original (teste em Task 2).
5. Usuário desativado com sessão ainda válida — não lê dados (RLS) e cai na tela "Acesso desativado" (verificação em Task 3 e Task 4).

---

### Task 1: Scaffold do projeto e tema visual

**Files:**
- Create: `app/` (via `npm create vite@5 app -- --template react-ts`), `app/.env.example`, `app/src/styles/theme.css`, `app/vercel.json`, `.gitignore`
- Modify: `app/src/main.tsx`, `app/vite.config.ts` (bloco `test` do Vitest, `environment: 'node'`)

**Interfaces:**
- Produces: variáveis CSS `--bg --card --primary --primary-contrast --text --muted --border --ok --warn --danger --danger-dark --radius --tap` em `theme.css`; scripts `npm run dev`, `npm test`, `npm run build`.

- [ ] **Step 1:** Na raiz `D:\github\Extensao`, `git init` e `.gitignore` com `node_modules`, `dist`, `.env.local`.
- [ ] **Step 2:** Criar o app Vite e instalar: `npm i @supabase/supabase-js react-router-dom lucide-react` e `npm i -D vitest`.
- [ ] **Step 3:** `theme.css` com os tokens dos Global Constraints, reset simples, `body { background: var(--bg); font-size: 17px }`, classes utilitárias `.card`, `.stack`, `.row`.
- [ ] **Step 4:** `.env.example` com `VITE_SUPABASE_URL=` e `VITE_SUPABASE_ANON_KEY=`; `vercel.json` com rewrite de todas as rotas para `/index.html`.
- [ ] **Step 5:** Verificar: `npm run build` termina sem erros.
- [ ] **Step 6:** Commit `chore: scaffold app React + Vite + tema`.

---

### Task 2: Lógica da agenda do dia (`schedule.ts`)

**Files:**
- Create: `app/src/lib/types.ts`, `app/src/lib/schedule.ts`
- Test: `app/src/lib/schedule.test.ts`

**Interfaces:**
- Produces (`types.ts`):
  ```ts
  export type Role = 'admin' | 'nurse' | 'family'
  export type RecordStatus = 'given' | 'refused' | 'missed'
  export type DoseStatus = 'pending' | 'late' | RecordStatus
  export interface Profile { id: string; full_name: string; role: Role; active: boolean; must_change_password: boolean }
  export interface Resident { id: string; full_name: string; birth_date: string | null; room: string | null; allergies: string | null; notes: string | null; active: boolean }
  export interface Prescription { id: string; resident_id: string; medication: string; dosage: string; route: string; times: string[]; start_date: string; end_date: string | null; prescriber_name: string; prescriber_crm: string; instructions: string | null; active: boolean }
  export interface Administration { id: string; prescription_id: string; scheduled_for: string; status: RecordStatus; reason: string | null; notes: string | null; recorded_by: string; recorded_at: string; supersedes: string | null }
  export interface DoseItem { prescription: Prescription; scheduledFor: Date; status: DoseStatus; record: Administration | null }
  ```
- Produces (`schedule.ts`):
  - `LATE_TOLERANCE_MIN = 30`
  - `spInstant(day: string, hhmm: string): Date` — `new Date(\`${day}T${hhmm}:00-03:00\`)`; aceita `'08:00'` ou `'08:00:00'`.
  - `todaySP(now: Date): string` — `'YYYY-MM-DD'` em São Paulo.
  - `latestRecords(records: Administration[]): Map<string, Administration>` — chave `` `${prescription_id}|${new Date(scheduled_for).toISOString()}` ``; ignora registros cujo `id` aparece em algum `supersedes`; em empate, maior `recorded_at`.
  - `buildSchedule(prescriptions: Prescription[], records: Administration[], day: string, now: Date): DoseItem[]` — só `active` e `start_date <= day <= (end_date ?? ∞)`; um item por horário; ordenado por `scheduledFor`, depois `medication`.
  - `statusLabel: Record<DoseStatus, string>` = `{ pending: 'Pendente', late: 'Atrasada', given: 'Aplicada', refused: 'Recusou', missed: 'Não foi aplicada' }`

- [ ] **Step 1: Testes que falham** em `schedule.test.ts` (use `now` fixo; prescrição base `times: ['08:00','20:00']`, `start_date: '2026-10-01'`, `end_date: null`, `active: true`):
  - `gera um item por horário` → 2 itens para `'2026-10-28'`, horários `11:00Z` e `23:00Z`.
  - `normaliza horário vindo do Postgres` → `times: ['08:00:00']` gera `2026-10-28T11:00:00.000Z`.
  - `ignora prescrição inativa ou fora do período` → `active:false` → 0; `start_date:'2026-10-29'` → 0.
  - `inclui o último dia de end_date` → `end_date:'2026-10-28'`: dia 28 → 2 itens, dia 29 → 0.
  - `pendente vira atrasada após 30 min` → `now = 08:29 SP` → 08:00 `pending`; `now = 08:31 SP` → `late`; 20:00 continua `pending`.
  - `usa o registro mais recente quando há correção` → registro A `given`, registro B `refused` com `supersedes: A.id` → status `refused`, `record.id === B.id`.
  - `todaySP usa o fuso de São Paulo` → `todaySP(new Date('2026-10-29T02:30:00Z')) === '2026-10-28'`.
  - `ordena por horário e medicamento` → duas prescrições às 08:00 (`'Losartana'`, `'Dipirona'`) → `Dipirona` primeiro.
- [ ] **Step 2:** `npx vitest run src/lib/schedule.test.ts` → FAIL (módulo inexistente).
- [ ] **Step 3:** Implementar `types.ts` e `schedule.ts` com as assinaturas acima.
- [ ] **Step 4:** `npx vitest run` → todos PASS.
- [ ] **Step 5:** Commit `feat: agenda do dia com regras de atraso e correção`.

---

### Task 3: Banco de dados, RLS e dados de exemplo

**Files:**
- Create: `app/supabase/migrations/001_schema.sql`, `app/supabase/migrations/002_rls.sql`, `app/supabase/seed.sql`, `app/supabase/tests/rls_check.sql`

**Interfaces:**
- Produces: tabelas e colunas exatamente como no §5 da spec; funções `public.my_role() returns text` e `public.is_active_user() returns boolean` (`security definer`, `stable`, `search_path = public`); publicação Realtime para `administrations`.

- [ ] **Step 1: `001_schema.sql`** — tabelas do §5; `check (status in ('given','refused','missed'))`; `check (status = 'given' or coalesce(trim(reason),'') <> '')`; `check (role in ('admin','nurse','family'))`; índices do §5; trigger `on auth.users insert` que cria `profiles` lendo `raw_user_meta_data->>'full_name'` e `->>'role'` (padrão `'family'`); `alter publication supabase_realtime add table administrations`.
- [ ] **Step 2: `002_rls.sql`** — `enable row level security` em todas; políticas:
  - `profiles`: select se `id = auth.uid()` ou `my_role()='admin'` ou (`is_active_user()` e `role in ('admin','nurse')`); update apenas admin; o próprio usuário pode atualizar só `must_change_password` (via função `public.mark_password_changed()` security definer, em vez de policy de update).
  - `residents`, `prescriptions`: select/insert/update para `is_active_user() and my_role() in ('admin','nurse')`; select para familiar quando existe `family_links` com `family_id = auth.uid()` e o `resident_id` correspondente, e `is_active_user()`.
  - `administrations`: select como `prescriptions` (via join na prescrição); insert para admin/nurse ativos com `recorded_by = auth.uid()`; sem policies de update/delete.
  - `family_links`: tudo para admin; select para `family_id = auth.uid()`.
- [ ] **Step 3: `seed.sql`** — 4 residentes, 8 prescrições (horários variados, uma com `end_date` = hoje), alguns registros de hoje. Usuários de exemplo não vão no seed; o README explica como criar o primeiro admin (Dashboard → Authentication → Add user, depois `update profiles set role='admin', must_change_password=false where id = '<uuid>'`).
- [ ] **Step 4: `rls_check.sql`** — blocos `set local role authenticated; set local request.jwt.claims = '{"sub":"<uuid>"}'` para um familiar e um enfermeiro, com `select` esperados comentados: familiar vê só o residente vinculado; `delete from administrations` afeta 0 linhas; familiar desativado vê 0 residentes.
- [ ] **Step 5: Verificar** — aplicar as migrations e o seed no SQL Editor do projeto Supabase do usuário; rodar `rls_check.sql`; os resultados batem com os comentários.
- [ ] **Step 6:** Commit `feat: schema, RLS e seed do Supabase`.

---

### Task 4: Cliente Supabase, sessão e rotas protegidas

**Files:**
- Create: `app/src/lib/supabase.ts`, `app/src/lib/auth.tsx`, `app/src/routes.tsx`, `app/src/pages/Login.tsx`, `app/src/pages/FirstAccess.tsx`, `app/src/pages/Account.tsx`, `app/src/pages/Disabled.tsx`, `app/src/pages/Privacy.tsx`
- Modify: `app/src/main.tsx`, `app/src/App.tsx`

**Interfaces:**
- Consumes: `Profile`, `Role` (Task 2).
- Produces:
  - `supabase` (cliente único).
  - `AuthProvider`, `useAuth(): { session: Session | null; profile: Profile | null; loading: boolean; signIn(email: string, password: string): Promise<string | null>; signOut(): Promise<void>; refreshProfile(): Promise<void> }` — `signIn` retorna mensagem de erro em português ou `null`.
  - `<RequireRole roles={Role[]}>` — sem sessão → `/login?next=<rota>`; `profile.active === false` → `/desativado`; `must_change_password` → `/primeiro-acesso`; perfil fora de `roles` → rota inicial do perfil.
  - `homeFor(role: Role): string` → `admin: '/admin'`, `nurse: '/hoje'`, `family: '/familia'`.
  - Rotas: `/login`, `/primeiro-acesso`, `/conta`, `/desativado`, `/privacidade`, `/esqueci-senha`.

- [ ] **Step 1:** Implementar `supabase.ts` (lança erro claro se faltar variável de ambiente) e `auth.tsx` (carrega `profiles` do usuário após login e em `onAuthStateChange`).
- [ ] **Step 2:** Páginas Login (e-mail, senha, "Esqueci minha senha" → `resetPasswordForEmail`), FirstAccess (nova senha ×2, mínimo 8 caracteres → `updateUser` + `rpc('mark_password_changed')`), Account, Disabled, Privacy (texto do §7 da spec: quais dados, para quê, quem acessa).
- [ ] **Step 3:** `routes.tsx` com `RequireRole` e páginas placeholder para as rotas das Tasks 6–10.
- [ ] **Step 4: Verificar** com `npm run dev`: login com o admin criado na Task 3 → força troca de senha → cai em `/admin`; desativar o usuário pelo SQL e recarregar → `/desativado`.
- [ ] **Step 5:** Commit `feat: autenticação e rotas por perfil`.

---

### Task 5: Componentes de interface e layout

**Files:**
- Create: `app/src/components/{Button,Card,StatusBadge,Field,Toast,EmptyState,Layout,Avatar}.tsx`, `app/src/components/components.css`

**Interfaces:**
- Consumes: `DoseStatus`, `statusLabel` (Task 2), `useAuth` (Task 4).
- Produces:
  - `Button({ variant?: 'primary'|'secondary'|'danger'|'ghost', loading?: boolean, ...buttonProps })` — `loading` desabilita e mostra spinner.
  - `StatusBadge({ status: DoseStatus })` — ícones lucide: pending `Clock`, late `AlertTriangle`, given `CheckCircle2`, refused `XCircle`, missed `MinusCircle`; texto de `statusLabel`.
  - `Field({ label, error?, children })`, `Card`, `EmptyState({ title, text })`, `Avatar({ name })` (iniciais).
  - `useToast(): (msg: string, kind?: 'ok'|'error') => void` + `ToastProvider`.
  - `Layout` com menu por perfil — nurse: Hoje `/hoje`, Residentes `/residentes`, Conta `/conta`; family: Meu idoso `/familia`, Histórico `/familia/historico`, Conta; admin: Painel `/admin`, Usuários `/admin/usuarios`, Residentes `/residentes`, Auditoria `/admin/auditoria` (Hoje e Conta acessíveis pelo cabeçalho).

- [ ] **Step 1:** Implementar os componentes seguindo os Global Constraints (48px, contraste, barra inferior/lateral).
- [ ] **Step 2: Verificar** no navegador a 360px e 1280px: menu muda de posição, sem rolagem horizontal.
- [ ] **Step 3:** Commit `feat: componentes base e layout responsivo`.

---

### Task 6: Tela "Hoje" do enfermeiro e registro de doses

**Files:**
- Create: `app/src/lib/api.ts`, `app/src/pages/nurse/Today.tsx`, `app/src/pages/nurse/RecordDoseDialog.tsx`
- Test: `app/src/lib/api.test.ts`

**Interfaces:**
- Consumes: `buildSchedule`, `todaySP`, `spInstant` (Task 2); `supabase` (Task 4); componentes (Task 5).
- Produces (`api.ts`, todas lançam `Error` com mensagem em português):
  - `fetchResidents(opts?: { activeOnly?: boolean }): Promise<Resident[]>`
  - `fetchPrescriptions(residentIds?: string[]): Promise<Prescription[]>`
  - `fetchAdministrationsForDay(day: string, prescriptionIds: string[]): Promise<Administration[]>` — intervalo `[spInstant(day,'00:00'), spInstant(day,'23:59')]`.
  - `recordDose(input: { prescription_id: string; scheduled_for: string; status: RecordStatus; reason?: string; notes?: string; supersedes?: string }): Promise<Administration>`
  - `validateDose(input): string | null` — `'Informe o motivo'` se `status !== 'given'` e motivo vazio.
  - `friendlyError(e: unknown): string` — erro de RLS/permissão → `'Você não tem acesso a esta informação'`; rede → `'Sem conexão. Tente novamente.'`

- [ ] **Step 1: Testes que falham** (`api.test.ts`): `validateDose` exige motivo para `refused`/`missed` e aceita `given` sem motivo; `friendlyError` mapeia `{ code: '42501' }` para a mensagem de permissão e `TypeError('Failed to fetch')` para a de rede.
- [ ] **Step 2:** `npx vitest run src/lib/api.test.ts` → FAIL.
- [ ] **Step 3:** Implementar `api.ts`.
- [ ] **Step 4:** `npx vitest run` → PASS.
- [ ] **Step 5:** `Today.tsx` — carrega residentes, prescrições e registros do dia; agrupa por horário `HH:MM`; seção "Atrasadas" no topo quando houver; filtro por residente e busca; recalcula a cada 60 s. Cada item mostra Avatar, residente, quarto, medicamento, dose, via, `StatusBadge` e botões grandes **Aplicada** / **Outro** (abre o diálogo com Recusou / Não foi aplicada + motivo + observação). Itens já registrados mostram "por <nome> às HH:MM" e um botão "Corrigir" (abre o diálogo e envia `supersedes`).
- [ ] **Step 6:** Proteção contra toque duplo: o botão usa `loading` durante `recordDose`; ao terminar, atualiza a lista e mostra o toast "Dose registrada".
- [ ] **Step 7: Verificar** no navegador com o seed: marcar uma dose → verde; tocar duas vezes rápido em "Aplicada" → apenas 1 linha nova em `administrations`; corrigir → status novo e o histórico mantém as 2 linhas.
- [ ] **Step 8:** Commit `feat: tela Hoje e registro de doses`.

---

### Task 7: Residentes, ficha e prescrições

**Files:**
- Create: `app/src/pages/residents/{ResidentList,ResidentDetail,ResidentForm,PrescriptionForm}.tsx`
- Modify: `app/src/lib/api.ts`
- Test: `app/src/lib/api.test.ts`

**Interfaces:**
- Consumes: `api.ts` (Task 6), componentes (Task 5).
- Produces (`api.ts`):
  - `saveResident(r: Partial<Resident> & { full_name: string }): Promise<Resident>` (insert se sem `id`, senão update)
  - `savePrescription(p: Omit<Prescription,'id'|'active'> & { id?: string }): Promise<Prescription>`
  - `endPrescription(id: string, today: string): Promise<void>` — `active=false`, `end_date=today`
  - `fetchAdministrationsForResident(residentId: string, day: string): Promise<Administration[]>`
  - `parseTimes(input: string[]): { times: string[]; error: string | null }` — valida `HH:MM`, remove duplicados, ordena.
  - `ROUTES_OPTIONS = ['Oral','Sublingual','Injetável','Tópica','Inalatória','Outra']`

- [ ] **Step 1: Testes que falham:** `parseTimes(['20:00','08:00','08:00'])` → `['08:00','20:00']`; `parseTimes(['25:00'])` → erro `'Horário inválido: 25:00'`; `parseTimes([])` → erro `'Informe ao menos um horário'`.
- [ ] **Step 2:** Rodar → FAIL. **Step 3:** Implementar. **Step 4:** Rodar → PASS.
- [ ] **Step 5:** Telas: lista com busca (`/residentes`); ficha (`/residentes/:id`) com alergias em destaque (fundo de alerta), prescrições ativas/encerradas, histórico por dia (seletor de data usando `buildSchedule` para o dia escolhido); formulário de residente (`/residentes/novo`, `/residentes/:id/editar`); formulário de prescrição (`/residentes/:id/prescricoes/nova`, `.../:pid/editar`) com horários adicionáveis, campos de médico + CRM obrigatórios e a dica "Para mudar a dose, encerre esta prescrição e crie uma nova". O admin vê "Desativar residente".
- [ ] **Step 6: Verificar** no navegador: criar residente → prescrição 08:00/20:00 → aparece em "Hoje"; encerrar → some da agenda de amanhã e continua no histórico.
- [ ] **Step 7:** Commit `feat: residentes e prescrições`.

---

### Task 8: Área do familiar

**Files:**
- Create: `app/src/pages/family/{FamilyHome,FamilyHistory}.tsx`, `app/src/lib/realtime.ts`
- Modify: `app/src/lib/api.ts`

**Interfaces:**
- Consumes: `buildSchedule` (Task 2), `api.ts` (Tasks 6–7).
- Produces:
  - `fetchMyResidents(): Promise<(Resident & { relationship: string | null })[]>`
  - `fetchStaffNames(ids: string[]): Promise<Record<string, string>>`
  - `subscribeAdministrations(prescriptionIds: string[], onChange: () => void): () => void` (retorna função para cancelar a inscrição)

- [ ] **Step 1:** `FamilyHome` (`/familia`) — seletor se houver mais de 1 idoso; o último escolhido fica salvo em `localStorage` (com try/catch); cartão do idoso; linha do tempo de hoje ("Losartana 50 mg — Aplicada às 08:03 por Ana"); próximas doses; lista de medicações ativas. Sem vínculo → `EmptyState` "Nenhum idoso vinculado. Fale com a clínica."
- [ ] **Step 2:** Realtime: `subscribeAdministrations` recarrega a linha do tempo quando chegar um insert.
- [ ] **Step 3:** `FamilyHistory` (`/familia/historico`) — seletor de data (padrão hoje, máximo hoje) e lista do dia.
- [ ] **Step 4: Verificar** com 2 janelas: enfermeiro registra uma dose → o familiar vê a atualização sem recarregar; um familiar vinculado ao residente A não consegue abrir `/residentes/<id de B>` (mensagem de acesso).
- [ ] **Step 5:** Commit `feat: área do familiar com tempo real`.

---

### Task 9: Gestão de usuários (Edge Function + tela admin)

**Files:**
- Create: `app/supabase/functions/admin-users/index.ts`, `app/src/pages/admin/{Users,UserForm,FamilyLinks}.tsx`
- Modify: `app/src/lib/api.ts`
- Test: `app/src/lib/api.test.ts`

**Interfaces:**
- Edge Function `POST /admin-users`, corpo `{ action: 'create', email, full_name, role, temp_password } | { action: 'reset_password', user_id, temp_password } | { action: 'set_active', user_id, active: boolean }`. Valida o JWT de quem chama, exige `profiles.role='admin'` e `active`; responde `{ ok: true, user_id? }` ou `{ ok: false, error }` (status 403 se não for admin). `create` usa `auth.admin.createUser({ email_confirm: true, user_metadata: { full_name, role } })`; `reset_password` também marca `must_change_password = true`; `set_active=false` também chama `auth.admin.updateUserById(id, { ban_duration: '876000h' })` (e `'none'` ao reativar).
- Produces (`api.ts`): `adminUsers(body): Promise<{ user_id?: string }>` (via `supabase.functions.invoke`), `fetchProfiles(): Promise<Profile[]>`, `updateProfile(id, { full_name?, role? })`, `fetchLinks(familyId)`, `addLink(familyId, residentId, relationship)`, `removeLink(familyId, residentId)`, `generateTempPassword(): string` (10 caracteres, sem caracteres ambíguos `0O1lI`).

- [ ] **Step 1: Teste que falha:** `generateTempPassword()` tem 10 caracteres e não contém `0`, `O`, `1`, `l`, `I` (100 iterações).
- [ ] **Step 2:** Rodar → FAIL. **Step 3:** Implementar. **Step 4:** Rodar → PASS.
- [ ] **Step 5:** Implementar a Edge Function e publicar: `npx supabase functions deploy admin-users` (README registra os comandos `supabase login` e `supabase link`).
- [ ] **Step 6:** Telas: `/admin/usuarios` — tabela com busca e filtro por perfil, badges Ativo/Inativo; "Novo usuário" mostra a senha provisória uma única vez, com botão copiar; ações Editar, Redefinir senha, Ativar/Desativar (com confirmação); para familiar, `FamilyLinks` com adicionar/remover residente e campo parentesco.
- [ ] **Step 7: Verificar:** criar um enfermeiro e um familiar, vincular o familiar a 1 residente, entrar como cada um; chamar a função logado como enfermeiro → 403.
- [ ] **Step 8:** Commit `feat: gestão de usuários pelo admin`.

---

### Task 10: Painel do admin e auditoria

**Files:**
- Create: `app/src/pages/admin/{Dashboard,Audit}.tsx`
- Modify: `app/src/lib/api.ts`

**Interfaces:**
- Consumes: `buildSchedule`, `todaySP` (Task 2); `api.ts`.
- Produces: `fetchAudit(filters: { residentId?: string; nurseId?: string; from: string; to: string }): Promise<(Administration & { medication: string; resident_name: string; recorded_by_name: string })[]>` — ordenado por `recorded_at desc`, limite 200.

- [ ] **Step 1:** `Dashboard` (`/admin`) — cartões: residentes ativos, enfermeiros ativos, familiares ativos, doses de hoje "X de Y aplicadas (Z%)", atrasadas agora; lista "Atrasadas agora" com link para `/hoje`.
- [ ] **Step 2:** `Audit` (`/admin/auditoria`) — filtros de residente, enfermeiro e período (padrão: últimos 7 dias); linhas "28/10 08:03 — Ana registrou Aplicada · Losartana · Sr. João"; registros corrigidos marcados "corrigido".
- [ ] **Step 3: Verificar** se os números do painel batem com a tela "Hoje" usando os dados do seed.
- [ ] **Step 4:** Commit `feat: painel do admin e auditoria`.

---

### Task 11: README, publicação e verificação final

**Files:**
- Create: `app/README.md`

- [ ] **Step 1:** README: o que é o projeto (contexto de extensão), como criar o projeto Supabase, aplicar as migrations e o seed, desativar o signup, criar o primeiro admin, configurar `.env.local`, publicar a Edge Function, deploy na Vercel (variáveis de ambiente) e dicas para o Relatório Síntese (o que fotografar e o que medir: nº de residentes, enfermeiros e familiares atendidos).
- [ ] **Step 2:** `npm test` e `npm run build` → sem falhas.
- [ ] **Step 3: Teste manual completo** no navegador a 360px e 1280px, com os 3 perfis, passando por cada item da Review Focus.
- [ ] **Step 4:** Commit `docs: README e instruções de deploy`.
