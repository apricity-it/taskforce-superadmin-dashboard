import { useEffect, useMemo, useState } from 'react'
import Head from 'next/head'
import {
  AlertTriangle, CheckCircle, ClipboardCheck, Loader2,
  MapPin, User, Clock, Eye, X, ZoomIn, Image as ImageIcon,
  Activity, Filter, ChevronRight, CalendarDays, RefreshCcw,
} from 'lucide-react'
import { DataService, ComplianceReport } from '@/lib/dataService'
import { collection, getDocs, query, orderBy, where, limit, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'
import { getTokens } from '@/lib/dashboardTheme'

// ─── Helpers ──────────────────────────────────────────────────────────────────
const ZONE_KEYS = new Set(['zone_name','q1','q1_zone_name','zone'])

const slugify = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'')

const resolveDate = (v: any): Date | null => {
  if (!v) return null
  if (v instanceof Date) return v
  if (typeof v.toDate === 'function') return v.toDate()
  if (typeof v._seconds === 'number') return new Date(v._seconds * 1000)
  if (typeof v === 'string') { const d = new Date(v); return isNaN(d.getTime()) ? null : d }
  return null
}

const fmtDT = (v: any) => {
  const d = resolveDate(v)
  return d ? d.toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '—'
}

function getAnswers(r: ComplianceReport): any[] {
  if (Array.isArray(r.answers) && r.answers.length > 0) return r.answers
  const out: any[] = []; let i = 0
  while ((r as any)[String(i)] !== undefined) { out.push((r as any)[String(i)]); i++ }
  return out
}

interface ZoneRecord { id: string; name: string }

// Normalize zone number: "05" → "5", "1" → "1"
function normalizeZoneNum(raw: string): string {
  const n = parseInt(raw.trim(), 10)
  return isNaN(n) ? raw.trim() : String(n)
}

function getZoneNum(r: ComplianceReport): string {
  const answers = getAnswers(r)
  const match = answers.find(a => a.questionId && ZONE_KEYS.has(slugify(a.questionId)))
  const val = match?.answer?.toString().trim()
  if (val) return normalizeZoneNum(val)
  return ''
}

function getZone(r: ComplianceReport): string {
  const num = getZoneNum(r)
  if (num) return `Zone - ${num}`
  return r.feederPointName || 'Unknown Zone'
}

function getPhotos(r: ComplianceReport): string[] {
  const answers = getAnswers(r)
  return answers.flatMap(a => (a.photos||[]).filter((p: string) => p?.startsWith('https://')))
}

// ─── Date range helpers ───────────────────────────────────────────────────────
type DatePreset = 'today' | 'week' | 'month' | 'all' | 'custom'

const toYMD = (d: Date) => d.toISOString().slice(0, 10)

function getPresetRange(preset: DatePreset, customStart?: string, customEnd?: string): { start: string; end: string } {
  const today = new Date()
  const todayStr = toYMD(today)
  if (preset === 'today')  return { start: todayStr, end: todayStr }
  if (preset === 'week') {
    const w = new Date(today); w.setDate(today.getDate() - 6); return { start: toYMD(w), end: todayStr }
  }
  if (preset === 'month') {
    const m = new Date(today); m.setDate(today.getDate() - 29); return { start: toYMD(m), end: todayStr }
  }
  if (preset === 'all') return { start: '2024-01-01', end: todayStr }
  // custom
  return { start: customStart || todayStr, end: customEnd || todayStr }
}

// ─── Sub-components ─────────────────────────────────────────────────────────────
function SBadge({ label, color }: { label: string; color: string }) {
  return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap"
      style={{ background:`${color}18`, border:`1px solid ${color}30`, color }}>
      {label}
    </span>
  )
}

