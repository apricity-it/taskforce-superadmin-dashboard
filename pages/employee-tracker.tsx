import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import {
  AlertTriangle, Award, CheckCircle, Download, Eye, Image as ImageIcon,
  Loader2, Search, Sparkles, TrendingDown, TrendingUp, Users, X,
  Activity, BarChart2, Shield, ChevronRight, Zap, Clock, RefreshCw,
} from 'lucide-react'
import { DataService, EmployeePerformance, ComplianceReport, FeederPointSummary } from '@/lib/dataService'
import { AIService } from '@/lib/aiService'
import { StatusPieChart } from '@/components/charts/StatusPieChart'
import { SimpleBarChart } from '@/components/charts/SimpleBarChart'
import { SummaryTrendChart } from '@/components/charts/SummaryTrendChart'
import type { KeyboardEvent, RefObject } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'
import { getTokens } from '@/lib/dashboardTheme'
import { collection, query, where, getDocs, orderBy, limit, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import * as XLSX from 'xlsx'

// ─── Types ────────────────────────────────────────────────────────────────────
interface TripReport {
  id: string; userId: string; userName: string
  feederPointId: string; feederPointName: string
  tripNumber: number; tripDate: string; submittedAt: any
  status: string; dailyTripId?: string; teamName?: string
  answers?: any[]
}

interface DailyTripRow {
  date: string            // DD/MM/YYYY
  feederPointId: string
  feederPointName: string
  assignedTo: string
  trip1Time: string       // HH:MM or '—'
  trip2Time: string
  trip3Time: string
  trip1Status: string
  trip2Status: string
  trip3Status: string
  overallStatus: string   // all-approved / partial / pending / rejected
}

interface ShiftReport {
  id: string; userId: string; userName: string
  feederPointId: string; feederPointName: string
  shiftType: string; shiftDate: string; status: string
  slots: any; startedAt?: any; completedAt?: any; createdAt?: any; updatedAt?: any
}

interface ChronicPerf {
  userId: string; name: string
  totalShifts: number; completedShifts: number; inProgressShifts: number
  completionRate: number; totalSlots: number; completedSlots: number
  slotCompletionRate: number; lastShiftAt: Date | null
  shiftsByPoint: Record<string, { pointName: string; total: number; completed: number }>
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (v: number) => `${Math.round((v||0)*100)}%`
const fmtPct = (n: number, d: number) => d===0?'—':`${Math.round(n/d*100)}%`
const toInput = (d: Date) => { const c=new Date(d); c.setHours(0,0,0,0); return c.toISOString().slice(0,10) }

const nd = (v: any): Date|null => {
  if (!v) return null
  if (v instanceof Date) return v
  if (typeof v.toDate==='function') return v.toDate()
  if (typeof v._seconds==='number') return new Date(v._seconds*1000)
  if (typeof v==='string') { const d=new Date(v); return isNaN(d.getTime())?null:d }
  return null
}
const fmtDT = (v: any) => { const d=nd(v); return d?d.toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):'—' }
const fmtTime = (v: any) => { const d=nd(v); return d?d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}):'—' }
const fmtDateDMY = (s: string) => { if(!s) return '—'; const [y,m,day]=s.split('-'); return `${day}/${m}/${y}` }

const YES = new Set(['yes','y','true','1'])
const NO  = new Set(['no','n','false','0'])
const fmtQ = (v: string) => v.replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim().toLowerCase()||'question'

function getAnswers(r: any): any[] {
  if (Array.isArray(r.answers) && r.answers.length>0) return r.answers
  const out: any[] = []; let i=0
  while (r[String(i)]!==undefined) { out.push(r[String(i)]); i++ }
  return out
}

function buildQStats(reports: any[]) {
  const c = new Map<string,{yes:number;no:number}>()
  reports.forEach(r => {
    getAnswers(r).forEach((a:any) => {
      const q=fmtQ((a.questionId||a.description||'q').toString())
      const raw=(a.answer||'').toString().trim().toLowerCase().replace(/\s+/g,'')
      const b=YES.has(raw)?'yes':NO.has(raw)?'no':null; if(!b) return
      const cur=c.get(q)||{yes:0,no:0}; cur[b]++; c.set(q,cur)
    })
  })
  return Array.from(c.entries()).map(([name,t])=>({name,yes:t.yes,no:t.no}))
}

function countSlots(slots: any): {total:number;filled:number} {
  if (!slots) return {total:8,filled:0}
  const arr = Array.isArray(slots)?slots:Object.values(slots)
  const filled = arr.filter((s:any)=>s&&(s.photoUrl?.startsWith('https://')||s.status==='completed'||s.status==='late')).length
  return {total:Math.max(arr.length,8),filled}
}

// ─── Fast direct Firestore loaders (bypass DataService for speed) ─────────────

// Load feeder trip reports: query by tripDate range (indexed field)
async function loadTripReports(startDate: Date, endDate: Date): Promise<TripReport[]> {
  const startStr = toInput(startDate)
  const endStr   = toInput(endDate)
  // Two separate queries to avoid composite index requirements
  const q = query(
    collection(db, 'complianceReports'),
    where('tripDate', '>=', startStr),
    where('tripDate', '<=', endStr),
    limit(500)
  )
  const snap = await getDocs(q)
  return snap.docs
    .map(d => ({ id:d.id, ...d.data() } as TripReport))
    .filter(r => r.feederPointId) // only real trip reports (not legacy ones without fpId)
}

// Load shift reports: query by shiftDate range
async function loadShiftReports(startDate: Date, endDate: Date): Promise<ShiftReport[]> {
  const startStr = toInput(startDate)
  const endStr   = toInput(endDate)
  const q = query(
    collection(db, 'shiftReports'),
    where('shiftDate', '>=', startStr),
    where('shiftDate', '<=', endStr),
    limit(500)
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id:d.id, ...d.data() } as ShiftReport))
}

// Build trip tracking rows grouped by feederPoint+date+user
function buildTripRows(trips: TripReport[]): DailyTripRow[] {
  const map = new Map<string, TripReport[]>()
  trips.forEach(t => {
    const key = `${t.feederPointId}__${t.tripDate}__${t.userId}`
    const arr = map.get(key)||[]; arr.push(t); map.set(key,arr)
  })
  const rows: DailyTripRow[] = []
  map.forEach((tripList, key) => {
    const sorted = tripList.slice().sort((a,b)=>(a.tripNumber||0)-(b.tripNumber||0))
    const t1 = sorted.find(t=>(t.tripNumber||0)===1)
    const t2 = sorted.find(t=>(t.tripNumber||0)===2)
    const t3 = sorted.find(t=>(t.tripNumber||0)===3)
    const statuses = sorted.map(t=>t.status)
    const overall = statuses.every(s=>s==='approved')?'approved'
      : statuses.some(s=>s==='rejected')?'partial-issue'
      : statuses.some(s=>s==='approved')?'partial'
      : 'pending'
    rows.push({
      date: fmtDateDMY(sorted[0].tripDate),
      feederPointId: sorted[0].feederPointId,
      feederPointName: sorted[0].feederPointName||'—',
      assignedTo: sorted[0].userName||'—',
      trip1Time: t1?fmtTime(t1.submittedAt):'—',
      trip2Time: t2?fmtTime(t2.submittedAt):'—',
      trip3Time: t3?fmtTime(t3.submittedAt):'—',
      trip1Status: t1?.status||'—',
      trip2Status: t2?.status||'—',
      trip3Status: t3?.status||'—',
      overallStatus: overall,
    })
  })
  return rows.sort((a,b)=>b.date.localeCompare(a.date))
}

// Build chronic performance from shift reports
function buildChronicPerf(shifts: ShiftReport[]): ChronicPerf[] {
  const map = new Map<string, ShiftReport[]>()
  shifts.forEach(s => { const arr=map.get(s.userId)||[]; arr.push(s); map.set(s.userId,arr) })
  const result: ChronicPerf[] = []
  map.forEach((list, userId) => {
    const name = list[0]?.userName||userId
    const completed = list.filter(s=>s.status==='completed').length
    const inProg    = list.filter(s=>s.status==='in_progress').length
    let totalSlots=0, completedSlots=0
    const byPoint: Record<string,{pointName:string;total:number;completed:number}> = {}
    list.forEach(s => {
      const sc=countSlots(s.slots); totalSlots+=sc.total; completedSlots+=sc.filled
      if (!byPoint[s.feederPointId]) byPoint[s.feederPointId]={pointName:s.feederPointName,total:0,completed:0}
      byPoint[s.feederPointId].total++
      if (s.status==='completed') byPoint[s.feederPointId].completed++
    })
    const dates = list.map(s=>nd(s.completedAt||s.updatedAt||s.createdAt)).filter(Boolean) as Date[]
    const lastShiftAt = dates.length?new Date(Math.max(...dates.map(d=>d.getTime()))):null
    result.push({ userId, name, totalShifts:list.length, completedShifts:completed, inProgressShifts:inProg,
      completionRate:list.length?completed/list.length:0, totalSlots, completedSlots,
      slotCompletionRate:totalSlots?completedSlots/totalSlots:0, lastShiftAt, shiftsByPoint:byPoint })
  })
  return result.sort((a,b)=>b.completionRate-a.completionRate)
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function SBadge({ label, color }: { label: string; color: string }) {
  return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap"
      style={{background:`${color}18`,border:`1px solid ${color}30`,color}}>
      {label}
    </span>
  )
}

