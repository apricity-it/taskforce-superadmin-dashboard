import { useMemo, useState, useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { getTokens } from '@/lib/dashboardTheme'
import { Card, SectionHeader } from './DashboardUI'
import type { ComplianceReport } from '@/lib/dashboardQueries'

/**
 * DATABASE SCHEMA (confirmed from Firestore):
 *
 * FEEDER TRIPS  →  collection: complianceReports
 *   r.feederPointType = "feeder"  (or missing = feeder)
 *   r.tripNumber      = 1 | 2 | 3   (number, not string)
 *   r.tripDate        = "YYYY-MM-DD"
 *   r.submittedAt     = Timestamp
 *   r.status          = "pending" | "approved" | "rejected" | "requires_action" | "action_taken"
 *
 * CHRONIC SHIFTS  →  collection: shiftReports  (separate collection — NOT complianceReports)
 *   r.shiftDate       = "YYYY-MM-DD"
 *   r.status          = "in_progress" | "completed"
 *   r.isPunchedOut    = true | undefined
 *   r.createdAt       = Timestamp
 *   r.slots[]         = [{ slotNumber, status: "pending"|"completed"|"late"|"missed" }]
 *
 * HEATMAP LOGIC:
 *   - Feeder tab:  one dot per complianceReport with feederPointType=feeder
 *                  grouped by tripDate, bucketed by tripNumber (1/2/3)
 *   - Chronic tab: one dot per shiftReport
 *                  isPunchedOut=true → "punch_out"
 *                  status="completed" (and not punchedOut) → "completed"
 *                  status="in_progress" → "in_progress"
 *                  Slot-level late/missed are shown as sub-counts in tooltip
 */

// ─── Date normalizer ──────────────────────────────────────────────────────────
function normDate(v: any): string | null {
  if (!v) return null
  if (typeof v === 'string') return v.slice(0, 10)
  if (typeof v.toDate === 'function') return v.toDate().toISOString().slice(0, 10)
  if (typeof v.seconds === 'number') return new Date(v.seconds * 1000).toISOString().slice(0, 10)
  if (typeof v._seconds === 'number') return new Date(v._seconds * 1000).toISOString().slice(0, 10)
  return null
}

// ─── Types ────────────────────────────────────────────────────────────────────

// Extends ComplianceReport to cover shiftReports too (both are passed in via reports prop)
// Your dashboardQueries.ts should union both collections into one array:
//   const feederReports = await getComplianceReports(userId)   // complianceReports
//   const shiftReports  = await getShiftReports(userId)        // shiftReports
//   return [...feederReports, ...shiftReports]

interface DayData {
  date: string
  // ── Feeder ──
  feeder: number
  trip1: number   // tripNumber === 1
  trip2: number   // tripNumber === 2
  trip3: number   // tripNumber === 3
  // feeder review statuses
  feederApproved: number
  feederPending: number
  feederRejected: number
  feederRequiresAction: number
  // ── Chronic shifts (shiftReports) ──
  chronic: number
  shiftCompleted: number    // status=completed AND isPunchedOut falsy
  shiftInProgress: number   // status=in_progress
  shiftPunchedOut: number   // isPunchedOut=true
  // slot-level sub-counts (for tooltip detail)
  slotLate: number
  slotMissed: number
  slotCompleted: number
}

type ActiveTab      = 'feeder' | 'chronic'
type TripFilter     = 'all' | 'trip1' | 'trip2' | 'trip3'
// Chronic filters map to the 3 top-level shift states
type ChronicFilter  = 'all' | 'completed' | 'in_progress' | 'punch_out'

// ─── Color helpers ─────────────────────────────────────────────────────────────

function getTripRamp(trip: TripFilter, dark: boolean): string[] {
  // All green-family, slightly different shades per trip
  if (trip === 'trip1') return dark
    ? ['#0e3d1a', '#1a6b2e', '#26a641', '#39d353']
    : ['#b8f0c4', '#6cd98a', '#2eaa52', '#1a7a38']
  if (trip === 'trip2') return dark
    ? ['#0a3515', '#145c25', '#1f8f3a', '#2ec44f']
    : ['#c2f5ce', '#78dfa0', '#33b85e', '#1e8040']
  if (trip === 'trip3') return dark
    ? ['#0c4020', '#187030', '#24a848', '#36d860']
    : ['#aaf0c0', '#60d47e', '#28b052', '#157836']
  // 'all' — standard GitHub-style green
  return dark
    ? ['#0e4429', '#006d32', '#26a641', '#39d353']
    : ['#9be9a8', '#40c463', '#30a14e', '#216e39']
}

function getChronicRamp(filter: ChronicFilter, dark: boolean): string[] {
  if (filter === 'completed') return dark
    ? ['#0e4429', '#006d32', '#26a641', '#39d353']
    : ['#9be9a8', '#40c463', '#30a14e', '#216e39']
  if (filter === 'in_progress') return dark
    ? ['#1a1a2e', '#1e3a5f', '#2563eb', '#60a5fa']
    : ['#dbeafe', '#93c5fd', '#2563eb', '#1d4ed8']
  if (filter === 'punch_out') return dark
    ? ['#1e1040', '#4c1d95', '#7c3aed', '#a78bfa']
    : ['#ede9fe', '#c4b5fd', '#7c3aed', '#4c1d95']
  // 'all'
  return dark
    ? ['#1a2e1a', '#245c24', '#2e8a2e', '#3dbf3d']
    : ['#d4f0d4', '#8cd88c', '#3aaa3a', '#1d6e1d']
}

function getColor(
  count: number, max: number,
  tab: ActiveTab, tripFilter: TripFilter, chronicFilter: ChronicFilter, dark: boolean
): string {
  if (count === 0) return dark ? '#161b22' : '#ebedf0'
  const idx = Math.min(Math.floor(Math.min(count / max, 1) * 4), 3)
  return tab === 'feeder'
    ? getTripRamp(tripFilter, dark)[idx]
    : getChronicRamp(chronicFilter, dark)[idx]
}

// ─── Portal Tooltip (FIX #3 — renders into document.body) ────────────────────

interface TooltipState { day: DayData; x: number; y: number }

function Tooltip({ data, activeTab, dark }: { data: TooltipState; activeTab: ActiveTab; dark: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: -9999, top: -9999 })

  useEffect(() => {
    if (!ref.current) return
    const h = ref.current.offsetHeight
    const w = ref.current.offsetWidth
    let left = data.x - w / 2
    let top  = data.y - h - 10
    if (top < 8)                          top  = data.y + 18
    if (left < 8)                         left = 8
    if (left + w > window.innerWidth - 8) left = window.innerWidth - w - 8
    setPos({ left, top })
  }, [data.x, data.y])

  const bdr   = dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
  const bg    = dark ? 'rgba(12,14,22,0.98)'   : 'rgba(255,255,255,0.99)'
  const txt   = dark ? '#fff' : '#111'
  const muted = dark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)'
  const mono  = "'JetBrains Mono',monospace"

  const Divider = () => <div style={{ height: 1, background: bdr, margin: '5px 0' }} />

  const Row = ({ label, value, color }: { label: string; value: number; color: string }) => (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:14, fontSize:11, marginBottom:3 }}>
      <span style={{ color:muted, display:'flex', alignItems:'center', gap:5 }}>
        <span style={{ width:7, height:7, borderRadius:'50%', background:color, flexShrink:0, display:'inline-block' }} />
        {label}
      </span>
      <span style={{ fontWeight:700, color, fontFamily:mono }}>{value}</span>
    </div>
  )

  const el = (
    <div
      ref={ref}
      style={{
        position:'fixed', left:pos.left, top:pos.top,
        background:bg, border:`1px solid ${bdr}`, borderRadius:10,
        padding:'10px 13px', minWidth:200,
        boxShadow:`0 8px 28px ${dark ? 'rgba(0,0,0,0.65)' : 'rgba(0,0,0,0.14)'}`,
        zIndex:999999, pointerEvents:'none',
      }}
    >
      <div style={{ fontSize:11, fontWeight:700, color:txt, fontFamily:mono, marginBottom:7 }}>
        {data.day.date}
      </div>
      <Divider />

      {activeTab === 'feeder' ? (
        <>
          {/* Trip breakdown */}
          <div style={{ fontSize:10, color:muted, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:4 }}>
            Trips completed
          </div>
          <Row label="Trip 1" value={data.day.trip1} color="#39d353" />
          <Row label="Trip 2" value={data.day.trip2} color="#2eaa52" />
          <Row label="Trip 3" value={data.day.trip3} color="#24a848" />
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, marginTop:4, paddingTop:4, borderTop:`1px solid ${bdr}` }}>
            <span style={{ color:muted }}>Total feeder</span>
            <span style={{ fontWeight:700, color:'#39d353', fontFamily:mono }}>{data.day.feeder}</span>
          </div>
          <Divider />
          {/* Review status */}
          <div style={{ fontSize:10, color:muted, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:4 }}>
            Review status
          </div>
          <Row label="Approved"        value={data.day.feederApproved}       color="#22c55e" />
          <Row label="Pending"         value={data.day.feederPending}        color="#f59e0b" />
          <Row label="Rejected"        value={data.day.feederRejected}       color="#ef4444" />
          <Row label="Requires action" value={data.day.feederRequiresAction} color="#a78bfa" />
        </>
      ) : (
        <>
          {/* Shift top-level status */}
          <div style={{ fontSize:10, color:muted, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:4 }}>
            Shift status
          </div>
          <Row label="Completed"   value={data.day.shiftCompleted}  color="#22c55e" />
          <Row label="In progress" value={data.day.shiftInProgress} color="#3b82f6" />
          <Row label="Punched out" value={data.day.shiftPunchedOut} color="#a78bfa" />
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, marginTop:4, paddingTop:4, borderTop:`1px solid ${bdr}` }}>
            <span style={{ color:muted }}>Total shifts</span>
            <span style={{ fontWeight:700, color:'#39d353', fontFamily:mono }}>{data.day.chronic}</span>
          </div>
          <Divider />
          {/* Slot-level sub-counts */}
          <div style={{ fontSize:10, color:muted, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:4 }}>
            Hourly slots
          </div>
          <Row label="Slots completed" value={data.day.slotCompleted} color="#22c55e" />
          <Row label="Slots late"      value={data.day.slotLate}      color="#f59e0b" />
          <Row label="Slots missed"    value={data.day.slotMissed}    color="#ef4444" />
        </>
      )}
    </div>
  )

  return typeof document !== 'undefined' ? createPortal(el, document.body) : null
}

