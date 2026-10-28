# Especificação — Sistema de Gestão de Medicamentos para Clínica de Idosos

- **Data:** 28/10/2026
- **Contexto:** Atividade de Extensão UNIP — ação "Desenvolvimento de aplicativos/software/website para a comunidade" (Prestação de serviços, 70h). ODS 3 — Saúde e bem-estar.
- **Status:** design aprovado, aguardando revisão da especificação escrita.

## 1. Objetivo

Permitir que a equipe de enfermagem de uma clínica de idosos registre as prescrições de cada residente e a administração de cada dose, e que os familiares acompanhem, de onde estiverem, as medicações sendo aplicadas. Um administrador controla todos os usuários.

**Critérios de sucesso**

1. O enfermeiro registra uma dose em no máximo 2 toques a partir da tela "Hoje".
2. Doses atrasadas ficam visíveis sem precisar procurar.
3. O familiar vê, em tempo real, o status das doses do dia do seu idoso e nada de outros idosos.
4. O admin cria, edita e desativa usuários e vínculos sem mexer no banco de dados.
5. O site funciona bem em celular (360px de largura) e em computador.

## 2. Decisões tomadas

| Tema | Decisão |
|---|---|
| Uso | Real, online, com dados compartilhados entre aparelhos |
| Frontend | React + Vite + TypeScript, React Router |
| Backend | Supabase (Postgres, Auth, Row Level Security, Edge Functions) |
| Hospedagem | Vercel (frontend) + Supabase plano gratuito |
| Rotina de doses | Agenda do dia gerada a partir dos horários das prescrições |
| Contas | Somente o admin cria contas; não há cadastro público |
| Idioma | Português (Brasil), fuso `America/Sao_Paulo` |

**Observação legal:** quem prescreve é o médico. O enfermeiro transcreve a prescrição no sistema e administra as doses. Toda prescrição registra o médico responsável (nome e CRM).

## 3. Perfis de acesso

| Perfil | Permissões |
|---|---|
| `admin` | Tudo: usuários, vínculos, residentes, prescrições, registros, painel geral |
| `nurse` (enfermeiro) | Ler e cadastrar/editar residentes; criar/encerrar prescrições; registrar administrações; ler histórico |
| `family` (familiar) | Somente leitura dos residentes vinculados a ele, suas prescrições e administrações |

Usuário com `active = false` não consegue usar o sistema (bloqueado pelas regras RLS e redirecionado para uma tela "Acesso desativado").

## 4. Telas

Navegação: barra inferior no celular / lateral no computador, com no máximo 4 itens por perfil.

### 4.1 Comum
- **Login** — e-mail e senha. Link "Esqueci minha senha" (e-mail de redefinição do Supabase).
- **Primeiro acesso** — se `must_change_password = true`, obriga a trocar a senha provisória antes de continuar.
- **Minha conta** — nome, troca de senha, sair.

### 4.2 Enfermeiro
- **Hoje** (tela inicial) — doses do dia agrupadas por horário (ex.: 08:00, 12:00, 20:00), cada item com foto/inicial do residente, nome, medicamento, dose e via. Filtro rápido por residente e busca por nome. Ações por dose: **Aplicada**, **Recusada**, **Não aplicada** (as duas últimas pedem um motivo curto). Observação opcional. Status com cor + ícone + texto:
  - Pendente (cinza), Atrasada (vermelho — mais de 30 min após o horário previsto e ainda pendente), Aplicada (verde), Recusada (laranja), Não aplicada (vermelho escuro).
  - Um registro feito pode ser **corrigido** (gera novo registro; ver §6).
- **Residentes** — lista com busca. Ficha do residente: dados, alergias em destaque, observações, prescrições ativas e encerradas, histórico de doses por dia.
- **Nova prescrição / editar** — medicamento, dosagem (texto, ex.: "500 mg", "10 gotas"), via (oral, sublingual, injetável, tópica, inalatória, outra), horários (lista de HH:MM), data de início, data de fim (opcional = uso contínuo), médico (nome + CRM), instruções. Botão "Encerrar prescrição" (define `end_date` = hoje e `active = false`); prescrições não são apagadas.
- **Novo residente / editar** — nome, data de nascimento, quarto, alergias, observações, foto opcional (fora da v1: usar iniciais).