function KpiCard({ label, value, sub, icon: Icon, color, T }: any) {
  return (
    <div className="rounded-2xl p-4" style={{background:T.card,border:`1px solid ${T.cardBorder}`}}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{color:T.textMuted}}>{label}</p>
        <div className="flex h-8 w-8 items-center justify-center rounded-xl" style={{background:`${color}15`}}>
          <Icon className="h-4 w-4" style={{color}} />
        </div>
      </div>
      <p className="text-2xl font-black" style={{color,fontFamily:"'JetBrains Mono',monospace"}}>{value}</p>
      {sub && <p className="text-[10px] mt-1" style={{color:T.textMuted}}>{sub}</p>}
    </div>
  )
}

function RateBar({ rate, T }: { rate: number; T: any }) {
  const pct = Math.round(rate*100)
  const color = pct>=70?T.green:pct>=40?T.amber:T.red
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{background:T.gridLine,minWidth:50}}>
        <div className="h-full rounded-full" style={{width:`${pct}%`,background:color}} />
      </div>
      <span className="text-xs font-bold" style={{color}}>{pct}%</span>
    </div>
  )
}

function TabBar({ active, onChange, T }: { active:'feeder'|'chronic'; onChange:(t:'feeder'|'chronic')=>void; T: any }) {
  return (
    <div className="flex gap-2 p-1 rounded-xl" style={{background:T.surface,display:'inline-flex'}}>
      {(['feeder','chronic'] as const).map(tab => {
        const isActive = active===tab
        const color = tab==='feeder'?T.accent:T.gold
        const Icon  = tab==='feeder'?Zap:Clock
        return (
          <button key={tab} onClick={()=>onChange(tab)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold"
            style={{background:isActive?T.card:'transparent',color:isActive?color:T.textSecondary,
              border:`1px solid ${isActive?color:T.cardBorder}`,cursor:'pointer',
              boxShadow:isActive?`0 2px 8px ${color}20`:'none'}}>
            <Icon className="h-4 w-4" /> {tab==='feeder'?'Feeder Employees':'Chronic Employees'}
          </button>
        )
      })}
    </div>
  )
}

function ChartNote({ note, T }: { note: string; T: any }) {
  return <p className="text-[10px] mt-1 italic" style={{color:T.textMuted}}>📊 {note}</p>
}

// Trip status color
const tripStatusColor = (s: string, T: any) => ({
  approved:T.green, rejected:T.red, pending:T.amber,
  requires_action:T.purple, action_taken:T.green, '—':T.textMuted
}[s]??T.textMuted)

const overallStatusColor = (s: string, T: any) => ({
  approved:T.green,'partial-issue':T.red,partial:T.amber,pending:T.textMuted
}[s]??T.textMuted)

const overallStatusLabel = (s: string) => ({
  approved:'All Approved','partial-issue':'Issue Found',partial:'Partial',pending:'Pending'
}[s]??s)

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function EmployeeTrackerPage() {
  const { theme } = useTheme(); const dark=theme==='dark'; const T=getTokens(dark)
  const router = useRouter()
  const { user } = useAuth()
  const isPmcMember = user?.role==='pmc_member'

  // dates
  const [startDateInput, setStartDateInput] = useState(() => { const d=new Date(); d.setDate(d.getDate()-30); return toInput(d) })
  const [endDateInput,   setEndDateInput]   = useState(() => toInput(new Date()))
  const [activeTab,      setActiveTab]      = useState<'feeder'|'chronic'>('feeder')
  const [searchTerm,     setSearchTerm]     = useState('')

  // raw data
  const [tripReports,   setTripReports]   = useState<TripReport[]>([])
  const [shiftReports,  setShiftReports]  = useState<ShiftReport[]>([])
  const [feederLoading, setFeederLoading] = useState(false)
  const [chronicLoading,setChronicLoading]= useState(false)

  // sub-views
  const [feederSubView, setFeederSubView] = useState<'performance'|'trips'|'overview'>('performance')
  const [selectedFPKey, setSelectedFPKey] = useState<string|null>(null)
  const [feederAI,      setFeederAI]      = useState<string|null>(null)
  const [feederAIing,   setFeederAIing]   = useState(false)
  const [feederQStats,  setFeederQStats]  = useState<{name:string;yes:number;no:number}[]>([])
  const [selReport,     setSelReport]     = useState<any>(null)
  const [selImage,      setSelImage]      = useState<string|null>(null)

  // chronic sub-views
  const [chronicSubView,setChronicSubView]= useState<'performance'|'shifts'>('performance')
  const [selShift,      setSelShift]      = useState<ShiftReport|null>(null)

  // refs
  const statsRef   = useRef<HTMLDivElement>(null)
  const empRef     = useRef<HTMLDivElement>(null)
  const overviewRef= useRef<HTMLDivElement>(null)
  const tripsRef   = useRef<HTMLDivElement>(null)

  // date validation
  const { startDate, endDate, dateError } = useMemo(() => {
    if (!startDateInput||!endDateInput) return {startDate:null,endDate:null,dateError:'Select both dates.'}
    const s=new Date(startDateInput); s.setHours(0,0,0,0)
    const e=new Date(endDateInput);   e.setHours(23,59,59,999)
    if (isNaN(s.getTime())||isNaN(e.getTime())) return {startDate:null,endDate:null,dateError:'Invalid dates.'}
    if (s>e) return {startDate:null,endDate:null,dateError:'Start must be before end.'}
    return {startDate:s,endDate:e,dateError:null}
  },[startDateInput,endDateInput])

  // loaders — lazy per tab
  const loadFeeder = useCallback(async () => {
    if (!startDate||!endDate||isPmcMember) return
    setFeederLoading(true)
    try {
      const trips = await loadTripReports(startDate, endDate)
      setTripReports(trips)
    } catch(e) { console.error(e) }
    finally { setFeederLoading(false) }
  }, [startDate, endDate, isPmcMember])

  const loadChronic = useCallback(async () => {
    if (!startDate||!endDate||isPmcMember) return
    setChronicLoading(true)
    try {
      const shifts = await loadShiftReports(startDate, endDate)
      setShiftReports(shifts)
    } catch(e) { console.error(e) }
    finally { setChronicLoading(false) }
  }, [startDate, endDate, isPmcMember])

  useEffect(() => {
    if (dateError||isPmcMember) return
    if (activeTab==='feeder') loadFeeder()
    else loadChronic()
  }, [activeTab, startDate, endDate])

  useEffect(() => {
    setFeederAI(null); setFeederAIing(false); setFeederQStats([])
    setSelReport(null); setSelImage(null)
  }, [selectedFPKey, startDateInput, endDateInput])

  // ── Feeder derived ──
  const feederPerf = useMemo(() => {
    const map = new Map<string,{name:string;total:number;approved:number;rejected:number;pending:number;lastAt:Date|null}>()
    tripReports.forEach(t => {
      const cur = map.get(t.userId)||{name:t.userName||t.userId,total:0,approved:0,rejected:0,pending:0,lastAt:null}
      cur.total++
      if (t.status==='approved') cur.approved++
      else if (t.status==='rejected') cur.rejected++
      else cur.pending++
      const d = nd(t.submittedAt)
      if (d&&(!cur.lastAt||d>cur.lastAt)) cur.lastAt=d
      map.set(t.userId,cur)
    })
    return Array.from(map.entries()).map(([userId,v])=>({
      userId, name:v.name, total:v.total, approved:v.approved,
      rejected:v.rejected, pending:v.pending,
      approvalRate:v.total?v.approved/v.total:0, lastAt:v.lastAt,
    })).sort((a,b)=>b.approvalRate-a.approvalRate)
  }, [tripReports])

  const feederFiltered = useMemo(() => {
    const term=searchTerm.trim().toLowerCase()
    if (!term) return feederPerf
    return feederPerf.filter(p=>p.name.toLowerCase().includes(term))
  }, [feederPerf, searchTerm])

  const feederStats = useMemo(() => ({
    employees: feederPerf.length,
    total:     feederPerf.reduce((a,p)=>a+p.total,0),
    approved:  feederPerf.reduce((a,p)=>a+p.approved,0),
    rejected:  feederPerf.reduce((a,p)=>a+p.rejected,0),
    pending:   feederPerf.reduce((a,p)=>a+p.pending,0),
    avgRate:   feederPerf.length?feederPerf.reduce((a,p)=>a+p.approvalRate,0)/feederPerf.filter(p=>p.total>0).length||0:0,
  }), [feederPerf])

  // FP overview - FEEDER ONLY
  const feederFPMap = useMemo(() => {
    const map = new Map<string,{name:string;total:number;approved:number;rejected:number;pending:number;reports:TripReport[]}>()
    tripReports.forEach(t => {
      const cur=map.get(t.feederPointId)||{name:t.feederPointName||'—',total:0,approved:0,rejected:0,pending:0,reports:[]}
      cur.total++; cur.reports.push(t)
      if (t.status==='approved') cur.approved++
      else if (t.status==='rejected') cur.rejected++
      else cur.pending++
      map.set(t.feederPointId,cur)
    })
    return map
  }, [tripReports])

  const feederFPs = useMemo(() => Array.from(feederFPMap.entries()).map(([id,v])=>({id,key:id,...v}))
    .sort((a,b)=>b.total-a.total), [feederFPMap])

  const selectedFP = useMemo(() => selectedFPKey?feederFPMap.get(selectedFPKey)||null:null, [selectedFPKey, feederFPMap])

  const fpStatusData = useMemo(() => {
    if (!selectedFP) return []
    return [
      selectedFP.approved && {name:'Approved',value:selectedFP.approved,color:T.green},
      selectedFP.rejected && {name:'Rejected',value:selectedFP.rejected,color:T.red},
      selectedFP.pending  && {name:'Pending', value:selectedFP.pending, color:T.amber},
    ].filter(Boolean) as any[]
  }, [selectedFP, T])

  const fpTripData = useMemo(() => {
    if (!selectedFP) return []
    const c=new Map<string,number>()
    selectedFP.reports.forEach(r=>{
      const l=r.tripNumber?`Trip ${r.tripNumber}`:'?'
      c.set(l,(c.get(l)||0)+1)
    })
    const pal=[T.accent,T.green,T.amber]
    return Array.from(c.entries()).map(([name,value],i)=>({name,value,color:pal[i%pal.length]}))
  }, [selectedFP, T])

  // Trip tracking rows
  const tripRows = useMemo(() => {
    let rows = buildTripRows(tripReports)
    const term=searchTerm.trim().toLowerCase()
    if (term) rows=rows.filter(r=>r.feederPointName.toLowerCase().includes(term)||r.assignedTo.toLowerCase().includes(term))
    return rows
  }, [tripReports, searchTerm])

  // ── Chronic derived ──
  const chronicPerf = useMemo(() => buildChronicPerf(shiftReports), [shiftReports])

  const chronicFiltered = useMemo(() => {
    const term=searchTerm.trim().toLowerCase()
    if (!term) return chronicPerf
    return chronicPerf.filter(p=>p.name.toLowerCase().includes(term))
  }, [chronicPerf, searchTerm])

  const chronicStats = useMemo(() => ({
    employees:  chronicPerf.length,
    total:      chronicPerf.reduce((a,p)=>a+p.totalShifts,0),
    completed:  chronicPerf.reduce((a,p)=>a+p.completedShifts,0),
    totalSlots: chronicPerf.reduce((a,p)=>a+p.totalSlots,0),
    doneSlots:  chronicPerf.reduce((a,p)=>a+p.completedSlots,0),
    inProg:     chronicPerf.reduce((a,p)=>a+p.inProgressShifts,0),
  }), [chronicPerf])

  // Chronic FP overview
  const chronicFPMap = useMemo(() => {
    const map = new Map<string,{name:string;total:number;completed:number;inProg:number;shifts:ShiftReport[]}>()
    shiftReports.forEach(s => {
      const cur=map.get(s.feederPointId)||{name:s.feederPointName||'—',total:0,completed:0,inProg:0,shifts:[]}
      cur.total++; cur.shifts.push(s)
      if (s.status==='completed') cur.completed++
      else cur.inProg++
      map.set(s.feederPointId,cur)
    })
    return map
  }, [shiftReports])

  const chronicFPs = useMemo(() => Array.from(chronicFPMap.entries()).map(([id,v])=>({id,...v}))
    .sort((a,b)=>b.total-a.total), [chronicFPMap])

  // Shift detail rows
  const shiftRows = useMemo(() => {
    let list = [...shiftReports].sort((a,b)=>b.shiftDate.localeCompare(a.shiftDate))
    const term=searchTerm.trim().toLowerCase()
    if (term) list=list.filter(s=>s.userName?.toLowerCase().includes(term)||s.feederPointName?.toLowerCase().includes(term))
    return list
  }, [shiftReports, searchTerm])

  // ── Export ──
  const exportTripList = () => {
    const rows = tripRows.map((r,i)=>({
      'S.No': i+1,
      'Date (DD/MM/YYYY)': r.date,
      'Feederpoint': r.feederPointName,
      'Assigned To': r.assignedTo,
      'Trip 1 (Submission Time)': r.trip1Time,
      'Trip 2 (Submission Time)': r.trip2Time,
      'Trip 3 (Submission Time)': r.trip3Time,
      'Trip 1 Status': r.trip1Status,
      'Trip 2 Status': r.trip2Status,
      'Trip 3 Status': r.trip3Status,
      'Status': overallStatusLabel(r.overallStatus),
    }))
    const ws=XLSX.utils.json_to_sheet(rows)
    const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'Trip Tracking')
    const url=URL.createObjectURL(new Blob([XLSX.write(wb,{bookType:'xlsx',type:'array'})],
      {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}))
    const a=document.createElement('a'); a.href=url
    a.download=`TripTracking_${startDateInput}_to_${endDateInput}.xlsx`; a.click(); URL.revokeObjectURL(url)
  }

  const exportShiftList = () => {
    const rows = shiftRows.map((s,i)=>({
      'S.No': i+1,
      'Date': s.shiftDate,
      'Chronic Point': s.feederPointName,
      'Employee': s.userName,
      'Shift Type': s.shiftType,
      'Status': s.status,
      'Slots Filled': countSlots(s.slots).filled,
      'Total Slots': countSlots(s.slots).total,
      'Started At': fmtDT(s.startedAt),
      'Completed At': fmtDT(s.completedAt),
    }))
    const ws=XLSX.utils.json_to_sheet(rows)
    const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'Shift Reports')
    const url=URL.createObjectURL(new Blob([XLSX.write(wb,{bookType:'xlsx',type:'array'})],
      {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}))
    const a=document.createElement('a'); a.href=url
    a.download=`ShiftReports_${startDateInput}_to_${endDateInput}.xlsx`; a.click(); URL.revokeObjectURL(url)
  }

  // AI summary
  const generateAI = async () => {
    if (!selectedFP||selectedFP.total===0) return
    const qStats=buildQStats(selectedFP.reports); setFeederQStats(qStats)
    setFeederAIing(true); setFeederAI(null)
    try {
      const {summary:aiText}=await AIService.generateAnalysis({
        date: startDateInput||new Date().toISOString(),
        metrics:{totalUsers:new Set(selectedFP.reports.map(r=>r.userId)).size,newRegistrations:0,
          totalComplaints:selectedFP.total,resolvedComplaints:selectedFP.approved,
          activeFeederPoints:1,completedInspections:selectedFP.total},
        performance:{complaintResolutionRate:Math.round(selectedFP.approved/selectedFP.total*100),
          userGrowth:0,operationalEfficiency:Math.round((selectedFP.approved+selectedFP.pending)/selectedFP.total*100)},
        rawReports:selectedFP.reports
      })
      setFeederAI(aiText?.trim()||null)
    } catch(e) { console.error(e); setFeederAI('Unable to generate AI summary. Please try again.') }
    finally { setFeederAIing(false) }
  }

  const downloadAI = () => {
    if (!selectedFP) return
    const qLines=feederQStats.map(s=>`"${s.name}": ${s.yes} yes / ${s.no} no`)
    const text=[feederAI,qLines.length?`Key Questions:\n${qLines.join('\n')}`:null].filter(Boolean).join('\n\n')
    if (!text) return
    const blob=new Blob([text],{type:'text/plain'})
    const url=URL.createObjectURL(blob); const a=document.createElement('a')
    a.href=url; a.download=`FP_${(selectedFP.name||'report').replace(/\s+/g,'_')}.txt`
    a.click(); URL.revokeObjectURL(url)
  }

  const inputSt={background:T.surface,border:`1px solid ${T.cardBorder}`,color:T.textPrimary,borderRadius:10,padding:'8px 12px',fontSize:13,outline:'none',width:'100%'}
  const scColor=(s:string)=>({approved:T.green,rejected:T.red,pending:T.amber,requires_action:T.purple,action_taken:T.green,completed:T.green,in_progress:T.accent}[s]??T.textMuted)
  const scrollTo=(ref:RefObject<HTMLDivElement>)=>ref.current?.scrollIntoView({behavior:'smooth',block:'start'})
  const isLoading=activeTab==='feeder'?feederLoading:chronicLoading

  if (isPmcMember) return (
    <div className="flex items-center justify-center h-64">
      <div className="rounded-2xl p-8 text-center" style={{background:T.card,border:`1px solid ${T.cardBorder}`}}>
        <Shield className="h-10 w-10 mx-auto mb-3 opacity-30" style={{color:T.red}} />
        <h2 className="text-base font-bold" style={{color:T.textPrimary}}>Access Restricted</h2>
      </div>
    </div>
  )

  return (
    <>
      <Head><title>Employee Tracker | Taskforce</title></Head>
      <div className="space-y-5">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{background:T.accentDim,border:`1px solid ${T.accentBorder}`}}>
            <Activity className="h-6 w-6" style={{color:T.accent}} />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight" style={{color:T.textPrimary}}>Employee Work Tracker</h1>
            <p className="text-sm" style={{color:T.textMuted}}>Feeder trip reports & chronic shift performance — separate views, fast loading</p>
          </div>
        </div>

        {/* Control bar */}
        <div className="rounded-2xl p-4 space-y-3" style={{background:T.card,border:`1px solid ${T.cardBorder}`}}>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{color:T.textMuted}}>Start Date</label>
              <input type="date" value={startDateInput} max={endDateInput} onChange={e=>setStartDateInput(e.target.value)} style={{...inputSt,width:'auto'}} />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{color:T.textMuted}}>End Date</label>
              <input type="date" value={endDateInput} min={startDateInput} onChange={e=>setEndDateInput(e.target.value)} style={{...inputSt,width:'auto'}} />
            </div>
            <div className="flex-1 min-w-40">
              <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{color:T.textMuted}}>Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{color:T.textMuted}} />
                <input value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} placeholder="Name, feeder point…" style={{...inputSt,paddingLeft:32}} />
              </div>
            </div>
            <button onClick={()=>activeTab==='feeder'?loadFeeder():loadChronic()}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold"
              style={{background:T.surface,border:`1px solid ${T.cardBorder}`,color:T.textSecondary,cursor:'pointer'}}>
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </button>
          </div>
          {dateError && <p className="text-xs flex items-center gap-1" style={{color:T.red}}><AlertTriangle className="h-3.5 w-3.5"/>{dateError}</p>}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1" style={{borderTop:`1px solid ${T.gridLine}`}}>
            <TabBar active={activeTab} onChange={tab=>{setActiveTab(tab);setSearchTerm('');setFeederSubView('performance');setChronicSubView('performance')}} T={T} />
            {/* Sub-view pills */}
            <div className="flex gap-2">
              {activeTab==='feeder' && [
                {id:'performance',label:'Performance'},
                {id:'trips',label:'Trip Tracking'},
                {id:'overview',label:'FP Overview'},
              ].map(v=>(
                <button key={v.id} onClick={()=>setFeederSubView(v.id as any)}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold"
                  style={{background:feederSubView===v.id?T.accentDim:T.surface,
                    color:feederSubView===v.id?T.accent:T.textSecondary,
                    border:`1px solid ${feederSubView===v.id?T.accentBorder:T.cardBorder}`,cursor:'pointer'}}>
                  {v.label}
                </button>
              ))}
              {activeTab==='chronic' && [
                {id:'performance',label:'Performance'},
                {id:'shifts',label:'Shift Details'},
              ].map(v=>(
                <button key={v.id} onClick={()=>setChronicSubView(v.id as any)}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold"
                  style={{background:chronicSubView===v.id?`${T.gold}15`:T.surface,
                    color:chronicSubView===v.id?T.gold:T.textSecondary,
                    border:`1px solid ${chronicSubView===v.id?`${T.gold}40`:T.cardBorder}`,cursor:'pointer'}}>
                  {v.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16 gap-3">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-t-transparent"
              style={{borderColor:`${activeTab==='feeder'?T.accent:T.gold}30`,borderTopColor:activeTab==='feeder'?T.accent:T.gold}} />
            <p className="text-sm font-semibold" style={{color:T.textSecondary}}>
              Loading {activeTab==='feeder'?'feeder trip':'chronic shift'} data…
            </p>
          </div>
        ) : (
          <>
            {/* ══════════════ FEEDER TAB ══════════════ */}
            {activeTab==='feeder' && (
              <>
                {/* KPIs */}
                <div ref={statsRef} className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <KpiCard label="Feeder Employees" value={feederStats.employees}             sub={`${tripReports.length} total trips loaded`}                    icon={Users}        color={T.accent} T={T}/>
                  <KpiCard label="Total Trips"       value={feederStats.total}                sub={`${feederStats.approved} approved · ${feederStats.pending} pending`} icon={CheckCircle}  color={T.green}  T={T}/>
                  <KpiCard label="Avg Approval Rate" value={`${Math.round(feederStats.avgRate*100)}%`} sub={`${feederStats.rejected} rejected across all trips`}   icon={TrendingUp}   color={T.purple} T={T}/>
                  <KpiCard label="Pending Review"    value={feederStats.pending}              sub="Trips awaiting review"                                           icon={AlertTriangle} color={T.amber}  T={T}/>
                </div>

                {/* PERFORMANCE sub-view */}
                {feederSubView==='performance' && (
                  <>
                    {/* Top/Lowest */}
                    {feederPerf.length>0 && (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {[
                          {title:'Top Performers',  list:feederPerf.slice(0,3),                                           isTop:true,  icon:Award       },
                          {title:'Needs Attention', list:[...feederPerf].sort((a,b)=>a.approvalRate-b.approvalRate).slice(0,3), isTop:false, icon:TrendingDown},
                        ].map(section=>(
                          <div key={section.title} className="rounded-2xl p-4" style={{background:T.card,border:`1px solid ${T.cardBorder}`}}>
                            <div className="flex items-center gap-2 mb-3">
                              <section.icon className="h-4 w-4" style={{color:section.isTop?T.green:T.red}} />
                              <p className="text-sm font-bold" style={{color:T.textPrimary}}>{section.title}</p>
                              <SBadge label="Feeder" color={T.accent}/>
                            </div>
                            <div className="space-y-2">
                              {section.list.map((p,i)=>{
                                const medals=['🥇','🥈','🥉']
                                const color=section.isTop?T.green:T.red
                                return (
                                  <div key={p.userId} className="rounded-xl px-3 py-2.5 flex items-center gap-3"
                                    style={{background:`${color}08`,border:`1px solid ${color}20`}}>
                                    <span className="text-lg">{medals[i]}</span>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-bold truncate" style={{color:T.textPrimary}}>{p.name}</p>
                                      <p className="text-[10px]" style={{color:T.textMuted}}>{p.total} trips</p>
                                    </div>
                                    <span className="text-sm font-black" style={{color,fontFamily:"'JetBrains Mono',monospace"}}>{Math.round(p.approvalRate*100)}%</span>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Employee performance table */}
                    <div ref={empRef} className="rounded-2xl overflow-hidden" style={{background:T.card,border:`1px solid ${T.cardBorder}`}}>
                      <div className="px-5 py-4 flex items-center gap-2" style={{borderBottom:`1px solid ${T.cardBorder}`}}>
                        <Zap className="h-4 w-4" style={{color:T.accent}} />
                        <div>
                          <h2 className="text-base font-bold" style={{color:T.textPrimary}}>Feeder Employee Performance</h2>
                          <p className="text-xs" style={{color:T.textMuted}}>Grouped by employee — based on all trip submissions in the date range</p>
                        </div>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full" style={{fontSize:12}}>
                          <thead>
                            <tr style={{background:T.surface,borderBottom:`1px solid ${T.cardBorder}`}}>
                              {['#','Employee','Total Trips','Approved','Rejected','Pending','Approval Rate','Last Trip'].map(h=>(
                                <th key={h} className="text-left px-4 py-3 font-semibold uppercase tracking-wider whitespace-nowrap" style={{fontSize:10,color:T.accent}}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {feederFiltered.length===0 ? (
                              <tr><td colSpan={8} className="px-4 py-10 text-center text-sm" style={{color:T.textMuted}}>No feeder trips in this range.</td></tr>
                            ) : feederFiltered.map((emp,i)=>(
                              <tr key={emp.userId} style={{borderBottom:`1px solid ${T.gridLine}`}}
                                onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background=T.surface}
                                onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background='transparent'}>
                                <td className="px-4 py-3" style={{color:T.textMuted}}>{i+1}</td>
                                <td className="px-4 py-3"><p className="font-semibold" style={{color:T.textPrimary}}>{emp.name}</p></td>
                                <td className="px-4 py-3 font-bold" style={{color:T.textPrimary,fontFamily:"'JetBrains Mono',monospace"}}>{emp.total}</td>
                                <td className="px-4 py-3 font-bold" style={{color:T.green,fontFamily:"'JetBrains Mono',monospace"}}>{emp.approved}</td>
                                <td className="px-4 py-3 font-bold" style={{color:T.red,fontFamily:"'JetBrains Mono',monospace"}}>{emp.rejected}</td>
                                <td className="px-4 py-3 font-bold" style={{color:T.amber,fontFamily:"'JetBrains Mono',monospace"}}>{emp.pending}</td>
                                <td className="px-4 py-3 min-w-[120px]"><RateBar rate={emp.approvalRate} T={T}/></td>
                                <td className="px-4 py-3" style={{color:T.textSecondary}}>{fmtDT(emp.lastAt)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}

                {/* TRIP TRACKING sub-view */}
                {feederSubView==='trips' && (
                  <div ref={tripsRef} className="rounded-2xl overflow-hidden" style={{background:T.card,border:`1px solid ${T.cardBorder}`}}>
                    <div className="px-5 py-4 flex items-center justify-between" style={{borderBottom:`1px solid ${T.cardBorder}`}}>
                      <div>
                        <h2 className="text-base font-bold" style={{color:T.textPrimary}}>Trip Tracking</h2>
                        <p className="text-xs mt-0.5" style={{color:T.textMuted}}>
                          One row per feeder point per day per employee. Shows Trip 1/2/3 submission times.
                        </p>
                      </div>
                      <button onClick={exportTripList}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold"
                        style={{background:T.green,color:'#fff',border:'none',cursor:'pointer'}}>
                        <Download className="h-3.5 w-3.5"/> Download Excel
                      </button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full" style={{fontSize:11}}>
                        <thead>
                          <tr style={{background:T.surface,borderBottom:`1px solid ${T.cardBorder}`}}>
                            {['S.No','Date','Feeder Point','Assigned To','Trip 1 Time','Trip 2 Time','Trip 3 Time','Status'].map(h=>(
                              <th key={h} className="text-left px-3 py-3 font-semibold uppercase tracking-wider whitespace-nowrap" style={{fontSize:9,color:T.accent}}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {tripRows.length===0 ? (
                            <tr><td colSpan={8} className="px-4 py-10 text-center text-sm" style={{color:T.textMuted}}>No trip records in this date range.</td></tr>
                          ) : tripRows.map((row,i)=>{
                            const sc=overallStatusColor(row.overallStatus,T)
                            return (
                              <tr key={`${row.feederPointId}-${row.date}-${row.assignedTo}`} style={{borderBottom:`1px solid ${T.gridLine}`}}
                                onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background=T.surface}
                                onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background='transparent'}>
                                <td className="px-3 py-2.5" style={{color:T.textMuted}}>{i+1}</td>
                                <td className="px-3 py-2.5 whitespace-nowrap font-mono" style={{color:T.textSecondary,fontSize:11}}>{row.date}</td>
                                <td className="px-3 py-2.5 max-w-[160px]">
                                  <p className="font-semibold truncate" style={{color:T.textPrimary}}>{row.feederPointName}</p>
                                </td>
                                <td className="px-3 py-2.5" style={{color:T.textSecondary}}>{row.assignedTo}</td>
                                {[{time:row.trip1Time,status:row.trip1Status},{time:row.trip2Time,status:row.trip2Status},{time:row.trip3Time,status:row.trip3Status}].map((trip,ti)=>(
                                  <td key={ti} className="px-3 py-2.5">
                                    {trip.time==='—'
                                      ? <span style={{color:T.textMuted}}>—</span>
                                      : <div>
                                          <span className="font-mono font-bold" style={{color:T.textPrimary}}>{trip.time}</span>
                                          <div className="mt-0.5"><SBadge label={trip.status} color={scColor(trip.status)}/></div>
                                        </div>
                                    }
                                  </td>
                                ))}
                                <td className="px-3 py-2.5">
                                  <SBadge label={overallStatusLabel(row.overallStatus)} color={sc}/>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="px-5 py-3 text-[10px]" style={{color:T.textMuted,borderTop:`1px solid ${T.gridLine}`}}>
                      📊 <strong>Status calculation:</strong> "All Approved" = all submitted trips are approved. "Issue Found" = at least one trip rejected. "Partial" = mix of approved/pending. "Pending" = no approved trips yet.
                    </div>
                  </div>
                )}

                {/* FP OVERVIEW sub-view — FEEDER ONLY */}
                {feederSubView==='overview' && (
                  <div ref={overviewRef} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* FP list */}
                    <div className="rounded-2xl overflow-hidden" style={{background:T.card,border:`1px solid ${T.cardBorder}`}}>
                      <div className="px-5 py-4 flex items-center justify-between" style={{borderBottom:`1px solid ${T.cardBorder}`}}>
                        <div>
                          <h2 className="text-base font-bold" style={{color:T.textPrimary}}>Feeder Point Overview</h2>
                          <p className="text-xs mt-0.5" style={{color:T.textMuted}}>Only feeder (trip-based) points shown here</p>
                        </div>
                        <span className="text-xs font-semibold px-2 py-1 rounded-full" style={{background:T.accentDim,color:T.accent}}>{feederFPs.length} points</span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full" style={{fontSize:12}}>
                          <thead>
                            <tr style={{background:T.surface,borderBottom:`1px solid ${T.cardBorder}`}}>
                              {['Feeder Point','Total','Approved','Rejected','Pending'].map(h=>(
                                <th key={h} className="text-left px-4 py-3 font-semibold uppercase tracking-wider whitespace-nowrap" style={{fontSize:10,color:T.accent}}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {feederFPs.length===0
                              ? <tr><td colSpan={5} className="px-4 py-8 text-center text-sm" style={{color:T.textMuted}}>No feeder point data.</td></tr>
                              : feederFPs.map(fp=>(
                                <tr key={fp.id} role="button" tabIndex={0}
                                  onClick={()=>setSelectedFPKey(fp.id)}
                                  style={{borderBottom:`1px solid ${T.gridLine}`,cursor:'pointer',background:selectedFPKey===fp.id?T.accentDim:'transparent'}}
                                  onMouseEnter={e=>{ if(selectedFPKey!==fp.id)(e.currentTarget as HTMLElement).style.background=T.surface }}
                                  onMouseLeave={e=>{ if(selectedFPKey!==fp.id)(e.currentTarget as HTMLElement).style.background='transparent' }}>
                                  <td className="px-4 py-3">
                                    <p className="font-semibold" style={{color:selectedFPKey===fp.id?T.accent:T.textPrimary}}>{fp.name}</p>
                                  </td>
                                  <td className="px-4 py-3 font-bold" style={{color:T.textPrimary,fontFamily:"'JetBrains Mono',monospace"}}>{fp.total}</td>
                                  <td className="px-4 py-3 font-bold" style={{color:T.green,fontFamily:"'JetBrains Mono',monospace"}}>{fp.approved}</td>
                                  <td className="px-4 py-3 font-bold" style={{color:T.red,fontFamily:"'JetBrains Mono',monospace"}}>{fp.rejected}</td>
                                  <td className="px-4 py-3 font-bold" style={{color:T.amber,fontFamily:"'JetBrains Mono',monospace"}}>{fp.pending}</td>
                                </tr>
                              ))
                            }
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* FP Detail */}
                    <div className="rounded-2xl overflow-hidden" style={{background:T.card,border:`1px solid ${T.cardBorder}`}}>
                      <div className="px-5 py-4 flex items-center justify-between" style={{borderBottom:`1px solid ${T.cardBorder}`}}>
                        <div>
                          <h2 className="text-base font-bold" style={{color:T.textPrimary}}>
                            {selectedFP?selectedFP.name:'Select a Feeder Point'}
                          </h2>
                          <p className="text-xs mt-0.5" style={{color:T.textMuted}}>
                            {selectedFP?`${selectedFP.total} trips · ${new Set(selectedFP.reports.map(r=>r.userId)).size} contributors`:'Click a row on the left'}
                          </p>
                        </div>
                        {selectedFP && (
                          <button onClick={generateAI} disabled={feederAIing||selectedFP.total===0}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold disabled:opacity-50"
                            style={{background:T.accentDim,border:`1px solid ${T.accentBorder}`,color:T.accent,cursor:'pointer'}}>
                            {feederAIing?<Loader2 className="h-3.5 w-3.5 animate-spin"/>:<Sparkles className="h-3.5 w-3.5"/>}
                            {feederAIing?'Analyzing…':'AI Summary'}
                          </button>
                        )}
                      </div>
                      {!selectedFP ? (
                        <div className="flex flex-col items-center py-16 gap-2">
                          <BarChart2 className="h-10 w-10 opacity-20" style={{color:T.accent}}/>
                          <p className="text-sm" style={{color:T.textMuted}}>Select a feeder point to view trip details.</p>
                        </div>
                      ) : (
                        <div className="p-4 space-y-4 overflow-y-auto" style={{maxHeight:600}}>
                          {/* Charts */}
                          <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-xl p-3" style={{background:T.surface,border:`1px solid ${T.cardBorder}`}}>
                              <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{color:T.textMuted}}>Status Breakdown</p>
                              <StatusPieChart data={fpStatusData}/>
                              <ChartNote note="Trip report statuses from QC review — approved/rejected/pending counts" T={T}/>
                            </div>
                            <div className="rounded-xl p-3" style={{background:T.surface,border:`1px solid ${T.cardBorder}`}}>
                              <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{color:T.textMuted}}>Trips Distribution</p>
                              <SimpleBarChart data={fpTripData} xLabel="Trip" yLabel="Reports"/>
                              <ChartNote note="Count of Trip 1 / 2 / 3 submissions for this feeder point" T={T}/>
                            </div>
                          </div>
                          {/* AI */}
                          {(feederAI||feederQStats.length>0) && (
                            <div className="rounded-xl p-4 space-y-3" style={{background:T.surface,border:`1px solid ${T.cardBorder}`}}>
                              {feederAI && <><p className="text-[10px] font-black uppercase tracking-widest" style={{color:T.accent}}>AI Summary</p><pre className="whitespace-pre-wrap text-xs" style={{color:T.textSecondary,fontFamily:'inherit'}}>{feederAI}</pre></>}
                              {feederQStats.length>0 && (
                                <>
                                  <p className="text-[10px] font-black uppercase tracking-widest" style={{color:T.accent}}>Yes/No Question Stats</p>
                                  <div className="space-y-1 text-xs" style={{color:T.textSecondary}}>
                                    {feederQStats.map(s=><p key={s.name}>"{s.name}": <span style={{color:T.green}}>{s.yes} yes</span> · <span style={{color:T.red}}>{s.no} no</span></p>)}
                                  </div>
                                  <SummaryTrendChart data={feederQStats} xLabel="Question" yLabel="Responses"/>
                                  <ChartNote note="Yes/No answer counts per inspection question across all trips at this feeder point" T={T}/>
                                </>
                              )}
                              <button onClick={downloadAI} className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold"
                                style={{background:T.green,color:'#fff',border:'none',cursor:'pointer'}}>
                                <Download className="h-3.5 w-3.5"/> Download Summary
                              </button>
                            </div>
                          )}
                          {/* Reports table */}
                          <div className="rounded-xl overflow-hidden" style={{border:`1px solid ${T.cardBorder}`}}>
                            <table className="w-full" style={{fontSize:11}}>
                              <thead><tr style={{background:T.surface}}>
                                {['Date','Employee','Trip','Status',''].map(h=><th key={h} className="text-left px-3 py-2 font-semibold uppercase tracking-wider" style={{fontSize:9,color:T.accent}}>{h}</th>)}
                              </tr></thead>
                              <tbody>
                                {selectedFP.reports.map(r=>(
                                  <tr key={r.id} style={{borderTop:`1px solid ${T.gridLine}`}}
                                    onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background=T.surface}
                                    onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background='transparent'}>
                                    <td className="px-3 py-2 whitespace-nowrap" style={{color:T.textSecondary}}>{fmtDT(r.submittedAt)}</td>
                                    <td className="px-3 py-2" style={{color:T.textPrimary}}>{r.userName||'—'}</td>
                                    <td className="px-3 py-2" style={{color:T.textMuted}}>{r.tripNumber?`Trip ${r.tripNumber}`:'—'}</td>
                                    <td className="px-3 py-2"><SBadge label={(r.status||'pending').replace('_',' ')} color={scColor(r.status||'pending')}/></td>
                                    <td className="px-3 py-2">
                                      <button onClick={()=>setSelReport(r)} className="p-1.5 rounded-lg"
                                        style={{background:T.accentDim,color:T.accent,border:'none',cursor:'pointer'}}>
                                        <Eye className="h-3.5 w-3.5"/>
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ══════════════ CHRONIC TAB ══════════════ */}
            {activeTab==='chronic' && (
              <>
                {/* KPIs */}
                <div ref={statsRef} className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <KpiCard label="Chronic Employees" value={chronicStats.employees} sub={`${shiftReports.length} shifts loaded`}                              icon={Users}        color={T.gold}   T={T}/>
                  <KpiCard label="Total Shifts"       value={chronicStats.total}    sub={`${chronicStats.completed} completed`}                               icon={Clock}        color={T.accent} T={T}/>
                  <KpiCard label="Slot Completion"    value={fmtPct(chronicStats.doneSlots,chronicStats.totalSlots)} sub={`${chronicStats.doneSlots}/${chronicStats.totalSlots} hourly slots`} icon={CheckCircle}  color={T.green}  T={T}/>
                  <KpiCard label="In Progress"        value={chronicStats.inProg}   sub="Shifts currently active"                                             icon={Activity}     color={T.amber}  T={T}/>
                </div>

                {/* PERFORMANCE sub-view */}
                {chronicSubView==='performance' && (
                  <>
                    {/* Top/Lowest */}
                    {chronicPerf.length>0 && (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {[
                          {title:'Top Performers',  list:chronicPerf.slice(0,3),                                             isTop:true  },
                          {title:'Needs Attention', list:[...chronicPerf].sort((a,b)=>a.completionRate-b.completionRate).slice(0,3), isTop:false},
                        ].map(section=>(
                          <div key={section.title} className="rounded-2xl p-4" style={{background:T.card,border:`1px solid ${T.cardBorder}`}}>
                            <div className="flex items-center gap-2 mb-3">
                              {section.isTop?<Award className="h-4 w-4" style={{color:T.green}}/>:<TrendingDown className="h-4 w-4" style={{color:T.red}}/>}
                              <p className="text-sm font-bold" style={{color:T.textPrimary}}>{section.title}</p>
                              <SBadge label="Chronic" color={T.gold}/>
                            </div>
                            <div className="space-y-2">
                              {section.list.map((p,i)=>{
                                const medals=['🥇','🥈','🥉']; const color=section.isTop?T.green:T.red
                                return (
                                  <div key={p.userId} className="rounded-xl px-3 py-2.5 flex items-center gap-3"
                                    style={{background:`${color}08`,border:`1px solid ${color}20`}}>
                                    <span className="text-lg">{medals[i]}</span>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-bold truncate" style={{color:T.textPrimary}}>{p.name}</p>
                                      <p className="text-[10px]" style={{color:T.textMuted}}>{p.totalShifts} shifts · {fmtPct(p.completedSlots,p.totalSlots)} slots</p>
                                    </div>
                                    <span className="text-sm font-black" style={{color,fontFamily:"'JetBrains Mono',monospace"}}>{fmtPct(p.completedShifts,p.totalShifts)}</span>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Chronic employee table */}
                    <div ref={empRef} className="rounded-2xl overflow-hidden" style={{background:T.card,border:`1px solid ${T.cardBorder}`}}>
                      <div className="px-5 py-4 flex items-center gap-2" style={{borderBottom:`1px solid ${T.cardBorder}`}}>
                        <Clock className="h-4 w-4" style={{color:T.gold}}/>
                        <div>
                          <h2 className="text-base font-bold" style={{color:T.textPrimary}}>Chronic Employee Performance</h2>
                          <p className="text-xs" style={{color:T.textMuted}}>Shift completion rate = completed shifts ÷ total shifts · Slot rate = filled slots ÷ total expected slots</p>
                        </div>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full" style={{fontSize:12}}>
                          <thead><tr style={{background:T.surface,borderBottom:`1px solid ${T.cardBorder}`}}>
                            {['#','Employee','Shifts','Completed','In Progress','Slots Filled','Shift Rate','Slot Rate','Last Shift'].map(h=>(
                              <th key={h} className="text-left px-4 py-3 font-semibold uppercase tracking-wider whitespace-nowrap" style={{fontSize:10,color:T.gold}}>{h}</th>
                            ))}
                          </tr></thead>
                          <tbody>
                            {chronicFiltered.length===0
                              ? <tr><td colSpan={9} className="px-4 py-10 text-center text-sm" style={{color:T.textMuted}}>No chronic shift data in this range.</td></tr>
                              : chronicFiltered.map((emp,i)=>(
                                <tr key={emp.userId} style={{borderBottom:`1px solid ${T.gridLine}`}}
                                  onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background=T.surface}
                                  onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background='transparent'}>
                                  <td className="px-4 py-3" style={{color:T.textMuted}}>{i+1}</td>
                                  <td className="px-4 py-3">
                                    <p className="font-semibold" style={{color:T.textPrimary}}>{emp.name}</p>
                                    <p className="text-[10px]" style={{color:T.textMuted}}>{Object.keys(emp.shiftsByPoint).length} chronic point{Object.keys(emp.shiftsByPoint).length!==1?'s':''}</p>
                                  </td>
                                  <td className="px-4 py-3 font-bold" style={{color:T.textPrimary,fontFamily:"'JetBrains Mono',monospace"}}>{emp.totalShifts}</td>
                                  <td className="px-4 py-3 font-bold" style={{color:T.green,fontFamily:"'JetBrains Mono',monospace"}}>{emp.completedShifts}</td>
                                  <td className="px-4 py-3 font-bold" style={{color:T.accent,fontFamily:"'JetBrains Mono',monospace"}}>{emp.inProgressShifts}</td>
                                  <td className="px-4 py-3 text-xs" style={{color:T.textSecondary}}>{emp.completedSlots}/{emp.totalSlots}</td>
                                  <td className="px-4 py-3 min-w-[110px]"><RateBar rate={emp.completionRate} T={T}/></td>
                                  <td className="px-4 py-3 min-w-[110px]"><RateBar rate={emp.slotCompletionRate} T={T}/></td>
                                  <td className="px-4 py-3" style={{color:T.textSecondary}}>{fmtDT(emp.lastShiftAt)}</td>
                                </tr>
                              ))
                            }
                          </tbody>
                        </table>
                      </div>
                      <div className="px-5 py-3 text-[10px]" style={{color:T.textMuted,borderTop:`1px solid ${T.gridLine}`}}>
                        📊 <strong>Shift Rate:</strong> completed shifts ÷ total shifts assigned in range. <strong>Slot Rate:</strong> hourly photo slots filled ÷ total expected (8 per shift). <strong>Slots Filled:</strong> slots with a valid uploaded photo or marked completed/late.
                      </div>
                    </div>

                    {/* Per-point breakdown */}
                    {chronicFiltered.length>0 && (
                      <div className="rounded-2xl p-4" style={{background:T.card,border:`1px solid ${T.cardBorder}`}}>
                        <h2 className="text-base font-bold mb-1" style={{color:T.textPrimary}}>Per-Point Breakdown</h2>
                        <p className="text-xs mb-3" style={{color:T.textMuted}}>Completed / total shifts per employee per chronic point</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                          {chronicFiltered.map(emp=>(
                            <div key={emp.userId} className="rounded-xl p-3" style={{background:T.surface,border:`1px solid ${T.cardBorder}`}}>
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-sm font-bold truncate" style={{color:T.textPrimary}}>{emp.name}</p>
                                <span className="text-xs font-black" style={{color:T.gold}}>{fmtPct(emp.completedShifts,emp.totalShifts)}</span>
                              </div>
                              <div className="space-y-1.5">
                                {Object.entries(emp.shiftsByPoint).map(([fpId,pt])=>(
                                  <div key={fpId} className="flex items-center justify-between text-xs rounded-lg px-2 py-1.5"
                                    style={{background:T.card,border:`1px solid ${T.gridLine}`}}>
                                    <p className="truncate flex-1 mr-2" style={{color:T.textSecondary}}>{pt.pointName}</p>
                                    <span style={{color:T.gold,fontFamily:"'JetBrains Mono',monospace",fontSize:11}}>{pt.completed}/{pt.total}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Chronic FP Overview — separate from feeder */}
                    {chronicFPs.length>0 && (
                      <div className="rounded-2xl overflow-hidden" style={{background:T.card,border:`1px solid ${T.cardBorder}`}}>
                        <div className="px-5 py-4 flex items-center justify-between" style={{borderBottom:`1px solid ${T.cardBorder}`}}>
                          <div>
                            <h2 className="text-base font-bold" style={{color:T.textPrimary}}>Chronic Point Overview</h2>
                            <p className="text-xs mt-0.5" style={{color:T.textMuted}}>Only chronic (shift-based) points — separate from feeder point overview</p>
                          </div>
                          <span className="text-xs font-semibold px-2 py-1 rounded-full" style={{background:`${T.gold}15`,color:T.gold}}>{chronicFPs.length} chronic points</span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full" style={{fontSize:12}}>
                            <thead><tr style={{background:T.surface,borderBottom:`1px solid ${T.cardBorder}`}}>
                              {['Chronic Point','Total Shifts','Completed','In Progress','Slot Completion'].map(h=>(
                                <th key={h} className="text-left px-4 py-3 font-semibold uppercase tracking-wider whitespace-nowrap" style={{fontSize:10,color:T.gold}}>{h}</th>
                              ))}
                            </tr></thead>
                            <tbody>
                              {chronicFPs.map(fp=>{
                                const totalSlots=fp.shifts.reduce((a:number,s:ShiftReport)=>a+countSlots(s.slots).total,0)
                                const doneSlots =fp.shifts.reduce((a:number,s:ShiftReport)=>a+countSlots(s.slots).filled,0)
                                return (
                                  <tr key={fp.id} style={{borderBottom:`1px solid ${T.gridLine}`}}
                                    onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background=T.surface}
                                    onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background='transparent'}>
                                    <td className="px-4 py-3 font-semibold" style={{color:T.textPrimary}}>{fp.name}</td>
                                    <td className="px-4 py-3 font-bold" style={{color:T.textPrimary,fontFamily:"'JetBrains Mono',monospace"}}>{fp.total}</td>
                                    <td className="px-4 py-3 font-bold" style={{color:T.green,fontFamily:"'JetBrains Mono',monospace"}}>{fp.completed}</td>
                                    <td className="px-4 py-3 font-bold" style={{color:T.accent,fontFamily:"'JetBrains Mono',monospace"}}>{fp.inProg}</td>
                                    <td className="px-4 py-3 min-w-[120px]"><RateBar rate={totalSlots?doneSlots/totalSlots:0} T={T}/></td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                        <div className="px-5 py-3 text-[10px]" style={{color:T.textMuted,borderTop:`1px solid ${T.gridLine}`}}>
                          📊 <strong>Slot Completion:</strong> proportion of 8 hourly photo slots filled across all shifts at this chronic point.
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* SHIFT DETAILS sub-view */}
                {chronicSubView==='shifts' && (
                  <div className="rounded-2xl overflow-hidden" style={{background:T.card,border:`1px solid ${T.cardBorder}`}}>
                    <div className="px-5 py-4 flex items-center justify-between" style={{borderBottom:`1px solid ${T.cardBorder}`}}>
                      <div>
                        <h2 className="text-base font-bold" style={{color:T.textPrimary}}>Shift Details</h2>
                        <p className="text-xs mt-0.5" style={{color:T.textMuted}}>Individual shift records with slot completion per row</p>
                      </div>
                      <button onClick={exportShiftList}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold"
                        style={{background:T.green,color:'#fff',border:'none',cursor:'pointer'}}>
                        <Download className="h-3.5 w-3.5"/> Download Excel
                      </button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full" style={{fontSize:11}}>
                        <thead><tr style={{background:T.surface,borderBottom:`1px solid ${T.cardBorder}`}}>
                          {['#','Date','Chronic Point','Employee','Shift Type','Slots Filled','Status','Started',''].map(h=>(
                            <th key={h} className="text-left px-3 py-3 font-semibold uppercase tracking-wider whitespace-nowrap" style={{fontSize:9,color:T.gold}}>{h}</th>
                          ))}
                        </tr></thead>
                        <tbody>
                          {shiftRows.length===0
                            ? <tr><td colSpan={9} className="px-4 py-10 text-center text-sm" style={{color:T.textMuted}}>No shift records in this range.</td></tr>
                            : shiftRows.map((s,i)=>{
                                const sc=countSlots(s.slots)
                                const slotPct=sc.total?sc.filled/sc.total:0
                                return (
                                  <tr key={s.id} style={{borderBottom:`1px solid ${T.gridLine}`}}
                                    onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background=T.surface}
                                    onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background='transparent'}>
                                    <td className="px-3 py-2.5" style={{color:T.textMuted}}>{i+1}</td>
                                    <td className="px-3 py-2.5 font-mono whitespace-nowrap" style={{color:T.textSecondary,fontSize:10}}>{s.shiftDate}</td>
                                    <td className="px-3 py-2.5 max-w-[140px]">
                                      <p className="font-semibold truncate" style={{color:T.textPrimary}}>{s.feederPointName}</p>
                                    </td>
                                    <td className="px-3 py-2.5" style={{color:T.textSecondary}}>{s.userName||'—'}</td>
                                    <td className="px-3 py-2.5">
                                      <span className="font-mono text-xs px-2 py-0.5 rounded-lg" style={{background:`${T.gold}15`,color:T.gold}}>{s.shiftType||'—'}</span>
                                    </td>
                                    <td className="px-3 py-2.5">
                                      <div className="flex items-center gap-2 min-w-[90px]">
                                        <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{background:T.gridLine}}>
                                          <div className="h-full rounded-full" style={{width:`${Math.round(slotPct*100)}%`,background:slotPct>=0.75?T.green:slotPct>=0.5?T.amber:T.red}}/>
                                        </div>
                                        <span className="text-[10px] font-bold whitespace-nowrap" style={{color:T.textSecondary}}>{sc.filled}/{sc.total}</span>
                                      </div>
                                    </td>
                                    <td className="px-3 py-2.5">
                                      <SBadge label={s.status} color={scColor(s.status)}/>
                                    </td>
                                    <td className="px-3 py-2.5 whitespace-nowrap" style={{color:T.textMuted,fontSize:10}}>{fmtDT(s.startedAt)}</td>
                                    <td className="px-3 py-2.5">
                                      <button onClick={()=>setSelShift(s)} className="p-1.5 rounded-lg"
                                        style={{background:`${T.gold}15`,color:T.gold,border:'none',cursor:'pointer'}}>
                                        <Eye className="h-3.5 w-3.5"/>
                                      </button>
                                    </td>
                                  </tr>
                                )
                              })
                          }
                        </tbody>
                      </table>
                    </div>
                    <div className="px-5 py-3 text-[10px]" style={{color:T.textMuted,borderTop:`1px solid ${T.gridLine}`}}>
                      📊 <strong>Slots Filled:</strong> count of hourly slots where a photo was successfully uploaded to Firebase Storage (https:// URL) or marked completed/late. Each shift has 8 hourly slots. Progress bar color: green ≥75% · amber ≥50% · red &lt;50%.
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ── Trip Report Modal ── */}
        {selReport && (() => {
          const answers=getAnswers(selReport)
          const photos=answers.flatMap((a:any)=>(a.photos||[]).filter((p:string)=>p.startsWith('https://')))
          return (
            <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto"
              style={{background:'rgba(0,0,0,0.7)',backdropFilter:'blur(6px)'}}
              onClick={()=>{setSelReport(null);setSelImage(null)}}>
              <div className="w-full max-w-4xl my-8 rounded-2xl shadow-2xl overflow-hidden"
                style={{background:T.card,border:`1px solid ${T.cardBorder}`}}
                onClick={e=>e.stopPropagation()}>
                <div className="flex items-start justify-between px-6 py-4" style={{borderBottom:`1px solid ${T.cardBorder}`}}>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{color:T.accent}}>Trip Report — Trip {selReport.tripNumber||'?'}</p>
                    <h3 className="text-lg font-bold" style={{color:T.textPrimary}}>{selReport.feederPointName||'Feeder Point'}</h3>
                    <p className="text-xs mt-0.5" style={{color:T.textMuted}}>{fmtDT(selReport.submittedAt)} · {selReport.userName||'—'}</p>
                  </div>
                  <button onClick={()=>{setSelReport(null);setSelImage(null)}}
                    className="flex items-center justify-center w-8 h-8 rounded-xl"
                    style={{background:T.surface,border:`1px solid ${T.cardBorder}`,color:T.textSecondary,cursor:'pointer'}}>
                    <X className="h-4 w-4"/>
                  </button>
                </div>
                <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-5">
                  <div className="lg:col-span-2 space-y-3">
                    <div className="grid grid-cols-2 gap-2 rounded-xl p-3" style={{background:T.surface,border:`1px solid ${T.cardBorder}`}}>
                      {[['Employee',selReport.userName||'—'],['Team',selReport.teamName||'—'],['Trip',selReport.tripNumber?`Trip ${selReport.tripNumber}`:'—'],['Date',selReport.tripDate||'—']].map(([l,v])=>(
                        <div key={l}><p className="text-[9px] font-black uppercase tracking-widest" style={{color:T.textMuted}}>{l}</p><p className="text-sm font-semibold" style={{color:T.textPrimary}}>{v}</p></div>
                      ))}
                      <div className="col-span-2"><p className="text-[9px] font-black uppercase tracking-widest mb-1" style={{color:T.textMuted}}>Status</p><SBadge label={(selReport.status||'pending').replace('_',' ')} color={scColor(selReport.status||'pending')}/></div>
                    </div>
                    <p className="text-[10px] font-black uppercase tracking-widest" style={{color:T.textMuted}}>Answers ({answers.length})</p>
                    {answers.map((a:any,idx:number)=>{
                      const ps=(a.photos||[]).filter((p:string)=>p.startsWith('https://'))
                      const ac=(a.answer||'').toString(); const acColor=YES.has(ac.toLowerCase())?T.green:NO.has(ac.toLowerCase())?T.red:T.textSecondary
                      return (
                        <div key={a.questionId||idx} className="rounded-xl p-3" style={{background:T.surface,border:`1px solid ${T.cardBorder}`}}>
                          <p className="text-xs font-semibold" style={{color:T.textPrimary}}>{a.description||fmtQ(a.questionId||'Q')}</p>
                          <p className="text-xs mt-1"><span style={{color:T.textMuted}}>Answer: </span><span style={{color:acColor}}>{ac||'—'}</span></p>
                          {a.notes&&<p className="text-[10px] mt-1" style={{color:T.textMuted}}>Notes: {a.notes}</p>}
                          {ps.length>0&&<div className="grid grid-cols-3 gap-1.5 mt-2">{ps.map((url:string,pi:number)=>(
                            <button key={pi} onClick={()=>setSelImage(url)} className="rounded-lg overflow-hidden" style={{border:`1px solid ${T.cardBorder}`,cursor:'pointer',padding:0,background:'none'}}>
                              <img src={url} alt="" className="h-20 w-full object-cover" onError={e=>(e.currentTarget.parentElement!.style.display='none')}/>
                            </button>
                          ))}</div>}
                        </div>
                      )
                    })}
                  </div>
                  <div className="space-y-3">
                    <div className="rounded-xl p-3" style={{background:T.surface,border:`1px solid ${T.cardBorder}`}}>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-black uppercase tracking-widest" style={{color:T.textMuted}}>All Photos</p>
                        <span className="text-[10px] font-bold" style={{color:T.accent}}>{photos.length}</span>
                      </div>
                      {photos.length===0?<p className="text-xs" style={{color:T.textMuted}}>No remote photos.</p>
                        :<div className="grid grid-cols-2 gap-1.5">{photos.map((url:string,i:number)=>(
                          <button key={i} onClick={()=>setSelImage(url)} className="rounded-lg overflow-hidden" style={{border:`1px solid ${T.cardBorder}`,cursor:'pointer',padding:0,background:'none'}}>
                            <img src={url} alt="" className="h-20 w-full object-cover" onError={e=>(e.currentTarget.parentElement!.style.display='none')}/>
                          </button>
                        ))}</div>
                      }
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        })()}

        {/* ── Shift Detail Modal ── */}
        {selShift && (() => {
          const slots = Array.isArray(selShift.slots)?selShift.slots:Object.entries(selShift.slots||{}).map(([k,v]:any)=>({slotNumber:parseInt(k)+1,...v}))
          return (
            <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto"
              style={{background:'rgba(0,0,0,0.7)',backdropFilter:'blur(6px)'}}
              onClick={()=>setSelShift(null)}>
              <div className="w-full max-w-2xl my-8 rounded-2xl shadow-2xl overflow-hidden"
                style={{background:T.card,border:`1px solid ${T.cardBorder}`}}
                onClick={e=>e.stopPropagation()}>
                <div className="flex items-start justify-between px-6 py-4" style={{borderBottom:`1px solid ${T.cardBorder}`}}>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{color:T.gold}}>Shift Report</p>
                    <h3 className="text-lg font-bold" style={{color:T.textPrimary}}>{selShift.feederPointName}</h3>
                    <p className="text-xs mt-0.5" style={{color:T.textMuted}}>{selShift.shiftDate} · {selShift.shiftType} · {selShift.userName}</p>
                  </div>
                  <button onClick={()=>setSelShift(null)} className="flex items-center justify-center w-8 h-8 rounded-xl"
                    style={{background:T.surface,border:`1px solid ${T.cardBorder}`,color:T.textSecondary,cursor:'pointer'}}>
                    <X className="h-4 w-4"/>
                  </button>
                </div>
                <div className="p-5 space-y-4">
                  <div className="grid grid-cols-3 gap-2 rounded-xl p-3" style={{background:T.surface,border:`1px solid ${T.cardBorder}`}}>
                    {[['Status',selShift.status],['Started',fmtDT(selShift.startedAt)],['Completed',fmtDT(selShift.completedAt)]].map(([l,v])=>(
                      <div key={l}><p className="text-[9px] font-black uppercase tracking-widest" style={{color:T.textMuted}}>{l}</p>
                        {l==='Status'?<SBadge label={v} color={scColor(v)}/>:<p className="text-xs font-semibold" style={{color:T.textPrimary}}>{v}</p>}
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-widest" style={{color:T.textMuted}}>Hourly Slots ({slots.length})</p>
                  <div className="space-y-2">
                    {slots.map((slot:any,i:number)=>{
                      const hasPhoto = slot.photoUrl?.startsWith('https://')
                      const slotStatus = slot.status||'pending'
                      const slotColor = slotStatus==='completed'?T.green:slotStatus==='late'?T.amber:slotStatus==='pending'?T.textMuted:T.red
                      return (
                        <div key={i} className="rounded-xl p-3 flex items-center gap-3"
                          style={{background:T.surface,border:`1px solid ${slotColor}20`}}>
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0"
                            style={{background:`${slotColor}15`,color:slotColor,fontSize:11,fontWeight:700}}>
                            {slot.slotNumber||i+1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold" style={{color:T.textPrimary}}>{slot.label||`Slot ${i+1}`}</p>
                            {slot.timestamp&&<p className="text-[10px]" style={{color:T.textMuted}}>{fmtDT(slot.timestamp)}</p>}
                          </div>
                          <SBadge label={slotStatus} color={slotColor}/>
                          {hasPhoto&&(
                            <button onClick={()=>setSelImage(slot.photoUrl)} className="rounded-lg overflow-hidden flex-shrink-0"
                              style={{border:`1px solid ${T.cardBorder}`,cursor:'pointer',padding:0,background:'none',width:48,height:36}}>
                              <img src={slot.photoUrl} alt="" className="w-full h-full object-cover"/>
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  <div className="text-[10px] italic" style={{color:T.textMuted}}>
                    📊 <strong>Slot status:</strong> "completed" = photo uploaded on time · "late" = photo uploaded after slot window · "pending" = not yet submitted.
                  </div>
                </div>
              </div>
            </div>
          )
        })()}

        {/* Lightbox */}
        {selImage&&(
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
            style={{background:'rgba(0,0,0,0.92)'}} onClick={()=>setSelImage(null)}>
            <button onClick={()=>setSelImage(null)} className="absolute top-6 right-6 flex items-center justify-center w-10 h-10 rounded-full"
              style={{background:'rgba(255,255,255,0.15)',border:'none',cursor:'pointer',color:'#fff'}}>
              <X className="h-5 w-5"/>
            </button>
            <img src={selImage} alt="Preview" className="max-h-[88vh] max-w-[95vw] object-contain rounded-xl shadow-2xl" onClick={e=>e.stopPropagation()}/>
          </div>
        )}

      </div>
    </>
  )
}