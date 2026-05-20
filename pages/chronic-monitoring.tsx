import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  collection, getDocs, query, where,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { DataService, ComplianceReport, FeederPoint, Zone, Ward, Kothi, ShiftReport } from '@/lib/dataService'
import {
  AlertTriangle, Calendar, CheckCircle, ChevronDown, Clock,
  Download, FileSpreadsheet, Filter, MapPin, Phone,
  RefreshCw, User, X, XCircle, Zap,
} from 'lucide-react'
import * as XLSX from 'xlsx'

// ─── Types ────────────────────────────────────────────────────────────────────
type TabType = 'inspections' | 'shifts'
type DateFilterType = 'today' | 'yesterday' | 'this_week' | 'this_month' | 'custom'

// ─── Date helpers ─────────────────────────────────────────────────────────────
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0)
}
function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
}
function isoDate(d: Date): string {
  return d.toISOString().split('T')[0]
}
function getRange(filter: DateFilterType, custom?: { start: Date; end: Date }): { start: Date; end: Date } {
  const now = new Date()
  switch (filter) {
    case 'today': return { start: startOfDay(now), end: endOfDay(now) }
    case 'yesterday': {
      const y = new Date(now); y.setDate(y.getDate() - 1)
      return { start: startOfDay(y), end: endOfDay(y) }
    }
    case 'this_week': {
      const mon = new Date(now)
      mon.setDate(now.getDate() - ((now.getDay() + 6) % 7))
      return { start: startOfDay(mon), end: endOfDay(now) }
    }
    case 'this_month': {
      const first = new Date(now.getFullYear(), now.getMonth(), 1)
      return { start: startOfDay(first), end: endOfDay(now) }
    }
    case 'custom':
      if (custom) return { start: startOfDay(custom.start), end: endOfDay(custom.end) }
      return { start: startOfDay(now), end: endOfDay(now) }
  }
}
function toJsDate(val: any): Date | null {
  if (!val) return null
  if (val instanceof Date) return val
  if (typeof val?.toDate === 'function') return val.toDate()
  const d = new Date(val)
  return isNaN(d.getTime()) ? null : d
}
function dateInRange(raw: any, range: { start: Date; end: Date }): boolean {
  if (!raw) return false
  if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw))
    return raw >= isoDate(range.start) && raw <= isoDate(range.end)
  const d = toJsDate(raw)
  if (!d) return false
  return d >= range.start && d <= range.end
}
function fmtDisplay(d: Date) {
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}
function fmtShort(d: Date) {
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

// ─── Mini Calendar ────────────────────────────────────────────────────────────
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const DAYS = ['Su','Mo','Tu','We','Th','Fr','Sa']

function MiniCalendar({ value, onChange, maxDate }: { value: Date; onChange: (d: Date) => void; maxDate?: Date }) {
  const [view, setView] = useState(new Date(value.getFullYear(), value.getMonth(), 1))
  const yr = view.getFullYear(), mo = view.getMonth()
  const firstDow = new Date(yr, mo, 1).getDay()
  const dim = new Date(yr, mo + 1, 0).getDate()
  const today = new Date()
  const cells = [...Array(firstDow).fill(null), ...Array.from({ length: dim }, (_, i) => i + 1)]

  return (
    <div className="bg-white rounded-xl border border-orange-100 p-3">
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => setView(new Date(yr, mo - 1, 1))} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-orange-50 text-slate-600 font-bold">‹</button>
        <span className="text-sm font-bold text-slate-800">{MONTHS[mo]} {yr}</span>
        <button onClick={() => setView(new Date(yr, mo + 1, 1))} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-orange-50 text-slate-600 font-bold">›</button>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {DAYS.map(d => <div key={d} className="text-center text-[10px] font-bold text-slate-400 py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((day, i) => {
          if (!day) return <div key={`e${i}`} />
          const date = new Date(yr, mo, day)
          const sel = value.getDate() === day && value.getMonth() === mo && value.getFullYear() === yr
          const isToday = today.getDate() === day && today.getMonth() === mo && today.getFullYear() === yr
          const disabled = maxDate ? date > maxDate : false
          return (
            <button key={day} disabled={disabled}
              onClick={() => !disabled && onChange(date)}
              className={`h-8 w-full rounded-lg text-xs font-medium transition-all
                ${sel ? 'bg-orange-500 text-white font-bold' :
                  isToday ? 'bg-orange-50 text-orange-600' :
                  disabled ? 'text-slate-200 cursor-not-allowed' :
                  'text-slate-700 hover:bg-orange-50'}`}>
              {day}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Custom Range Modal ───────────────────────────────────────────────────────
function CustomRangeModal({ visible, onClose, onApply, initial }: {
  visible: boolean; onClose: () => void;
  onApply: (s: Date, e: Date) => void;
  initial?: { start: Date; end: Date }
}) {
  const today = new Date()
  const [start, setStart] = useState(initial?.start ?? startOfDay(today))
  const [end, setEnd] = useState(initial?.end ?? endOfDay(today))
  const [picking, setPicking] = useState<'start' | 'end'>('start')

  if (!visible) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-slate-50 rounded-t-2xl sm:rounded-2xl p-5 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-slate-800">Custom Date Range</h3>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-200 text-slate-500"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex gap-2 mb-4">
          {(['start','end'] as const).map(p => (
            <button key={p} onClick={() => setPicking(p)}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold border transition-all
                ${picking === p ? 'bg-orange-50 border-orange-300 text-orange-700' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}>
              {p === 'start' ? `From: ${fmtDisplay(start)}` : `To: ${fmtDisplay(end)}`}
            </button>
          ))}
        </div>
        {picking === 'start'
          ? <MiniCalendar value={start} maxDate={end} onChange={d => { setStart(d); setPicking('end') }} />
          : <MiniCalendar value={end} maxDate={today} onChange={d => setEnd(d)} />}
        <button
          disabled={start > end}
          onClick={() => { if (start <= end) { onApply(start, end); onClose() } }}
          className="mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-sm transition-all disabled:opacity-40">
          <Calendar className="w-4 h-4" /> Apply Range
        </button>
      </div>
    </div>
  )
}

// ─── Filter Modal ──────────────────────────────────────────────────────────────
function FilterModal({ visible, onClose, zones, wards, kothis, chronicPoints,
  selectedZone, selectedWard, selectedKothi, selectedPoint, onApply
}: {
  visible: boolean; onClose: () => void
  zones: Zone[]; wards: Ward[]; kothis: Kothi[]; chronicPoints: FeederPoint[]
  selectedZone: string; selectedWard: string; selectedKothi: string; selectedPoint: string
  onApply: (z: string, w: string, k: string, p: string) => void
}) {
  const [zone, setZone] = useState(selectedZone)
  const [ward, setWard] = useState(selectedWard)
  const [kothi, setKothi] = useState(selectedKothi)
  const [point, setPoint] = useState(selectedPoint)

  useEffect(() => {
    if (visible) { setZone(selectedZone); setWard(selectedWard); setKothi(selectedKothi); setPoint(selectedPoint) }
  }, [visible])

  if (!visible) return null
  const filteredWards = wards.filter(w => !zone || w.zoneId === zone)
  const filteredKothis = kothis.filter(k => !ward || k.wardId === ward)
  const filteredPoints = chronicPoints.filter(p => {
    if (kothi) return (p as any).kothiId === kothi
    if (ward) return (p as any).wardId === ward
    if (zone) return (p as any).zoneId === zone
    return true
  })
  const activeCount = [zone, ward, kothi, point].filter(Boolean).length

  const sections = [
    { label: 'Zone', items: zones, sel: zone, onAll: () => { setZone(''); setWard(''); setKothi(''); setPoint('') }, onSel: (id: string) => { setZone(id); setWard(''); setKothi(''); setPoint('') } },
    { label: 'Ward', items: filteredWards, sel: ward, onAll: () => { setWard(''); setKothi(''); setPoint('') }, onSel: (id: string) => { setWard(id); setKothi(''); setPoint('') } },
    { label: 'Kothi', items: filteredKothis, sel: kothi, onAll: () => { setKothi(''); setPoint('') }, onSel: (id: string) => { setKothi(id); setPoint('') } },
    { label: 'Chronic Point', items: filteredPoints, sel: point, onAll: () => setPoint(''), onSel: (id: string) => setPoint(id) },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-slate-50 rounded-t-2xl sm:rounded-2xl p-5 w-full max-w-md shadow-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4 flex-shrink-0">
          <h3 className="text-base font-bold text-slate-800 flex-1">Filter Data</h3>
          {activeCount > 0 && (
            <button onClick={() => { setZone(''); setWard(''); setKothi(''); setPoint('') }} className="text-xs font-bold text-red-500 hover:underline">Clear all</button>
          )}
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-200 text-slate-500"><X className="w-4 h-4" /></button>
        </div>
        <div className="overflow-y-auto flex-1 space-y-4 pr-1">
          {sections.map(({ label, items, sel, onAll, onSel }) => (
            <div key={label}>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{label}</p>
              <div className="flex flex-wrap gap-2">
                <button onClick={onAll} className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all
                  ${!sel ? 'bg-orange-50 border-orange-300 text-orange-700' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}>All</button>
                {(items as any[]).map((item: any) => (
                  <button key={item.id} onClick={() => onSel(item.id)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all
                      ${sel === item.id ? 'bg-orange-50 border-orange-300 text-orange-700' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                    {item.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <button onClick={() => { onApply(zone, ward, kothi, point); onClose() }}
          className="mt-4 flex-shrink-0 w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-sm transition-all">
          <Filter className="w-4 h-4" /> Apply{activeCount > 0 ? ` (${activeCount})` : ''}
        </button>
      </div>
    </div>
  )
}

// ─── Excel Export ─────────────────────────────────────────────────────────────
function exportInspectionsToExcel(inspections: ComplianceReport[], label: string) {
  const rows = inspections.map((r, i) => {
    const getAns = (qId: string) => r.answers?.find(a => a.questionId === qId)?.answer ?? '—'
    return {
      '#': i + 1,
      'Date': r.tripDate ?? '',
      'Feeder Point': r.feederPointName ?? '—',
      'Member': r.userName ?? '—',
      'Citizen Name': getAns('citizen_name'),
      'Phone': getAns('phone_number'),
      'Address': getAns('address'),
      'Feedback': getAns('feedback') !== '—' ? getAns('feedback') : getAns('remarks'),
      'Status': r.status ?? '—',
      'Trip #': r.tripNumber ?? '—',
    }
  })
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Inspections')
  XLSX.writeFile(wb, `chronic-inspections-${label}.xlsx`)
}

function exportShiftsToExcel(shifts: ShiftReport[], label: string) {
  const rows = shifts.flatMap((s, i) => {
    const slots = Array.isArray(s.slots) ? s.slots : []
    const total = slots.length || 8
    const done = slots.filter(sl => sl.status === 'completed').length
    const late = slots.filter(sl => sl.status === 'late').length
    const missed = slots.filter(sl => sl.status === 'missed').length
    const pct = Math.round(((done + late) / total) * 100)
    return [{
      '#': i + 1,
      'Date': s.shiftDate ?? '',
      'Feeder Point': s.feederPointName ?? '—',
      'Shift Type': s.shiftType ?? '—',
      'Member': s.userName ?? '—',
      'Total Slots': total,
      'Completed': done,
      'Late': late,
      'Missed': missed,
      'Completion %': `${pct}%`,
      'Punched Out': (s as any).isPunchedOut ? 'Yes' : 'No',
      'Status': s.status ?? '—',
    }]
  })
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Shifts')
  XLSX.writeFile(wb, `chronic-shifts-${label}.xlsx`)
}

// ─── Summary Cards ────────────────────────────────────────────────────────────
function StatCard({ value, label, color, icon }: { value: string | number; label: string; color: string; icon: React.ReactNode }) {
  return (
    <div className={`flex-1 min-w-[80px] bg-white rounded-xl border border-slate-100 px-3 py-3 shadow-sm flex flex-col items-center gap-1 relative overflow-hidden`}>
      <div className={`absolute top-0 left-0 right-0 h-0.5 ${color}`} />
      <div className="text-slate-400">{icon}</div>
      <div className={`text-xl font-black leading-none tracking-tight`} style={{ color: 'var(--stat-color)' }}>{value}</div>
      <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</div>
      <style>{`:root { --stat-color: inherit }`}</style>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ChronicMonitoringPage() {
  const [zones, setZones] = useState<Zone[]>([])
  const [wards, setWards] = useState<Ward[]>([])
  const [kothis, setKothis] = useState<Kothi[]>([])
  const [chronicPoints, setChronicPoints] = useState<FeederPoint[]>([])
  const [metaLoading, setMetaLoading] = useState(true)

  const [allInspections, setAllInspections] = useState<ComplianceReport[]>([])
  const [allShifts, setAllShifts] = useState<ShiftReport[]>([])
  const [dataLoading, setDataLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const [activeTab, setActiveTab] = useState<TabType>('inspections')
  const [dateFilter, setDateFilter] = useState<DateFilterType>('today')
  const [customRange, setCustomRange] = useState<{ start: Date; end: Date } | undefined>()
  const [showCustom, setShowCustom] = useState(false)
  const [showFilter, setShowFilter] = useState(false)

  const [selZone, setSelZone] = useState('')
  const [selWard, setSelWard] = useState('')
  const [selKothi, setSelKothi] = useState('')
  const [selPoint, setSelPoint] = useState('')

  // Sort / search
  const [searchQuery, setSearchQuery] = useState('')
  const [sortField, setSortField] = useState<string>('')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const isMounted = useRef(true)
  useEffect(() => { isMounted.current = true; return () => { isMounted.current = false } }, [])

  // ── Load meta, then immediately trigger data load with the loaded chronic points ──
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [z, w, k, cp] = await Promise.all([
          DataService.onZonesChange ? new Promise<Zone[]>(res => { const u = DataService.onZonesChange(d => { res(d); u() }) }) : Promise.resolve([] as Zone[]),
          DataService.onWardsChange ? new Promise<Ward[]>(res => { const u = DataService.onWardsChange(d => { res(d); u() }) }) : Promise.resolve([] as Ward[]),
          DataService.onKothisChange ? new Promise<Kothi[]>(res => { const u = DataService.onKothisChange(d => { res(d); u() }) }) : Promise.resolve([] as Kothi[]),
          DataService.getChronicPoints(),
        ])
        if (!mounted) return
        const points = (cp ?? []) as FeederPoint[]
        setZones(z ?? [])
        setWards(w ?? [])
        setKothis(k ?? [])
        setChronicPoints(points)
        setMetaLoading(false)
        // Immediately load data with the freshly-loaded chronic points — no stale closure
        await loadDataWithPoints(points, getRange('today'))
      } catch (e) {
        console.error('Meta load error:', e)
        if (mounted) setMetaLoading(false)
      }
    })()
    return () => { mounted = false }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Core fetch — receives cpPoints explicitly to avoid stale-closure issues ──
  const loadDataWithPoints = useCallback(async (
    cpPoints: FeederPoint[],
    range: { start: Date; end: Date }
  ) => {
    try {
      setDataLoading(true)

      // Build the chronic-point ID set from the argument, NOT from state
      const cpIds = new Set(cpPoints.map(p => p.id))

      const startStr = isoDate(range.start)
      const endStr   = isoDate(range.end)

      // ── Inspections ──
      let inspDocs: any[] = []
      try {
        const snap = await getDocs(query(
          collection(db, 'complianceReports'),
          where('feederPointType', '==', 'chronic'),
          where('tripDate', '>=', startStr),
          where('tripDate', '<=', endStr)
        ))
        inspDocs = snap.docs
      } catch {
        // Composite index missing — fallback: fetch chronic only, filter dates client-side
        const snap = await getDocs(query(
          collection(db, 'complianceReports'),
          where('feederPointType', '==', 'chronic')
        ))
        inspDocs = snap.docs.filter(d => {
          const td = d.data().tripDate
          return typeof td === 'string' ? td >= startStr && td <= endStr : dateInRange(d.data().submittedAt, range)
        })
      }

      // Always enforce strict date filter client-side as a safety net
      const inspections: ComplianceReport[] = inspDocs
        .map(d => ({ id: d.id, ...(d.data() as any) } as ComplianceReport))
        .filter(r => {
          // Date guard — tripDate is YYYY-MM-DD string
          const td = r.tripDate
          const inRange = typeof td === 'string'
            ? td >= startStr && td <= endStr
            : dateInRange((r as any).submittedAt, range)
          if (!inRange) return false
          // Chronic-point guard — only show if cpIds is populated
          if (cpIds.size > 0 && !cpIds.has(r.feederPointId)) return false
          return true
        })

      // ── Shifts ──
      const shiftSnap = await getDocs(query(
        collection(db, 'shiftReports'),
        where('shiftDate', '>=', startStr),
        where('shiftDate', '<=', endStr)
      ))
      const shifts: ShiftReport[] = shiftSnap.docs
        .map(d => ({ id: d.id, ...(d.data() as any) } as ShiftReport))
        .filter(s => {
          const sd = s.shiftDate
          const inRange = typeof sd === 'string' ? sd >= startStr && sd <= endStr : false
          if (!inRange) return false
          if (cpIds.size > 0 && !cpIds.has(s.feederPointId)) return false
          return true
        })

      if (!isMounted.current) return
      setAllInspections(inspections)
      setAllShifts(shifts)
    } catch (e) {
      console.error('Data load error:', e)
    } finally {
      if (isMounted.current) { setDataLoading(false); setRefreshing(false) }
    }
  }, [])

  // ── Re-fetch whenever date filter changes (after meta is ready) ──
  useEffect(() => {
    if (metaLoading) return
    loadDataWithPoints(chronicPoints, getRange(dateFilter, customRange))
  }, [dateFilter, customRange]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleRefresh = useCallback(() => {
    setRefreshing(true)
    loadDataWithPoints(chronicPoints, getRange(dateFilter, customRange))
  }, [dateFilter, customRange, chronicPoints, loadDataWithPoints])

  const visiblePointIds = useMemo<Set<string>>(() => {
    if (!selZone && !selWard && !selKothi && !selPoint)
      return new Set(chronicPoints.map(p => p.id))
    return new Set(
      chronicPoints.filter(p => {
        const pp = p as any
        if (selPoint && p.id !== selPoint) return false
        if (selKothi && pp.kothiId !== selKothi) return false
        if (selWard && pp.wardId !== selWard) return false
        if (selZone && pp.zoneId !== selZone) return false
        return true
      }).map(p => p.id)
    )
  }, [chronicPoints, selZone, selWard, selKothi, selPoint])

  const range = useMemo(() => getRange(dateFilter, customRange), [dateFilter, customRange])

  const filteredInspections = useMemo<ComplianceReport[]>(() => {
    // Use strict ISO string comparison — prevents cross-day bleed
    const startStr = isoDate(range.start)
    const endStr   = isoDate(range.end)
    let data = allInspections.filter(r => {
      if (!visiblePointIds.has(r.feederPointId)) return false
      const td = r.tripDate
      if (typeof td === 'string') return td >= startStr && td <= endStr
      // fallback for non-string tripDate
      return dateInRange((r as any).submittedAt, range)
    })
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      data = data.filter(r =>
        (r.feederPointName ?? '').toLowerCase().includes(q) ||
        (r.userName ?? '').toLowerCase().includes(q) ||
        (r.tripDate ?? '').includes(q)
      )
    }
    return data
  }, [allInspections, visiblePointIds, range, searchQuery])

  const filteredShifts = useMemo<ShiftReport[]>(() => {
    const startStr = isoDate(range.start)
    const endStr   = isoDate(range.end)
    let data = allShifts.filter(s => {
      if (!visiblePointIds.has(s.feederPointId)) return false
      const sd = s.shiftDate
      return typeof sd === 'string' ? sd >= startStr && sd <= endStr : false
    })
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      data = data.filter(s =>
        (s.feederPointName ?? '').toLowerCase().includes(q) ||
        (s.userName ?? '').toLowerCase().includes(q) ||
        (s.shiftDate ?? '').includes(q)
      )
    }
    return data
  }, [allShifts, visiblePointIds, range, searchQuery])

  const activeFilterCount = [selZone, selWard, selKothi, selPoint].filter(Boolean).length
  const isLoading = metaLoading || dataLoading

  // ── Shift stats ──
  const shiftStats = useMemo(() => {
    const allSlots = filteredShifts.flatMap(s => Array.isArray(s.slots) ? s.slots : [])
    const total = allSlots.length
    const done = allSlots.filter(sl => sl.status === 'completed').length
    const late = allSlots.filter(sl => sl.status === 'late').length
    const missed = allSlots.filter(sl => sl.status === 'missed').length
    const pct = total > 0 ? Math.round(((done + late) / total) * 100) : 0
    return { total, done, late, missed, pct }
  }, [filteredShifts])

  // ── Export label ──
  const exportLabel = useMemo(() => {
    if (dateFilter === 'custom' && customRange)
      return `${isoDate(customRange.start)}_${isoDate(customRange.end)}`
    return `${dateFilter}_${isoDate(new Date())}`
  }, [dateFilter, customRange])

  // ── Date filter pills ──
  const DATE_FILTERS: { key: DateFilterType; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'yesterday', label: 'Yesterday' },
    { key: 'this_week', label: 'This Week' },
    { key: 'this_month', label: 'This Month' },
    { key: 'custom', label: 'Custom' },
  ]

  return (
    <div className="min-h-full">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center shadow-md shadow-orange-200">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-black text-slate-900 leading-none">Chronic Monitoring</h1>
            <p className="text-xs text-slate-400 mt-0.5 font-medium">Inspections & Shift Reports</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Refresh */}
          <button onClick={handleRefresh} disabled={refreshing || isLoading}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 text-xs font-semibold hover:border-slate-300 hover:bg-slate-50 transition-all disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
          </button>
          {/* Filter */}
          <button onClick={() => setShowFilter(true)}
            className={`relative flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold transition-all
              ${activeFilterCount > 0
                ? 'bg-orange-50 border-orange-300 text-orange-700'
                : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'}`}>
            <Filter className="w-3.5 h-3.5" /> Filter
            {activeFilterCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-orange-500 text-white text-[9px] font-black flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>
          {/* Export */}
          <div className="relative group">
            <button className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold transition-all shadow-sm shadow-emerald-200">
              <FileSpreadsheet className="w-3.5 h-3.5" /> Export Excel <ChevronDown className="w-3 h-3" />
            </button>
            <div className="absolute right-0 top-full mt-1.5 w-52 bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-all z-30">
              <button onClick={() => exportInspectionsToExcel(filteredInspections, exportLabel)}
                className="w-full flex items-center gap-3 px-4 py-3 text-xs font-semibold text-slate-700 hover:bg-emerald-50 transition-all text-left">
                <Download className="w-3.5 h-3.5 text-emerald-500" /> Export Inspections
              </button>
              <div className="h-px bg-slate-100" />
              <button onClick={() => exportShiftsToExcel(filteredShifts, exportLabel)}
                className="w-full flex items-center gap-3 px-4 py-3 text-xs font-semibold text-slate-700 hover:bg-emerald-50 transition-all text-left">
                <Download className="w-3.5 h-3.5 text-emerald-500" /> Export Shifts
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Active Filter Chips ── */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {selZone && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-orange-50 border border-orange-200 text-xs font-bold text-orange-700">
              {zones.find(z => z.id === selZone)?.name ?? selZone}
              <button onClick={() => { setSelZone(''); setSelWard(''); setSelKothi(''); setSelPoint('') }}><X className="w-3 h-3" /></button>
            </span>
          )}
          {selWard && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-orange-50 border border-orange-200 text-xs font-bold text-orange-700">
              {wards.find(w => w.id === selWard)?.name ?? selWard}
              <button onClick={() => { setSelWard(''); setSelKothi(''); setSelPoint('') }}><X className="w-3 h-3" /></button>
            </span>
          )}
          {selKothi && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-orange-50 border border-orange-200 text-xs font-bold text-orange-700">
              {kothis.find(k => k.id === selKothi)?.name ?? selKothi}
              <button onClick={() => { setSelKothi(''); setSelPoint('') }}><X className="w-3 h-3" /></button>
            </span>
          )}
          {selPoint && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-orange-50 border border-orange-200 text-xs font-bold text-orange-700">
              {chronicPoints.find(p => p.id === selPoint)?.name ?? selPoint}
              <button onClick={() => setSelPoint('')}><X className="w-3 h-3" /></button>
            </span>
          )}
          <button onClick={() => { setSelZone(''); setSelWard(''); setSelKothi(''); setSelPoint('') }}
            className="text-xs font-bold text-red-500 hover:underline px-1">Clear all</button>
        </div>
      )}

      {/* ── Controls Bar ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 mb-4">
        {/* Date Filters */}
        <div className="flex flex-wrap gap-2 mb-3">
          {DATE_FILTERS.map(f => {
            const isActive = dateFilter === f.key
            const isCustom = f.key === 'custom'
            let lbl = f.label
            if (isCustom && customRange && isActive)
              lbl = `${fmtShort(customRange.start)} – ${fmtShort(customRange.end)}`
            return (
              <button key={f.key}
                onClick={() => isCustom ? setShowCustom(true) : setDateFilter(f.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all
                  ${isActive ? 'bg-orange-500 text-white border-orange-500 shadow-sm' : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300'}`}>
                {isCustom && <Calendar className="w-3 h-3" />}
                {lbl}
                {isCustom && <ChevronDown className="w-3 h-3" />}
              </button>
            )
          })}
        </div>
        {/* Search */}
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search by point name, member, date..."
            className="w-full pl-8 pr-4 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-100 transition-all" />
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-2 mb-4">
        {([
          { key: 'inspections', label: 'Inspections', count: filteredInspections.length },
          { key: 'shifts', label: 'Shift Reports', count: filteredShifts.length },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border transition-all
              ${activeTab === t.key
                ? 'bg-orange-500 text-white border-orange-500 shadow-md shadow-orange-200'
                : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-700'}`}>
            {t.label}
            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full
              ${activeTab === t.key ? 'bg-orange-400 text-white' : 'bg-slate-100 text-slate-500'}`}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* ── Summary Cards ── */}
      {!isLoading && (
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          {activeTab === 'inspections' ? (
            <>
              <StatCard value={visiblePointIds.size} label="Points" color="bg-orange-400" icon={<Zap className="w-4 h-4" />} />
              <StatCard value={filteredInspections.length} label="Inspections" color="bg-blue-400" icon={<AlertTriangle className="w-4 h-4" />} />
              <StatCard value={[...new Set(filteredInspections.map(r => r.feederPointId))].length} label="Unique Points" color="bg-violet-400" icon={<MapPin className="w-4 h-4" />} />
              <StatCard value={[...new Set(filteredInspections.map(r => r.userId))].length} label="Members" color="bg-teal-400" icon={<User className="w-4 h-4" />} />
            </>
          ) : (
            <>
              <StatCard value={filteredShifts.length} label="Shifts" color="bg-orange-400" icon={<Clock className="w-4 h-4" />} />
              <StatCard value={shiftStats.done} label="Done" color="bg-emerald-400" icon={<CheckCircle className="w-4 h-4" />} />
              <StatCard value={shiftStats.late} label="Late" color="bg-amber-400" icon={<Clock className="w-4 h-4" />} />
              <StatCard value={shiftStats.missed} label="Missed" color="bg-red-400" icon={<XCircle className="w-4 h-4" />} />
              <StatCard value={`${shiftStats.pct}%`} label="Rate" color={shiftStats.pct >= 75 ? 'bg-emerald-400' : shiftStats.pct >= 40 ? 'bg-amber-400' : 'bg-red-400'} icon={<Zap className="w-4 h-4" />} />
            </>
          )}
        </div>
      )}

      {/* ── Table ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-10 h-10 rounded-full border-4 border-orange-200 border-t-orange-500 animate-spin" />
            <p className="text-sm text-slate-500 font-semibold">Loading data…</p>
          </div>
        ) : activeTab === 'inspections' ? (
          <InspectionsTable data={filteredInspections} />
        ) : (
          <ShiftsTable data={filteredShifts} />
        )}
      </div>

      {/* ── Modals ── */}
      <CustomRangeModal visible={showCustom} onClose={() => setShowCustom(false)} initial={customRange}
        onApply={(s, e) => { setCustomRange({ start: s, end: e }); setDateFilter('custom') }} />
      <FilterModal visible={showFilter} onClose={() => setShowFilter(false)}
        zones={zones} wards={wards} kothis={kothis} chronicPoints={chronicPoints}
        selectedZone={selZone} selectedWard={selWard} selectedKothi={selKothi} selectedPoint={selPoint}
        onApply={(z, w, k, p) => { setSelZone(z); setSelWard(w); setSelKothi(k); setSelPoint(p) }} />
    </div>
  )
}

// ─── Inspections Table ────────────────────────────────────────────────────────
function InspectionsTable({ data }: { data: ComplianceReport[] }) {
  if (data.length === 0) return <EmptyState message="No inspections found for selected filters." />
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] text-xs">
        <thead>
          <tr className="bg-orange-50 border-b border-orange-100">
            {['#', 'Date', 'Feeder Point', 'Member', 'Citizen', 'Phone', 'Address', 'Feedback', 'Status'].map(h => (
              <th key={h} className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-wider text-orange-600 whitespace-nowrap first:w-10">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((r, i) => {
            const getAns = (qId: string) => r.answers?.find(a => a.questionId === qId)?.answer ?? '—'
            const citizenName = getAns('citizen_name')
            const phone = getAns('phone_number')
            const address = getAns('address')
            const feedback = getAns('feedback') !== '—' ? getAns('feedback') : getAns('remarks')
            return (
              <tr key={r.id} className={`border-b border-slate-50 hover:bg-slate-50 transition-colors ${i % 2 === 0 ? '' : 'bg-slate-50/50'}`}>
                <td className="px-4 py-3 text-slate-400 font-bold">{i + 1}</td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap font-medium">{r.tripDate ?? '—'}</td>
                <td className="px-4 py-3">
                  <div className="flex items-start gap-1.5">
                    <AlertTriangle className="w-3 h-3 text-orange-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-bold text-slate-800 leading-tight">{r.feederPointName ?? '—'}</p>
                      {r.tripNumber && <p className="text-[10px] text-slate-400">Trip #{r.tripNumber}</p>}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <User className="w-3 h-3 text-slate-400 flex-shrink-0" />
                    <span className="text-slate-700 font-medium">{r.userName ?? '—'}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-700">{citizenName}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <Phone className="w-3 h-3 text-slate-400" />
                    <span className="text-slate-600 font-mono">{phone}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-start gap-1">
                    <MapPin className="w-3 h-3 text-slate-400 mt-0.5 flex-shrink-0" />
                    <span className="text-slate-600 max-w-[140px] line-clamp-2">{address}</span>
                  </div>
                </td>
                <td className="px-4 py-3 max-w-[160px]">
                  <span className="text-slate-600 line-clamp-2">{feedback}</span>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={r.status} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between">
        <p className="text-xs text-slate-400 font-medium">{data.length} record{data.length !== 1 ? 's' : ''}</p>
      </div>
    </div>
  )
}

// ─── Shifts Table ─────────────────────────────────────────────────────────────
function ShiftsTable({ data }: { data: ShiftReport[] }) {
  if (data.length === 0) return <EmptyState message="No shift reports found for selected filters." />
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] text-xs">
        <thead>
          <tr className="bg-orange-50 border-b border-orange-100">
            {['#', 'Date', 'Feeder Point', 'Shift', 'Member', 'Missed', 'Late', 'Done', 'Rate', 'Out'].map(h => (
              <th key={h} className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-wider text-orange-600 whitespace-nowrap first:w-10">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((s, i) => {
            const slots = Array.isArray(s.slots) ? s.slots : []
            const total = slots.length || 8
            const done = slots.filter(sl => sl.status === 'completed').length
            const late = slots.filter(sl => sl.status === 'late').length
            const missed = slots.filter(sl => sl.status === 'missed').length
            const pct = Math.round(((done + late) / total) * 100)
            const pctColor = pct >= 75 ? '#059669' : pct >= 40 ? '#D97706' : '#DC2626'
            return (
              <tr key={s.id} className={`border-b border-slate-50 hover:bg-slate-50 transition-colors ${i % 2 === 0 ? '' : 'bg-slate-50/50'}`}>
                <td className="px-4 py-3 text-slate-400 font-bold">{i + 1}</td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap font-medium">{s.shiftDate ?? '—'}</td>
                <td className="px-4 py-3">
                  <div className="flex items-start gap-1.5">
                    <AlertTriangle className="w-3 h-3 text-orange-400 mt-0.5 flex-shrink-0" />
                    <span className="font-bold text-slate-800">{s.feederPointName ?? '—'}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="px-2 py-0.5 rounded-lg bg-amber-50 text-amber-700 font-bold text-[10px] border border-amber-200">{s.shiftType ?? '—'}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <User className="w-3 h-3 text-slate-400 flex-shrink-0" />
                    <span className="text-slate-700 font-medium">{s.userName ?? '—'}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-red-50 border border-red-100 w-fit">
                    <XCircle className="w-3 h-3 text-red-500" />
                    <span className="font-bold text-red-600">{missed}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-50 border border-amber-100 w-fit">
                    <Clock className="w-3 h-3 text-amber-500" />
                    <span className="font-bold text-amber-600">{late}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 border border-emerald-100 w-fit">
                    <CheckCircle className="w-3 h-3 text-emerald-500" />
                    <span className="font-bold text-emerald-600">{done}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-1 min-w-[60px]">
                    <span className="font-black text-xs" style={{ color: pctColor }}>{pct}%</span>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden w-16">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: pctColor }} />
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  {(s as any).isPunchedOut ? (
                    <span className="px-2 py-0.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold text-[10px]">✓ Yes</span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-lg bg-red-50 border border-red-200 text-red-600 font-bold text-[10px]">✗ No</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="px-4 py-3 border-t border-slate-100">
        <p className="text-xs text-slate-400 font-medium">{data.length} record{data.length !== 1 ? 's' : ''}</p>
      </div>
    </div>
  )
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status?: string }) {
  const map: Record<string, string> = {
    approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    pending: 'bg-amber-50 text-amber-700 border-amber-200',
    rejected: 'bg-red-50 text-red-600 border-red-200',
    requires_action: 'bg-orange-50 text-orange-700 border-orange-200',
    action_taken: 'bg-blue-50 text-blue-700 border-blue-200',
  }
  const cls = map[status ?? ''] ?? 'bg-slate-50 text-slate-500 border-slate-200'
  return (
    <span className={`px-2 py-0.5 rounded-lg border text-[10px] font-bold capitalize whitespace-nowrap ${cls}`}>
      {status ?? '—'}
    </span>
  )
}

// ─── Empty State ──────────────────────────────────────────────────────────────
function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <div className="w-14 h-14 rounded-2xl bg-orange-50 flex items-center justify-center">
        <AlertTriangle className="w-7 h-7 text-orange-300" />
      </div>
      <p className="text-sm font-semibold text-slate-400">{message}</p>
    </div>
  )
}