### 4.3 Familiar
- **Meu idoso** (tela inicial) — se tiver mais de um vínculo, seletor no topo. Mostra: linha do tempo de hoje (✔ "Losartana 50 mg — aplicada às 08:03 por Enf. Ana"), próximas doses, medicações ativas.
- **Histórico** — escolha de dia (calendário simples), lista das doses daquele dia com status.
- Atualização em tempo real via Supabase Realtime na tela de hoje.

### 4.4 Admin
- **Painel** — cartões: residentes ativos, enfermeiros ativos, familiares ativos, doses de hoje (aplicadas / previstas, %), doses atrasadas agora. Lista "Atrasadas agora".
- **Usuários** — tabela com busca e filtro por perfil. Criar usuário (nome, e-mail, perfil, senha provisória gerada e exibida uma vez), editar nome/perfil, ativar/desativar, redefinir senha. Para familiares: gerenciar vínculos (adicionar/remover residentes, campo "parentesco").
- **Residentes** — mesma tela do enfermeiro, mais ativar/desativar residente.
- **Auditoria** — lista cronológica de registros de administração (quem, quando, o quê), filtrável por residente, enfermeiro e período.
- O admin também acessa as telas do enfermeiro (pode registrar doses).

## 5. Modelo de dados (Postgres)

```
profiles
  id uuid PK = auth.users.id
  full_name text not null
  role text check in ('admin','nurse','family')
  active boolean default true
  must_change_password boolean default true
  created_at timestamptz default now()

residents
  id uuid PK
  full_name text not null
  birth_date date
  room text
  allergies text
  notes text
  active boolean default true
  created_at timestamptz default now()

family_links
  family_id uuid FK profiles(id)
  resident_id uuid FK residents(id)
  relationship text            -- ex.: "Filha"
  PK (family_id, resident_id)

prescriptions
  id uuid PK
  resident_id uuid FK residents(id)
  medication text not null
  dosage text not null
  route text not null
  times time[] not null        -- horários diários, ex.: {08:00,20:00}
  start_date date not null
  end_date date                -- null = uso contínuo
  prescriber_name text not null
  prescriber_crm text not null
  instructions text
  active boolean default true
  created_by uuid FK profiles(id)
  created_at timestamptz default now()

administrations
  id uuid PK
  prescription_id uuid FK prescriptions(id)
  scheduled_for timestamptz not null   -- data + horário previsto
  status text check in ('given','refused','missed')
  reason text                          -- obrigatório se refused/missed
  notes text
  recorded_by uuid FK profiles(id)
  recorded_at timestamptz default now()
  supersedes uuid FK administrations(id)  -- preenchido em correções
```

Índices: `administrations(prescription_id, scheduled_for)`, `prescriptions(resident_id, active)`, `family_links(resident_id)`.

## 6. Regras de negócio

1. **Agenda do dia** é calculada no frontend (função pura `buildSchedule(prescriptions, administrations, date, now)`): para cada prescrição ativa em que `start_date <= dia <= end_date (ou sem fim)`, gera um item por horário em `times`. O status do item vem do registro de administração mais recente (que não tenha sido substituído) para aquele `prescription_id + scheduled_for`; sem registro → `pending` ou `late`.
2. **Atraso:** item `pending` cujo `scheduled_for + 30 min < agora` vira `late`. A tolerância fica em uma constante.
3. **Registros são imutáveis:** não há UPDATE nem DELETE em `administrations` (bloqueado por RLS). Uma correção insere novo registro com `supersedes` apontando para o anterior; o histórico mostra "corrigido".
4. **Recusada / Não aplicada** exigem `reason` (validação no frontend e `check` no banco).
5. **Prescrições não são apagadas**, apenas encerradas. Editar uma prescrição que já tem administrações registradas altera só os dados futuros; os registros antigos continuam ligados ao mesmo `prescription_id`. (Para mudança de dose, o fluxo recomendado na interface é "Encerrar e criar nova", mostrado como dica.)
6. Fuso horário fixo `America/Sao_Paulo` para montar `scheduled_for`.

