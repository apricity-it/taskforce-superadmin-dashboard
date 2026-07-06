import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useQuery } from '@tanstack/react-query'
import { DataService, ComplianceReport, FeederPoint, Zone, Ward, Kothi, ShiftReport } from '@/lib/dataService'
import {
  AlertTriangle, Calendar, CheckCircle, ChevronDown, Clock,
  Download, FileSpreadsheet, Filter, MapPin, Phone,
  RefreshCw, User, X, XCircle, Zap,
} from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import { getTokens } from '@/lib/dashboardTheme'
import * as XLSX from 'xlsx'

type TabType = 'inspections' | 'shifts'
type DateFilterType = 'today' | 'yesterday' | 'this_week' | 'this_month' | 'custom'

function startOfDay(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0) }
function endOfDay(d: Date)   { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999) }
function isoDate(d: Date)    { return d.toISOString().split('T')[0] }
function fmtDisplay(d: Date) { return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) }
function fmtShort(d: Date)   { return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) }

function getRange(filter: DateFilterType, custom?: { start: Date; end: Date }) {
  const now = new Date()
  switch (filter) {
    case 'today':      return { start: startOfDay(now), end: endOfDay(now) }
    case 'yesterday':  { const y = new Date(now); y.setDate(y.getDate() - 1); return { start: startOfDay(y), end: endOfDay(y) } }
    case 'this_week':  { const m = new Date(now); m.setDate(now.getDate() - ((now.getDay() + 6) % 7)); return { start: startOfDay(m), end: endOfDay(now) } }
    case 'this_month': return { start: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)), end: endOfDay(now) }
    case 'custom':     return custom ? { start: startOfDay(custom.start), end: endOfDay(custom.end) } : { start: startOfDay(now), end: endOfDay(now) }
  }
}
function toJsDate(v: any): Date | null {
  if (!v) return null
  if (v instanceof Date) return v
  if (typeof v?.toDate === 'function') return v.toDate()
  const d = new Date(v); return isNaN(d.getTime()) ? null : d
}
function dateInRange(raw: any, range: { start: Date; end: Date }) {
  if (!raw) return false
  if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw >= isoDate(range.start) && raw <= isoDate(range.end)
  const d = toJsDate(raw); return !!d && d >= range.start && d <= range.end
}

// ─── Mini Calendar ────────────────────────────────────────────────────────────
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const WDAYS  = ['Su','Mo','Tu','We','Th','Fr','Sa']

