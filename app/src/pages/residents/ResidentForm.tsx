import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button, Card, ErrorBox, Field, Loading, PageHead } from '../../components/ui'
import { useToast } from '../../components/toast'
import { fetchResident, saveResident } from '../../lib/api'
import { todaySP } from '../../lib/schedule'

const empty = { full_name: '', birth_date: '', room: '', allergies: '', notes: '' }

export function ResidentFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const [form, setForm] = useState(empty)
  const [loading, setLoading] = useState(!!id)
  const [error, setError] = useState<string | null>(null)
  const [nameError, setNameError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!id) return
    fetchResident(id)
      .then((r) => {
        if (!r) return setError('Residente não encontrado.')
        setForm({
          full_name: r.full_name,
          birth_date: r.birth_date ?? '',
          room: r.room ?? '',
          allergies: r.allergies ?? '',
          notes: r.notes ?? '',
        })
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  const set = (k: keyof typeof empty) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value })

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!form.full_name.trim()) return setNameError('Informe o nome')
    setBusy(true)
    try {
      const saved = await saveResident({ ...form, id })
      toast(id ? 'Dados atualizados' : 'Residente cadastrado')
      navigate(`/residentes/${saved.id}`, { replace: true })
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  if (loading) return <Loading />

  return (
    <div className="stack-lg" style={{ maxWidth: 680 }}>
      <PageHead title={id ? 'Editar residente' : 'Novo residente'} />
      {error && <ErrorBox message={error} />}
      <Card>
        <form className="form-grid" onSubmit={submit}>
          <Field label="Nome completo" error={nameError}>
            <input className="input" value={form.full_name} onChange={set('full_name')} autoFocus={!id} />
          </Field>
          <div className="form-grid two">
            <Field label="Data de nascimento">
              <input className="input" type="date" max={todaySP(new Date())} value={form.birth_date} onChange={set('birth_date')} />
            </Field>
            <Field label="Quarto">
              <input className="input" value={form.room} onChange={set('room')} />
            </Field>
          </div>
          <Field label="Alergias" hint="Deixe em branco se não houver. Aparece em destaque para a equipe.">
            <input className="input" value={form.allergies} onChange={set('allergies')} placeholder="Ex.: Dipirona, penicilina" />
          </Field>
          <Field label="Observações">
            <textarea className="textarea" value={form.notes} onChange={set('notes')} placeholder="Condições de saúde, cuidados, preferências" />
          </Field>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <Link to={id ? `/residentes/${id}` : '/residentes'} className="btn btn-secondary">
              Cancelar
            </Link>
            <Button type="submit" loading={busy}>
              Salvar
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
