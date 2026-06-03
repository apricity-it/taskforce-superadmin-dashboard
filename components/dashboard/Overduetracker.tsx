import { useMemo, useState } from 'react'
import { getTokens } from '@/lib/dashboardTheme'
import { Card, SectionHeader, ExportButton } from './DashboardUI'
import { exportToCSV } from '@/lib/dashboardExport'
import type { ComplianceReport, FeederPoint } from '@/lib/dashboardQueries'

function tsToDate(v: any): Date | null {
  if (!v) return null
  if (typeof v.toDate === 'function') return v.toDate()
  if (typeof v.seconds === 'number') return new Date(v.seconds * 1000)
  if (typeof v._seconds === 'number') return new Date(v._seconds * 1000)
  if (v instanceof Date) return v
  return null
}

interface OverduePoint {
  id: string
  name: string
  type: 'feeder' | 'chronic'
  zone: string
  ward: string
  team: string
  daysSince: number
  lastDate: string | null
  frequency: string
  status: string
}

export function OverdueTracker({
  points, reports, dark,
}: {
  points: FeederPoint[]
  reports: ComplianceReport[]
  dark: boolean
}) {
  const T = getTokens(dark)
  const [thresh, setThresh] = useState(3)
  const [typeFilter, setTypeFilter] = useState<'all' | 'feeder' | 'chronic'>('all')

  const overdue = useMemo((): OverduePoint[] => {
    const now = Date.now()
    const lastInspection: Record<string, Date> = {}

    reports.forEach(r => {
      if (!r.feederPointId) return
      const d = tsToDate(r.submittedAt ?? r.createdAt)
      if (!d) return
      if (!lastInspection[r.feederPointId] || d > lastInspection[r.feederPointId]) {
        lastInspection[r.feederPointId] = d
      }
    })

    return points
      .filter(p => !p.isEliminated && p.status === 'active')
      .map(p => {
        const last = lastInspection[p.id] || tsToDate(p.lastInspection)
        const daysSince = last ? Math.floor((now - last.getTime()) / 86400000) : 999
        return {
          id: p.id,
          name: p.name,
          type: (p.type ?? 'feeder') as 'feeder' | 'chronic',
          zone: p.zoneName || '—',
          ward: p.wardName || '—',
          team: (p as any).assignmentDetails?.name || 'Unassigned',
          daysSince,
          lastDate: last ? last.toISOString().slice(0, 10) : null,
          frequency: (p as any).inspectionFrequency?.type || 'unknown',
          status: p.status,
        }
      })
      .filter(p => p.daysSince >= thresh)
      .sort((a, b) => b.daysSince - a.daysSince)
  }, [points, reports, thresh])

  const filtered = useMemo(() =>
    typeFilter === 'all' ? overdue : overdue.filter(p => p.type === typeFilter),
    [overdue, typeFilter]
  )

  const critical  = overdue.filter(p => p.daysSince >= 14).length
  const serious   = overdue.filter(p => p.daysSince >= 7 && p.daysSince < 14).length
  const warning   = overdue.filter(p => p.daysSince >= thresh && p.daysSince < 7).length
  const neverInsp = overdue.filter(p => p.daysSince === 999).length
  const feederOD  = overdue.filter(p => p.type === 'feeder').length
  const chronicOD = overdue.filter(p => p.type === 'chronic').length

  const urgencyColor = (d: number) => {
    if (d === 999) return T.red
    if (d >= 14)   return T.red
    if (d >= 7)    return T.amber
    return T.gold
  }

  const urgencyBg = (d: number) => {
    if (d === 999 || d >= 14) return `${T.red}15`
    if (d >= 7)               return `${T.amber}15`
    return `${T.gold}15`
  }

  const urgencyLabel = (d: number) => {
    if (d === 999) return 'NEVER'
    if (d >= 14)   return 'CRITICAL'
    if (d >= 7)    return 'SERIOUS'
    return 'WARNING'
  }

  return (
    <Card dark={dark} animDelay={650}>
      <SectionHeader
        title={`Overdue inspections (${overdue.length})`}
        sub={`${critical} critical · ${serious} serious · ${warning} warning · ${neverInsp} never inspected`}
        accent={T.amber}
        dark={dark}
        rightSlot={
          <div className="flex items-center gap-2">
            <select
              value={thresh}
              onChange={e => setThresh(Number(e.target.value))}
              style={{
                background: dark ? T.surface : '#f8f7f5',
                border: `1px solid ${T.cardBorder}`,
                borderRadius: 6, padding: '3px 8px',
                fontSize: 11, color: T.textPrimary,
                cursor: 'pointer', outline: 'none',
              }}
            >
              <option value={1}>1+ days</option>
              <option value={3}>3+ days</option>
              <option value={7}>7+ days</option>
              <option value={14}>14+ days</option>
            </select>
            {overdue.length > 0 && (
              <ExportButton
                onClick={() => exportToCSV(overdue.map(p => ({
                  Point: p.name, Type: p.type, Zone: p.zone, Ward: p.ward,
                  Team: p.team,
                  'Days Since': p.daysSince === 999 ? 'Never' : p.daysSince,
                  'Last Inspected': p.lastDate || 'Never',
                  Frequency: p.frequency,
                })), 'overdue-inspections')}
                label="CSV" dark={dark}
              />
            )}
          </div>
        }
      />

      {overdue.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 gap-2" style={{ color: T.green }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          <span style={{ fontSize: 13, fontWeight: 600 }}>All active points inspected within {thresh} day{thresh !== 1 ? 's' : ''}</span>
          <span style={{ fontSize: 11, color: T.textMuted }}>No overdue inspections at the current threshold</span>
        </div>
      ) : (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            {[
              { label: 'Critical (14d+)', value: critical,  color: T.red,   bg: `${T.red}12`   },
              { label: 'Serious (7-13d)', value: serious,   color: T.amber, bg: `${T.amber}12` },
              { label: 'Warning',         value: warning,   color: T.gold,  bg: `${T.gold}12`  },
              { label: 'Never inspected', value: neverInsp, color: T.red,   bg: `${T.red}08`   },
            ].map((s, i) => (
              <div key={s.label} className="rounded-xl p-3 text-center"
                style={{
                  background: s.bg,
                  border: `1px solid ${s.color}25`,
                  animation: `slideUp 0.35s ease ${i * 50}ms both`,
                }}>
                <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: s.color, margin: '0 0 3px' }}>
                  {s.label}
                </p>
                <p className="text-[20px] font-bold leading-none" style={{ color: s.color, fontFamily: "'JetBrains Mono', monospace", margin: 0 }}>
                  {s.value}
                </p>
              </div>
            ))}
          </div>

          {/* Type filter tabs */}
          <div className="flex items-center gap-1.5 mb-3">
            {([['all', `All (${overdue.length})`], ['feeder', `Feeder (${feederOD})`], ['chronic', `Chronic (${chronicOD})`]] as const).map(([val, lbl]) => (
              <button key={val}
                onClick={() => setTypeFilter(val)}
                style={{
                  padding: '3px 10px', borderRadius: 5,
                  fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  border: `1px solid ${typeFilter === val
                    ? (val === 'feeder' ? T.accent : val === 'chronic' ? T.gold : T.amber)
                    : T.cardBorder}`,
                  background: typeFilter === val
                    ? (val === 'feeder' ? `${T.accent}20` : val === 'chronic' ? `${T.gold}20` : `${T.amber}20`)
                    : 'transparent',
                  color: typeFilter === val
                    ? (val === 'feeder' ? T.accent : val === 'chronic' ? T.gold : T.amber)
                    : T.textSecondary,
                }}>
                {lbl}
              </button>
            ))}
          </div>

          {/* List */}
          <div style={{ maxHeight: 320, overflowY: 'auto', scrollbarWidth: 'thin' }}>
            {filtered.slice(0, 60).map((p, i) => (
              <div
                key={p.id}
                className="flex items-center gap-3 py-2 px-2 rounded-lg mb-1"
                style={{
                  background: urgencyBg(p.daysSince),
                  border: `1px solid ${urgencyColor(p.daysSince)}20`,
                  animation: `slideInLeft 0.3s ease ${Math.min(i * 25, 400)}ms both`,
                }}
              >
                {/* Days badge */}
                <div className="flex-shrink-0 text-center rounded-lg px-2 py-1"
                  style={{ minWidth: 52, background: `${urgencyColor(p.daysSince)}20` }}>
                  <span style={{
                    fontSize: 15, fontWeight: 800,
                    fontFamily: "'JetBrains Mono', monospace",
                    color: urgencyColor(p.daysSince),
                    display: 'block', lineHeight: 1,
                  }}>
                    {p.daysSince === 999 ? '∞' : p.daysSince}
                  </span>
                  <span style={{ fontSize: 8, color: urgencyColor(p.daysSince), display: 'block', marginTop: 1, fontWeight: 700, letterSpacing: '0.04em' }}>
                    {urgencyLabel(p.daysSince)}
                  </span>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[12px] font-semibold truncate" style={{ color: T.textPrimary }}>
                      {p.name}
                    </span>
                    <span style={{
                      fontSize: 9, padding: '1px 5px', borderRadius: 4, fontWeight: 700,
                      background: p.type === 'chronic' ? `${T.gold}20` : `${T.accent}15`,
                      color: p.type === 'chronic' ? T.gold : T.accent,
                    }}>
                      {p.type}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 flex-wrap mt-0.5" style={{ fontSize: 10, color: T.textMuted }}>
                    {p.zone !== '—' && <span>{p.zone}</span>}
                    {p.ward !== '—' && <><span>·</span><span>{p.ward}</span></>}
                    <span>·</span>
                    <span style={{ color: p.team === 'Unassigned' ? T.amber : T.textMuted }}>
                      {p.team}
                    </span>
                  </div>
                </div>

                {/* Last inspected */}
                <div className="flex-shrink-0 text-right">
                  <span style={{ fontSize: 10, color: T.textMuted, fontFamily: "'JetBrains Mono', monospace", display: 'block' }}>
                    {p.lastDate || 'Never'}
                  </span>
                  <span style={{ fontSize: 9, color: T.textMuted }}>last inspected</span>
                </div>
              </div>
            ))}
            {filtered.length > 60 && (
              <p className="text-center py-2" style={{ color: T.textMuted, fontSize: 11 }}>
                +{filtered.length - 60} more · Export CSV for full list
              </p>
            )}
          </div>
        </>
      )}
    </Card>
  )
}