// Testa as migrations e as regras RLS num Postgres embutido (PGlite),
// com um "mini Supabase" (schema auth, papéis e publicação) simulado.
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

const dir = join(__dirname, '..')
const sql = (f: string) => readFileSync(join(dir, f), 'utf8')

const SUPABASE_STUB = `
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$
  select nullif(nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub', '')::uuid
$$;
grant usage on schema auth to anon, authenticated;
create publication supabase_realtime;
`

const GRANTS = `
grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant execute on all functions in schema public to authenticated;
`

const ADMIN = '00000000-0000-0000-0000-00000000000a'
const NURSE = '00000000-0000-0000-0000-00000000000b'
const FAMILY = '00000000-0000-0000-0000-00000000000c'
const RES_A = '10000000-0000-0000-0000-000000000001'
const RES_B = '10000000-0000-0000-0000-000000000002'
const RX_A = '20000000-0000-0000-0000-000000000001'
const RX_B = '20000000-0000-0000-0000-000000000002'

let db: PGlite

/** Executa `fn` como o usuário `uid` dentro de uma transação desfeita ao final. */
async function as<T>(uid: string, fn: (q: (s: string) => Promise<any>) => Promise<T>): Promise<T> {
  await db.exec('begin')
  try {
    await db.exec(`set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}"}'`)
    return await fn(async (s) => (await db.query(s)).rows)
  } finally {
    await db.exec('rollback')
  }
}

