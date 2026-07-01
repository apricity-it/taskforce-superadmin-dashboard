'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  AlertTriangle, Trophy, Circle, BarChart3,
  Download, FileText, MapPin, Clock,
  CheckCircle, AlertCircle, Flag, Shield, Flame,
  Users, RefreshCw, Loader2,
} from 'lucide-react'
import {
  fetchFeederPoints,
  fetchComplianceReports,
  fetchZones,
  type FeederPoint,
  type ComplianceReport,
} from '@/lib/dashboardQueries'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ThemeTokens {
  card: string
  surface: string
  cardBorder: string
  accent: string
  accentDim: string
  accentBorder: string
  textPrimary: string
  textSecondary: string
  textMuted: string
  green: string
  amber: string
  purple: string
}

interface ZoneData {
  zone: string
  total: number
  elim: number
  issues: number
  health: number
}

interface WorstEntry {
  fp: FeederPoint
  issues: number
  reasons: string[]
  dates: string[]
  wastePresent: boolean
}

interface BestEntry {
  fp: FeederPoint
  approvedCount: number
}

interface InsightsData {
  worstMap: Record<string, WorstEntry>
  bestMap: Record<string, BestEntry>
  feederPoints: FeederPoint[]
  zones: string[]
  totalApproved: number
}

interface ZoneTabsProps {
  zones: string[]
  active: string
  onChange: (z: string) => void
  T: ThemeTokens
}

interface DownloadBarProps {
  onCSV: () => void
  onPDF: () => void
  T: ThemeTokens
  loading?: boolean
}

// ─── Answer extraction ────────────────────────────────────────────────────────

function getAnswers(r: ComplianceReport) {
  if (Array.isArray(r.answers)) return r.answers
  // Fallback: indexed keys (r[0], r[1], …) used in some legacy docs
  const items = []
  for (let i = 0; i <= 15; i++) {
    const item = (r as any)[String(i)]
    if (item && typeof item === 'object' && item.questionId) items.push(item)
  }
  return items
}

// ─── Reason extraction ────────────────────────────────────────────────────────

const VEHICLE_DELAY_ANSWERS = new Set([
  'vehicle yet to arrive',
  'waste not collected',
  'not collected',
  'vehicle not arrived',
])

function getReasonsFromReport(r: ComplianceReport): { reasons: string[]; wastePresent: boolean } {
  const reasons = new Set<string>()
  let wastePresent = false

  getAnswers(r).forEach((a: any) => {
    const qid: string = a.questionId ?? ''
    const ansLow: string = (a.answer ?? '').trim().toLowerCase()

    if (qid === 'scp_area_clean' && ansLow === 'no') {
      reasons.add('Area Not Clean')
      wastePresent = true
    }
    if (qid === 'waste_segregated' && ansLow === 'no') {
      reasons.add('Waste Not Segregated')
      wastePresent = true
    }
    if (qid === 'waste_collection_status' && VEHICLE_DELAY_ANSWERS.has(ansLow)) {
      reasons.add('Vehicle Delayed')
    }
    if (qid === 'staff_present' && ansLow === 'no') {
      reasons.add('Staff Absent')
    }
    if (qid === 'workers_wearing_uniform' && ansLow === 'no') {
      reasons.add('No Uniform')
    }
    // "Are they mixing waste?" → 'no' = good; "Is waste separated?" → 'no' = bad
    // Verify question phrasing in Firestore before relying on this:
    if (qid === 'collection_team_mixing_waste' && ansLow === 'no') {
      reasons.add('Waste Mixing')
    }
    if (qid === 'driver_helper_uniform' && ansLow === 'no') {
      reasons.add('Driver No Uniform')
    }
    if (qid === 'vehicle_separate_compartments' && ansLow === 'no') {
      reasons.add('Compartment Issue')
    }
  })

  return { reasons: [...reasons], wastePresent }
}

// ─── Zone / ward / team resolvers ─────────────────────────────────────────────

function resolveZoneId(fp: FeederPoint): string {
  return fp.zoneId ?? 'unknown'
}

function resolveZoneLabel(fp: FeederPoint, zoneNameMap: Record<string, string>): string {
  if (fp.zoneId && zoneNameMap[fp.zoneId]) return zoneNameMap[fp.zoneId]
  if (fp.zoneName) return fp.zoneName
  return fp.zoneId ?? 'Zone - Other'
}