// ─── Summary Card ──────────────────────────────────────────────────────────────

interface SummaryCardProps {
  totalAll: number; totalFeeder: number; totalChronic: number
  activeDays: number; streak: number
  trip1Total: number; trip2Total: number; trip3Total: number
  shiftCompleted: number; shiftInProgress: number; shiftPunchedOut: number
  activeTab: ActiveTab; dark: boolean
}

function SummaryCard(p: SummaryCardProps) {
  const bdr    = p.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)'
  const surf   = p.dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.025)'
  const txt    = p.dark ? '#fff' : '#111'
  const muted  = p.dark ? 'rgba(255,255,255,0.4)'  : 'rgba(0,0,0,0.4)'
  const cardBg = p.dark ? 'rgba(255,255,255,0.03)' : '#fff'

  const subtext = p.activeTab === 'feeder'
    ? '365-day activity — feeder trip submissions · grouped by tripDate'
    : '365-day activity — chronic shift reports · one shift = one record'

  const topMetrics = [
    { label:'Total (yr)',    value: p.totalAll,       color:'#39d353', sub:'all types'         },
    { label:'Feeder trips',  value: p.totalFeeder,    color:'#26a641', sub:'3 trips/cycle'     },
    { label:'Chronic shifts',value: p.totalChronic,   color:'#30a14e', sub:'shift reports'     },
    { label:'Active days',   value: p.activeDays,     color:'#40c463', sub:'days with activity'},
    { label:'Streak',        value:`${p.streak}d`,   color:'#9be9a8', sub:'consecutive days'  },
  ]

  return (
    <div style={{ background:cardBg, border:`1px solid ${bdr}`, borderRadius:14, padding:'14px 18px', marginBottom:12, position:'relative', zIndex:10 }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:12 }}>
        <div>
          <div style={{ fontSize:13, fontWeight:700, color:txt, letterSpacing:'-0.01em' }}>Member work summary</div>
          <div style={{ fontSize:11, color:muted, marginTop:2 }}>{subtext}</div>
        </div>
        <span style={{ fontSize:10, fontWeight:600, padding:'3px 9px', borderRadius:20, border:`1px solid ${bdr}`, background:surf, color:muted, letterSpacing:'0.03em', whiteSpace:'nowrap', marginLeft:12 }}>
          By submission date
        </span>
      </div>

      {/* Top metrics */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
        {topMetrics.map(m => (
          <div key={m.label} style={{ flex:'1 1 80px', background:surf, border:`1px solid ${bdr}`, borderRadius:9, padding:'8px 12px' }}>
            <div style={{ fontSize:10, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.05em', color:muted, marginBottom:3 }}>{m.label}</div>
            <div style={{ fontSize:20, fontWeight:700, fontFamily:"'JetBrains Mono',monospace", lineHeight:1, color:m.color }}>{m.value}</div>
            <div style={{ fontSize:10, color:muted, marginTop:3 }}>{m.sub}</div>
          </div>
        ))}
      </div>

      {/* Feeder: trip 1/2/3 breakdown */}
      {p.activeTab === 'feeder' && (
        <div style={{ display:'flex', gap:8, marginTop:8, flexWrap:'wrap' }}>
          {[
            { label:'Trip 1', value:p.trip1Total, color:'#39d353', sub:'tripNumber = 1' },
            { label:'Trip 2', value:p.trip2Total, color:'#2eaa52', sub:'tripNumber = 2' },
            { label:'Trip 3', value:p.trip3Total, color:'#24a848', sub:'tripNumber = 3' },
          ].map(t => (
            <div key={t.label} style={{ flex:'1 1 70px', background:surf, border:`1px solid ${bdr}`, borderRadius:9, padding:'7px 12px' }}>
              <div style={{ fontSize:10, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.05em', color:muted, marginBottom:2 }}>{t.label}</div>
              <div style={{ fontSize:16, fontWeight:700, fontFamily:"'JetBrains Mono',monospace", lineHeight:1, color:t.color }}>{t.value}</div>
              <div style={{ fontSize:10, color:muted, marginTop:2 }}>{t.sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* Chronic: shift status breakdown */}
      {p.activeTab === 'chronic' && (
        <div style={{ display:'flex', gap:8, marginTop:8, flexWrap:'wrap' }}>
          {[
            { label:'Completed',   value:p.shiftCompleted,  color:'#22c55e', sub:'status=completed' },
            { label:'In progress', value:p.shiftInProgress, color:'#3b82f6', sub:'status=in_progress' },
            { label:'Punched out', value:p.shiftPunchedOut, color:'#a78bfa', sub:'isPunchedOut=true' },
          ].map(t => (
            <div key={t.label} style={{ flex:'1 1 70px', background:surf, border:`1px solid ${bdr}`, borderRadius:9, padding:'7px 12px' }}>
              <div style={{ fontSize:10, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.05em', color:muted, marginBottom:2 }}>{t.label}</div>
              <div style={{ fontSize:16, fontWeight:700, fontFamily:"'JetBrains Mono',monospace", lineHeight:1, color:t.color }}>{t.value}</div>
              <div style={{ fontSize:10, color:muted, marginTop:2 }}>{t.sub}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────
// Props — pass BOTH collections separately (preferred) or a pre-merged array (legacy).
// complianceReports : feeder trip records  (complianceReports collection, feederPointType="feeder")
// shiftReports      : chronic shift records (shiftReports collection, has shiftType field)

export function HeatmapCalendar({
  reports,
  complianceReports,
  shiftReports: shiftReportsProp,
  dark,
}: {
  reports?: any[]            // legacy: already-merged array
  complianceReports?: any[]  // preferred: feeder compliance reports only
  shiftReports?: any[]       // preferred: shift reports only (from shiftReports collection)
  dark: boolean
}) {
  const [hovered,       setHovered]       = useState<TooltipState | null>(null)
  const [activeTab,     setActiveTab]     = useState<ActiveTab>('feeder')
  const [tripFilter,    setTripFilter]    = useState<TripFilter>('all')
  const [chronicFilter, setChronicFilter] = useState<ChronicFilter>('all')

  // Merge both collections — shift records are detected by shiftType field
  const allReports = useMemo(() => {
    if (complianceReports !== undefined || shiftReportsProp !== undefined) {
      return [...(complianceReports ?? []), ...(shiftReportsProp ?? [])]
    }
    return reports ?? []
  }, [reports, complianceReports, shiftReportsProp])

  const bdr   = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)'
  const surf  = dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'
  const txt   = dark ? '#fff' : '#111'
  const muted = dark ? 'rgba(255,255,255,0.4)'  : 'rgba(0,0,0,0.4)'

  // ── Build day map from real schema ──────────────────────────────────────────
  const { weeks, dayMap, monthLabels, summary } = useMemo(() => {
    const map: Record<string, DayData> = {}

    const ensure = (d: string) => {
      if (!map[d]) map[d] = {
        date:d,
        feeder:0, trip1:0, trip2:0, trip3:0,
        feederApproved:0, feederPending:0, feederRejected:0, feederRequiresAction:0,
        chronic:0, shiftCompleted:0, shiftInProgress:0, shiftPunchedOut:0,
        slotLate:0, slotMissed:0, slotCompleted:0,
      }
      return map[d]
    }

    allReports.forEach((r: any) => {
      // shiftType (e.g. "7PM-3AM", "3AM-11AM") ONLY exists on shiftReports, never on complianceReports.
      // feederPointType = "feeder"|"chronic" ONLY exists on complianceReports.
      // Using shiftType as the single most reliable discriminator.
      const isShift = typeof r.shiftType === 'string' && r.shiftType.length > 0

      if (isShift) {
        // ── CHRONIC SHIFT (shiftReports collection) ──────────────────────────
        // Date comes from r.shiftDate (string "YYYY-MM-DD") or r.createdAt
        const d = r.shiftDate ?? normDate(r.createdAt)
        if (!d) return
        const day = ensure(d)
        day.chronic++

        if (r.isPunchedOut === true) {
          day.shiftPunchedOut++
        } else if (r.status === 'completed') {
          day.shiftCompleted++
        } else {
          day.shiftInProgress++ // in_progress or any other
        }

        // Tally slot-level statuses for tooltip detail
        const slots = r.slots
        if (Array.isArray(slots)) {
          slots.forEach((s: any) => {
            const ss = s?.status ?? ''
            if (ss === 'completed') day.slotCompleted++
            else if (ss === 'late') day.slotLate++
            else if (ss === 'missed') day.slotMissed++
          })
        } else if (slots && typeof slots === 'object') {
          // slots stored as object map {0: {...}, 1: {...}}
          Object.values(slots).forEach((s: any) => {
            const ss = s?.status ?? ''
            if (ss === 'completed') day.slotCompleted++
            else if (ss === 'late') day.slotLate++
            else if (ss === 'missed') day.slotMissed++
          })
        }
      } else {
        // ── FEEDER TRIP (complianceReports collection) ───────────────────────
        // feederPointType = "feeder" or missing
        // Date from r.tripDate (preferred) or r.submittedAt or r.createdAt
        const d = r.tripDate ?? normDate(r.submittedAt ?? r.createdAt)
        if (!d) return
        const day = ensure(d)
        day.feeder++

        // tripNumber is a number (1 | 2 | 3) in the DB
        const n = Number(r.tripNumber ?? 1)
        if (n === 2) day.trip2++
        else if (n === 3) day.trip3++
        else day.trip1++

        // Review status
        const st = r.status ?? ''
        if (st === 'approved') day.feederApproved++
        else if (st === 'rejected') day.feederRejected++
        else if (st === 'requires_action' || st === 'action_taken') day.feederRequiresAction++
        else day.feederPending++ // pending or unknown
      }
    })

    // ── Build week grid ──────────────────────────────────────────────────────
    const today = new Date()
    const start = new Date(today)
    start.setDate(start.getDate() - 364)
    start.setDate(start.getDate() - start.getDay())

    const wks: string[][] = []
    const mLabels: { label: string; col: number }[] = []
    let lastMonth = -1
    const cursor = new Date(start)

    while (cursor <= today || wks.length === 0 || wks[wks.length - 1].length < 7) {
      if (wks.length === 0 || wks[wks.length - 1].length === 7) {
        wks.push([])
        const m = cursor.getMonth()
        if (m !== lastMonth) {
          mLabels.push({ label: cursor.toLocaleString('en', { month: 'short' }), col: wks.length - 1 })
          lastMonth = m
        }
      }
      wks[wks.length - 1].push(cursor.toISOString().slice(0, 10))
      cursor.setDate(cursor.getDate() + 1)
      if (cursor > today && wks[wks.length - 1].length === 7) break
    }
    while (wks[wks.length - 1].length < 7) wks[wks.length - 1].push('')

    // ── Streak ───────────────────────────────────────────────────────────────
    let streak = 0
    const sc = new Date(); sc.setHours(0, 0, 0, 0)
    while (true) {
      const k = sc.toISOString().slice(0, 10)
      if (!map[k] || map[k].feeder + map[k].chronic === 0) break
      streak++; sc.setDate(sc.getDate() - 1)
    }

    const allDays = Object.values(map)
    return {
      weeks: wks, dayMap: map, monthLabels: mLabels,
      summary: {
        totalAll:      allDays.reduce((s, d) => s + d.feeder + d.chronic, 0),
        totalFeeder:   allDays.reduce((s, d) => s + d.feeder, 0),
        totalChronic:  allDays.reduce((s, d) => s + d.chronic, 0),
        trip1Total:    allDays.reduce((s, d) => s + d.trip1, 0),
        trip2Total:    allDays.reduce((s, d) => s + d.trip2, 0),
        trip3Total:    allDays.reduce((s, d) => s + d.trip3, 0),
        shiftCompleted:  allDays.reduce((s, d) => s + d.shiftCompleted, 0),
        shiftInProgress: allDays.reduce((s, d) => s + d.shiftInProgress, 0),
        shiftPunchedOut: allDays.reduce((s, d) => s + d.shiftPunchedOut, 0),
        activeDays:    allDays.filter(d => d.feeder + d.chronic > 0).length,
        streak,
        bestDay: [...allDays].sort((a, b) => (b.feeder + b.chronic) - (a.feeder + a.chronic))[0] ?? null,
      },
    }
  }, [allReports])

  // ── Count key per active filter ─────────────────────────────────────────────
  function getCountForDay(day: DayData): number {
    if (activeTab === 'feeder') {
      if (tripFilter === 'trip1') return day.trip1
      if (tripFilter === 'trip2') return day.trip2
      if (tripFilter === 'trip3') return day.trip3
      return day.feeder
    }
    if (chronicFilter === 'completed')   return day.shiftCompleted
    if (chronicFilter === 'in_progress') return day.shiftInProgress
    if (chronicFilter === 'punch_out')   return day.shiftPunchedOut
    return day.chronic
  }

  const maxCount = useMemo(() => {
    const vals = Object.values(dayMap).map(d => getCountForDay(d))
    return Math.max(...vals, 1)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayMap, activeTab, tripFilter, chronicFilter])

  // ── Tooltip mouse handler ───────────────────────────────────────────────────
  const handleMouseEnter = useCallback((e: React.MouseEvent<SVGRectElement>, day: DayData) => {
    const r = (e.currentTarget as SVGRectElement).getBoundingClientRect()
    setHovered({ day, x: r.left + r.width / 2, y: r.top })
  }, [])

  // ── Accent color ────────────────────────────────────────────────────────────
  const accentColor = activeTab === 'chronic'
    ? (chronicFilter === 'punch_out' ? '#a78bfa' : chronicFilter === 'in_progress' ? '#3b82f6' : '#39d353')
    : (tripFilter === 'trip2' ? '#2eaa52' : tripFilter === 'trip3' ? '#24a848' : '#39d353')

  const contextInfo = activeTab === 'feeder'
    ? {
        icon: '📍',
        title: 'Feeder trips',
        body: 'Source: complianceReports. Each dot = one trip report. tripNumber field (1/2/3) splits by trip. Date from tripDate field.',
      }
    : {
        icon: '🔁',
        title: 'Chronic shifts',
        body: 'Source: shiftReports. Each dot = one 8-hour shift record. Status: completed / in_progress / punch_out (isPunchedOut=true). Slot-level late/missed visible in tooltip.',
      }

  const cellSize = 11, cellGap = 2
  const totalW   = weeks.length * (cellSize + cellGap)
  const todayKey = new Date().toISOString().slice(0, 10)

  const legendColors = [0, 0.25, 0.5, 0.75, 1].map(v =>
    getColor(Math.round(v * maxCount), maxCount, activeTab, tripFilter, chronicFilter, dark)
  )

  const tripCards = [
    { id:'all'   as TripFilter, label:'All trips', value:summary.totalFeeder, color:'#39d353', sub:'Total feeder'  },
    { id:'trip1' as TripFilter, label:'Trip 1',    value:summary.trip1Total,  color:'#39d353', sub:'tripNumber = 1'},
    { id:'trip2' as TripFilter, label:'Trip 2',    value:summary.trip2Total,  color:'#2eaa52', sub:'tripNumber = 2'},
    { id:'trip3' as TripFilter, label:'Trip 3',    value:summary.trip3Total,  color:'#24a848', sub:'tripNumber = 3'},
  ]

  const chronicFilterBtns: { id: ChronicFilter; label: string; color: string; sub: string }[] = [
    { id:'all',         label:'All shifts',  color:'#39d353', sub:'total shift records'   },
    { id:'completed',   label:'Completed',   color:'#22c55e', sub:'status = completed'    },
    { id:'in_progress', label:'In progress', color:'#3b82f6', sub:'status = in_progress'  },
    { id:'punch_out',   label:'Punched out', color:'#a78bfa', sub:'isPunchedOut = true'   },
  ]

  return (
    <>
      <style>{`
        .hm-tab-btn {
          font-size:13px; font-weight:600; padding:7px 18px 9px;
          background:none; border:none; border-bottom:2px solid transparent;
          margin-bottom:-1px; cursor:pointer; transition:color 0.15s,border-color 0.15s;
          display:flex; align-items:center; gap:7px; color:${muted};
          font-family:system-ui,sans-serif;
        }
        .hm-tab-btn.active { color:${txt}; }
        .hm-trip-card {
          flex:1 1 70px; background:${surf}; border:1px solid ${bdr};
          border-radius:9px; padding:8px 11px; cursor:pointer;
          transition:border-color 0.12s,background 0.12s;
        }
        .hm-trip-card.active { background:var(--tc-bg); border-color:var(--tc-bdr); }
        .hm-trip-label { font-size:10px; font-weight:600; text-transform:uppercase; letter-spacing:.05em; color:${muted}; margin-bottom:3px; }
        .hm-trip-val   { font-size:17px; font-weight:700; font-family:'JetBrains Mono',monospace; line-height:1; }
        .hm-trip-sub   { font-size:10px; color:${muted}; margin-top:2px; }
        .hm-cf-btn {
          font-size:11px; font-weight:600; padding:4px 11px; border-radius:20px;
          border:1px solid ${bdr}; background:none; cursor:pointer;
          color:${muted}; transition:all 0.12s; font-family:system-ui,sans-serif;
        }
        .hm-cf-btn:hover { background:${surf}; }
        .hm-cf-btn.active { color:var(--cf-c); background:var(--cf-bg); border-color:var(--cf-bdr); }
        .hm-context-bar {
          background:${surf}; border:1px solid ${bdr}; border-radius:9px;
          padding:9px 13px; margin-bottom:13px;
          display:flex; align-items:flex-start; gap:10px;
        }
        .hm-context-icon { font-size:15px; flex-shrink:0; margin-top:1px; }
        .hm-context-text { font-size:11.5px; color:${muted}; line-height:1.55; }
        .hm-context-text strong { font-weight:700; color:${txt}; }
        svg rect { transition:opacity 0.1s; cursor:pointer; }
        svg rect:hover { opacity:0.72; }
      `}</style>

      {/* ── Floating summary card (above heatmap card) ── */}
      <SummaryCard
        totalAll={summary.totalAll}         totalFeeder={summary.totalFeeder}
        totalChronic={summary.totalChronic} activeDays={summary.activeDays}
        streak={summary.streak}
        trip1Total={summary.trip1Total}     trip2Total={summary.trip2Total}     trip3Total={summary.trip3Total}
        shiftCompleted={summary.shiftCompleted} shiftInProgress={summary.shiftInProgress} shiftPunchedOut={summary.shiftPunchedOut}
        activeTab={activeTab} dark={dark}
      />

      {/* ── Main heatmap card ── */}
      <Card dark={dark} animDelay={700}>
        <SectionHeader
          title="Daily activity heatmap"
          sub="Each cell = one calendar day · color intensity = submissions that day"
          accent={accentColor}
          dark={dark}
        />

        {/* Tabs */}
        <div style={{ display:'flex', borderBottom:`1px solid ${bdr}`, marginBottom:14 }}>
          {([
            { id:'feeder'  as ActiveTab, label:'Feeder trips',  accent:'#39d353' },
            { id:'chronic' as ActiveTab, label:'Chronic shifts', accent:'#26a641' },
          ] as const).map(tab => (
            <button
              key={tab.id}
              className={`hm-tab-btn${activeTab === tab.id ? ' active' : ''}`}
              style={activeTab === tab.id ? { color:tab.accent, borderBottomColor:tab.accent } : {}}
              onClick={() => setActiveTab(tab.id)}
            >
              <span style={{ width:7, height:7, borderRadius:'50%', background:tab.accent, display:'inline-block' }} />
              {tab.label}
            </button>
          ))}
          {summary.bestDay && (
            <span style={{ marginLeft:'auto', fontSize:11, color:muted, fontFamily:"'JetBrains Mono',monospace", alignSelf:'center', paddingRight:4 }}>
              Peak: <span style={{ color:accentColor, fontWeight:700 }}>{summary.bestDay.feeder + summary.bestDay.chronic}</span> on {summary.bestDay.date}
            </span>
          )}
        </div>

        {/* Context bar — explains data source & logic */}
        <div className="hm-context-bar">
          <span className="hm-context-icon">{contextInfo.icon}</span>
          <div className="hm-context-text">
            <strong>{contextInfo.title}</strong> — {contextInfo.body}
          </div>
        </div>

        {/* Feeder: trip selector cards */}
        {activeTab === 'feeder' && (
          <div style={{ display:'flex', gap:7, marginBottom:13, flexWrap:'wrap' }}>
            {tripCards.map(tc => {
              const isActive = tripFilter === tc.id
              return (
                <div
                  key={tc.id}
                  className={`hm-trip-card${isActive ? ' active' : ''}`}
                  style={{ '--tc-bg': `${tc.color}18`, '--tc-bdr': `${tc.color}66` } as React.CSSProperties}
                  onClick={() => setTripFilter(tc.id)}
                >
                  <div className="hm-trip-label">{tc.label}</div>
                  <div className="hm-trip-val" style={{ color: isActive ? tc.color : (dark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.5)') }}>
                    {tc.value}
                  </div>
                  <div className="hm-trip-sub">{tc.sub}</div>
                </div>
              )
            })}
          </div>
        )}

        {/* Chronic: status filter pills */}
        {activeTab === 'chronic' && (
          <div style={{ display:'flex', gap:6, marginBottom:13, flexWrap:'wrap' }}>
            {chronicFilterBtns.map(btn => (
              <button
                key={btn.id}
                className={`hm-cf-btn${chronicFilter === btn.id ? ' active' : ''}`}
                style={{ '--cf-c': btn.color, '--cf-bg': `${btn.color}18`, '--cf-bdr': `${btn.color}66` } as React.CSSProperties}
                onClick={() => setChronicFilter(btn.id)}
                title={btn.sub}
              >
                {btn.label}
              </button>
            ))}
          </div>
        )}

        {/* Heatmap grid */}
        <div style={{ overflowX:'auto', paddingBottom:4 }} onMouseLeave={() => setHovered(null)}>
          <svg width={totalW + 32} height={7 * (cellSize + cellGap) + 28} style={{ display:'block' }}>
            {monthLabels.map((m, i) => (
              <text key={i} x={30 + m.col * (cellSize + cellGap)} y={10}
                fill={dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)'}
                fontSize={9} fontFamily="'JetBrains Mono',monospace">{m.label}</text>
            ))}
            {['','Mon','','Wed','','Fri',''].map((d, i) => (
              <text key={i} x={0} y={18 + i * (cellSize + cellGap) + cellSize - 2}
                fill={dark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.3)'}
                fontSize={8} fontFamily="'JetBrains Mono',monospace">{d}</text>
            ))}
            {weeks.map((week, wi) =>
              week.map((day, di) => {
                if (!day) return null
                const data = dayMap[day]
                const count = data ? getCountForDay(data) : 0
                const isToday = day === todayKey
                return (
                  <rect
                    key={`${wi}-${di}`}
                    x={30 + wi * (cellSize + cellGap)} y={16 + di * (cellSize + cellGap)}
                    width={cellSize} height={cellSize} rx={2}
                    fill={getColor(count, maxCount, activeTab, tripFilter, chronicFilter, dark)}
                    stroke={isToday ? accentColor : 'none'} strokeWidth={isToday ? 1.5 : 0}
                    onMouseEnter={data ? (e) => handleMouseEnter(e, data) : undefined}
                  />
                )
              })
            )}
          </svg>
        </div>

        {/* Legend */}
        <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:8, fontSize:10, color:muted, fontFamily:"'JetBrains Mono',monospace" }}>
          <span>Less</span>
          {legendColors.map((c, i) => (
            <div key={i} style={{ width:cellSize, height:cellSize, borderRadius:2, background:c }} />
          ))}
          <span>More</span>
          <span style={{ marginLeft:'auto' }}>
            {activeTab === 'feeder' ? summary.totalFeeder : summary.totalChronic} {activeTab} records (1 yr)
          </span>
        </div>
      </Card>

      {/* Tooltip — portal into document.body */}
      {hovered && <Tooltip data={hovered} activeTab={activeTab} dark={dark} />}
    </>
  )
}