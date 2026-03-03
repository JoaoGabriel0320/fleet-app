'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CalendarPlus, Calendar, XCircle, Clock, Car } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import type { Schedule } from '@/types'
import { format, isPast } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  pending:   { label: 'Pendente',   className: 'bg-amber-100 text-amber-700' },
  confirmed: { label: 'Agendado', className: 'bg-blue-100 text-blue-700' },
  cancelled: { label: 'Cancelado',  className: 'bg-red-100 text-red-700' },
  completed: { label: 'Concluído',  className: 'bg-green-100 text-green-700' },
}

export default function SchedulesPage() {
  const { collaborator } = useAuth()
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)
  const [cancelling, setCancelling] = useState<string | null>(null)

  async function load() {
    if (!collaborator) return
    const { data } = await supabase
      .from('schedules')
      .select('*, vehicle:vehicles(plate,brand,model,year), origin_branch:branches!schedules_origin_branch_id_fkey(name,city), destination_branch:branches!schedules_destination_branch_id_fkey(name,city)')
      .eq('collaborator_id', collaborator.id)
      .order('scheduled_departure', { ascending: true })
    setSchedules(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [collaborator])

  async function cancel(id: string) {
    setCancelling(id)
    await supabase.from('schedules').update({ status: 'cancelled' }).eq('id', id)
    await load()
    setCancelling(null)
  }

  if (loading) return <div className="flex justify-center mt-16"><div className="w-8 h-8 border-4 border-blue-700 border-t-transparent rounded-full animate-spin" /></div>

  const upcoming = schedules.filter(s => s.status === 'pending' || s.status === 'confirmed')
  const past = schedules.filter(s => s.status === 'cancelled' || s.status === 'completed' || (s.status === 'pending' && isPast(new Date(s.scheduled_departure))))

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-blue-700" />
          <h1 className="text-xl font-bold text-slate-800">Meus Agendamentos</h1>
        </div>
        <Link href="/schedule" className="flex items-center gap-1.5 bg-blue-700 text-white text-sm font-semibold px-3 py-2 rounded-xl hover:bg-blue-800 transition-colors">
          <CalendarPlus className="w-4 h-4" />
          Novo
        </Link>
      </div>

      {schedules.length === 0 && (
        <div className="text-center py-12 text-slate-400">
          <Calendar className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="font-medium">Nenhum agendamento</p>
          <p className="text-sm mt-1">Agende um veículo com antecedência</p>
          <Link href="/schedule" className="inline-flex items-center gap-1.5 mt-4 bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-xl">
            <CalendarPlus className="w-4 h-4" /> Agendar agora
          </Link>
        </div>
      )}

      {upcoming.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Próximos</h2>
          {upcoming.map(s => (
            <ScheduleCard key={s.id} schedule={s} onCancel={cancel} cancelling={cancelling} />
          ))}
        </section>
      )}

      {past.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Histórico</h2>
          {past.map(s => (
            <ScheduleCard key={s.id} schedule={s} onCancel={cancel} cancelling={cancelling} readonly />
          ))}
        </section>
      )}
    </div>
  )
}

function ScheduleCard({
  schedule: s,
  onCancel,
  cancelling,
  readonly = false,
}: {
  schedule: Schedule
  onCancel: (id: string) => void
  cancelling: string | null
  readonly?: boolean
}) {
  const vehicle = s.vehicle as any
  const originBranch = s.origin_branch as any
  const destBranch = s.destination_branch as any
  const { label, className } = STATUS_MAP[s.status] ?? { label: s.status, className: 'bg-slate-100 text-slate-600' }
  // Mostrar "Retirar agora" quando faltam até 30 min ou já passou a hora de saída
  const canCheckout = s.status === 'confirmed' &&
    new Date(s.scheduled_departure) <= new Date(Date.now() + 30 * 60 * 1000)

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-slate-800">
            {vehicle?.plate} — {vehicle?.brand} {vehicle?.model}
          </p>
          {(originBranch || destBranch) && (
            <p className="text-sm text-slate-500">
              {originBranch?.name ?? '—'} → {destBranch?.name ?? s.destination_description ?? '—'}
            </p>
          )}
          {s.destination_description && !destBranch && (
            <p className="text-sm text-slate-500">{s.destination_description}</p>
          )}
        </div>
        <span className={`text-xs px-2 py-1 rounded-full font-medium shrink-0 ${className}`}>{label}</span>
      </div>

      <div className="flex items-center gap-1 text-xs text-slate-500">
        <Clock className="w-3.5 h-3.5" />
        <span>
          {format(new Date(s.scheduled_departure), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
          {s.estimated_return && (
            <> → {format(new Date(s.estimated_return), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</>
          )}
        </span>
      </div>

      {s.notes && <p className="text-xs text-slate-400 italic">"{s.notes}"</p>}

      {!readonly && (s.status === 'pending' || s.status === 'confirmed') && (
        <div className="flex items-center gap-2 flex-wrap">
          {canCheckout && (
            <Link
              href={`/checkout?schedule_id=${s.id}`}
              className="flex items-center gap-1.5 text-xs bg-green-600 text-white hover:bg-green-700 font-medium px-3 py-1.5 rounded-lg transition-colors"
            >
              <Car className="w-3.5 h-3.5" />
              Retirar agora
            </Link>
          )}
          <button
            onClick={() => onCancel(s.id)}
            disabled={cancelling === s.id}
            className="flex items-center gap-1 text-xs text-red-600 hover:text-red-700 font-medium disabled:opacity-50"
          >
            <XCircle className="w-3.5 h-3.5" />
            {cancelling === s.id ? 'Cancelando...' : 'Cancelar'}
          </button>
        </div>
      )}
    </div>
  )
}