function resolveTeam(fp: FeederPoint): string {
  return fp.assignmentDetails?.name ?? (fp.assignedTeamId ? fp.assignedTeamId : 'Unassigned')
}

function resolveWard(fp: FeederPoint): string {
  return fp.wardName ?? fp.location?.address ?? '—'
}

// ─── Core builder ─────────────────────────────────────────────────────────────

function buildInsights(points: FeederPoint[], reports: ComplianceReport[], zoneNameMap: Record<string, string> = {}): InsightsData {
  const feederPoints = points.filter(p => {
    const t = p.type ?? 'feeder'
    return t === 'feeder'
  })
  const fpIds = new Set(feederPoints.map(p => p.id))

  // Deduplicate by report id (guards against any double-fetch edge cases)
  const seen = new Set<string>()
  const deduped = reports.filter(r => {
    if (seen.has(r.id)) return false
    seen.add(r.id)
    return true
  })

  const worstAgg: Record<string, {
    issues: number
    reasons: Set<string>
    dates: Set<string>
    wastePresent: boolean
  }> = {}

  const approvedAgg: Record<string, number> = {}

  deduped.forEach(r => {
    const fpid = r.feederPointId
    if (!fpid || !fpIds.has(fpid)) return  // skip chronic / unknown

    if (r.status === 'approved') {
      approvedAgg[fpid] = (approvedAgg[fpid] ?? 0) + 1
    }

    if (r.status === 'requires_action') {
      if (!worstAgg[fpid]) {
        worstAgg[fpid] = { issues: 0, reasons: new Set(), dates: new Set(), wastePresent: false }
      }
      worstAgg[fpid].issues++
      const { reasons, wastePresent } = getReasonsFromReport(r)
      reasons.forEach(rr => worstAgg[fpid].reasons.add(rr))
      if (r.tripDate) worstAgg[fpid].dates.add(r.tripDate)
      if (wastePresent) worstAgg[fpid].wastePresent = true
    }
  })

  const fpMap = Object.fromEntries(feederPoints.map(p => [p.id, p]))

  const worstMap: Record<string, WorstEntry> = {}
  Object.entries(worstAgg).forEach(([fpid, agg]) => {
    const fp = fpMap[fpid]
    if (!fp) return
    worstMap[fpid] = {
      fp,
      issues: agg.issues,
      reasons: [...agg.reasons],
      dates: [...agg.dates].sort(),
      wastePresent: agg.wastePresent,
    }
  })

  // bestMap: active feeder points with NO requires_action reports AND
  // at least 1 approved report (uninspected points are excluded)
  const bestMap: Record<string, BestEntry> = {}
  feederPoints.forEach(fp => {
    if (worstMap[fp.id] || fp.isEliminated) return
    const approvedCount = approvedAgg[fp.id] ?? 0
    if (approvedCount === 0) return  // never inspected → not "best"
    bestMap[fp.id] = { fp, approvedCount }
  })

  const zones = [...new Set(feederPoints.map(fp => resolveZoneLabel(fp, zoneNameMap)))].sort()
  const totalApproved = Object.values(approvedAgg).reduce((a, b) => a + b, 0)

  return { worstMap, bestMap, feederPoints, zones, totalApproved }
}

// ─── Download helpers ─────────────────────────────────────────────────────────

