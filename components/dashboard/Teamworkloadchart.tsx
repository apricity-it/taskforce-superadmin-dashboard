import { useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts'
import { getTokens } from '@/lib/dashboardTheme'
import { Card, SectionHeader } from './DashboardUI'
import type { ComplianceReport, Team } from '@/lib/dashboardQueries'

interface TeamWorkload {
  name: string
  reports: number
  members: number
  perMember: number
  ratio: number
  feeder: number
  chronic: number
}

export function TeamWorkloadChart({
  reports, teams, dark,
}: {
  reports: ComplianceReport[]
  teams: Team[]
  dark: boolean
}) {
  const T = getTokens(dark)
  const blue = dark ? '#70a1ff' : '#3b82f6'

  const { data, avg, maxRatio } = useMemo(() => {
    const userToTeam: Record<string, string> = {}
    teams.forEach(t => {
      ;(t.members || []).forEach(m => { if (m.id) userToTeam[m.id] = t.id })
    })

    const countByTeam: Record<string, { total: number; feeder: number; chronic: number }> = {}
    reports.forEach(r => {
      let tid = r.teamId?.trim() || ''
      if (!tid && r.userId) tid = userToTeam[r.userId] || ''
      if (!tid) return
      if (!countByTeam[tid]) countByTeam[tid] = { total: 0, feeder: 0, chronic: 0 }
      countByTeam[tid].total++
      if ((r.feederPointType ?? 'feeder') === 'chronic') countByTeam[tid].chronic++
      else countByTeam[tid].feeder++
    })

    let items: TeamWorkload[] = teams.map(t => {
      const c = countByTeam[t.id] || { total: 0, feeder: 0, chronic: 0 }
      const mems = (t.members || []).filter(m => m.isActive).length || 1
      return {
        name: t.name.length > 20 ? t.name.slice(0, 18) + '…' : t.name,
        reports: c.total,
        members: mems,
        perMember: Math.round((c.total / mems) * 10) / 10,
        ratio: 0,
        feeder: c.feeder,
        chronic: c.chronic,
      }
    }).filter(t => t.reports > 0).sort((a, b) => b.reports - a.reports)

    const avgRep = items.length > 0
      ? items.reduce((s, t) => s + t.reports, 0) / items.length
      : 0

    items = items.map(t => ({
      ...t,
      ratio: avgRep > 0 ? Math.round((t.reports / avgRep) * 100) / 100 : 0,
    }))

    const mx = items.length > 0 ? Math.max(...items.map(t => t.ratio)) : 0
    return { data: items.slice(0, 15), avg: Math.round(avgRep), maxRatio: mx }
  }, [reports, teams])

  const barColor = (ratio: number) => {
    if (ratio >= 2)   return T.red
    if (ratio >= 1.5) return T.amber
    return blue
  }

  const balanceLabel = maxRatio >= 3
    ? { text: 'Significant imbalance', color: T.red,   icon: '⚠️' }
    : maxRatio >= 2
    ? { text: 'Moderate imbalance',    color: T.amber,  icon: '⚡' }
    : { text: 'Well balanced',         color: T.green,  icon: '✓'  }

  return (
    <Card dark={dark} animDelay={700}>
      <SectionHeader
        title="Team workload balance"
        sub={`${data.length} teams · avg ${avg} reports · ${maxRatio > 0 ? `${maxRatio.toFixed(1)}× max imbalance` : 'no data'}`}
        accent={blue}
        dark={dark}
      />

      {data.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 gap-2" style={{ color: T.textMuted }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity={0.4}>
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
          </svg>
          <span style={{ fontSize: 13 }}>No team-level report data</span>
        </div>
      ) : (
        <>
          {/* Top 3 summary */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            {[
              { label: 'Avg reports',  value: avg,                      color: blue,   sub: 'per team'    },
              { label: 'Heaviest',     value: data[0]?.reports ?? 0,    color: T.red,  sub: data[0]?.name ?? '—' },
              { label: 'Per member',  value: data[0]?.perMember ?? 0,  color: T.amber, sub: 'top team avg' },
            ].map((s, i) => (
              <div key={s.label} className="rounded-xl p-3"
                style={{
                  background: dark ? T.surface : '#f8f7f5',
                  border: `1px solid ${T.cardBorder}`,
                  animation: `slideUp 0.35s ease ${i * 60}ms both`,
                }}>
                <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: T.textSecondary, margin: '0 0 3px' }}>
                  {s.label}
                </p>
                <p className="text-[17px] font-bold leading-none" style={{ color: s.color, fontFamily: "'JetBrains Mono', monospace", margin: 0 }}>
                  {s.value}
                </p>
                <p className="text-[9px] mt-0.5 truncate" style={{ color: T.textMuted, margin: '3px 0 0' }}>{s.sub}</p>
              </div>
            ))}
          </div>

          {/* Bar chart */}
          <div style={{ height: Math.max(200, data.length * 34 + 50) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="vertical" margin={{ top: 4, right: 50, left: 10, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.gridLine} horizontal={false} />
                <XAxis type="number"
                  tick={{ fill: T.textMuted, fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}
                  axisLine={false} tickLine={false}
                />
                <YAxis type="category" dataKey="name" width={130}
                  tick={{ fill: T.textSecondary, fontSize: 11 }}
                  axisLine={false} tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: dark ? '#1a2030' : '#fff',
                    border: `1px solid ${T.cardBorder}`,
                    borderRadius: 8, fontSize: 12,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                  formatter={(_: any, __: any, props: any) => {
                    const d = props.payload as TeamWorkload
                    return [
                      `${d.reports} reports · ${d.members} members · ${d.perMember}/member · F:${d.feeder} C:${d.chronic}`,
                      d.name,
                    ]
                  }}
                  labelStyle={{ color: T.textPrimary }}
                />
                <ReferenceLine x={avg} stroke={T.amber} strokeDasharray="4 4"
                  label={{ value: `avg ${avg}`, fill: T.amber, fontSize: 9, position: 'top' }}
                />
                <Bar dataKey="reports" radius={[0, 4, 4, 0]} barSize={18} animationDuration={700}
                  label={({ x, y, width, height, value }: any) => (
                    <text x={x + width + 6} y={y + height / 2 + 4}
                      fill={T.textMuted} fontSize={10}
                      fontFamily="'JetBrains Mono', monospace">
                      {value}
                    </text>
                  )}
                >
                  {data.map((d, i) => (
                    <Cell key={i} fill={barColor(d.ratio)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Balance footer */}
          <div className="flex items-center justify-between flex-wrap gap-2 mt-3 pt-3"
            style={{ borderTop: `1px solid ${T.cardBorder}` }}>
            <div className="flex items-center gap-1.5">
              <span style={{ fontSize: 13 }}>{balanceLabel.icon}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: balanceLabel.color }}>{balanceLabel.text}</span>
            </div>
            <div className="flex items-center gap-3 text-[11px]" style={{ color: T.textMuted }}>
              <span className="flex items-center gap-1">
                <span style={{ color: T.red }}>■</span> Overloaded (2×+)
              </span>
              <span className="flex items-center gap-1">
                <span style={{ color: T.amber }}>■</span> High (1.5×+)
              </span>
              <span className="flex items-center gap-1">
                <span style={{ color: blue }}>■</span> Normal
              </span>
            </div>
          </div>
        </>
      )}
    </Card>
  )
}