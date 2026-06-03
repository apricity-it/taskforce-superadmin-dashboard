import { useMemo, useState, useCallback } from 'react'
import { getTokens } from '@/lib/dashboardTheme'
import { Card, SectionHeader } from './DashboardUI'
import type { ComplianceReport } from '@/lib/dashboardQueries'

function normDate(v: any): string | null {
  if (!v) return null
  if (typeof v === 'string') return v.slice(0, 10)
  if (typeof v.toDate === 'function') return v.toDate().toISOString().slice(0, 10)
  if (typeof v.seconds === 'number') return new Date(v.seconds * 1000).toISOString().slice(0, 10)
  if (typeof v._seconds === 'number') return new Date(v._seconds * 1000).toISOString().slice(0, 10)
  return null
}

interface DayData {
  date: string
  total: number
  feeder: number
  chronic: number
  approved: number
  pending: number
  rejected: number
}

export function HeatmapCalendar({ reports, dark }: { reports: ComplianceReport[]; dark: boolean }) {
  const T = getTokens(dark)
  const [hovered, setHovered] = useState<{ day: DayData; x: number; y: number } | null>(null)
  const [activeFilter, setActiveFilter] = useState<'all' | 'feeder' | 'chronic'>('all')

  const { weeks, dayMap, maxCount, monthLabels, summary } = useMemo(() => {
    // Build per-day breakdown
    const map: Record<string, DayData> = {}

    reports.forEach(r => {
      const d = normDate(r.submittedAt ?? r.createdAt)
      if (!d) return
      if (!map[d]) map[d] = { date: d, total: 0, feeder: 0, chronic: 0, approved: 0, pending: 0, rejected: 0 }
      map[d].total++
      if ((r.feederPointType ?? 'feeder') === 'chronic') map[d].chronic++
      else map[d].feeder++
      if (r.status === 'approved') map[d].approved++
      else if (r.status === 'pending') map[d].pending++
      else if (r.status === 'rejected') map[d].rejected++
    })

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
    while (wks.length > 0 && wks[wks.length - 1].length < 7) {
      wks[wks.length - 1].push('')
    }

    let mx = 0
    Object.values(map).forEach(d => { if (d.total > mx) mx = d.total })

    // Summary stats
    const allDays = Object.values(map)
    const activeDays = allDays.filter(d => d.total > 0).length
    const totalFeeder = allDays.reduce((s, d) => s + d.feeder, 0)
    const totalChronic = allDays.reduce((s, d) => s + d.chronic, 0)
    const totalAll = allDays.reduce((s, d) => s + d.total, 0)
    const streak = calcStreak(map)
    const bestDay = allDays.sort((a, b) => b.total - a.total)[0] ?? null

    return {
      weeks: wks,
      dayMap: map,
      maxCount: mx || 1,
      monthLabels: mLabels,
      summary: { totalAll, totalFeeder, totalChronic, activeDays, streak, bestDay },
    }
  }, [reports])

  function calcStreak(map: Record<string, DayData>): number {
    let streak = 0
    const cursor = new Date()
    cursor.setHours(0, 0, 0, 0)
    while (true) {
      const key = cursor.toISOString().slice(0, 10)
      if (!map[key] || map[key].total === 0) break
      streak++
      cursor.setDate(cursor.getDate() - 1)
    }
    return streak
  }

  function getCount(day: DayData): number {
    if (activeFilter === 'feeder') return day.feeder
    if (activeFilter === 'chronic') return day.chronic
    return day.total
  }

  function getFilterMax(): number {
    if (activeFilter === 'feeder') return Math.max(...Object.values(dayMap).map(d => d.feeder), 1)
    if (activeFilter === 'chronic') return Math.max(...Object.values(dayMap).map(d => d.chronic), 1)
    return maxCount
  }

  function getColor(count: number, fmax: number): string {
    if (count === 0) return dark ? '#161b22' : '#ebedf0'
    const intensity = Math.min(count / fmax, 1)

    if (activeFilter === 'chronic') {
      // Orange ramp for chronic
      if (dark) {
        if (intensity < 0.25) return '#4a1900'
        if (intensity < 0.5)  return '#92400e'
        if (intensity < 0.75) return '#d97706'
        return '#fbbf24'
      } else {
        if (intensity < 0.25) return '#fed7aa'
        if (intensity < 0.5)  return '#fb923c'
        if (intensity < 0.75) return '#ea580c'
        return '#c2410c'
      }
    }

    if (activeFilter === 'feeder') {
      // Blue ramp for feeder
      if (dark) {
        if (intensity < 0.25) return '#0c1a3a'
        if (intensity < 0.5)  return '#1d4ed8'
        if (intensity < 0.75) return '#3b82f6'
        return '#93c5fd'
      } else {
        if (intensity < 0.25) return '#bfdbfe'
        if (intensity < 0.5)  return '#60a5fa'
        if (intensity < 0.75) return '#2563eb'
        return '#1d4ed8'
      }
    }

    // Default green ramp
    if (dark) {
      if (intensity < 0.25) return '#0e4429'
      if (intensity < 0.5)  return '#006d32'
      if (intensity < 0.75) return '#26a641'
      return '#39d353'
    } else {
      if (intensity < 0.25) return '#9be9a8'
      if (intensity < 0.5)  return '#40c463'
      if (intensity < 0.75) return '#30a14e'
      return '#216e39'
    }
  }

  const handleMouseEnter = useCallback((e: React.MouseEvent<SVGRectElement>, day: DayData) => {
    const rect = (e.currentTarget as SVGRectElement).getBoundingClientRect()
    setHovered({
      day,
      x: rect.left + rect.width / 2,
      y: rect.top,
    })
  }, [])

  const cellSize = 11
  const cellGap = 2
  const totalW = weeks.length * (cellSize + cellGap)
  const fmax = getFilterMax()
  const todayKey = new Date().toISOString().slice(0, 10)

  const filterColor = activeFilter === 'chronic' ? '#f59e0b' : activeFilter === 'feeder' ? '#3b82f6' : T.green
  const bdr = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)'
  const surf = dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'
  const txt = dark ? '#fff' : '#111'
  const muted = dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'

  return (
    <Card dark={dark} animDelay={700}>
      <style>{`
        .hm-container { position: relative; }
        .hm-tooltip {
          position: fixed;
          pointer-events: none;
          z-index: 9999;
          transform: translateX(-50%) translateY(calc(-100% - 10px));
          background: ${dark ? 'rgba(10,12,18,0.97)' : 'rgba(255,255,255,0.98)'};
          border: 1px solid ${bdr};
          border-radius: 10px;
          padding: 10px 13px;
          min-width: 160px;
          box-shadow: 0 8px 24px ${dark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.12)'};
          animation: ttIn 0.12s cubic-bezier(.22,1,.36,1);
        }
        @keyframes ttIn { from { opacity:0; transform: translateX(-50%) translateY(calc(-100% - 6px)); } to { opacity:1; transform: translateX(-50%) translateY(calc(-100% - 10px)); } }
        .hm-tooltip::after {
          content: '';
          position: absolute;
          bottom: -5px;
          left: 50%;
          transform: translateX(-50%);
          width: 8px;
          height: 8px;
          background: ${dark ? 'rgba(10,12,18,0.97)' : 'rgba(255,255,255,0.98)'};
          border-right: 1px solid ${bdr};
          border-bottom: 1px solid ${bdr};
          transform: translateX(-50%) rotate(45deg);
        }
        .tt-date { font-size:11px; font-weight:700; color:${txt}; margin-bottom:7px; font-family:'JetBrains Mono',monospace; }
        .tt-row { display:flex; align-items:center; justify-content:space-between; gap:12px; font-size:11px; margin-bottom:3px; }
        .tt-label { color:${muted}; }
        .tt-val { font-weight:700; color:${txt}; font-family:'JetBrains Mono',monospace; }
        .tt-dot { width:7px; height:7px; border-radius:50%; margin-right:5px; display:inline-block; flex-shrink:0; }
        .tt-divider { height:1px; background:${bdr}; margin:5px 0; }

        .hm-filters { display:flex; gap:6px; margin-bottom:12px; }
        .hm-filter-btn {
          font-size:11px; font-weight:600; padding:4px 10px; border-radius:20px;
          border: 1px solid ${bdr}; background: none; cursor: pointer;
          color: ${muted}; transition: all 0.15s;
          font-family: system-ui, sans-serif;
        }
        .hm-filter-btn:hover { background: ${surf}; }
        .hm-filter-btn.active { color: ${txt}; }

        .hm-summary { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px; }
        .hm-stat {
          flex:1; min-width:80px;
          background:${surf}; border:1px solid ${bdr}; border-radius:8px;
          padding:8px 12px;
        }
        .hm-stat-lbl { font-size:10px; font-weight:600; text-transform:uppercase; letter-spacing:.05em; color:${muted}; margin-bottom:3px; }
        .hm-stat-val { font-size:18px; font-weight:700; line-height:1; font-family:'JetBrains Mono',monospace; }

        svg rect { transition: opacity 0.12s; cursor: pointer; }
        svg rect:hover { opacity: 0.75; }
      `}</style>

      <SectionHeader
        title="Activity heatmap"
        sub="Daily report submissions — hover cells for breakdown"
        accent={filterColor}
        dark={dark}
      />

      {/* Summary stats */}
      <div className="hm-summary">
        {[
          { label: 'Total (yr)',  val: summary.totalAll,     color: filterColor },
          { label: 'Feeder',     val: summary.totalFeeder,  color: '#3b82f6'   },
          { label: 'Chronic',    val: summary.totalChronic, color: '#f59e0b'   },
          { label: 'Active days',val: summary.activeDays,   color: T.green     },
          { label: 'Streak',     val: `${summary.streak}d`, color: '#a855f7'   },
        ].map(s => (
          <div key={s.label} className="hm-stat">
            <div className="hm-stat-lbl">{s.label}</div>
            <div className="hm-stat-val" style={{ color: s.color }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* Filter chips */}
      <div className="hm-filters">
        {(['all', 'feeder', 'chronic'] as const).map(f => (
          <button
            key={f}
            className={`hm-filter-btn ${activeFilter === f ? 'active' : ''}`}
            style={activeFilter === f ? {
              background: f === 'chronic' ? 'rgba(245,158,11,0.12)' : f === 'feeder' ? 'rgba(59,130,246,0.12)' : 'rgba(34,197,94,0.12)',
              borderColor: f === 'chronic' ? 'rgba(245,158,11,0.4)' : f === 'feeder' ? 'rgba(59,130,246,0.4)' : 'rgba(34,197,94,0.4)',
              color: f === 'chronic' ? '#f59e0b' : f === 'feeder' ? '#3b82f6' : '#22c55e',
            } : {}}
            onClick={() => setActiveFilter(f)}
          >
            {f === 'all' ? '🌐 All' : f === 'feeder' ? '📍 Feeder' : '⚡ Chronic'}
          </button>
        ))}
        {summary.bestDay && (
          <span style={{ marginLeft: 'auto', fontSize: 11, color: muted, fontFamily: "'JetBrains Mono',monospace" }}>
            Peak: <span style={{ color: filterColor, fontWeight: 700 }}>{summary.bestDay.total}</span> on {summary.bestDay.date}
          </span>
        )}
      </div>

      {/* Heatmap grid */}
      <div className="hm-container" style={{ overflowX: 'auto', paddingBottom: 4 }}>
        <svg
          width={totalW + 32}
          height={7 * (cellSize + cellGap) + 28}
          style={{ display: 'block' }}
          onMouseLeave={() => setHovered(null)}
        >
          {/* Month labels */}
          {monthLabels.map((m, i) => (
            <text
              key={i}
              x={30 + m.col * (cellSize + cellGap)}
              y={10}
              fill={dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)'}
              fontSize={9}
              fontFamily="'JetBrains Mono', monospace"
            >
              {m.label}
            </text>
          ))}

          {/* Day labels */}
          {['', 'Mon', '', 'Wed', '', 'Fri', ''].map((d, i) => (
            <text
              key={i}
              x={0}
              y={18 + i * (cellSize + cellGap) + cellSize - 2}
              fill={dark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.3)'}
              fontSize={8}
              fontFamily="'JetBrains Mono', monospace"
            >
              {d}
            </text>
          ))}

          {/* Cells */}
          {weeks.map((week, wi) =>
            week.map((day, di) => {
              if (!day) return null
              const data = dayMap[day]
              const count = data ? getCount(data) : 0
              const isToday = day === todayKey
              return (
                <rect
                  key={`${wi}-${di}`}
                  x={30 + wi * (cellSize + cellGap)}
                  y={16 + di * (cellSize + cellGap)}
                  width={cellSize}
                  height={cellSize}
                  rx={2}
                  fill={getColor(count, fmax)}
                  stroke={isToday ? filterColor : 'none'}
                  strokeWidth={isToday ? 1.5 : 0}
                  onMouseEnter={data ? (e) => handleMouseEnter(e, data) : undefined}
                />
              )
            })
          )}
        </svg>

      </div>

      {/* Tooltip — outside scroll container, uses fixed positioning */}
      {hovered && (
        <div
          className="hm-tooltip"
          style={{ left: hovered.x, top: hovered.y }}
        >
          <div className="tt-date">{hovered.day.date}</div>
          <div className="tt-divider" />
          <div className="tt-row">
            <span className="tt-label">Total</span>
            <span className="tt-val">{hovered.day.total}</span>
          </div>
          <div className="tt-row">
            <span className="tt-label"><span className="tt-dot" style={{ background: '#3b82f6' }} />Feeder</span>
            <span className="tt-val" style={{ color: '#3b82f6' }}>{hovered.day.feeder}</span>
          </div>
          <div className="tt-row">
            <span className="tt-label"><span className="tt-dot" style={{ background: '#f59e0b' }} />Chronic</span>
            <span className="tt-val" style={{ color: '#f59e0b' }}>{hovered.day.chronic}</span>
          </div>
          <div className="tt-divider" />
          <div className="tt-row">
            <span className="tt-label"><span className="tt-dot" style={{ background: '#22c55e' }} />Approved</span>
            <span className="tt-val" style={{ color: '#22c55e' }}>{hovered.day.approved}</span>
          </div>
          <div className="tt-row">
            <span className="tt-label"><span className="tt-dot" style={{ background: '#f59e0b' }} />Pending</span>
            <span className="tt-val" style={{ color: '#f59e0b' }}>{hovered.day.pending}</span>
          </div>
          <div className="tt-row">
            <span className="tt-label"><span className="tt-dot" style={{ background: '#ef4444' }} />Rejected</span>
            <span className="tt-val" style={{ color: '#ef4444' }}>{hovered.day.rejected}</span>
          </div>
        </div>
      )}

      {/* Legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 10, color: muted, fontFamily: "'JetBrains Mono', monospace" }}>
        <span>Less</span>
        {[0, 0.25, 0.5, 0.75, 1].map((v, i) => (
          <div
            key={i}
            style={{
              width: cellSize,
              height: cellSize,
              borderRadius: 2,
              background: getColor(Math.round(v * fmax), fmax),
            }}
          />
        ))}
        <span>More</span>
        <span style={{ marginLeft: 'auto' }}>
          {activeFilter === 'all' ? summary.totalAll : activeFilter === 'feeder' ? summary.totalFeeder : summary.totalChronic} {activeFilter === 'all' ? 'total' : activeFilter} reports
        </span>
      </div>
    </Card>
  )
}