// ─── Report Card ──────────────────────────────────────────────────────────────
function ReportCard({ report, isResolved, onView, T }: {
  report: ComplianceReport; isResolved: boolean; onView: ()=>void; T: any
}) {
  const zone     = getZone(report)
  const photos   = getPhotos(report)
  const answers  = getAnswers(report)
  const actionPhoto = (report as any).actionTakenPhoto
  const hasActionPhoto = actionPhoto?.startsWith('https://')
  const workNote = (report as any).actionTakenNote || report.adminNotes || ''
  const noAnswers  = answers.filter(a => (a.answer||'').toString().toLowerCase()==='no').length
  const yesAnswers = answers.filter(a => (a.answer||'').toString().toLowerCase()==='yes').length

  return (
    <div className="rounded-2xl p-4 space-y-3"
      style={{ background:T.card, border:`1px solid ${isResolved?T.green:T.amber}30` }}>

      {/* Card header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {isResolved
            ? <div className="flex h-8 w-8 items-center justify-center rounded-xl flex-shrink-0" style={{ background:`${T.green}15` }}>
                <CheckCircle className="h-4 w-4" style={{ color:T.green }}/>
              </div>
            : <div className="flex h-8 w-8 items-center justify-center rounded-xl flex-shrink-0" style={{ background:`${T.amber}15` }}>
                <AlertTriangle className="h-4 w-4" style={{ color:T.amber }}/>
              </div>
          }
          <div>
            <p className="text-sm font-bold" style={{ color:T.textPrimary }}>{report.feederPointName||'Feeder Point'}</p>
            <p className="text-[10px]" style={{ color:T.textMuted }}>{report.id.slice(-10)}</p>
          </div>
        </div>
        <SBadge label={zone} color={T.accent}/>
      </div>

      {/* Meta */}
      <div className="grid grid-cols-2 gap-2 text-xs" style={{ color:T.textSecondary }}>
        <div className="flex items-center gap-1.5">
          <User className="h-3 w-3 flex-shrink-0" style={{ color:T.textMuted }}/>
          <span className="truncate">{report.userName||(report as any).submittedBy||'Unknown'}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Clock className="h-3 w-3 flex-shrink-0" style={{ color:T.textMuted }}/>
          <span>{fmtDT(report.submittedAt||report.createdAt)}</span>
        </div>
        {(report as any).tripNumber && (
          <div className="flex items-center gap-1.5">
            <Activity className="h-3 w-3 flex-shrink-0" style={{ color:T.textMuted }}/>
            <span>Trip {(report as any).tripNumber} · {(report as any).tripDate||'—'}</span>
          </div>
        )}
        {(report as any).reviewedBy && (
          <div className="flex items-center gap-1.5">
            <ClipboardCheck className="h-3 w-3 flex-shrink-0" style={{ color:T.textMuted }}/>
            <span className="truncate">{(report as any).reviewedBy}</span>
          </div>
        )}
      </div>

      {/* Answer summary pills */}
      {(yesAnswers + noAnswers) > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          {yesAnswers > 0 && <SBadge label={`${yesAnswers} ✓ Yes`} color={T.green}/>}
          {noAnswers  > 0 && <SBadge label={`${noAnswers} ✗ No`}  color={T.red}/>}
        </div>
      )}

      {/* Admin notes (requires_action) */}
      {!isResolved && report.adminNotes && (
        <div className="rounded-xl px-3 py-2 text-xs"
          style={{ background:`${T.amber}10`, border:`1px solid ${T.amber}25`, color:T.amber }}>
          <span className="font-semibold">Note: </span>{report.adminNotes}
        </div>
      )}

      {/* Action taken section */}
      {isResolved && (
        <div className="rounded-xl p-3 space-y-2"
          style={{ background:`${T.green}08`, border:`1px solid ${T.green}20` }}>
          <p className="text-xs font-semibold" style={{ color:T.green }}>PMC Work Summary</p>
          {workNote && <p className="text-xs" style={{ color:T.textSecondary }}>{workNote}</p>}
          {hasActionPhoto && (
            <div className="relative rounded-xl overflow-hidden" style={{ border:`1px solid ${T.cardBorder}` }}>
              <img src={actionPhoto} alt="PMC action proof" className="w-full h-36 object-cover"/>
              <div className="absolute bottom-0 left-0 right-0 px-2 py-1 text-[9px] font-semibold"
                style={{ background:'rgba(0,0,0,0.5)', color:'#fff' }}>
                Proof photo by PMC
              </div>
            </div>
          )}
          {!hasActionPhoto && (report as any).actionTakenPhoto && (
            <p className="text-[10px] italic" style={{ color:T.textMuted }}>Photo saved locally on device — not available on web.</p>
          )}
        </div>
      )}

      {/* Photos preview */}
      {photos.length > 0 && (
        <div className="grid grid-cols-4 gap-1">
          {photos.slice(0,4).map((u,i)=>(
            <div key={i} className="rounded-lg overflow-hidden" style={{ border:`1px solid ${T.cardBorder}` }}>
              <img src={u} alt="" className="h-14 w-full object-cover"
                onError={e=>(e.currentTarget.parentElement!.style.display='none')}/>
            </div>
          ))}
          {photos.length > 4 && (
            <div className="rounded-lg flex items-center justify-center text-xs font-bold"
              style={{ background:T.surface, border:`1px solid ${T.cardBorder}`, color:T.textMuted, height:56 }}>
              +{photos.length-4}
            </div>
          )}
        </div>
      )}

      {/* View details button */}
      <button onClick={onView}
        className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold"
        style={{ background:T.accentDim, border:`1px solid ${T.accentBorder}`, color:T.accent, cursor:'pointer' }}>
        <Eye className="h-3.5 w-3.5"/> View Full Report
      </button>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function PmcActionPage() {
  const { user }   = useAuth()
  const { theme }  = useTheme()
  const dark       = theme === 'dark'
  const T          = getTokens(dark)

  const [reports,    setReports]    = useState<ComplianceReport[]>([])
  const [loading,    setLoading]    = useState(true)
  const [zoneFilter, setZoneFilter] = useState('all')
  const [activeTab,  setActiveTab]  = useState<'requires_action'|'action_taken'>('requires_action')
  const [selReport,  setSelReport]  = useState<ComplianceReport|null>(null)
  const [selImage,   setSelImage]   = useState<string|null>(null)
  const [zones,      setZones]      = useState<ZoneRecord[]>([])

  // Load real zones from Firestore zones collection
  useEffect(() => {
    const loadZones = async () => {
      try {
        const snap = await getDocs(query(collection(db, 'zones'), orderBy('name')))
        const data: ZoneRecord[] = snap.docs.map(d => ({ id: d.id, name: d.data().name as string }))
        setZones(data.sort((a,b) => a.name.localeCompare(b.name, undefined, { numeric: true })))
      } catch(e) { console.error('Failed to load zones', e) }
    }
    loadZones()
  }, [])

  // Date filter state — default today
  const [datePreset,   setDatePreset]   = useState<DatePreset>('today')
  const [customStart,  setCustomStart]  = useState(() => toYMD(new Date()))
  const [customEnd,    setCustomEnd]    = useState(() => toYMD(new Date()))
  const [showCustom,   setShowCustom]   = useState(false)

  const dateRange = getPresetRange(datePreset, customStart, customEnd)

  const loadReports = async (start: string, end: string) => {
    setLoading(true)
    setReports([])
    try {
      // Query both requires_action and action_taken in the date range using tripDate index
      const [reqSnap, actSnap] = await Promise.all([
        getDocs(query(
          collection(db, 'complianceReports'),
          where('tripDate', '>=', start),
          where('tripDate', '<=', end),
          where('status', '==', 'requires_action'),
          limit(300)
        )),
        getDocs(query(
          collection(db, 'complianceReports'),
          where('tripDate', '>=', start),
          where('tripDate', '<=', end),
          where('status', '==', 'action_taken'),
          limit(300)
        )),
      ])
      const all = [
        ...reqSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        ...actSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      ] as ComplianceReport[]
      setReports(all)
    } catch(e) {
      console.error('Failed to load reports', e)
    } finally {
      setLoading(false)
    }
  }

  // Load on mount (today) and whenever date range changes
  useEffect(() => {
    loadReports(dateRange.start, dateRange.end)
  }, [dateRange.start, dateRange.end])

  // Use loaded Firestore zones — only show zones that have actual reports
  const zonesWithReports = useMemo(() => {
    const numsInReports = new Set<string>()
    reports.forEach(r => { const n = getZoneNum(r); if (n) numsInReports.add(n) })
    return zones.filter(z => {
      // Extract number from "Zone - 5" → "5"
      const m = z.name.match(/\d+/)
      return m ? numsInReports.has(m[0]) : false
    })
  }, [reports, zones])

  const filtered = useMemo(() => {
    if (zoneFilter === 'all') return reports
    // Extract number from selected zone name e.g. "Zone - 5" → "5"
    const m = zoneFilter.match(/\d+/)
    const selectedNum = m ? m[0] : ''
    return reports.filter(r => getZoneNum(r) === selectedNum)
  }, [reports, zoneFilter])

  const actionRequired = useMemo(() => filtered.filter(r => r.status === 'requires_action'), [filtered])
  const actionTaken    = useMemo(() => filtered.filter(r => r.status === 'action_taken'), [filtered])
  const active         = activeTab === 'requires_action' ? actionRequired : actionTaken

  const inputSt = { background:T.surface, border:`1px solid ${T.cardBorder}`, color:T.textPrimary, borderRadius:10, padding:'7px 12px', fontSize:13, outline:'none' }

  return (
    <>
      <Head><title>PMC Employee Action | Taskforce</title></Head>
      <div className="space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl"
              style={{ background:T.accentDim, border:`1px solid ${T.accentBorder}` }}>
              <ClipboardCheck className="h-6 w-6" style={{ color:T.accent }}/>
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight" style={{ color:T.textPrimary }}>PMC Action</h1>
              <p className="text-sm" style={{ color:T.textMuted }}>Action-required and resolved reports by zone</p>
            </div>
          </div>
          {/* Zone filter */}
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4" style={{ color:T.textMuted }}/>
            <select value={zoneFilter} onChange={e=>setZoneFilter(e.target.value)}
              style={{ background:T.surface, border:`1px solid ${T.cardBorder}`, color:T.textPrimary, borderRadius:10, padding:'7px 12px', fontSize:13, outline:'none' }}>
              <option value="all">All Zones</option>
              {zonesWithReports.map(z=>(
                <option key={z.id} value={z.name}>{z.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Date filter bar */}
        <div className="rounded-2xl p-4 space-y-3" style={{ background:T.card, border:`1px solid ${T.cardBorder}` }}>
          <div className="flex flex-wrap items-center gap-2">
            <CalendarDays className="h-4 w-4 flex-shrink-0" style={{ color:T.accent }}/>
            <p className="text-sm font-semibold mr-1" style={{ color:T.textPrimary }}>Date Range</p>
            {/* Preset pills */}
            {([
              { id:'today' as DatePreset,  label:'Today'      },
              { id:'week'  as DatePreset,  label:'This Week'  },
              { id:'month' as DatePreset,  label:'This Month' },
              { id:'all'   as DatePreset,  label:'All Time'   },
              { id:'custom'as DatePreset,  label:'Custom'     },
            ] as {id:DatePreset;label:string}[]).map(p => (
              <button key={p.id}
                onClick={()=>{ setDatePreset(p.id); setShowCustom(p.id==='custom') }}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold"
                style={{
                  background: datePreset===p.id ? `${T.accent}18` : T.surface,
                  color:       datePreset===p.id ? T.accent : T.textSecondary,
                  border:      `1px solid ${datePreset===p.id ? T.accentBorder : T.cardBorder}`,
                  cursor: 'pointer',
                  boxShadow:   datePreset===p.id ? `0 2px 8px ${T.accent}20` : 'none',
                }}>
                {p.label}
              </button>
            ))}
            <button
              onClick={()=>loadReports(dateRange.start, dateRange.end)}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold"
              style={{ background:T.surface, border:`1px solid ${T.cardBorder}`, color:T.textSecondary, cursor:'pointer' }}>
              <RefreshCcw className="h-3.5 w-3.5"/> Refresh
            </button>
          </div>

          {/* Custom date pickers */}
          {(datePreset==='custom' || showCustom) && (
            <div className="flex flex-wrap items-end gap-3 pt-2" style={{ borderTop:`1px solid ${T.gridLine}` }}>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color:T.textMuted }}>From</p>
                <input type="date" value={customStart} max={customEnd}
                  onChange={e=>{ setCustomStart(e.target.value); setDatePreset('custom') }}
                  style={{ background:T.surface, border:`1px solid ${T.cardBorder}`, color:T.textPrimary, borderRadius:10, padding:'7px 12px', fontSize:13, outline:'none' }}/>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color:T.textMuted }}>To</p>
                <input type="date" value={customEnd} min={customStart}
                  onChange={e=>{ setCustomEnd(e.target.value); setDatePreset('custom') }}
                  style={{ background:T.surface, border:`1px solid ${T.cardBorder}`, color:T.textPrimary, borderRadius:10, padding:'7px 12px', fontSize:13, outline:'none' }}/>
              </div>
              <button
                onClick={()=>loadReports(customStart, customEnd)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold"
                style={{ background:T.accent, color:'#000', border:'none', cursor:'pointer' }}>
                <CalendarDays className="h-3.5 w-3.5"/> Apply
              </button>
            </div>
          )}

          {/* Active range display */}
          <p className="text-[10px]" style={{ color:T.textMuted }}>
            Showing: <span style={{ color:T.accent, fontWeight:700 }}>
              {dateRange.start === dateRange.end ? dateRange.start : `${dateRange.start} → ${dateRange.end}`}
            </span>
            {' '}· {reports.length} report{reports.length!==1?'s':''} loaded
          </p>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label:'Action Required', value:actionRequired.length, color:T.amber,  icon:AlertTriangle },
            { label:'Action Taken',    value:actionTaken.length,    color:T.green,  icon:CheckCircle  },
            { label:'Current Zone',    value:zoneFilter==='all'?'All Zones':zoneFilter, color:T.accent, icon:MapPin, str:true },
          ].map(s=>(
            <div key={s.label} className="rounded-2xl p-4" style={{ background:T.card, border:`1px solid ${T.cardBorder}` }}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color:T.textMuted }}>{s.label}</p>
                <s.icon className="h-4 w-4" style={{ color:s.color }}/>
              </div>
              <p className="text-2xl font-black" style={{ color:s.color, fontFamily:(s as any).str?'inherit':"'JetBrains Mono',monospace" }}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Tab bar */}
        <div className="flex gap-2 flex-wrap">
          {[
            { id:'requires_action' as const, label:`Action Required (${actionRequired.length})`, icon:AlertTriangle, color:T.amber  },
            { id:'action_taken'    as const, label:`PMC Reports (${actionTaken.length})`,        icon:ClipboardCheck, color:T.green },
          ].map(tab => {
            const isActive = activeTab === tab.id
            return (
              <button key={tab.id} onClick={()=>setActiveTab(tab.id)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
                style={{ background:isActive?`${tab.color}12`:T.surface, color:isActive?tab.color:T.textSecondary,
                  border:`1px solid ${isActive?tab.color:T.cardBorder}`, cursor:'pointer',
                  boxShadow:isActive?`0 2px 8px ${tab.color}20`:'none' }}>
                <tab.icon className="h-4 w-4"/>
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-3">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-t-transparent"
              style={{ borderColor:`${T.accent}30`, borderTopColor:T.accent }}/>
            <p className="text-sm font-semibold" style={{ color:T.textSecondary }}>Loading reports…</p>
          </div>
        ) : active.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-2 rounded-2xl"
            style={{ background:T.card, border:`2px dashed ${T.cardBorder}` }}>
            {activeTab==='requires_action'
              ? <AlertTriangle className="h-10 w-10 opacity-20" style={{ color:T.amber }}/>
              : <CheckCircle  className="h-10 w-10 opacity-20" style={{ color:T.green }}/>}
            <p className="text-sm" style={{ color:T.textMuted }}>
              {activeTab==='requires_action'
                ? `No action-required reports${zoneFilter!=='all'?` for ${zoneFilter}`:''}.`
                : `No PMC reports${zoneFilter!=='all'?` for ${zoneFilter}`:''} yet.`}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {active.map(r => (
              <ReportCard
                key={r.id}
                report={r}
                isResolved={activeTab==='action_taken'}
                onView={()=>setSelReport(r)}
                T={T}
              />
            ))}
          </div>
        )}

        {/* ── Full Report Modal ── */}
        {selReport && (() => {
          const answers  = getAnswers(selReport)
          const photos   = getPhotos(selReport)
          const isResolved = selReport.status === 'action_taken'
          const actionPhoto = (selReport as any).actionTakenPhoto
          const hasActionPhoto = actionPhoto?.startsWith('https://')

          return (
            <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto"
              style={{ background:'rgba(0,0,0,0.7)', backdropFilter:'blur(6px)' }}
              onClick={()=>setSelReport(null)}>
              <div className="w-full max-w-3xl my-8 rounded-2xl shadow-2xl overflow-hidden"
                style={{ background:T.card, border:`1px solid ${T.cardBorder}` }}
                onClick={e=>e.stopPropagation()}>

                {/* Modal header */}
                <div className="flex items-start justify-between px-5 py-4"
                  style={{ borderBottom:`1px solid ${T.cardBorder}`, background:isResolved?`${T.green}06`:`${T.amber}06` }}>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      {isResolved
                        ? <SBadge label="Action Taken" color={T.green}/>
                        : <SBadge label="Requires Action" color={T.amber}/>}
                      <SBadge label={getZone(selReport)} color={T.accent}/>
                    </div>
                    <h3 className="text-base font-bold" style={{ color:T.textPrimary }}>{selReport.feederPointName||'Feeder Point'}</h3>
                    <p className="text-xs mt-0.5" style={{ color:T.textMuted }}>
                      {selReport.userName||'?'} · Trip {(selReport as any).tripNumber||'?'} · {fmtDT(selReport.submittedAt||selReport.createdAt)}
                    </p>
                  </div>
                  <button onClick={()=>setSelReport(null)} className="flex items-center justify-center w-8 h-8 rounded-xl"
                    style={{ background:T.surface, border:`1px solid ${T.cardBorder}`, color:T.textSecondary, cursor:'pointer' }}>
                    <X className="h-4 w-4"/>
                  </button>
                </div>

                <div className="p-5 grid grid-cols-1 lg:grid-cols-3 gap-5">
                  {/* Answers */}
                  <div className="lg:col-span-2 space-y-3">
                    {/* Admin notes */}
                    {selReport.adminNotes && (
                      <div className="rounded-xl px-3 py-2.5"
                        style={{ background:isResolved?`${T.green}08`:`${T.amber}10`, border:`1px solid ${isResolved?T.green:T.amber}25` }}>
                        <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color:isResolved?T.green:T.amber }}>
                          {isResolved?'Action Summary':'Admin Note'}
                        </p>
                        <p className="text-sm" style={{ color:T.textSecondary }}>{selReport.adminNotes}</p>
                      </div>
                    )}

                    {/* PMC action photo */}
                    {isResolved && hasActionPhoto && (
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color:T.green }}>PMC Proof Photo</p>
                        <button onClick={()=>setSelImage(actionPhoto)} className="w-full rounded-xl overflow-hidden"
                          style={{ border:`1px solid ${T.cardBorder}`, padding:0, background:'none', cursor:'pointer' }}>
                          <img src={actionPhoto} alt="PMC action proof" className="w-full h-40 object-cover"/>
                        </button>
                      </div>
                    )}

                    {/* Answers list */}
                    <p className="text-[10px] font-black uppercase tracking-widest" style={{ color:T.textMuted }}>
                      Answers ({answers.length})
                    </p>
                    {answers.map((a: any, i: number) => {
                      const raw = (a.answer||'').toString().toLowerCase()
                      const isYes = raw === 'yes' || raw === 'y'
                      const isNo  = raw === 'no'  || raw === 'n'
                      const aPhotos = (a.photos||[]).filter((p: string) => p?.startsWith('https://'))
                      return (
                        <div key={i} className="rounded-xl p-3" style={{ background:T.surface, border:`1px solid ${T.cardBorder}` }}>
                          <p className="text-xs font-semibold" style={{ color:T.textPrimary }}>
                            {a.description||a.questionId?.replace(/_/g,' ')||`Q${i+1}`}
                          </p>
                          <p className="text-xs mt-0.5">
                            <span style={{ color:T.textMuted }}>Answer: </span>
                            <span style={{ color:isYes?T.green:isNo?T.red:T.textSecondary }}>{a.answer||'—'}</span>
                          </p>
                          {a.notes && <p className="text-[10px] mt-0.5 italic" style={{ color:T.textMuted }}>{a.notes}</p>}
                          {aPhotos.length > 0 && (
                            <div className="grid grid-cols-3 gap-1.5 mt-2">
                              {aPhotos.map((u: string, pi: number)=>(
                                <button key={pi} onClick={()=>setSelImage(u)} className="rounded-lg overflow-hidden group relative"
                                  style={{ border:`1px solid ${T.cardBorder}`, padding:0, background:'none', cursor:'pointer' }}>
                                  <img src={u} alt="" className="h-16 w-full object-cover"
                                    onError={e=>(e.currentTarget.parentElement!.style.display='none')}/>
                                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                                    <ZoomIn className="h-3 w-3 text-white opacity-0 group-hover:opacity-100 transition-opacity"/>
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* Right: all photos + meta */}
                  <div className="space-y-3">
                    {/* All photos */}
                    <div className="rounded-xl p-3" style={{ background:T.surface, border:`1px solid ${T.cardBorder}` }}>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-black uppercase tracking-widest flex items-center gap-1" style={{ color:T.textMuted }}>
                          <ImageIcon className="h-3 w-3"/> Photos
                        </p>
                        <span className="text-[10px] font-bold" style={{ color:T.accent }}>{photos.length}</span>
                      </div>
                      {photos.length === 0
                        ? <p className="text-xs" style={{ color:T.textMuted }}>No https:// photos.</p>
                        : <div className="grid grid-cols-2 gap-1.5">
                            {photos.map((u: string, i: number)=>(
                              <button key={i} onClick={()=>setSelImage(u)} className="rounded-lg overflow-hidden group relative"
                                style={{ border:`1px solid ${T.cardBorder}`, padding:0, background:'none', cursor:'pointer' }}>
                                <img src={u} alt="" className="h-20 w-full object-cover"
                                  onError={e=>(e.currentTarget.parentElement!.style.display='none')}/>
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                                  <ZoomIn className="h-4 w-4 text-white opacity-0 group-hover:opacity-100 transition-opacity"/>
                                </div>
                              </button>
                            ))}
                          </div>
                      }
                    </div>

                    {/* Meta */}
                    <div className="rounded-xl p-3" style={{ background:T.surface, border:`1px solid ${T.cardBorder}` }}>
                      <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color:T.textMuted }}>Report Details</p>
                      {[
                        ['Feeder Point', selReport.feederPointName||'—'],
                        ['Zone',         getZone(selReport)],
                        ['Employee',     selReport.userName||(selReport as any).submittedBy||'—'],
                        ['Trip',         `${(selReport as any).tripNumber||'?'} · ${(selReport as any).tripDate||'—'}`],
                        ['Submitted',    fmtDT(selReport.submittedAt||selReport.createdAt)],
                        ['Reviewed By',  (selReport as any).reviewedBy||'—'],
                        ['Report ID',    selReport.id.slice(-12)],
                      ].map(([l,v])=>(
                        <div key={l} className="flex items-start justify-between gap-2 py-1.5" style={{ borderTop:`1px solid ${T.gridLine}` }}>
                          <p className="text-[10px] font-semibold uppercase tracking-wider flex-shrink-0" style={{ color:T.textMuted }}>{l}</p>
                          <p className="text-xs text-right font-mono" style={{ color:T.textSecondary }}>{v}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        })()}

        {/* ── Lightbox ── */}
        {selImage && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
            style={{ background:'rgba(0,0,0,0.92)' }} onClick={()=>setSelImage(null)}>
            <button onClick={()=>setSelImage(null)} className="absolute top-6 right-6 flex items-center justify-center w-10 h-10 rounded-full"
              style={{ background:'rgba(255,255,255,0.15)', border:'none', cursor:'pointer', color:'#fff' }}>
              <X className="h-5 w-5"/>
            </button>
            <img src={selImage} alt="Preview"
              className="max-h-[88vh] max-w-[95vw] object-contain rounded-xl shadow-2xl"
              onClick={e=>e.stopPropagation()}/>
          </div>
        )}

      </div>
    </>
  )
}