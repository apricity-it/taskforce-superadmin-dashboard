import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { getTokens } from '@/lib/dashboardTheme'
import { Card, SectionHeader, ExportButton } from './DashboardUI'
import { exportToCSV } from '@/lib/dashboardExport'
import type { ComplianceReport } from '@/lib/dashboardQueries'

function tsToMs(v: any): number | null {
  if (!v) return null
  if (typeof v.toDate === 'function') return v.toDate().getTime()
  if (typeof v.seconds === 'number') return v.seconds * 1000
  if (typeof v._seconds === 'number') return v._seconds * 1000
  if (v instanceof Date) return v.getTime()
  return null
}

function fmtMins(m: number): string {
  if (m < 60)   return `${m}m`
  if (m < 1440) return `${Math.floor(m / 60)}h ${m % 60}m`
  return `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h`
}

interface QCStats {
  name: string
  avgMinutes: number
  avgFormatted: string
  reviewed: number
  fastest: number
  slowest: number
  feeder: number
  chronic: number
}

export function ResponseTimeAnalytics({ reports, dark }: { reports: ComplianceReport[]; dark: boolean }) {
  const T = getTokens(dark)

  const data = useMemo((): QCStats[] => {
    const byQC: Record<string, { times: number[]; feeder: number; chronic: number }> = {}

    reports.forEach(r => {
      if (!r.reviewedBy || !r.reviewedAt) return
      const submitted = tsToMs(r.submittedAt ?? r.createdAt)
      const reviewed  = tsToMs(r.reviewedAt)
      if (!submitted || !reviewed || reviewed <= submitted) return
      const mins = (reviewed - submitted) / 60000
      if (mins > 43200) return

      if (!byQC[r.reviewedBy]) byQC[r.reviewedBy] = { times: [], feeder: 0, chronic: 0 }
      byQC[r.reviewedBy].times.push(mins)
      if ((r.feederPointType ?? 'feeder') === 'chronic') byQC[r.reviewedBy].chronic++
      else byQC[r.reviewedBy].feeder++
    })

    return Object.entries(byQC).map(([name, { times, feeder, chronic }]) => {
      const avg = times.reduce((s, t) => s + t, 0) / times.length
      return {
        name: name.length > 18 ? name.slice(0, 16) + '…' : name,
        avgMinutes: Math.round(avg),
        avgFormatted: fmtMins(Math.round(avg)),
        reviewed: times.length,
        fastest: Math.round(Math.min(...times)),
        slowest: Math.round(Math.max(...times)),
        feeder,
        chronic,
      }
    }).sort((a, b) => a.avgMinutes - b.avgMinutes)
  }, [reports])

  const totalReviewed = data.reduce((s, d) => s + d.reviewed, 0)
  const overallAvg    = totalReviewed > 0
    ? Math.round(data.reduce((s, d) => s + d.avgMinutes * d.reviewed, 0) / totalReviewed)
    : 0

  const rateColor = (avg: number) => {
    if (avg < 60)   return T.green
    if (avg < 360)  return T.amber
    return T.red
  }

  return (
    <Card dark={dark} animDelay={800}>
      <SectionHeader
        title="Response time — QC officers"
        sub={`Overall avg: ${fmtMins(overallAvg)} · ${totalReviewed} reviewed`}
        accent={T.purple}
        dark={dark}
        rightSlot={data.length > 0
          ? <ExportButton
              onClick={() => exportToCSV(data.map(d => ({
                Officer: d.name, 'Avg (min)': d.avgMinutes,
                Reviewed: d.reviewed, Feeder: d.feeder, Chronic: d.chronic,
                'Fastest (min)': d.fastest, 'Slowest (min)': d.slowest,
              })), 'response-times')}
              label="CSV" dark={dark}
            />
          : undefined}
      />

      {data.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 gap-2" style={{ color: T.textMuted }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity={0.4}>
            <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
          </svg>
          <span style={{ fontSize: 13 }}>No reviewed reports with timing data</span>
          <span style={{ fontSize: 11 }}>Response times appear once QC officers review reports</span>
        </div>
      ) : (
        <>
          {/* Overall stat row */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            {[
              { label: 'Overall avg',   value: fmtMins(overallAvg), color: rateColor(overallAvg) },
              { label: 'Total reviewed', value: totalReviewed.toLocaleString(), color: T.green  },
              { label: 'Officers',       value: data.length,         color: T.purple },
            ].map((s, i) => (
              <div key={s.label} className="rounded-xl p-3 text-center"
                style={{
                  background: dark ? T.surface : '#f8f7f5',
                  border: `1px solid ${T.cardBorder}`,
                  animation: `slideUp 0.4s ease ${i * 60}ms both`,
                }}>
                <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: T.textSecondary, margin: '0 0 4px' }}>
                  {s.label}
                </p>
                <p className="text-[18px] font-bold" style={{ color: s.color, fontFamily: "'JetBrains Mono', monospace", margin: 0 }}>
                  {typeof s.value === 'number' ? s.value.toLocaleString() : s.value}
                </p>
              </div>
            ))}
          </div>

          {/* Bar chart */}
          <div style={{ height: Math.max(180, data.length * 36 + 40) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, left: 10, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.gridLine} horizontal={false} />
                <XAxis type="number"
                  tick={{ fill: T.textMuted, fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}
                  axisLine={false} tickLine={false}
                  tickFormatter={v => fmtMins(v)}
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
                  formatter={(value: number, _: any, props: any) => {
                    const d = props.payload as QCStats
                    return [
                      `Avg: ${fmtMins(value)} | ${d.reviewed} reviews | F:${d.feeder} C:${d.chronic}`,
                      'Response time',
                    ]
                  }}
                  labelStyle={{ color: T.textPrimary }}
                />
                <Bar dataKey="avgMinutes" radius={[0, 4, 4, 0]} barSize={18} animationDuration={700}>
                  {data.map((d, i) => (
                    <Cell key={i} fill={rateColor(d.avgMinutes)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Top 3 podium */}
          <div className="grid grid-cols-3 gap-2 mt-3">
            {data.slice(0, 3).map((d, i) => (
              <div key={i} className="rounded-xl p-3"
                style={{
                  background: dark ? T.surface : '#f8f7f5',
                  border: `1px solid ${i === 0 ? `${T.green}40` : T.cardBorder}`,
                  animation: `slideUp 0.4s ease ${i * 80 + 300}ms both`,
                }}>
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-1"
                  style={{ color: i === 0 ? T.green : T.textMuted }}>
                  {i === 0 ? '🏆 Fastest' : i === 1 ? '🥈 2nd' : '🥉 3rd'}
                </p>
                <p className="text-[13px] font-bold truncate" style={{ color: T.textPrimary, margin: '0 0 2px' }}>
                  {d.name}
                </p>
                <p className="text-[11px] font-bold" style={{ color: rateColor(d.avgMinutes), fontFamily: "'JetBrains Mono', monospace", margin: '0 0 2px' }}>
                  {d.avgFormatted} avg
                </p>
                <div className="flex items-center gap-2 text-[10px]" style={{ color: T.textMuted }}>
                  <span>{d.reviewed} reviews</span>
                  <span style={{ color: T.accent }}>F:{d.feeder}</span>
                  <span style={{ color: T.gold }}>C:{d.chronic}</span>
                </div>
                <div className="flex items-center gap-1 mt-1.5 text-[9px]" style={{ color: T.textMuted }}>
                  <span>⚡{fmtMins(d.fastest)}</span>
                  <span style={{ flex: 1 }} />
                  <span>🐢{fmtMins(d.slowest)}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  )
}