## 7. Segurança

- **RLS ativado em todas as tabelas.** Funções auxiliares `security definer`: `current_role()` e `is_active()`.
  - `profiles`: usuário lê o próprio perfil; admin lê/edita todos; qualquer usuário ativo lê o perfil de enfermeiros e admins (para mostrar "por Enf. Ana"); familiares não enxergam outros familiares.
  - `residents`, `prescriptions`: admin e enfermeiro ativos leem e escrevem; familiar lê apenas os vinculados via `family_links`.
  - `administrations`: admin/enfermeiro ativos leem e inserem (`recorded_by = auth.uid()`); familiar lê os dos residentes vinculados; ninguém atualiza ou apaga.
  - `family_links`: admin gerencia; familiar lê os próprios.
- **Edge Function `admin-users`** (usa a service role key, que nunca vai para o navegador): criar usuário, redefinir senha, ativar/desativar. Verifica se quem chama é admin ativo.
- O primeiro admin é criado por um script SQL de seed (instruções no README).
- Sem cadastro público: "Allow new users to sign up" desativado no Supabase.
- LGPD: coletar o mínimo de dados; página "Privacidade" simples explicando quais dados são guardados e para quê.

## 8. Visual e usabilidade

- Minimalista: fundo claro (`#F7F9FA`), cartões brancos, uma cor de destaque verde-azulada (`#0F766E`), texto escuro com contraste AA.
- Fonte base 17px no celular, títulos grandes, alvos de toque ≥ 48px.
- Status sempre com cor **e** ícone **e** texto.
- Linguagem simples ("Aplicada", "Recusou", "Não foi aplicada"), sem jargão técnico.
- Confirmações curtas (toast "Dose registrada") e opção de desfazer via correção.
- Estados vazios explicativos ("Nenhuma dose prevista para hoje").
- Modo escuro: fora da v1.

## 9. Estrutura do projeto

```
app/
  src/
    lib/supabase.ts          cliente Supabase
    lib/schedule.ts          buildSchedule + regras de atraso (puro, testado)
    lib/auth.tsx             contexto de sessão + perfil
    components/              Button, Card, StatusBadge, Layout, Nav...
    pages/login, today, residents, resident-detail, prescription-form,
          family-home, family-history, admin-dashboard, admin-users, audit, account
    routes.tsx               rotas protegidas por perfil
  supabase/
    migrations/001_schema.sql, 002_rls.sql
    seed.sql                 dados de exemplo para demonstração
    functions/admin-users/
  README.md                  como rodar, publicar e criar o primeiro admin
```

## 10. Tratamento de erros

- Falha de rede ao registrar dose: mensagem clara + botão "Tentar novamente"; o botão fica desabilitado durante o envio para evitar registro duplicado.
- Sessão expirada: volta para o login preservando a rota.
- Erro de permissão (RLS): mensagem "Você não tem acesso a esta informação".

## 11. Testes

- **Unitários (Vitest):** `buildSchedule` — prescrição ativa/encerrada, início/fim, vários horários, atraso, registro substituído por correção, virada de dia/fuso.
- **Regras RLS:** script SQL de verificação com usuários de cada perfil (familiar não enxerga residente não vinculado; ninguém apaga administração).
- **Manual no navegador:** fluxos dos 3 perfis no celular e no desktop, usando o seed.

## 12. Fora do escopo da v1

Notificações (WhatsApp/e-mail/push), controle de estoque de medicamentos, doses "se necessário" (avulsas), fotos dos residentes, modo escuro, app nativo, relatórios em PDF.
