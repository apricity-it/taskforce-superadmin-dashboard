import { useState, useMemo, type CSSProperties } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis,
} from 'recharts'
import { getTokens } from '@/lib/dashboardTheme'
import { Card, SectionHeader, AnimatedNumber, MiniBar } from './DashboardUI'
import type { ComplianceReport, FeederPoint, Team, ApprovedUser, Zone, Ward } from '@/lib/dashboardQueries'

type CompareMode = 'zone' | 'team' | 'ward' | 'point' | 'user'

interface EntityStats {
  id: string
  name: string
  totalReports: number
  approved: number
  rejected: number
  pending: number
  requiresAction: number
  approvalRate: number
  avgDistance: number
  maxDistance: number
  gpsAnomalies: number
  uniquePoints: number
  uniqueUsers: number
  feederReports: number
  chronicReports: number
}

interface ComparisonProps {
  dark: boolean
  reports: ComplianceReport[]
  points: FeederPoint[]
  teams: Team[]
  users: ApprovedUser[]
  zones: Zone[]
  wards: Ward[]
}

function computeStats(reports: ComplianceReport[], id: string, name: string): EntityStats {
  const distances = reports.map(r => r.distanceFromFeederPoint).filter((d): d is number => d != null && d > 0)
  const pointSet  = new Set(reports.map(r => r.feederPointId).filter(Boolean))
  const userSet   = new Set(reports.map(r => r.userId).filter(Boolean))
  const approved  = reports.filter(r => r.status === 'approved').length
  const total     = reports.length
  return {
    id, name, totalReports: total, approved,
    rejected:       reports.filter(r => r.status === 'rejected').length,
    pending:        reports.filter(r => r.status === 'pending').length,
    requiresAction: reports.filter(r => r.status === 'requires_action').length,
    approvalRate:   total > 0 ? Math.round((approved / total) * 100) : 0,
    avgDistance:    distances.length > 0 ? Math.round(distances.reduce((a, b) => a + b, 0) / distances.length) : 0,
    maxDistance:    distances.length > 0 ? Math.round(Math.max(...distances)) : 0,
    gpsAnomalies:   distances.filter(d => d > 100).length,
    uniquePoints:   pointSet.size,
    uniqueUsers:    userSet.size,
    feederReports:  reports.filter(r => (r.feederPointType ?? 'feeder') === 'feeder').length,
    chronicReports: reports.filter(r => r.feederPointType === 'chronic').length,
  }
}

function ChartTooltip({ active, payload, label, dark }: any) {
  if (!active || !payload?.length) return null
  const T = getTokens(dark)
  return (
    <div style={{
      background: dark ? '#1a2030' : '#fff', border: `1px solid ${T.cardBorder}`,
      borderRadius: 8, padding: '10px 14px',
      fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: T.textPrimary,
    }}>
      <p style={{ margin: '0 0 4px', color: T.textSecondary }}>{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ margin: '2px 0', color: p.fill || p.color }}>
          {p.name ?? p.dataKey}: <strong>{p.value?.toLocaleString()}</strong>
        </p>
      ))}
    </div>
  )
}

function MetricRow({ label, valA, valB, higherIsBetter = true, dark, accentA, accentB, delay = 0 }: {
  label: string; valA: number | string; valB: number | string
  higherIsBetter?: boolean; dark: boolean; accentA: string; accentB: string; delay?: number
}) {
  const T = getTokens(dark)
  const numA = typeof valA === 'number' ? valA : parseFloat(String(valA)) || 0
  const numB = typeof valB === 'number' ? valB : parseFloat(String(valB)) || 0
  let winA = false, winB = false
  if (numA !== numB) {
    if (higherIsBetter) { winA = numA > numB; winB = numB > numA }
    else                { winA = numA < numB; winB = numB < numA }
  }
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-2"
      style={{ borderBottom: `1px solid ${T.gridLine}`, animation: `slideInLeft 0.3s ease ${delay}ms both` }}>
      <div className="text-right flex items-center justify-end gap-1">
        {winA && <span style={{ color: accentA, fontSize: 11 }}>✓</span>}
        <span className="text-sm font-bold" style={{ fontFamily: "'JetBrains Mono', monospace", color: winA ? accentA : T.textPrimary }}>
          {typeof valA === 'number' ? valA.toLocaleString() : valA}
        </span>
      </div>
      <div className="text-center px-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: T.textSecondary }}>
          {label}
        </span>
      </div>
      <div className="text-left flex items-center gap-1">
        <span className="text-sm font-bold" style={{ fontFamily: "'JetBrains Mono', monospace", color: winB ? accentB : T.textPrimary }}>
          {typeof valB === 'number' ? valB.toLocaleString() : valB}
        </span>
        {winB && <span style={{ color: accentB, fontSize: 11 }}>✓</span>}
      </div>
    </div>
  )
}