function downloadCSV(filename: string, headers: string[], rows: (string | number)[][]): void {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
  const csv = [headers, ...rows].map(r => r.map(esc).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function downloadPDF(title: string, headers: string[], rows: (string | number)[][], subtitle = ''): void {
  const trs = rows
    .map(r => `<tr>${r.map(c => `<td>${String(c).replace(/</g, '&lt;')}</td>`).join('')}</tr>`)
    .join('')
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
  <style>
    body{font-family:Arial,sans-serif;padding:28px;color:#111;font-size:13px}
    h1{font-size:17px;margin:0 0 4px}
    p.sub{font-size:11px;color:#666;margin:0 0 18px}
    table{width:100%;border-collapse:collapse}
    th{background:#f2f2f2;padding:7px 9px;text-align:left;border:1px solid #ddd;font-size:11px;font-weight:600}
    td{padding:6px 9px;border:1px solid #ddd;vertical-align:top;font-size:11px}
    tr:nth-child(even) td{background:#fafafa}
    .foot{margin-top:20px;font-size:10px;color:#aaa}
    @media print{body{padding:12px}}
  </style></head><body>
  <h1>${title}</h1>
  ${subtitle ? `<p class="sub">${subtitle}</p>` : ''}
  <table>
    <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${trs}</tbody>
  </table>
  <p class="foot">Generated ${new Date().toLocaleString()} · Taskforce Dashboard</p>
  </body></html>`
  const w = window.open('', '_blank', 'width=960,height=720')
  if (!w) return
  w.document.write(html); w.document.close(); w.focus()
  setTimeout(() => w.print(), 700)
}

function healthColor(pct: number) {
  if (pct >= 70) return { bar: 'bg-green-500', text: 'text-green-600' }
  if (pct >= 40) return { bar: 'bg-amber-400', text: 'text-amber-600' }
  return { bar: 'bg-red-500', text: 'text-red-600' }
}

// ─── Reason tag colors ────────────────────────────────────────────────────────

type ReasonKey =
  | 'Area Not Clean' | 'Waste Not Segregated' | 'Vehicle Delayed'
  | 'Staff Absent' | 'No Uniform' | 'Waste Mixing'
  | 'Driver No Uniform' | 'Compartment Issue'

const REASON_COLOR: Record<ReasonKey, { bg: string; text: string; border: string }> = {
  'Area Not Clean': { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
  'Waste Not Segregated': { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  'Vehicle Delayed': { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  'Staff Absent': { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
  'No Uniform': { bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-200' },
  'Waste Mixing': { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  'Driver No Uniform': { bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-200' },
  'Compartment Issue': { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
}

function getReasonColor(r: string) {
  return REASON_COLOR[r as ReasonKey] ?? { bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-200' }
}

// ─── Shared UI ────────────────────────────────────────────────────────────────

function ZoneTabs({ zones, active, onChange, T }: ZoneTabsProps) {
  return (
    <div className="flex flex-wrap gap-1.5 mb-4">
      {zones.map(z => (
        <button key={z} onClick={() => onChange(z)}
          className="text-xs font-medium px-3 py-1 rounded-full transition-all"
          style={z === active
            ? { background: T.accentDim, color: T.accent, border: `1px solid ${T.accentBorder}` }
            : { background: 'transparent', color: T.textSecondary, border: `1px solid ${T.cardBorder}` }}
        >{z}</button>
      ))}
    </div>
  )
}

function DownloadBar({ onCSV, onPDF, T, loading }: DownloadBarProps) {
  const s = { background: T.surface, border: `1px solid ${T.cardBorder}`, color: T.textSecondary }
  return (
    <div className="flex items-center gap-2">
      <button onClick={onCSV} disabled={loading}
        className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition hover:opacity-80 disabled:opacity-40"
        style={s}>
        <Download className="h-3 w-3" /> CSV
      </button>
      <button onClick={onPDF} disabled={loading}
        className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition hover:opacity-80 disabled:opacity-40"
        style={s}>
        <FileText className="h-3 w-3" /> PDF
      </button>
    </div>
  )
}

function ReasonTag({ reason }: { reason: string }) {
  const c = getReasonColor(reason)
  return (
    <span className={`inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full border ${c.bg} ${c.text} ${c.border}`}>
      {reason}
    </span>
  )
}

function Card({ T, children, extra }: { T: ThemeTokens; children: React.ReactNode; extra?: string }) {
  return (
    <div className={`rounded-2xl p-5 ${extra ?? ''}`} style={{ background: T.card, border: `1px solid ${T.cardBorder}` }}>
      {children}
    </div>
  )
}

function CardHeader({ title, icon, badge, right, T }: {
  title: string; icon: React.ReactNode; badge?: React.ReactNode
  right: React.ReactNode; T: ThemeTokens
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: T.textPrimary }}>
        {icon}{title}{badge}
      </h2>
      {right}
    </div>
  )
}

function Empty({ msg, T }: { msg: string; T: ThemeTokens }) {
  return <p className="text-xs py-8 text-center" style={{ color: T.textMuted }}>{msg}</p>
}

function Spinner({ T }: { T: ThemeTokens }) {
  return (
    <div className="flex items-center justify-center py-10 gap-2" style={{ color: T.textMuted }}>
      <Loader2 className="h-4 w-4 animate-spin" />
      <span className="text-xs">Loading live data…</span>
    </div>
  )
}

// ─── Component 1: Worst ───────────────────────────────────────────────────────

function WorstFeederPoints({
  worstMap, feederPoints, zones, loading, T,
}: {
  worstMap: Record<string, WorstEntry>
  feederPoints: FeederPoint[]
  zones: string[]
  loading: boolean
  T: ThemeTokens
}) {
  const worstZones = zones.filter(z =>
    feederPoints.some(fp => resolveZoneLabel(fp, {}) === z && !fp.isEliminated && worstMap[fp.id])
  )
  const [activeZone, setActiveZone] = useState<string>(worstZones[0] ?? '')
  useEffect(() => {
    if (worstZones.length && !worstZones.includes(activeZone)) setActiveZone(worstZones[0])
  }, [worstZones.join(',')])  // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = feederPoints
    .filter(fp => !fp.isEliminated && worstMap[fp.id] && resolveZoneLabel(fp, {}) === activeZone)
    .sort((a, b) => (worstMap[b.id]?.issues ?? 0) - (worstMap[a.id]?.issues ?? 0))
    .slice(0, 5)

  const allWorst = feederPoints
    .filter(fp => worstMap[fp.id])
    .sort((a, b) => (worstMap[b.id]?.issues ?? 0) - (worstMap[a.id]?.issues ?? 0))

  const csvH = ['Rank', 'Name', 'Zone', 'Ward', 'Address', 'Team', 'Issues', 'Waste Present', 'Action Required', 'Reasons', 'Last Reported']
  const csvR: (string | number)[][] = allWorst.map((fp, i) => {
    const d = worstMap[fp.id]
    return [i + 1, fp.name, resolveZoneLabel(fp, {}), resolveWard(fp), fp.location?.address ?? '—',
    resolveTeam(fp), d.issues, d.wastePresent ? 'Yes' : 'No',
    d.wastePresent ? 'Yes — Waste Present' : 'No',
    d.reasons.join('; '), d.dates[d.dates.length - 1] ?? '—']
  })

  return (
    <Card T={T}>
      <CardHeader title="Zone-wise worst feeder points" T={T}
        icon={<div className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-50"><AlertTriangle className="h-4 w-4 text-red-500" strokeWidth={1.8} /></div>}
        right={<DownloadBar loading={loading}
          onCSV={() => downloadCSV('worst_feeder_points.csv', csvH, csvR)}
          onPDF={() => downloadPDF('Zone-wise Worst Feeder Points', csvH, csvR, `${allWorst.length} critical feeder points`)}
          T={T} />}
      />
      {loading ? <Spinner T={T} /> : worstZones.length === 0 ? <Empty msg="No critical feeder points found" T={T} /> : (
        <>
          <ZoneTabs zones={worstZones} active={activeZone} onChange={setActiveZone} T={T} />
          <div className="space-y-3">
            {filtered.length === 0 ? <Empty msg={`No critical points in ${activeZone}`} T={T} /> :
              filtered.map((fp, i) => {
                const d = worstMap[fp.id]
                return (
                  <div key={fp.id} className="flex items-start gap-3 p-3 rounded-xl"
                    style={{ background: T.surface, border: `1px solid ${T.cardBorder}` }}>
                    <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-semibold mt-0.5 bg-red-50 text-red-700">{i + 1}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate mb-0.5" style={{ color: T.textPrimary }}>{fp.name}</p>
                      <div className="flex items-center gap-1 mb-2">
                        <MapPin className="h-2.5 w-2.5 flex-shrink-0" style={{ color: T.textMuted }} />
                        <span className="text-[10px] truncate" style={{ color: T.textMuted }}>
                          {resolveWard(fp)} · {resolveZoneLabel(fp, {})} · {resolveTeam(fp)}
                        </span>
                      </div>
                      {d.reasons.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2">
                          {d.reasons.map(r => <ReasonTag key={r} reason={r} />)}
                        </div>
                      )}
                      {d.wastePresent && (
                        <div className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 mb-1.5">
                          <Flame className="h-2.5 w-2.5" /> Action required — waste present
                        </div>
                      )}
                      <div className="flex items-center gap-3 mt-1">
                        <span className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">
                          <Flag className="h-2.5 w-2.5" />{d.issues} issue{d.issues > 1 ? 's' : ''}
                        </span>
                        <span className="flex items-center gap-1 text-[10px]" style={{ color: T.textMuted }}>
                          <Clock className="h-2.5 w-2.5" />Last: {d.dates[d.dates.length - 1] ?? '—'}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
          </div>
        </>
      )}
    </Card>
  )
}

// ─── Component 2: Best ────────────────────────────────────────────────────────

function BestFeederPoints({
  bestMap, feederPoints, zones, loading, T,
}: {
  bestMap: Record<string, BestEntry>
  feederPoints: FeederPoint[]
  zones: string[]
  loading: boolean
  T: ThemeTokens
}) {
  const bestZones = zones.filter(z =>
    feederPoints.some(fp => resolveZoneLabel(fp, {}) === z && !fp.isEliminated && bestMap[fp.id])
  )
  const [activeZone, setActiveZone] = useState<string>(bestZones[0] ?? '')
  useEffect(() => {
    if (bestZones.length && !bestZones.includes(activeZone)) setActiveZone(bestZones[0])
  }, [bestZones.join(',')])  // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = feederPoints
    .filter(fp => !fp.isEliminated && bestMap[fp.id] && resolveZoneLabel(fp, {}) === activeZone)
    .map(fp => ({ fp, count: bestMap[fp.id].approvedCount }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  const maxCount = filtered[0]?.count ?? 1

  const allBest = feederPoints
    .filter(fp => !fp.isEliminated && bestMap[fp.id])
    .map(fp => ({ fp, count: bestMap[fp.id].approvedCount }))
    .sort((a, b) => b.count - a.count)

  const csvH = ['Rank', 'Name', 'Zone', 'Ward', 'Address', 'Team', 'Approved Reports', 'Status']
  const csvR: (string | number)[][] = allBest.map(({ fp, count }, i) => [
    i + 1, fp.name, resolveZoneLabel(fp, {}), resolveWard(fp), fp.location?.address ?? '—',
    resolveTeam(fp), count, 'Active · No Issues',
  ])

  return (
    <Card T={T}>
      <CardHeader title="Zone-wise best feeder points" T={T}
        icon={<div className="flex h-7 w-7 items-center justify-center rounded-lg bg-green-50"><Trophy className="h-4 w-4 text-green-600" strokeWidth={1.8} /></div>}
        right={<DownloadBar loading={loading}
          onCSV={() => downloadCSV('best_feeder_points.csv', csvH, csvR)}
          onPDF={() => downloadPDF('Zone-wise Best Feeder Points', csvH, csvR, `${allBest.length} clean feeder points`)}
          T={T} />}
      />
      {loading ? <Spinner T={T} /> : bestZones.length === 0 ? <Empty msg="No best feeder points found" T={T} /> : (
        <>
          <ZoneTabs zones={bestZones} active={activeZone} onChange={setActiveZone} T={T} />
          <div className="space-y-3">
            {filtered.length === 0 ? <Empty msg={`No data for ${activeZone}`} T={T} /> :
              filtered.map(({ fp, count }, i) => {
                const pct = Math.round((count / maxCount) * 100)
                return (
                  <div key={fp.id} className="flex items-start gap-3 p-3 rounded-xl"
                    style={{ background: T.surface, border: `1px solid ${T.cardBorder}` }}>
                    <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-semibold mt-0.5 bg-green-50 text-green-700">{i + 1}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate mb-0.5" style={{ color: T.textPrimary }}>{fp.name}</p>
                      <div className="flex items-center gap-1 mb-2">
                        <MapPin className="h-2.5 w-2.5 flex-shrink-0" style={{ color: T.textMuted }} />
                        <span className="text-[10px] truncate" style={{ color: T.textMuted }}>
                          {resolveWard(fp)} · {resolveZoneLabel(fp, {})} · {resolveTeam(fp)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">
                          <CheckCircle className="h-2.5 w-2.5" />{count} approved
                        </span>
                        <span className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                          <Shield className="h-2.5 w-2.5" />No issues
                        </span>
                      </div>
                      <div className="h-1 w-32 rounded-full overflow-hidden" style={{ background: T.cardBorder }}>
                        <div className="h-full rounded-full bg-green-500 transition-all duration-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  </div>
                )
              })}
          </div>
        </>
      )}
    </Card>
  )
}

// ─── Component 3: Eliminated ──────────────────────────────────────────────────

function EliminatedFeederPoints({
  feederPoints, zones, loading, T,
}: {
  feederPoints: FeederPoint[]
  zones: string[]
  loading: boolean
  T: ThemeTokens
}) {
  const eliminated = feederPoints.filter(fp => fp.isEliminated)
  const elimZones = zones.filter(z => eliminated.some(fp => resolveZoneLabel(fp, {}) === z))
  const [activeZone, setActiveZone] = useState<string>(elimZones[0] ?? '')
  useEffect(() => {
    if (elimZones.length && !elimZones.includes(activeZone)) setActiveZone(elimZones[0])
  }, [elimZones.join(',')])  // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = eliminated.filter(fp => resolveZoneLabel(fp, {}) === activeZone)

  const csvH = ['Name', 'Zone', 'Ward', 'Address', 'Team', 'Status', 'Note']
  const csvR: (string | number)[][] = eliminated.map(fp => [
    fp.name, resolveZoneLabel(fp, {}), resolveWard(fp), fp.location?.address ?? '—',
    resolveTeam(fp), 'Eliminated', 'Successfully eliminated',
  ])

  const badge = (
    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full"
      style={{ background: T.surface, color: T.textSecondary, border: `1px solid ${T.cardBorder}` }}>
      {eliminated.length} total
    </span>
  )

  return (
    <Card T={T}>
      <CardHeader title="Zone-wise eliminated feeder points" T={T}
        badge={badge}
        icon={<div className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: T.surface, border: `1px solid ${T.cardBorder}` }}><Circle className="h-4 w-4" style={{ color: T.textSecondary }} strokeWidth={1.8} /></div>}
        right={<DownloadBar loading={loading}
          onCSV={() => downloadCSV('eliminated_feeder_points.csv', csvH, csvR)}
          onPDF={() => downloadPDF('Zone-wise Eliminated Feeder Points', csvH, csvR, `${eliminated.length} eliminated across ${elimZones.length} zones`)}
          T={T} />}
      />
      {loading ? <Spinner T={T} /> : elimZones.length === 0 ? <Empty msg="No eliminated feeder points found" T={T} /> : (
        <>
          <ZoneTabs zones={elimZones} active={activeZone} onChange={setActiveZone} T={T} />
          {filtered.length === 0 ? <Empty msg={`No eliminated points in ${activeZone}`} T={T} /> :
            filtered.map(fp => (
              <div key={fp.id} className="flex items-center justify-between py-2.5 border-b last:border-0"
                style={{ borderColor: T.cardBorder }}>
                <div>
                  <p className="text-xs font-medium" style={{ color: T.textPrimary }}>{fp.name}</p>
                  <p className="flex items-center gap-0.5 text-[10px] mt-0.5" style={{ color: T.textMuted }}>
                    <MapPin className="h-2.5 w-2.5" />
                    {fp.location?.address ?? '—'} · {resolveWard(fp)} · {resolveTeam(fp)}
                  </p>
                </div>
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0"
                  style={{ background: T.surface, color: T.textSecondary, border: `1px solid ${T.cardBorder}` }}>
                  Eliminated
                </span>
              </div>
            ))}
        </>
      )}
    </Card>
  )
}

// ─── Component 4: Overall Smart Report ───────────────────────────────────────

function OverallSmartReport({
  feederPoints, worstMap, zones, totalApproved, loading, T,
}: {
  feederPoints: FeederPoint[]
  worstMap: Record<string, WorstEntry>
  zones: string[]
  totalApproved: number
  loading: boolean
  T: ThemeTokens
}) {
  const worstIds = new Set(Object.keys(worstMap))
  const total = feederPoints.length
  const eliminated = feederPoints.filter(fp => fp.isEliminated).length
  const active = feederPoints.filter(fp => !fp.isEliminated && fp.status === 'active').length
  const withIssues = feederPoints.filter(fp => worstIds.has(fp.id) && !fp.isEliminated).length
  const actionReq = feederPoints.filter(fp => worstMap[fp.id]?.wastePresent).length
  const unassigned = feederPoints.filter(fp => !fp.isEliminated && !fp.assignedTeamId && !fp.assignedUserId).length

  const zoneData: ZoneData[] = zones.map(z => {
    const zfps = feederPoints.filter(fp => resolveZoneLabel(fp, {}) === z)
    const zElim = zfps.filter(fp => fp.isEliminated).length
    const zIssues = zfps.filter(fp => worstIds.has(fp.id) && !fp.isEliminated).length
    const health = zfps.length ? Math.round(((zfps.length - zElim - zIssues) / zfps.length) * 100) : 0
    return { zone: z, total: zfps.length, elim: zElim, issues: zIssues, health }
  })

  const topWorstZone = [...zoneData].sort((a, b) => b.issues - a.issues)[0]
  const topElimZone = [...zoneData].sort((a, b) => b.elim - a.elim)[0]

  const metrics = [
    { label: 'Total feeder points', value: total, color: T.accent },
    { label: 'Active', value: active, color: '#16a34a' },
    { label: 'Eliminated', value: eliminated, color: T.textSecondary },
    { label: 'With issues', value: withIssues, color: '#dc2626' },
    { label: 'Action required', value: actionReq, color: '#d97706' },
    { label: 'Approved reports', value: totalApproved, color: T.accent },
  ]

  const csvH = ['Zone', 'Total', 'Active', 'Eliminated', 'With Issues', 'Health %']
  const csvR: (string | number)[][] = [
    ...zoneData.map(z => [z.zone, z.total, z.total - z.elim - z.issues, z.elim, z.issues, `${z.health}%`]),
    ['TOTAL', total, active, eliminated, withIssues, `${total ? Math.round(((total - eliminated - withIssues) / total) * 100) : 0}%`],
  ]

  const observations = [
    { icon: <Trophy className="h-3 w-3 text-green-600" />, text: topElimZone?.elim ? `${topElimZone.zone} leads with ${topElimZone.elim} eliminated points — strongest cleanup progress.` : 'No eliminations recorded yet.' },
    { icon: <AlertTriangle className="h-3 w-3 text-red-500" />, text: topWorstZone?.issues ? `${topWorstZone.zone} has the most active issues (${topWorstZone.issues} points) — needs immediate intervention.` : 'No critical issues across zones.' },
    { icon: <Flame className="h-3 w-3 text-amber-500" />, text: `${actionReq} feeder point${actionReq !== 1 ? 's' : ''} have waste present and require immediate team action.` },
    { icon: <Users className="h-3 w-3" style={{ color: T.textSecondary }} />, text: `${unassigned} point${unassigned !== 1 ? 's' : ''} unassigned — allocate teams to ensure full coverage.` },
    { icon: <AlertCircle className="h-3 w-3 text-orange-500" />, text: 'Top recurring issues: Area Not Clean · Staff Absent · Vehicle Delayed.' },
  ]

  return (
    <Card T={T}>
      <CardHeader title="Overall smart report" T={T}
        icon={<div className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: T.accentDim }}><BarChart3 className="h-4 w-4" style={{ color: T.accent }} strokeWidth={1.8} /></div>}
        right={<DownloadBar loading={loading}
          onCSV={() => downloadCSV('overall_smart_report.csv', csvH, csvR)}
          onPDF={() => downloadPDF('Overall Smart Report — Feeder Points', csvH, csvR, `Action required: ${actionReq} · Unassigned: ${unassigned} · Approved: ${totalApproved}`)}
          T={T} />}
      />
      {loading ? <Spinner T={T} /> : (
        <>
          <div className="grid grid-cols-3 gap-2 mb-5">
            {metrics.map(m => (
              <div key={m.label} className="rounded-xl p-3 text-center" style={{ background: T.surface, border: `1px solid ${T.cardBorder}` }}>
                <p className="text-lg font-semibold leading-none" style={{ color: m.color, fontFamily: "'JetBrains Mono', monospace" }}>{m.value}</p>
                <p className="text-[10px] mt-1 leading-tight" style={{ color: T.textSecondary }}>{m.label}</p>
              </div>
            ))}
          </div>

          <p className="text-xs font-semibold mb-3" style={{ color: T.textPrimary }}>Zone health index</p>
          <div className="space-y-3 mb-5">
            {zoneData.map(z => {
              const hc = healthColor(z.health)
              return (
                <div key={z.zone}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs" style={{ color: T.textPrimary }}>{z.zone}</span>
                    <div className="flex items-center gap-2">
                      {z.elim > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: T.surface, color: T.textSecondary }}>{z.elim} elim</span>}
                      {z.issues > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600">{z.issues} issues</span>}
                      <span className={`text-xs font-semibold ${hc.text}`}>{z.health}%</span>
                    </div>
                  </div>
                  <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: T.cardBorder }}>
                    <div className={`h-full rounded-full transition-all duration-700 ${hc.bar}`} style={{ width: `${z.health}%` }} />
                  </div>
                </div>
              )
            })}
          </div>

          <p className="text-xs font-semibold mb-2" style={{ color: T.textPrimary }}>Key observations</p>
          <div className="space-y-1.5">
            {observations.map((obs, i) => (
              <div key={i} className="flex items-start gap-2 text-xs" style={{ color: T.textSecondary }}>
                <span className="mt-0.5 flex-shrink-0">{obs.icon}</span>
                <span>{obs.text}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function FeederPointInsights({
  T,
  dateFrom,
  dateTo,
}: {
  T?: ThemeTokens
  dateFrom?: string
  dateTo?: string
}) {
  const theme: ThemeTokens = T ?? {
    card: '#ffffff', surface: '#f9fafb', cardBorder: '#e5e7eb',
    accent: '#6366f1', accentDim: '#ede9fe', accentBorder: '#c4b5fd',
    textPrimary: '#111827', textSecondary: '#6b7280', textMuted: '#9ca3af',
    green: '#16a34a', amber: '#d97706', purple: '#7c3aed',
  }

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<InsightsData | null>(null)

  const from = dateFrom ?? new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  const to = dateTo ?? new Date().toISOString().slice(0, 10)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [points, zones] = await Promise.all([
        fetchFeederPoints({ type: 'all', includeEliminated: true }),
        fetchZones(),
      ])

      const zoneNameMap = Object.fromEntries(zones.map(z => [z.id, z.name]))

      const [issueReports, approvedReports] = await Promise.all([
        fetchComplianceReports({ status: 'requires_action' }),
        fetchComplianceReports({ status: 'approved', dateFrom: from, dateTo: to, limitCount: 500 }),
      ])

      console.log('=== FeederPointInsights Debug ===')
      console.log('points total:', points.length)
      console.log('points sample:', points.slice(0, 3).map(p => ({ id: p.id, name: p.name, type: p.type, zoneId: p.zoneId, zoneName: p.zoneName, isEliminated: p.isEliminated })))
      console.log('zoneNameMap:', zoneNameMap)
      console.log('issueReports total:', issueReports.length)
      console.log('approvedReports total:', approvedReports.length)
      console.log('issueReports sample:', issueReports.slice(0, 3).map(r => ({ id: r.id, status: r.status, feederPointId: r.feederPointId, feederPointType: r.feederPointType })))

      const insights = buildInsights(points, [...issueReports, ...approvedReports], zoneNameMap)
      console.log('worstMap keys:', Object.keys(insights.worstMap).length)
      console.log('bestMap keys:', Object.keys(insights.bestMap).length)
      console.log('zones:', insights.zones)
      console.log('feederPoints after filter:', insights.feederPoints.length)
      setData(insights)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load data'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [from, to])

  useEffect(() => { load() }, [load])

  if (error) {
    return (
      <div className="rounded-2xl p-5 flex items-center justify-between"
        style={{ background: theme.card, border: `1px solid ${theme.cardBorder}` }}>
        <div className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-red-500" />
          <span className="text-xs" style={{ color: theme.textSecondary }}>{error}</span>
        </div>
        <button onClick={load}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg"
          style={{ background: theme.surface, border: `1px solid ${theme.cardBorder}`, color: theme.textSecondary }}>
          <RefreshCw className="h-3 w-3" /> Retry
        </button>
      </div>
    )
  }

  const { worstMap, bestMap, feederPoints, zones, totalApproved } = data ?? {
    worstMap: {}, bestMap: {}, feederPoints: [], zones: [], totalApproved: 0,
  }

  return (
    <div className="space-y-4">
      <WorstFeederPoints worstMap={worstMap} feederPoints={feederPoints} zones={zones} loading={loading} T={theme} />
      <BestFeederPoints bestMap={bestMap} feederPoints={feederPoints} zones={zones} loading={loading} T={theme} />
      <EliminatedFeederPoints feederPoints={feederPoints} zones={zones} loading={loading} T={theme} />
      <OverallSmartReport
        feederPoints={feederPoints} worstMap={worstMap} zones={zones}
        totalApproved={totalApproved} loading={loading} T={theme}
      />
    </div>
  )
}