function MiniCalendar({ value, onChange, maxDate, T }: { value: Date; onChange: (d: Date) => void; maxDate?: Date; T: any }) {
  const [view, setView] = useState(new Date(value.getFullYear(), value.getMonth(), 1))
  const yr = view.getFullYear(), mo = view.getMonth()
  const cells = [...Array(new Date(yr, mo, 1).getDay()).fill(null), ...Array.from({ length: new Date(yr, mo + 1, 0).getDate() }, (_, i) => i + 1)]
  const today = new Date()
  return (
    <div className="rounded-xl p-3" style={{ background: T.surface, border: `1px solid ${T.cardBorder}` }}>
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => setView(new Date(yr, mo - 1, 1))} style={{ width: 28, height: 28, borderRadius: 8, background: T.card, border: `1px solid ${T.cardBorder}`, color: T.textSecondary, cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>‹</button>
        <span className="text-sm font-bold" style={{ color: T.textPrimary }}>{MONTHS[mo]} {yr}</span>
        <button onClick={() => setView(new Date(yr, mo + 1, 1))} style={{ width: 28, height: 28, borderRadius: 8, background: T.card, border: `1px solid ${T.cardBorder}`, color: T.textSecondary, cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>›</button>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {WDAYS.map(d => <div key={d} className="text-center text-[10px] font-bold py-1" style={{ color: T.textMuted }}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((day, i) => {
          if (!day) return <div key={`e${i}`} />
          const date = new Date(yr, mo, day)
          const sel  = value.getDate() === day && value.getMonth() === mo && value.getFullYear() === yr
          const now  = today.getDate() === day && today.getMonth() === mo && today.getFullYear() === yr
          const dis  = maxDate ? date > maxDate : false
          return (
            <button key={day} disabled={dis} onClick={() => !dis && onChange(date)}
              className="h-8 w-full rounded-lg text-xs font-medium"
              style={{ background: sel ? T.accent : now ? T.accentDim : 'transparent', color: sel ? (T === darkTokens ? '#000' : '#fff') : now ? T.accent : dis ? T.textMuted : T.textPrimary, cursor: dis ? 'not-allowed' : 'pointer', opacity: dis ? 0.3 : 1, border: 'none' }}>
              {day}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// need darkTokens ref for calendar color
import { darkTokens } from '@/lib/dashboardTheme'

// ─── Custom Range Modal ───────────────────────────────────────────────────────
function CustomRangeModal({ visible, onClose, onApply, initial, T }: any) {
  const today = new Date()
  const [start, setStart]   = useState(initial?.start ?? startOfDay(today))
  const [end,   setEnd]     = useState(initial?.end   ?? endOfDay(today))
  const [pick,  setPick]    = useState<'start'|'end'>('start')
  if (!visible) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div className="rounded-t-2xl sm:rounded-2xl p-5 w-full max-w-sm shadow-2xl" style={{ background: T.card, border: `1px solid ${T.cardBorder}` }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold" style={{ color: T.textPrimary }}>Custom Date Range</h3>
          <button onClick={onClose} style={{ background: T.surface, border: `1px solid ${T.cardBorder}`, borderRadius: 8, width: 28, height: 28, cursor: 'pointer', color: T.textSecondary, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X className="w-4 h-4" /></button>
        </div>
        <div className="flex gap-2 mb-4">
          {(['start','end'] as const).map(p => (
            <button key={p} onClick={() => setPick(p)} className="flex-1 py-2 px-3 rounded-xl text-xs font-bold"
              style={{ background: pick === p ? T.accentDim : T.surface, border: `1px solid ${pick === p ? T.accentBorder : T.cardBorder}`, color: pick === p ? T.accent : T.textSecondary, cursor: 'pointer' }}>
              {p === 'start' ? `From: ${fmtDisplay(start)}` : `To: ${fmtDisplay(end)}`}
            </button>
          ))}
        </div>
        {pick === 'start'
          ? <MiniCalendar value={start} maxDate={end} onChange={d => { setStart(d); setPick('end') }} T={T} />
          : <MiniCalendar value={end}   maxDate={today} onChange={d => setEnd(d)} T={T} />
        }
        <button disabled={start > end} onClick={() => { if (start <= end) { onApply(start, end); onClose() } }}
          className="mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm"
          style={{ background: start > end ? T.cardBorder : T.accent, color: '#fff', border: 'none', cursor: start > end ? 'not-allowed' : 'pointer', opacity: start > end ? 0.5 : 1 }}>
          <Calendar className="w-4 h-4" /> Apply Range
        </button>
      </div>
    </div>
  )
}

// ─── Filter Modal ─────────────────────────────────────────────────────────────
function FilterModal({ visible, onClose, zones, wards, kothis, chronicPoints, selectedZone, selectedWard, selectedKothi, selectedPoint, onApply, T }: any) {
  const [zone, setZone]   = useState(selectedZone)
  const [ward, setWard]   = useState(selectedWard)
  const [kothi, setKothi] = useState(selectedKothi)
  const [point, setPoint] = useState(selectedPoint)
  useEffect(() => { if (visible) { setZone(selectedZone); setWard(selectedWard); setKothi(selectedKothi); setPoint(selectedPoint) } }, [visible])
  if (!visible) return null

  const fWards  = wards.filter((w: any) => !zone || w.zoneId === zone)
  const fKothis = kothis.filter((k: any) => !ward || k.wardId === ward)
  const fPoints = chronicPoints.filter((p: any) => {
    if (kothi) return p.kothiId === kothi
    if (ward)  return p.wardId  === ward
    if (zone)  return p.zoneId  === zone
    return true
  })
  const activeCount = [zone, ward, kothi, point].filter(Boolean).length
  const sections = [
    { label: 'Zone',          items: zones,    sel: zone,  onAll: () => { setZone(''); setWard(''); setKothi(''); setPoint('') }, onSel: (id: string) => { setZone(id); setWard(''); setKothi(''); setPoint('') } },
    { label: 'Ward',          items: fWards,   sel: ward,  onAll: () => { setWard(''); setKothi(''); setPoint('') },             onSel: (id: string) => { setWard(id); setKothi(''); setPoint('') } },
    { label: 'Kothi',         items: fKothis,  sel: kothi, onAll: () => { setKothi(''); setPoint('') },                          onSel: (id: string) => { setKothi(id); setPoint('') } },
    { label: 'Chronic Point', items: fPoints,  sel: point, onAll: () => setPoint(''),                                            onSel: (id: string) => setPoint(id) },
  ]
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div className="rounded-t-2xl sm:rounded-2xl p-5 w-full max-w-md shadow-2xl max-h-[85vh] flex flex-col" style={{ background: T.card, border: `1px solid ${T.cardBorder}` }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4 flex-shrink-0">
          <h3 className="text-base font-bold flex-1" style={{ color: T.textPrimary }}>Filter Data</h3>
          {activeCount > 0 && <button onClick={() => { setZone(''); setWard(''); setKothi(''); setPoint('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.red, fontSize: 12, fontWeight: 700 }}>Clear all</button>}
          <button onClick={onClose} style={{ background: T.surface, border: `1px solid ${T.cardBorder}`, borderRadius: 8, width: 28, height: 28, cursor: 'pointer', color: T.textSecondary, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X className="w-4 h-4" /></button>
        </div>
        <div className="overflow-y-auto flex-1 space-y-4 pr-1">
          {sections.map(({ label, items, sel, onAll, onSel }) => (
            <div key={label}>
              <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: T.textMuted }}>{label}</p>
              <div className="flex flex-wrap gap-2">
                <button onClick={onAll} className="px-3 py-1.5 rounded-full text-xs font-bold"
                  style={{ background: !sel ? T.accentDim : T.surface, border: `1px solid ${!sel ? T.accentBorder : T.cardBorder}`, color: !sel ? T.accent : T.textSecondary, cursor: 'pointer' }}>All</button>
                {(items as any[]).map((item: any) => (
                  <button key={item.id} onClick={() => onSel(item.id)} className="px-3 py-1.5 rounded-full text-xs font-bold"
                    style={{ background: sel === item.id ? T.accentDim : T.surface, border: `1px solid ${sel === item.id ? T.accentBorder : T.cardBorder}`, color: sel === item.id ? T.accent : T.textSecondary, cursor: 'pointer' }}>
                    {item.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <button onClick={() => { onApply(zone, ward, kothi, point); onClose() }}
          className="mt-4 flex-shrink-0 w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm"
          style={{ background: T.accent, color: '#fff', border: 'none', cursor: 'pointer' }}>
          <Filter className="w-4 h-4" /> Apply{activeCount > 0 ? ` (${activeCount})` : ''}
        </button>
      </div>
    </div>
  )
}

// ─── Excel Export ─────────────────────────────────────────────────────────────
function exportInspections(data: ComplianceReport[], label: string) {
  const rows = data.map((r, i) => {
    const g = (qId: string) => r.answers?.find(a => a.questionId === qId)?.answer ?? '—'
    return { '#': i+1, Date: r.tripDate??'', 'Feeder Point': r.feederPointName??'—', Member: r.userName??'—', Citizen: g('citizen_name'), Phone: g('phone_number'), Address: g('address'), Feedback: g('feedback')!=='—'?g('feedback'):g('remarks'), Status: r.status??'—', Trip: r.tripNumber??'—' }
  })
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Inspections')
  XLSX.writeFile(wb, `chronic-inspections-${label}.xlsx`)
}
function exportShifts(data: ShiftReport[], label: string) {
  const rows = data.map((s, i) => {
    const slots = Array.isArray(s.slots) ? s.slots : []; const total = slots.length||8
    const done = slots.filter(sl=>sl.status==='completed').length, late = slots.filter(sl=>sl.status==='late').length, missed = slots.filter(sl=>sl.status==='missed').length
    return { '#': i+1, Date: s.shiftDate??'', 'Feeder Point': s.feederPointName??'—', 'Shift Type': s.shiftType??'—', Member: s.userName??'—', 'Total Slots': total, Done: done, Late: late, Missed: missed, 'Rate': `${Math.round(((done+late)/total)*100)}%`, Status: s.status??'—' }
  })
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Shifts')
  XLSX.writeFile(wb, `chronic-shifts-${label}.xlsx`)
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function ChronicMonitoringPage() {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const T = getTokens(dark)

const { data: allPoints = [] } = useQuery<FeederPoint[]>({ queryKey: ['feederPoints'], queryFn: () => DataService.getAllFeederPoints(), staleTime: 5*60_000 })
const chronicPoints: FeederPoint[] = useMemo(() => allPoints.filter((p: FeederPoint) => p.type === 'chronic'), [allPoints])

  const [zones,  setZones]  = useState<Zone[]>([])
  const [wards,  setWards]  = useState<Ward[]>([])
  const [kothis, setKothis] = useState<Kothi[]>([])
  useEffect(() => {
    const u1 = DataService.onZonesChange(setZones)
    const u2 = DataService.onWardsChange(setWards)
    const u3 = DataService.onKothisChange(setKothis)
    return () => { u1(); u2(); u3() }
  }, [])

  const [allInspections, setAllInspections] = useState<ComplianceReport[]>([])
  const [allShifts,      setAllShifts]      = useState<ShiftReport[]>([])
  const [dataLoading,    setDataLoading]    = useState(false)
  const [refreshing,     setRefreshing]     = useState(false)
  const [activeTab,      setActiveTab]      = useState<TabType>('inspections')
  const [dateFilter,     setDateFilter]     = useState<DateFilterType>('today')
  const [customRange,    setCustomRange]    = useState<{start:Date;end:Date}|undefined>()
  const [showCustom,     setShowCustom]     = useState(false)
  const [showFilter,     setShowFilter]     = useState(false)
  const [selZone,  setSelZone]  = useState('')
  const [selWard,  setSelWard]  = useState('')
  const [selKothi, setSelKothi] = useState('')
  const [selPoint, setSelPoint] = useState('')
  const [search,   setSearch]   = useState('')
  const isMounted = useRef(true)
  useEffect(() => { isMounted.current = true; return () => { isMounted.current = false } }, [])

  const loadData = useCallback(async (cpPoints: FeederPoint[], range: {start:Date;end:Date}) => {
    try {
      setDataLoading(true)
      const cpIds = new Set(cpPoints.map(p => p.id))
      const s = isoDate(range.start), e = isoDate(range.end)
      let inspDocs: any[] = []
      try {
        const snap = await getDocs(query(collection(db,'complianceReports'), where('feederPointType','==','chronic'), where('tripDate','>=',s), where('tripDate','<=',e)))
        inspDocs = snap.docs
      } catch {
        const snap = await getDocs(query(collection(db,'complianceReports'), where('feederPointType','==','chronic')))
        inspDocs = snap.docs.filter(d => { const td=d.data().tripDate; return typeof td==='string' ? td>=s&&td<=e : dateInRange(d.data().submittedAt,range) })
      }
      const inspections: ComplianceReport[] = inspDocs
        .map(d => ({ id: d.id, ...d.data() } as ComplianceReport))
        .filter(r => { const td=r.tripDate; const ok=typeof td==='string'?td>=s&&td<=e:dateInRange((r as any).submittedAt,range); return ok&&(cpIds.size===0||cpIds.has(r.feederPointId)) })
      const shiftSnap = await getDocs(query(collection(db,'shiftReports'), where('shiftDate','>=',s), where('shiftDate','<=',e)))
      const shifts: ShiftReport[] = shiftSnap.docs
        .map(d => ({ id: d.id, ...d.data() } as ShiftReport))
        .filter(s2 => { const sd=s2.shiftDate; return typeof sd==='string'&&sd>=s&&sd<=e&&(cpIds.size===0||cpIds.has(s2.feederPointId)) })
      if (!isMounted.current) return
      setAllInspections(inspections); setAllShifts(shifts)
    } catch(err) { console.error(err) }
    finally { if (isMounted.current) { setDataLoading(false); setRefreshing(false) } }
  }, [])

  useEffect(() => {
    if (allPoints.length === 0) return
    loadData(chronicPoints, getRange(dateFilter, customRange))
  }, [dateFilter, customRange, chronicPoints]) // eslint-disable-line

  const handleRefresh = useCallback(() => { setRefreshing(true); loadData(chronicPoints, getRange(dateFilter,customRange)) }, [dateFilter,customRange,chronicPoints,loadData])

  const visibleIds = useMemo<Set<string>>(() => {
    if (!selZone&&!selWard&&!selKothi&&!selPoint) return new Set(chronicPoints.map(p=>p.id))
    return new Set(chronicPoints.filter(p => {
      const pp = p as any
      if (selPoint&&p.id!==selPoint) return false
      if (selKothi&&pp.kothiId!==selKothi) return false
      if (selWard&&pp.wardId!==selWard) return false
      if (selZone&&pp.zoneId!==selZone) return false
      return true
    }).map(p=>p.id))
  }, [chronicPoints,selZone,selWard,selKothi,selPoint])

  const range = useMemo(() => getRange(dateFilter,customRange), [dateFilter,customRange])

  const filteredInspections = useMemo(() => {
    const s=isoDate(range.start), e=isoDate(range.end)
    let d = allInspections.filter(r => { if(!visibleIds.has(r.feederPointId)) return false; const td=r.tripDate; return typeof td==='string'?td>=s&&td<=e:dateInRange((r as any).submittedAt,range) })
    if (search) { const q=search.toLowerCase(); d=d.filter(r=>(r.feederPointName??'').toLowerCase().includes(q)||(r.userName??'').toLowerCase().includes(q)||(r.tripDate??'').includes(q)) }
    return d
  }, [allInspections,visibleIds,range,search])

  const filteredShifts = useMemo(() => {
    const s=isoDate(range.start), e=isoDate(range.end)
    let d = allShifts.filter(sh => { if(!visibleIds.has(sh.feederPointId)) return false; const sd=sh.shiftDate; return typeof sd==='string'&&sd>=s&&sd<=e })
    if (search) { const q=search.toLowerCase(); d=d.filter(sh=>(sh.feederPointName??'').toLowerCase().includes(q)||(sh.userName??'').toLowerCase().includes(q)||(sh.shiftDate??'').includes(q)) }
    return d
  }, [allShifts,visibleIds,range,search])

  const shiftStats = useMemo(() => {
    const slots = filteredShifts.flatMap(s=>Array.isArray(s.slots)?s.slots:[])
    const total=slots.length, done=slots.filter(sl=>sl.status==='completed').length, late=slots.filter(sl=>sl.status==='late').length, missed=slots.filter(sl=>sl.status==='missed').length
    return { total, done, late, missed, pct: total>0?Math.round(((done+late)/total)*100):0 }
  }, [filteredShifts])

  const activeFilterCount = [selZone,selWard,selKothi,selPoint].filter(Boolean).length
  const exportLabel = dateFilter==='custom'&&customRange ? `${isoDate(customRange.start)}_${isoDate(customRange.end)}` : `${dateFilter}_${isoDate(new Date())}`

  const DATE_PILLS: {key:DateFilterType;label:string}[] = [
    {key:'today',label:'Today'},{key:'yesterday',label:'Yesterday'},
    {key:'this_week',label:'This Week'},{key:'this_month',label:'This Month'},{key:'custom',label:'Custom'},
  ]

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: T.accentDim, border: `1px solid ${T.accentBorder}` }}>
            <Zap className="w-6 h-6" style={{ color: T.accent }} />
          </div>
          <div>
            <h1 className="text-xl font-black leading-none" style={{ color: T.textPrimary }}>Chronic Team Monitoring</h1>
            <p className="text-xs mt-0.5" style={{ color: T.textMuted }}>Inspections & Shift Reports · {chronicPoints.length} chronic points</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleRefresh} disabled={refreshing||dataLoading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold disabled:opacity-50"
            style={{ background: T.surface, border: `1px solid ${T.cardBorder}`, color: T.textSecondary, cursor: 'pointer' }}>
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing?'animate-spin':''}`} /> Refresh
          </button>
          <button onClick={() => setShowFilter(true)}
            className="relative flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold"
            style={{ background: activeFilterCount>0?T.accentDim:T.surface, border: `1px solid ${activeFilterCount>0?T.accentBorder:T.cardBorder}`, color: activeFilterCount>0?T.accent:T.textSecondary, cursor: 'pointer' }}>
            <Filter className="w-3.5 h-3.5" /> Filter
            {activeFilterCount>0 && <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black" style={{ background: T.accent, color: dark?'#000':'#fff' }}>{activeFilterCount}</span>}
          </button>
          <div className="relative group">
            <button className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold" style={{ background: T.green, color: '#fff', border: 'none', cursor: 'pointer' }}>
              <FileSpreadsheet className="w-3.5 h-3.5" /> Export <ChevronDown className="w-3 h-3" />
            </button>
            <div className="absolute right-0 top-full mt-1.5 w-52 rounded-xl overflow-hidden opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-all z-30"
              style={{ background: T.card, border: `1px solid ${T.cardBorder}`, boxShadow: '0 8px 24px rgba(0,0,0,0.2)' }}>
              {[{label:'Export Inspections',fn:()=>exportInspections(filteredInspections,exportLabel)},{label:'Export Shifts',fn:()=>exportShifts(filteredShifts,exportLabel)}].map(btn => (
                <button key={btn.label} onClick={btn.fn} className="w-full flex items-center gap-3 px-4 py-3 text-xs font-semibold text-left hover:opacity-80"
                  style={{ color: T.textPrimary, background: 'none', border: 'none', cursor: 'pointer', borderBottom: `1px solid ${T.gridLine}` }}>
                  <Download className="w-3.5 h-3.5" style={{ color: T.green }} /> {btn.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Active filter chips */}
      {activeFilterCount>0 && (
        <div className="flex flex-wrap gap-2">
          {[{val:selZone,items:zones,clear:()=>{setSelZone('');setSelWard('');setSelKothi('');setSelPoint('')}},
            {val:selWard,items:wards,clear:()=>{setSelWard('');setSelKothi('');setSelPoint('')}},
            {val:selKothi,items:kothis,clear:()=>{setSelKothi('');setSelPoint('')}},
            {val:selPoint,items:chronicPoints,clear:()=>setSelPoint('')}
          ].filter(f=>f.val).map((f,i)=>(
            <span key={i} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold" style={{ background: T.accentDim, border: `1px solid ${T.accentBorder}`, color: T.accent }}>
              {(f.items as any[]).find((x:any)=>x.id===f.val)?.name??f.val}
              <button onClick={f.clear} style={{ background:'none',border:'none',cursor:'pointer',color:T.accent,lineHeight:1,padding:0 }}>×</button>
            </span>
          ))}
          <button onClick={()=>{setSelZone('');setSelWard('');setSelKothi('');setSelPoint('')}} style={{ background:'none',border:'none',cursor:'pointer',color:T.red,fontSize:12,fontWeight:700 }}>Clear all</button>
        </div>
      )}

      {/* Controls bar */}
      <div className="rounded-2xl p-4" style={{ background: T.card, border: `1px solid ${T.cardBorder}` }}>
        <div className="flex flex-wrap gap-2 mb-3">
          {DATE_PILLS.map(f => {
            const active = dateFilter===f.key
            let lbl = f.label
            if (f.key==='custom'&&customRange&&active) lbl=`${fmtShort(customRange.start)} – ${fmtShort(customRange.end)}`
            return (
              <button key={f.key} onClick={()=>f.key==='custom'?setShowCustom(true):setDateFilter(f.key)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold"
                style={{ background: active?T.accent:T.surface, color: active?(dark?'#000':'#fff'):T.textSecondary, border: `1px solid ${active?T.accent:T.cardBorder}`, cursor:'pointer' }}>
                {f.key==='custom'&&<Calendar className="w-3 h-3"/>}
                {lbl}
                {f.key==='custom'&&<ChevronDown className="w-3 h-3"/>}
              </button>
            )
          })}
        </div>
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{color:T.textMuted}} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by point name, member, date..."
            className="w-full pl-8 pr-4 py-2 rounded-xl text-xs"
            style={{ background:T.surface, border:`1px solid ${T.cardBorder}`, color:T.textPrimary, outline:'none' }}/>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {([{key:'inspections',label:'Inspections',count:filteredInspections.length},{key:'shifts',label:'Shift Reports',count:filteredShifts.length}] as const).map(t=>(
          <button key={t.key} onClick={()=>setActiveTab(t.key)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold"
            style={{ background:activeTab===t.key?T.accent:T.card, color:activeTab===t.key?(dark?'#000':'#fff'):T.textSecondary, border:`1px solid ${activeTab===t.key?T.accent:T.cardBorder}`, cursor:'pointer' }}>
            {t.label}
            <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full" style={{ background: activeTab===t.key?'rgba(0,0,0,0.15)':T.surface, color: activeTab===t.key?(dark?'#000':'#fff'):T.textMuted }}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* Stat cards */}
      {!dataLoading && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {activeTab==='inspections' ? (
            <>
              <MiniStat value={visibleIds.size}                                                      label="Points"   color={T.accent}  icon={<Zap className="w-4 h-4"/>}          T={T}/>
              <MiniStat value={filteredInspections.length}                                           label="Reports"  color={T.textPrimary} icon={<AlertTriangle className="w-4 h-4"/>} T={T}/>
              <MiniStat value={[...new Set(filteredInspections.map(r=>r.feederPointId))].length}     label="Unique"   color={T.purple}  icon={<MapPin className="w-4 h-4"/>}        T={T}/>
              <MiniStat value={[...new Set(filteredInspections.map(r=>r.userId))].length}            label="Members"  color={T.green}   icon={<User className="w-4 h-4"/>}          T={T}/>
            </>
          ) : (
            <>
              <MiniStat value={filteredShifts.length} label="Shifts"  color={T.accent} icon={<Clock className="w-4 h-4"/>}        T={T}/>
              <MiniStat value={shiftStats.done}        label="Done"    color={T.green}  icon={<CheckCircle className="w-4 h-4"/>}  T={T}/>
              <MiniStat value={shiftStats.late}        label="Late"    color={T.amber}  icon={<Clock className="w-4 h-4"/>}        T={T}/>
              <MiniStat value={shiftStats.missed}      label="Missed"  color={T.red}    icon={<XCircle className="w-4 h-4"/>}      T={T}/>
              <MiniStat value={`${shiftStats.pct}%`}   label="Rate"    color={shiftStats.pct>=75?T.green:shiftStats.pct>=40?T.amber:T.red} icon={<Zap className="w-4 h-4"/>} T={T}/>
            </>
          )}
        </div>
      )}

      {/* Table */}
      <div className="rounded-2xl overflow-hidden" style={{ background:T.card, border:`1px solid ${T.cardBorder}` }}>
        {dataLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-10 h-10 rounded-full border-4 animate-spin" style={{ borderColor:`${T.accent}30`, borderTopColor:T.accent }}/>
            <p className="text-sm font-semibold" style={{ color:T.textMuted }}>Loading data…</p>
          </div>
        ) : activeTab==='inspections'
          ? <InspTable data={filteredInspections} T={T}/>
          : <ShiftTable data={filteredShifts} T={T}/>
        }
      </div>

      <CustomRangeModal visible={showCustom} onClose={()=>setShowCustom(false)} initial={customRange} onApply={(s:Date,e:Date)=>{setCustomRange({start:s,end:e});setDateFilter('custom')}} T={T}/>
      <FilterModal visible={showFilter} onClose={()=>setShowFilter(false)} zones={zones} wards={wards} kothis={kothis} chronicPoints={chronicPoints} selectedZone={selZone} selectedWard={selWard} selectedKothi={selKothi} selectedPoint={selPoint} onApply={(z:string,w:string,k:string,p:string)=>{setSelZone(z);setSelWard(w);setSelKothi(k);setSelPoint(p)}} T={T}/>
    </div>
  )
}

function MiniStat({ value, label, color, icon, T }: any) {
  return (
    <div className="flex-1 min-w-[80px] rounded-xl px-3 py-3 flex flex-col items-center gap-1 relative overflow-hidden" style={{ background:T.card, border:`1px solid ${T.cardBorder}` }}>
      <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background:color }}/>
      <div style={{ color }}>{icon}</div>
      <div className="text-xl font-black leading-none" style={{ color, fontFamily:"'JetBrains Mono',monospace" }}>{value}</div>
      <div className="text-[9px] font-black uppercase tracking-widest" style={{ color:T.textMuted }}>{label}</div>
    </div>
  )
}

function SBadge({ status, T }: { status?: string; T: any }) {
  const map: Record<string,string> = { approved:T.green, pending:T.amber, rejected:T.red, requires_action:T.red, action_taken:T.accent }
  const c = map[status??''] ?? T.textMuted
  return <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold capitalize whitespace-nowrap" style={{ background:`${c}15`, border:`1px solid ${c}30`, color:c }}>{status??'—'}</span>
}

function EmptyRows({ msg, T, cols }: { msg:string; T:any; cols:number }) {
  return (
    <tr><td colSpan={cols} className="py-16 text-center">
      <div className="flex flex-col items-center gap-2">
        <AlertTriangle className="w-8 h-8 opacity-30" style={{ color:T.accent }}/>
        <p className="text-sm font-semibold" style={{ color:T.textMuted }}>{msg}</p>
      </div>
    </td></tr>
  )
}

function THead({ cols, T }: { cols:string[]; T:any }) {
  return (
    <thead>
      <tr style={{ borderBottom:`1px solid ${T.cardBorder}`, background:T.surface }}>
        {cols.map(h=>(
          <th key={h} className="px-4 py-3 text-left font-black uppercase tracking-wider whitespace-nowrap" style={{ fontSize:10, color:T.accent }}>{h}</th>
        ))}
      </tr>
    </thead>
  )
}

function InspTable({ data, T }: { data:ComplianceReport[]; T:any }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] text-xs">
        <THead cols={['#','Date','Feeder Point','Member','Citizen','Phone','Address','Feedback','Status']} T={T}/>
        <tbody>
          {data.length===0 ? <EmptyRows msg="No inspections found for selected filters." T={T} cols={9}/> : data.map((r,i)=>{
            const g=(qId:string)=>r.answers?.find(a=>a.questionId===qId)?.answer??'—'
            return (
              <tr key={r.id} style={{ borderBottom:`1px solid ${T.gridLine}` }} onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background=T.surface} onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background='transparent'}>
                <td className="px-4 py-3 font-bold" style={{color:T.textMuted}}>{i+1}</td>
                <td className="px-4 py-3 whitespace-nowrap font-medium" style={{color:T.textSecondary}}>{r.tripDate??'—'}</td>
                <td className="px-4 py-3">
                  <div className="flex items-start gap-1.5">
                    <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" style={{color:T.accent}}/>
                    <div>
                      <p className="font-bold leading-tight" style={{color:T.textPrimary}}>{r.feederPointName??'—'}</p>
                      {r.tripNumber&&<p className="text-[10px]" style={{color:T.textMuted}}>Trip #{r.tripNumber}</p>}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3"><div className="flex items-center gap-1.5"><User className="w-3 h-3 flex-shrink-0" style={{color:T.textMuted}}/><span style={{color:T.textSecondary}}>{r.userName??'—'}</span></div></td>
                <td className="px-4 py-3" style={{color:T.textSecondary}}>{g('citizen_name')}</td>
                <td className="px-4 py-3"><div className="flex items-center gap-1"><Phone className="w-3 h-3" style={{color:T.textMuted}}/><span className="font-mono" style={{color:T.textSecondary}}>{g('phone_number')}</span></div></td>
                <td className="px-4 py-3"><div className="flex items-start gap-1"><MapPin className="w-3 h-3 mt-0.5 flex-shrink-0" style={{color:T.textMuted}}/><span className="max-w-[140px] line-clamp-2" style={{color:T.textSecondary}}>{g('address')}</span></div></td>
                <td className="px-4 py-3 max-w-[160px]"><span className="line-clamp-2" style={{color:T.textSecondary}}>{g('feedback')!=='—'?g('feedback'):g('remarks')}</span></td>
                <td className="px-4 py-3"><SBadge status={r.status} T={T}/></td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="px-4 py-3" style={{ borderTop:`1px solid ${T.cardBorder}` }}><p className="text-xs font-medium" style={{color:T.textMuted}}>{data.length} record{data.length!==1?'s':''}</p></div>
    </div>
  )
}

function ShiftTable({ data, T }: { data:ShiftReport[]; T:any }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] text-xs">
        <THead cols={['#','Date','Feeder Point','Shift','Member','Missed','Late','Done','Rate','Punched Out']} T={T}/>
        <tbody>
          {data.length===0 ? <EmptyRows msg="No shift reports found for selected filters." T={T} cols={10}/> : data.map((s,i)=>{
            const slots=Array.isArray(s.slots)?s.slots:[], total=slots.length||8
            const done=slots.filter(sl=>sl.status==='completed').length, late=slots.filter(sl=>sl.status==='late').length, missed=slots.filter(sl=>sl.status==='missed').length
            const pct=Math.round(((done+late)/total)*100)
            const pc=pct>=75?T.green:pct>=40?T.amber:T.red
            return (
              <tr key={s.id} style={{borderBottom:`1px solid ${T.gridLine}`}} onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background=T.surface} onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background='transparent'}>
                <td className="px-4 py-3 font-bold" style={{color:T.textMuted}}>{i+1}</td>
                <td className="px-4 py-3 whitespace-nowrap font-medium" style={{color:T.textSecondary}}>{s.shiftDate??'—'}</td>
                <td className="px-4 py-3"><div className="flex items-start gap-1.5"><AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" style={{color:T.accent}}/><span className="font-bold" style={{color:T.textPrimary}}>{s.feederPointName??'—'}</span></div></td>
                <td className="px-4 py-3"><span className="px-2 py-0.5 rounded-lg text-[10px] font-bold" style={{background:`${T.amber}15`,border:`1px solid ${T.amber}30`,color:T.amber}}>{s.shiftType??'—'}</span></td>
                <td className="px-4 py-3"><div className="flex items-center gap-1.5"><User className="w-3 h-3 flex-shrink-0" style={{color:T.textMuted}}/><span style={{color:T.textSecondary}}>{s.userName??'—'}</span></div></td>
                <td className="px-4 py-3"><div className="flex items-center gap-1 px-2 py-1 rounded-lg w-fit" style={{background:`${T.red}12`,border:`1px solid ${T.red}20`}}><XCircle className="w-3 h-3" style={{color:T.red}}/><span className="font-bold" style={{color:T.red}}>{missed}</span></div></td>
                <td className="px-4 py-3"><div className="flex items-center gap-1 px-2 py-1 rounded-lg w-fit" style={{background:`${T.amber}12`,border:`1px solid ${T.amber}20`}}><Clock className="w-3 h-3" style={{color:T.amber}}/><span className="font-bold" style={{color:T.amber}}>{late}</span></div></td>
                <td className="px-4 py-3"><div className="flex items-center gap-1 px-2 py-1 rounded-lg w-fit" style={{background:`${T.green}12`,border:`1px solid ${T.green}20`}}><CheckCircle className="w-3 h-3" style={{color:T.green}}/><span className="font-bold" style={{color:T.green}}>{done}</span></div></td>
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-1 min-w-[60px]">
                    <span className="font-black text-xs" style={{color:pc,fontFamily:"'JetBrains Mono',monospace"}}>{pct}%</span>
                    <div className="h-1.5 rounded-full overflow-hidden w-16" style={{background:T.cardBorder}}><div className="h-full rounded-full" style={{width:`${pct}%`,background:pc}}/></div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  {(s as any).isPunchedOut
                    ? <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold" style={{background:`${T.green}15`,border:`1px solid ${T.green}30`,color:T.green}}>✓ Yes</span>
                    : <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold" style={{background:`${T.red}15`,border:`1px solid ${T.red}30`,color:T.red}}>✗ No</span>
                  }
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="px-4 py-3" style={{borderTop:`1px solid ${T.cardBorder}`}}><p className="text-xs font-medium" style={{color:T.textMuted}}>{data.length} record{data.length!==1?'s':''}</p></div>
    </div>
  )
}