export function ComparisonEngine({ dark, reports, points, teams, users, zones, wards }: ComparisonProps) {
  const T = getTokens(dark)
  const [mode, setMode]       = useState<CompareMode>('zone')
  const [entityA, setEntityA] = useState('')
  const [entityB, setEntityB] = useState('')

  const options = useMemo(() => {
    switch (mode) {
      case 'zone':  return zones.map(z => ({ id: z.id, name: z.name }))
      case 'ward':  return wards.map(w => ({ id: w.id, name: w.name }))
      case 'team':  return teams.map(t => ({ id: t.id, name: t.name }))
      case 'point': return points.filter(p => !p.isEliminated).slice(0, 100).map(p => ({ id: p.id, name: p.name }))
      case 'user':  return users.filter(u => u.role === 'task_force_team' && u.isActive).map(u => ({ id: u.id, name: u.name }))
      default:      return []
    }
  }, [mode, zones, wards, teams, points, users])

  const handleModeChange = (m: CompareMode) => { setMode(m); setEntityA(''); setEntityB('') }

  const { statsA, statsB } = useMemo(() => {
    if (!entityA || !entityB) return { statsA: null, statsB: null }
    const nameA = options.find(o => o.id === entityA)?.name || 'Entity A'
    const nameB = options.find(o => o.id === entityB)?.name || 'Entity B'
    let rA: ComplianceReport[] = [], rB: ComplianceReport[] = []

    switch (mode) {
      case 'zone': {
        const pA = new Set(points.filter(p => p.zoneId === entityA).map(p => p.id))
        const pB = new Set(points.filter(p => p.zoneId === entityB).map(p => p.id))
        rA = reports.filter(r => pA.has(r.feederPointId)); rB = reports.filter(r => pB.has(r.feederPointId)); break
      }
      case 'ward': {
        const pA = new Set(points.filter(p => p.wardId === entityA).map(p => p.id))
        const pB = new Set(points.filter(p => p.wardId === entityB).map(p => p.id))
        rA = reports.filter(r => pA.has(r.feederPointId)); rB = reports.filter(r => pB.has(r.feederPointId)); break
      }
      case 'team': {
        const u2t: Record<string, string> = {}
        teams.forEach(t => (t.members || []).forEach(m => { if (m.id) u2t[m.id] = t.id }))
        rA = reports.filter(r => (r.teamId?.trim() ? r.teamId === entityA : u2t[r.userId] === entityA))
        rB = reports.filter(r => (r.teamId?.trim() ? r.teamId === entityB : u2t[r.userId] === entityB))
        break
      }
      case 'point':
        rA = reports.filter(r => r.feederPointId === entityA)
        rB = reports.filter(r => r.feederPointId === entityB)
        break
      case 'user':
        rA = reports.filter(r => r.userId === entityA)
        rB = reports.filter(r => r.userId === entityB)
        break
    }

    return { statsA: computeStats(rA, entityA, nameA), statsB: computeStats(rB, entityB, nameB) }
  }, [entityA, entityB, mode, reports, points, teams, options])

  const radarData = useMemo(() => {
    if (!statsA || !statsB) return []
    const mR = Math.max(statsA.totalReports, statsB.totalReports, 1)
    const mP = Math.max(statsA.uniquePoints, statsB.uniquePoints, 1)
    const mU = Math.max(statsA.uniqueUsers, statsB.uniqueUsers, 1)
    return [
      { metric: 'Reports',    A: Math.round(statsA.totalReports / mR * 100), B: Math.round(statsB.totalReports / mR * 100) },
      { metric: 'Approval',   A: statsA.approvalRate,                        B: statsB.approvalRate                        },
      { metric: 'Coverage',   A: Math.round(statsA.uniquePoints / mP * 100), B: Math.round(statsB.uniquePoints / mP * 100) },
      { metric: 'Team size',  A: Math.round(statsA.uniqueUsers / mU * 100),  B: Math.round(statsB.uniqueUsers / mU * 100)  },
      { metric: 'Compliance', A: Math.max(0, 100 - statsA.requiresAction),   B: Math.max(0, 100 - statsB.requiresAction)   },
    ]
  }, [statsA, statsB])

  const barData = useMemo(() => {
    if (!statsA || !statsB) return []
    return [
      { metric: 'Total',      A: statsA.totalReports,  B: statsB.totalReports  },
      { metric: 'Approved',   A: statsA.approved,      B: statsB.approved      },
      { metric: 'Rejected',   A: statsA.rejected,      B: statsB.rejected      },
      { metric: 'Pending',    A: statsA.pending,        B: statsB.pending       },
      { metric: 'Action',     A: statsA.requiresAction, B: statsB.requiresAction },
    ]
  }, [statsA, statsB])

  // Winner determination
  const winner = useMemo(() => {
    if (!statsA || !statsB) return null
    let scoreA = 0, scoreB = 0
    if (statsA.approvalRate > statsB.approvalRate) scoreA += 2; else if (statsB.approvalRate > statsA.approvalRate) scoreB += 2
    if (statsA.totalReports > statsB.totalReports) scoreA++; else if (statsB.totalReports > statsA.totalReports) scoreB++
    if (statsA.requiresAction < statsB.requiresAction) scoreA++; else if (statsB.requiresAction < statsA.requiresAction) scoreB++
    if (statsA.gpsAnomalies < statsB.gpsAnomalies) scoreA++; else if (statsB.gpsAnomalies < statsA.gpsAnomalies) scoreB++
    if (scoreA === scoreB) return { name: 'Tied', score: scoreA, color: T.textMuted }
    if (scoreA > scoreB) return { name: statsA.name, score: scoreA, color: T.accent }
    return { name: statsB.name, score: scoreB, color: T.gold }
  }, [statsA, statsB])

  const accentA = T.accent
  const accentB = T.gold

  const selectSt: CSSProperties = {
    background: dark ? T.surface : '#f8f7f5', border: `1px solid ${T.cardBorder}`,
    borderRadius: 8, padding: '8px 12px', color: T.textPrimary, fontSize: 12,
    fontFamily: "'JetBrains Mono', monospace", outline: 'none', cursor: 'pointer',
    flex: 1, colorScheme: dark ? 'dark' : 'light',
  }

  const modes: { id: CompareMode; label: string; icon: string }[] = [
    { id: 'zone',  label: 'Zone',   icon: '🗺️' },
    { id: 'ward',  label: 'Ward',   icon: '🏘️' },
    { id: 'team',  label: 'Team',   icon: '👥' },
    { id: 'point', label: 'Point',  icon: '📍' },
    { id: 'user',  label: 'Member', icon: '👤' },
  ]

  return (
    <Card dark={dark} animDelay={750}>
      <SectionHeader
        title="Comparison engine"
        sub="Head-to-head analysis between any two entities"
        accent={T.gold}
        dark={dark}
        icon={<span style={{ fontSize: 14 }}>⚔️</span>}
      />

      {/* Mode selector */}
      <div className="flex gap-1.5 mb-4 flex-wrap">
        {modes.map(m => (
          <button key={m.id} onClick={() => handleModeChange(m.id)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all active:scale-95"
            style={{
              background: mode === m.id ? `${T.accent}15` : (dark ? T.surface : '#f8f7f5'),
              border: `1px solid ${mode === m.id ? `${T.accent}40` : T.cardBorder}`,
              color: mode === m.id ? T.accent : T.textSecondary, cursor: 'pointer',
            }}>
            <span style={{ fontSize: 13 }}>{m.icon}</span>{m.label}
          </button>
        ))}
      </div>

      {/* Selectors */}
      <div className="grid grid-cols-[1fr_auto_1fr] gap-3 mb-5 items-end">
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider block mb-1.5" style={{ color: accentA }}>
            Entity A
          </label>
          <select style={{ ...selectSt, borderColor: entityA ? accentA : selectSt.borderColor as string }}
            value={entityA} onChange={e => setEntityA(e.target.value)}>
            <option value="">Select {mode}…</option>
            {options.filter(o => o.id !== entityB).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
        <div className="flex items-center justify-center w-10 h-10 rounded-full"
          style={{ background: `${T.gold}15`, border: `1px solid ${T.gold}30` }}>
          <span className="text-sm font-bold" style={{ color: T.gold }}>VS</span>
        </div>
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider block mb-1.5" style={{ color: accentB }}>
            Entity B
          </label>
          <select style={{ ...selectSt, borderColor: entityB ? accentB : selectSt.borderColor as string }}
            value={entityB} onChange={e => setEntityB(e.target.value)}>
            <option value="">Select {mode}…</option>
            {options.filter(o => o.id !== entityA).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
      </div>

      {statsA && statsB ? (
        <div className="flex flex-col gap-5" style={{ animation: 'slideUp 0.4s ease' }}>
          {/* Winner banner */}
          {winner && (
            <div className="flex items-center justify-center gap-2 py-2 rounded-xl"
              style={{ background: `${winner.color}15`, border: `1px solid ${winner.color}30` }}>
              <span style={{ fontSize: 16 }}>{winner.name === 'Tied' ? '🤝' : '🏆'}</span>
              <span className="text-sm font-bold" style={{ color: winner.color }}>
                {winner.name === 'Tied' ? 'Tied match' : `${winner.name} leads`}
              </span>
              <span className="text-[11px]" style={{ color: T.textMuted }}>
                ({winner.score}/4 criteria)
              </span>
            </div>
          )}

          {/* Score header */}
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-bold truncate" style={{ color: accentA, margin: 0 }}>{statsA.name}</p>
              <p className="text-[26px] font-bold" style={{ fontFamily: "'JetBrains Mono', monospace", color: T.textPrimary, margin: 0 }}>
                <AnimatedNumber value={statsA.totalReports} />
              </p>
              <p className="text-[10px]" style={{ color: T.textSecondary, margin: 0 }}>reports</p>
              <div className="flex items-center justify-end gap-2 mt-1">
                <span className="text-[10px]" style={{ color: T.accent }}>F:{statsA.feederReports}</span>
                <span className="text-[10px]" style={{ color: T.gold }}>C:{statsA.chronicReports}</span>
              </div>
            </div>
            <div className="w-px h-20" style={{ background: T.cardBorder }} />
            <div className="text-left">
              <p className="text-sm font-bold truncate" style={{ color: accentB, margin: 0 }}>{statsB.name}</p>
              <p className="text-[26px] font-bold" style={{ fontFamily: "'JetBrains Mono', monospace", color: T.textPrimary, margin: 0 }}>
                <AnimatedNumber value={statsB.totalReports} />
              </p>
              <p className="text-[10px]" style={{ color: T.textSecondary, margin: 0 }}>reports</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px]" style={{ color: T.accent }}>F:{statsB.feederReports}</span>
                <span className="text-[10px]" style={{ color: T.gold }}>C:{statsB.chronicReports}</span>
              </div>
            </div>
          </div>

          {/* Approval rate bars */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { stats: statsA, accent: accentA },
              { stats: statsB, accent: accentB },
            ].map(({ stats, accent }, i) => (
              <div key={i} className="rounded-xl p-3"
                style={{ background: dark ? T.surface : '#f8f7f5', border: `1px solid ${T.cardBorder}` }}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-semibold" style={{ color: T.textSecondary }}>Approval rate</span>
                  <span className="text-[14px] font-bold" style={{ color: accent, fontFamily: "'JetBrains Mono', monospace" }}>
                    {stats.approvalRate}%
                  </span>
                </div>
                <MiniBar value={stats.approved} max={stats.totalReports} color={accent} dark={dark} />
              </div>
            ))}
          </div>

          {/* Metric rows */}
          <div>
            {[
              { label: 'Approval rate', vA: `${statsA.approvalRate}%`, vB: `${statsB.approvalRate}%`, h: true  },
              { label: 'Approved',      vA: statsA.approved,           vB: statsB.approved,           h: true  },
              { label: 'Rejected',      vA: statsA.rejected,           vB: statsB.rejected,           h: false },
              { label: 'Pending',       vA: statsA.pending,            vB: statsB.pending,            h: false },
              { label: 'Req. action',   vA: statsA.requiresAction,     vB: statsB.requiresAction,     h: false },
              { label: 'Feeder reports',vA: statsA.feederReports,      vB: statsB.feederReports,      h: true  },
              { label: 'Chronic reports',vA: statsA.chronicReports,    vB: statsB.chronicReports,     h: true  },
              { label: 'Avg dist (m)',  vA: statsA.avgDistance,        vB: statsB.avgDistance,        h: false },
              { label: 'GPS anomalies', vA: statsA.gpsAnomalies,       vB: statsB.gpsAnomalies,       h: false },
              { label: 'Unique points', vA: statsA.uniquePoints,       vB: statsB.uniquePoints,       h: true  },
              { label: 'Unique users',  vA: statsA.uniqueUsers,        vB: statsB.uniqueUsers,        h: true  },
            ].map((row, i) => (
              <MetricRow key={row.label} label={row.label}
                valA={row.vA} valB={row.vB}
                higherIsBetter={row.h}
                dark={dark} accentA={accentA} accentB={accentB}
                delay={i * 30}
              />
            ))}
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: T.textSecondary }}>
                Report status comparison
              </p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.gridLine} />
                  <XAxis dataKey="metric" tick={{ fontSize: 10, fill: T.textSecondary }} />
                  <YAxis tick={{ fontSize: 10, fill: T.textSecondary }} />
                  <Tooltip content={(p: any) => <ChartTooltip {...p} dark={dark} />} />
                  <Bar dataKey="A" name={statsA.name} fill={accentA} radius={[4, 4, 0, 0]} animationDuration={500} />
                  <Bar dataKey="B" name={statsB.name} fill={accentB} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: T.textSecondary }}>
                Performance radar
              </p>
              <ResponsiveContainer width="100%" height={200}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke={T.gridLine} />
                  <PolarAngleAxis dataKey="metric" tick={{ fontSize: 9, fill: T.textSecondary }} />
                  <PolarRadiusAxis tick={{ fontSize: 8, fill: T.textMuted }} domain={[0, 100]} />
                  <Radar name={statsA.name} dataKey="A" stroke={accentA} fill={accentA} fillOpacity={0.15} />
                  <Radar name={statsB.name} dataKey="B" stroke={accentB} fill={accentB} fillOpacity={0.15} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Legend */}
          <div className="flex justify-center gap-6 text-[11px]">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm" style={{ background: accentA }} />
              <span style={{ color: T.textSecondary }}>{statsA.name}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm" style={{ background: accentB }} />
              <span style={{ color: T.textSecondary }}>{statsB.name}</span>
            </span>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-10 gap-2" style={{ color: T.textMuted }}>
          <span style={{ fontSize: 32 }}>⚔️</span>
          <span style={{ fontSize: 13 }}>Select two {mode}s above to compare</span>
          <span style={{ fontSize: 11 }}>Approval rates, GPS accuracy, coverage and more</span>
        </div>
      )}

      <style>{`
        @keyframes slideUp { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:translateY(0) } }
        @keyframes slideInLeft { from { opacity:0; transform:translateX(-8px) } to { opacity:1; transform:translateX(0) } }
      `}</style>
    </Card>
  )
}