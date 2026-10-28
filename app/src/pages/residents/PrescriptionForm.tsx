import { Info, Plus, X } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button, Card, ErrorBox, Field, Loading, PageHead } from '../../components/ui'
import { useToast } from '../../components/toast'
import {
  endPrescription,
  fetchPrescription,
  fetchResident,
  hasAdministrations,
  ROUTES_OPTIONS,
  savePrescription,
} from '../../lib/api'
import { formatShortDate } from '../../lib/format'
import { planPrescriptionEdit } from '../../lib/rules'
import type { Prescription } from '../../lib/types'
import { todaySP } from '../../lib/schedule'
import { parseTimes, validatePrescription, type PrescriptionForm } from '../../lib/validation'

type Form = PrescriptionForm & { instructions: string }

export function PrescriptionFormPage() {
  const { id: residentId, pid } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const [residentName, setResidentName] = useState('')
  const [original, setOriginal] = useState<Prescription | null>(null)
  const [form, setForm] = useState<Form>({
    medication: '',
    dosage: '',
    route: 'Oral',
    times: ['08:00'],
    start_date: todaySP(new Date()),
    end_date: '',
    prescriber_name: '',
    prescriber_crm: '',
    instructions: '',
  })
  const [errors, setErrors] = useState<ReturnType<typeof validatePrescription>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    Promise.all([fetchResident(residentId!), pid ? fetchPrescription(pid) : null])
      .then(([r, p]) => {
        if (!r) return setError('Residente não encontrado.')
        setResidentName(r.full_name)
        setOriginal(p)
        if (p)
          setForm({
            medication: p.medication,
            dosage: p.dosage,
            route: p.route,
            times: p.times,
            start_date: p.start_date,
            end_date: p.end_date ?? '',
            prescriber_name: p.prescriber_name,
            prescriber_crm: p.prescriber_crm,
            instructions: p.instructions ?? '',
          })
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [residentId, pid])

  const set = (k: keyof Form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value })
  const setTime = (i: number, v: string) => setForm({ ...form, times: form.times.map((t, j) => (j === i ? v : t)) })

  async function submit(e: FormEvent) {
    e.preventDefault()
    const v = validatePrescription(form)
    setErrors(v)
    if (Object.keys(v).length) return
    setBusy(true)
    try {
      const data = {
        ...form,
        resident_id: residentId!,
        times: parseTimes(form.times).times,
        end_date: form.end_date || null,
        instructions: form.instructions || null,
      }
      const today = todaySP(new Date())
      const plan =
        pid && original
          ? planPrescriptionEdit(
              original,
              data,
              {
                anyRecords: await hasAdministrations(pid),
                recordsToday: await hasAdministrations(pid, today),
              },
              today,
            )
          : null

      if (plan?.mode === 'replace') {
        // Mudança clínica com histórico: encerra a antiga e cria uma nova, sem reescrever o passado
        if (data.end_date && data.end_date < plan.startNew) {
          setErrors({ end_date: `Com esta mudança, a prescrição nova começa em ${formatShortDate(plan.startNew)}` })
          setBusy(false)
          return
        }
        await endPrescription(pid!, plan.endOld, false)
        await savePrescription({ ...data, start_date: plan.startNew })
        toast(
          plan.startNew > today
            ? `Alteração salva. Vale a partir de amanhã (${formatShortDate(plan.startNew)}); hoje seguem os horários atuais.`
            : 'Alteração salva. O histórico anterior foi preservado.',
        )
      } else {
        await savePrescription({ ...data, id: pid })
        toast(pid ? 'Prescrição atualizada' : 'Prescrição cadastrada')
      }
      navigate(`/residentes/${residentId}`, { replace: true })
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  if (loading) return <Loading />

  return (
    <div className="stack-lg" style={{ maxWidth: 680 }}>
      <PageHead title={pid ? 'Editar prescrição' : 'Nova prescrição'} sub={residentName} />
      {error && <ErrorBox message={error} />}
      {pid && (
        <div className="alert alert-info row" style={{ alignItems: 'flex-start' }}>
          <Info size={20} style={{ flex: 'none', marginTop: 2 }} aria-hidden />
          <span className="small">
            Se você mudar o medicamento, a dose, a via ou os horários, o sistema encerra esta prescrição e cria uma nova,
            para o histórico continuar mostrando exatamente o que foi aplicado em cada dia.
          </span>
        </div>
      )}
      <Card>
        <form className="form-grid" onSubmit={submit} noValidate>
          <Field label="Medicamento" error={errors.medication}>
            <input className="input" value={form.medication} onChange={set('medication')} placeholder="Ex.: Losartana" />
          </Field>
          <div className="form-grid two">
            <Field label="Dose" error={errors.dosage}>
              <input className="input" value={form.dosage} onChange={set('dosage')} placeholder="Ex.: 50 mg, 10 gotas" />
            </Field>
            <Field label="Via" error={errors.route}>
              <select className="select" value={form.route} onChange={set('route')}>
                {ROUTES_OPTIONS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </Field>
          </div>

          <div className="field">
            <span className="field-label">Horários (todos os dias)</span>
            <div className="stack" style={{ gap: 8 }}>
              {form.times.map((t, i) => (
                <div key={i} className="row">
                  <input
                    className="input"
                    type="time"
                    value={t}
                    aria-label={`Horário ${i + 1}`}
                    onChange={(e) => setTime(i, e.target.value)}
                    style={{ maxWidth: 180 }}
                  />
                  {form.times.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      className="icon-btn"
                      aria-label={`Remover horário ${t}`}
                      onClick={() => setForm({ ...form, times: form.times.filter((_, j) => j !== i) })}
                    >
                      <X size={20} aria-hidden />
                    </Button>
                  )}
                </div>
              ))}
            </div>
            <div>
              <Button type="button" variant="ghost" small onClick={() => setForm({ ...form, times: [...form.times, ''] })}>
                <Plus size={18} aria-hidden /> Adicionar horário
              </Button>
            </div>
            {errors.times && <span className="field-error">{errors.times}</span>}
          </div>

          <div className="form-grid two">
            <Field label="Início" error={errors.start_date}>
              <input className="input" type="date" value={form.start_date} onChange={set('start_date')} />
            </Field>
            <Field label="Fim (opcional)" hint="Em branco = uso contínuo" error={errors.end_date}>
              <input className="input" type="date" value={form.end_date} min={form.start_date} onChange={set('end_date')} />
            </Field>
          </div>
          <div className="form-grid two">
            <Field label="Médico responsável" error={errors.prescriber_name}>
              <input className="input" value={form.prescriber_name} onChange={set('prescriber_name')} placeholder="Ex.: Dra. Ana Ribeiro" />
            </Field>
            <Field label="CRM" error={errors.prescriber_crm}>
              <input className="input" value={form.prescriber_crm} onChange={set('prescriber_crm')} placeholder="Ex.: CRM-SP 123456" />
            </Field>
          </div>
          <Field label="Instruções (opcional)">
            <textarea className="textarea" value={form.instructions} onChange={set('instructions')} placeholder="Ex.: tomar após as refeições" />
          </Field>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <Link to={`/residentes/${residentId}`} className="btn btn-secondary">
              Cancelar
            </Link>
            <Button type="submit" loading={busy}>
              Salvar prescrição
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