async function count(uid: string, query: string): Promise<number> {
  return as(uid, async (q) => Number((await q(query))[0].n))
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(SUPABASE_STUB)
  await db.exec(sql('migrations/001_schema.sql'))
  await db.exec(sql('migrations/002_rls.sql'))
  await db.exec(GRANTS)
  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${ADMIN}', 'admin@x.com', '{"full_name":"Admin","role":"admin"}'),
      ('${NURSE}', 'ana@x.com', '{"full_name":"Ana","role":"nurse"}'),
      ('${FAMILY}', 'filha@x.com', '{"full_name":"Filha","role":"family"}');
    insert into public.residents (id, full_name) values ('${RES_A}', 'João'), ('${RES_B}', 'Maria');
    insert into public.family_links (family_id, resident_id, relationship) values ('${FAMILY}', '${RES_A}', 'Filha');
    insert into public.prescriptions (id, resident_id, medication, dosage, route, times, start_date, prescriber_name, prescriber_crm, created_by) values
      ('${RX_A}', '${RES_A}', 'Losartana', '50 mg', 'Oral', '{08:00}', '2026-10-01', 'Dra', 'CRM 1', '${ADMIN}'),
      ('${RX_B}', '${RES_B}', 'Metformina', '850 mg', 'Oral', '{08:00}', '2026-10-01', 'Dra', 'CRM 1', '${ADMIN}');
    insert into public.administrations (prescription_id, scheduled_for, status, recorded_by) values
      ('${RX_A}', '2026-10-28T11:00:00Z', 'given', '${NURSE}'),
      ('${RX_B}', '2026-10-28T11:00:00Z', 'given', '${NURSE}');
  `)
})

describe('perfis', () => {
  it('trigger cria o perfil com nome e papel do metadata', async () => {
    const rows = (await db.query<{ role: string }>(`select role from public.profiles order by role`)).rows
    expect(rows.map((r) => r.role)).toEqual(['admin', 'family', 'nurse'])
  })

  it('familiar não enxerga outros familiares, mas vê o nome da equipe', async () => {
    expect(await count(FAMILY, `select count(*) n from profiles where role = 'family'`)).toBe(1)
    expect(await count(FAMILY, `select count(*) n from profiles where role in ('admin','nurse')`)).toBe(2)
  })

  it('usuário não consegue mudar o próprio papel', async () => {
    await as(FAMILY, async (q) => {
      await q(`update profiles set role = 'admin' where id = '${FAMILY}'`)
      const r = await q(`select role from profiles where id = '${FAMILY}'`)
      expect(r[0].role).toBe('family')
    })
  })

  it('update_my_name altera só o nome', async () => {
    await as(FAMILY, async (q) => {
      await q(`select update_my_name('Carla')`)
      const r = await q(`select full_name, role from profiles where id = '${FAMILY}'`)
      expect(r[0]).toEqual({ full_name: 'Carla', role: 'family' })
    })
  })
})

describe('familiar', () => {
  it('vê apenas o residente vinculado e seus dados', async () => {
    expect(await count(FAMILY, `select count(*) n from residents`)).toBe(1)
    expect(await count(FAMILY, `select count(*) n from residents where id = '${RES_B}'`)).toBe(0)
    expect(await count(FAMILY, `select count(*) n from prescriptions`)).toBe(1)
    expect(await count(FAMILY, `select count(*) n from administrations`)).toBe(1)
  })

  it('não consegue registrar dose', async () => {
    await expect(
      as(FAMILY, (q) => q(`insert into administrations (prescription_id, scheduled_for, status) values ('${RX_A}', '2026-10-28T23:00:00Z', 'given')`)),
    ).rejects.toThrow(/row-level security/)
  })

  it('desativado não vê nada', async () => {
    await db.exec('begin')
    try {
      await db.exec(`update public.profiles set active = false where id = '${FAMILY}'`)
      await db.exec(`set local role authenticated; set local request.jwt.claims = '{"sub":"${FAMILY}"}'`)
      const r = await db.query<{ n: number }>(`select count(*) n from residents`)
      expect(Number(r.rows[0].n)).toBe(0)
    } finally {
      await db.exec('rollback')
    }
  })
})

describe('enfermeiro', () => {
  it('vê todos os residentes', async () => {
    expect(await count(NURSE, `select count(*) n from residents`)).toBe(2)
  })

  it('registra dose em nome próprio', async () => {
    await as(NURSE, async (q) => {
      const r = await q(`insert into administrations (prescription_id, scheduled_for, status) values ('${RX_A}', '2026-10-28T23:00:00Z', 'given') returning recorded_by`)
      expect(r[0].recorded_by).toBe(NURSE)
    })
  })

  it('não registra dose em nome de outra pessoa', async () => {
    await expect(
      as(NURSE, (q) => q(`insert into administrations (prescription_id, scheduled_for, status, recorded_by) values ('${RX_A}', '2026-10-28T23:00:00Z', 'given', '${ADMIN}')`)),
    ).rejects.toThrow(/row-level security/)
  })

  it('não altera nem apaga registros', async () => {
    await as(NURSE, async (q) => {
      await q(`update administrations set status = 'missed', reason = 'x'`)
      await q(`delete from administrations`)
      const r = await q(`select count(*) n, count(*) filter (where status = 'given') g from administrations`)
      expect(Number(r[0].n)).toBe(2)
      expect(Number(r[0].g)).toBe(2)
    })
  })

  it('não registra a mesma dose duas vezes', async () => {
    await expect(
      as(NURSE, (q) => q(`insert into administrations (prescription_id, scheduled_for, status) values ('${RX_A}', '2026-10-28T11:00:00Z', 'given')`)),
    ).rejects.toThrow(/duplicate key/)
  })

  it('recusa sem motivo é rejeitada', async () => {
    await expect(
      as(NURSE, (q) => q(`insert into administrations (prescription_id, scheduled_for, status) values ('${RX_A}', '2026-10-28T23:00:00Z', 'refused')`)),
    ).rejects.toThrow(/check constraint/)
  })

  it('corrige um registro uma única vez e na mesma dose', async () => {
    await as(NURSE, async (q) => {
      const [orig] = await q(`select id from administrations where prescription_id = '${RX_A}'`)
      await q(`insert into administrations (prescription_id, scheduled_for, status, reason, supersedes) values ('${RX_A}', '2026-10-28T11:00:00Z', 'refused', 'Recusou', '${orig.id}')`)
      await expect(
        q(`insert into administrations (prescription_id, scheduled_for, status, supersedes) values ('${RX_A}', '2026-10-28T11:00:00Z', 'given', '${orig.id}')`),
      ).rejects.toThrow(/duplicate key/)
    })
    await expect(
      as(NURSE, async (q) => {
        const [orig] = await q(`select id from administrations where prescription_id = '${RX_A}'`)
        await q(`insert into administrations (prescription_id, scheduled_for, status, supersedes) values ('${RX_B}', '2026-10-28T11:00:00Z', 'given', '${orig.id}')`)
      }),
    ).rejects.toThrow(/mesma dose/)
  })

  it('não gerencia vínculos familiares', async () => {
    await expect(
      as(NURSE, (q) => q(`insert into family_links (family_id, resident_id) values ('${FAMILY}', '${RES_B}')`)),
    ).rejects.toThrow(/row-level security/)
  })
})

describe('admin', () => {
  it('altera papel de usuários e gerencia vínculos', async () => {
    await as(ADMIN, async (q) => {
      await q(`update profiles set role = 'nurse' where id = '${FAMILY}'`)
      await q(`insert into family_links (family_id, resident_id) values ('${FAMILY}', '${RES_B}')`)
      const r = await q(`select role from profiles where id = '${FAMILY}'`)
      expect(r[0].role).toBe('nurse')
    })
  })
})

describe('seed', () => {
  it('roda sem erros', async () => {
    await db.exec('begin')
    try {
      await db.exec(sql('seed.sql'))
      const r = await db.query<{ n: number }>(`select count(*) n from public.residents`)
      expect(Number(r.rows[0].n)).toBe(6)
    } finally {
      await db.exec('rollback')
    }
  })
})
