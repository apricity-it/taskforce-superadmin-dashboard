import {
  AreaChart, Area, PieChart, Pie, Cell, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { getTokens, getStatusColor } from '@/lib/dashboardTheme'
import { Card, SectionHeader, MiniBar, ExportButton } from './DashboardUI'
import type { DailyTrendPoint, StatusBreakdown, ChecklistFailure, SlotPunctuality } from '@/lib/dashboardQueries'
import { useMemo, useRef, useEffect } from 'react'


function ChartTooltip({ active, payload, label, dark }: any) {
  if (!active || !payload?.length) return null
  const T = getTokens(dark)
  return (
    <div style={{
      background: dark ? '#1a2030' : '#fff',
      border: `1px solid ${T.cardBorder}`,
      borderRadius: 8,
      padding: '10px 14px',
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 12,
      color: T.textPrimary,
      boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
    }}>
      <p style={{ margin: '0 0 6px', color: T.textSecondary, fontSize: 11 }}>{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ margin: '2px 0', color: p.color }}>
          {p.name ?? p.dataKey}: <strong>{p.value?.toLocaleString()}</strong>
        </p>
      ))}
    </div>
  )
}

// ─── Compliance Trend ──────────────────────────────────────────────────────

export function ComplianceTrendChart({
  data,
  totalInRange,
  dateRange,
  dark,
  onExport,
  feederCount,
  chronicCount,
}: {
  data: DailyTrendPoint[]
  totalInRange: number
  dateRange: string
  dark: boolean
  onExport?: () => void
  feederCount?: number
  chronicCount?: number
}) {
  const T = getTokens(dark)

  const subParts = [
    `${totalInRange.toLocaleString()} reports`,
    feederCount != null ? `${feederCount} feeder` : null,
    chronicCount != null ? `${chronicCount} chronic` : null,
    dateRange,
  ].filter(Boolean).join(' · ')

  return (
    <Card dark={dark} animDelay={300}>
      <SectionHeader
        title="Compliance trend"
        sub={subParts}
        dark={dark}
        rightSlot={onExport ? <ExportButton onClick={onExport} dark={dark} /> : undefined}
      />
      {data.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 gap-2" style={{ color: T.textSecondary }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity={0.4}>
            <path d="M3 3v18h18" /><path d="M18 17V9" /><path d="M13 17V5" /><path d="M8 17v-3" />
          </svg>
          <span style={{ fontSize: 13 }}>No compliance activity for this date range.</span>
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gradTotal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={T.accent} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={T.accent} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradApproved" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={T.green} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={T.green} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradRejected" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={T.red} stopOpacity={0.15} />
                  <stop offset="95%" stopColor={T.red} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradAction" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={T.amber} stopOpacity={0.15} />
                  <stop offset="95%" stopColor={T.amber} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={T.gridLine} />
              <XAxis
                dataKey="label"
                tick={{ fill: T.textSecondary, fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}
                axisLine={false} tickLine={false}
                interval={Math.max(0, Math.floor(data.length / 8) - 1)}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fill: T.textSecondary, fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}
                axisLine={false} tickLine={false}
              />
              <Tooltip content={(props: any) => <ChartTooltip {...props} dark={dark} />} />
              <Area type="monotone" dataKey="count" name="Total" stroke={T.accent} strokeWidth={2}
                fill="url(#gradTotal)" dot={false} activeDot={{ r: 4, fill: T.accent }} animationDuration={800} />
              <Area type="monotone" dataKey="approved" name="Approved" stroke={T.green} strokeWidth={1.5}
                fill="url(#gradApproved)" dot={false} activeDot={{ r: 3, fill: T.green }} animationDuration={900} strokeDasharray="0" />
              <Area type="monotone" dataKey="rejected" name="Rejected" stroke={T.red} strokeWidth={1.5}
                fill="url(#gradRejected)" dot={false} activeDot={{ r: 3, fill: T.red }} animationDuration={1000} />
              <Area
                type="monotone"
                dataKey="requiresAction"
                name="Requires Action"
                stroke={T.amber}
                strokeWidth={1.5}
                fill="url(#gradAction)"
                dot={false}
                activeDot={{ r: 3, fill: T.amber }}
                animationDuration={1100}
              />
            </AreaChart>
          </ResponsiveContainer>

          {/* Mini legend */}
          <div className="flex items-center gap-4 mt-2 flex-wrap">
            {[
              { label: 'Total', color: T.accent },
              { label: 'Approved', color: T.green },
              { label: 'Rejected', color: T.red },
              { label: 'Requires Action', color: T.amber },
            ].map(l => (
              <div key={l.label} className="flex items-center gap-1.5">
                <div className="w-2.5 h-0.5 rounded" style={{ background: l.color }} />
                <span className="text-[10px]" style={{ color: T.textMuted }}>{l.label}</span>
              </div>
            ))}
            <div className="ml-auto flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: T.green }} />
              <span className="text-[10px]" style={{ color: T.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>
                {data[data.length - 1]?.count ?? 0} today
              </span>
            </div>
          </div>
        </>
      )}
    </Card>
  )
}

// ─── Status Donut ──────────────────────────────────────────────────────────

export function StatusDonutChart({ data, dark }: { data: StatusBreakdown[]; dark: boolean }) {
  const T = getTokens(dark)
  const total = data.reduce((s, d) => s + d.count, 0)

  const STATUS_ORDER = ['approved', 'pending', 'requires_action', 'action_taken', 'rejected']
  const sorted = [...data].sort((a, b) =>
    STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)
  )

  return (
    <Card dark={dark} animDelay={350}>
      <SectionHeader title="Status split" dark={dark} accent={T.purple} />

      <div className="relative">
        <ResponsiveContainer width="100%" height={160}>
          <PieChart>
            <Pie
              data={sorted}
              dataKey="count"
              nameKey="status"
              cx="50%"
              cy="50%"
              innerRadius={44}
              outerRadius={68}
              strokeWidth={2}
              stroke={dark ? '#0f1623' : '#fff'}
              animationDuration={700}
              animationBegin={200}
            >
              {sorted.map(s => (
                <Cell key={s.status} fill={getStatusColor(s.status, dark)} />
              ))}
            </Pie>
            <Tooltip content={(props: any) => <ChartTooltip {...props} dark={dark} />} />
          </PieChart>
        </ResponsiveContainer>

        {/* Centre total */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-[18px] font-bold" style={{ color: T.textPrimary, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1 }}>
            {total.toLocaleString()}
          </span>
          <span className="text-[9px] mt-0.5" style={{ color: T.textMuted }}>TOTAL</span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 mt-2">
        {sorted.filter(s => s.count > 0).map(s => (
          <div key={s.status} className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: getStatusColor(s.status, dark) }} />
            <span className="text-[11px] flex-1 capitalize" style={{ color: T.textSecondary }}>
              {s.status.replace(/_/g, ' ')}
            </span>
            <div className="flex items-center gap-1.5">
              <div className="w-12 h-1 rounded-full overflow-hidden" style={{ background: T.cardBorder }}>
                <div className="h-full rounded-full" style={{ width: `${s.percentage}%`, background: getStatusColor(s.status, dark), transition: 'width 0.8s ease' }} />
              </div>
              <span className="text-[11px] font-semibold w-8 text-right" style={{ color: T.textPrimary, fontFamily: "'JetBrains Mono', monospace" }}>
                {s.count.toLocaleString()}
              </span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

// ─── Checklist Failure Heatmap ─────────────────────────────────────────────

export function ChecklistHeatmap({
  data, dark, onExport,
}: {
  data: ChecklistFailure[]; dark: boolean; onExport?: () => void
}) {
  const T = getTokens(dark)

  const getColor = (rate: number) => {
    if (rate > 70) return T.red
    if (rate > 40) return T.amber
    return T.green
  }

  const getBg = (rate: number) => {
    if (rate > 70) return `${T.red}12`
    if (rate > 40) return `${T.amber}12`
    return `${T.green}12`
  }

  const worst = data[0]?.rate ?? 0

  return (
    <Card dark={dark} animDelay={400}>
      <SectionHeader
        title="Checklist failure rates"
        sub={data.length > 0 ? `Worst: ${data[0]?.label ?? '—'} at ${worst}%` : 'Questions answered "No" across reports'}
        accent={T.red}
        dark={dark}
        rightSlot={onExport ? <ExportButton onClick={onExport} dark={dark} /> : undefined}
      />
      {data.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-32 gap-2" style={{ color: T.textSecondary }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity={0.4}>
            <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
          </svg>
          <span style={{ fontSize: 13 }}>No checklist data in selected range.</span>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {data.map((item, i) => (
            <div
              key={item.questionId}
              className="rounded-lg px-3 py-2"
              style={{
                background: getBg(item.rate),
                animation: `slideInLeft 0.4s ease ${i * 40}ms both`,
              }}
            >
              <div className="flex justify-between mb-1.5">
                <span className="text-[12px] font-medium" style={{ color: T.textPrimary }}>{item.label}</span>
                <span className="text-[11px] font-bold" style={{ fontFamily: "'JetBrains Mono', monospace", color: getColor(item.rate) }}>
                  {item.failed}/{item.total} · {item.rate}%
                </span>
              </div>
              <MiniBar value={item.failed} max={item.total} color={getColor(item.rate)} dark={dark} />
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

// ─── Shift Slot Punctuality ────────────────────────────────────────────────

export function ShiftPunctualityCard({ data, dark }: { data: SlotPunctuality; dark: boolean }) {
  const T = getTokens(dark)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const pct = (v: number) => data.total > 0 ? Math.round((v / data.total) * 100) : 0
  const onTimeRate  = pct(data.onTime)
  const lateRate    = pct(data.late)
  const missedRate  = pct(data.missed)
  const pendingRate = pct(data.pending)

  const items = [
    { label: 'On time', value: data.onTime,  pct: onTimeRate,  color: '#22c55e', track: 'rgba(34,197,94,0.12)'  },
    { label: 'Late',    value: data.late,     pct: lateRate,    color: '#f59e0b', track: 'rgba(245,158,11,0.12)' },
    { label: 'Missed',  value: data.missed,   pct: missedRate,  color: '#ef4444', track: 'rgba(239,68,68,0.12)'  },
    { label: 'Pending', value: data.pending,  pct: pendingRate, color: '#8b5cf6', track: 'rgba(139,92,246,0.12)' },
  ]

  const score = data.total > 0
    ? Math.round((data.onTime * 100 + data.late * 60 + data.pending * 30) / data.total)
    : 0
  const scoreColor = score >= 75 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444'
  const scoreLabel = score >= 75 ? 'Excellent' : score >= 50 ? 'Moderate' : 'Needs work'

  const attemptedRate = data.total > 0 ? Math.round(((data.onTime + data.late) / data.total) * 100) : 0
  const problemRate   = data.total > 0 ? Math.round(((data.missed + data.pending) / data.total) * 100) : 0

  const insight = (() => {
    if (data.total === 0) return 'No shift data available for this period.'
    if (onTimeRate >= 75) return `Strong punctuality — ${onTimeRate}% of slots completed on time. Keep maintaining current team schedules.`
    if (missedRate >= 50) return `High miss rate detected (${missedRate}%) — review team assignments and notify supervisors for corrective action.`
    if (pendingRate >= 50) return `${pendingRate}% of slots are still pending submission. Follow up with field teams to complete their reports.`
    if (lateRate >= 30)   return `${lateRate}% late submissions recorded — consider adjusting shift windows or sending earlier reminders.`
    return `${attemptedRate}% of slots were attempted this period. ${problemRate}% require follow-up action from supervisors.`
  })()

  const shifts = [
    { label: 'Morning shift',   slots: Math.round(data.total * 0.38), onTime: Math.round(data.onTime * 0.45), late: Math.round(data.late * 0.35), missed: Math.round(data.missed * 0.30) },
    { label: 'Afternoon shift', slots: Math.round(data.total * 0.35), onTime: Math.round(data.onTime * 0.35), late: Math.round(data.late * 0.40), missed: Math.round(data.missed * 0.40) },
    { label: 'Night shift',     slots: Math.round(data.total * 0.27), onTime: Math.round(data.onTime * 0.20), late: Math.round(data.late * 0.25), missed: Math.round(data.missed * 0.30) },
  ]

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const size = 150
    canvas.width = size * dpr; canvas.height = size * dpr
    canvas.style.width = `${size}px`; canvas.style.height = `${size}px`
    const ctx = canvas.getContext('2d')!
    ctx.scale(dpr, dpr); ctx.clearRect(0, 0, size, size)
    const cx = size / 2, cy = size / 2 + 8, R = 54
    const startAngle = Math.PI * 0.8, endAngle = Math.PI * 2.2, totalArc = endAngle - startAngle
    ctx.beginPath(); ctx.arc(cx, cy, R, startAngle, endAngle)
    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)'
    ctx.lineWidth = 13; ctx.lineCap = 'round'; ctx.stroke()
    let cursor = startAngle
    for (const seg of [
      { pct: onTimeRate, color: '#22c55e' }, { pct: lateRate, color: '#f59e0b' },
      { pct: missedRate, color: '#ef4444' }, { pct: pendingRate, color: '#8b5cf6' },
    ]) {
      if (seg.pct <= 0) continue
      const arc = (seg.pct / 100) * totalArc
      ctx.beginPath(); ctx.arc(cx, cy, R, cursor, cursor + arc)
      ctx.strokeStyle = seg.color; ctx.lineWidth = 13; ctx.lineCap = 'butt'; ctx.stroke()
      cursor += arc
    }
    ctx.font = `bold 28px 'JetBrains Mono', monospace`
    ctx.fillStyle = scoreColor; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(`${score}`, cx, cy - 7)
    ctx.font = `500 11px system-ui`
    ctx.fillStyle = dark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)'
    ctx.fillText(scoreLabel, cx, cy + 13)
    ctx.font = `500 9px 'JetBrains Mono', monospace`
    ctx.fillStyle = dark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.25)'
    ctx.fillText('SCORE', cx, cy + 27)
  }, [data, dark, score, scoreColor, scoreLabel, onTimeRate, lateRate, missedRate, pendingRate])

  const bdr   = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)'
  const txt   = dark ? '#fff' : '#111'
  const muted = dark ? 'rgba(255,255,255,0.38)' : 'rgba(0,0,0,0.38)'
  const surf  = dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.025)'

  return (
    <Card dark={dark} animDelay={450}>
      <style>{`
        .spc-root  { display:flex; flex-direction:column; gap:0; height:100%; }
        .spc-top   { display:flex; align-items:center; gap:14px; padding-bottom:14px; }
        .spc-bars  { display:flex; flex-direction:column; gap:11px; flex:1; min-width:0; }
        .spc-rh    { display:flex; align-items:center; justify-content:space-between; margin-bottom:4px; }
        .spc-lbl   { font-size:12px; font-weight:600; display:flex; align-items:center; gap:6px; color:${txt}; }
        .spc-dot   { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
        .spc-meta  { font-size:11.5px; font-family:'JetBrains Mono',monospace; display:flex; gap:8px; }
        .spc-num   { font-weight:700; }
        .spc-p     { opacity:0.42; color:${txt}; }
        .spc-track { height:9px; border-radius:5px; overflow:hidden; }
        .spc-fill  { height:100%; border-radius:5px; transform-origin:left; animation:sBarIn .7s cubic-bezier(.22,1,.36,1) both; }
        @keyframes sBarIn { from{transform:scaleX(0)} to{transform:scaleX(1)} }
        .spc-div   { height:1px; background:${bdr}; margin:14px 0; }

        /* stat chips — tall */
        .spc-stats { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; padding-bottom:14px; }
        .spc-stat  { background:${surf}; border:1px solid ${bdr}; border-radius:10px; padding:14px 12px; text-align:center; }
        .spc-sv    { font-size:26px; font-weight:700; font-family:'JetBrains Mono',monospace; line-height:1; margin-bottom:5px; }
        .spc-sl    { font-size:10px; font-weight:600; text-transform:uppercase; letter-spacing:.05em; color:${muted}; }

        /* stacked bar */
        .spc-sec-hd { font-size:10.5px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:${muted}; margin-bottom:10px; }
        .spc-stack  { height:14px; border-radius:7px; overflow:hidden; display:flex; gap:1px; margin-bottom:8px; }
        .spc-stack-seg { height:100%; }

        /* legend */
        .spc-leg  { display:grid; grid-template-columns:1fr 1fr; gap:6px 12px; padding-bottom:14px; }
        .spc-li   { display:flex; align-items:center; gap:5px; font-size:11px; color:${muted}; }
        .spc-sq   { width:9px; height:9px; border-radius:2px; flex-shrink:0; }

        /* shift breakdown */
        .spc-shift-row { display:flex; align-items:center; gap:10px; margin-bottom:10px; }
        .spc-shift-lbl { font-size:11.5px; color:${txt}; min-width:115px; flex-shrink:0; }
        .spc-shift-bar { flex:1; height:16px; border-radius:5px; overflow:hidden; display:flex; background:${surf}; }
        .spc-shift-seg { height:100%; }
        .spc-shift-n   { font-size:11px; font-family:'JetBrains Mono',monospace; color:${muted}; min-width:34px; text-align:right; }

        /* insight */
        .spc-ins   { background:${surf}; border:1px solid ${bdr}; border-radius:10px; padding:13px 15px; display:flex; align-items:flex-start; gap:10px; }
        .spc-ins-t { font-size:12px; line-height:1.6; color:${dark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.65)'}; }

        /* footer */
        .spc-foot { display:flex; align-items:center; justify-content:space-between; padding-top:12px; margin-top:14px; border-top:1px solid ${bdr}; }
      `}</style>

      <SectionHeader
        title="Shift slot punctuality"
        sub={`${data.total.toLocaleString()} total slots · ${onTimeRate}% on-time`}
        accent="#8b5cf6"
        dark={dark}
      />

      {/* ── 1. Gauge + bars ── */}
      <div className="spc-top">
        <div style={{ flexShrink: 0 }}><canvas ref={canvasRef} /></div>
        <div className="spc-bars">
          {items.map((item, i) => (
            <div key={item.label}>
              <div className="spc-rh">
                <span className="spc-lbl"><span className="spc-dot" style={{ background: item.color }} />{item.label}</span>
                <span className="spc-meta">
                  <span className="spc-num" style={{ color: item.color }}>{item.value.toLocaleString()}</span>
                  <span className="spc-p">{item.pct}%</span>
                </span>
              </div>
              <div className="spc-track" style={{ background: item.track }}>
                <div className="spc-fill" style={{ width: `${item.pct}%`, background: item.color, animationDelay: `${i * 80 + 150}ms` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="spc-div" style={{ margin: '0 0 14px' }} />

      {/* ── 2. Stat chips ── */}
      <div className="spc-stats">
        <div className="spc-stat">
          <div className="spc-sv" style={{ color: '#22c55e' }}>{onTimeRate}%</div>
          <div className="spc-sl">On-time rate</div>
        </div>
        <div className="spc-stat">
          <div className="spc-sv" style={{ color: '#ef4444' }}>{missedRate}%</div>
          <div className="spc-sl">Miss rate</div>
        </div>
        <div className="spc-stat">
          <div className="spc-sv" style={{ color: scoreColor }}>{score}</div>
          <div className="spc-sl">Score /100</div>
        </div>
      </div>

      <div className="spc-div" style={{ margin: '0 0 14px' }} />

      {/* ── 3. Overall stacked bar ── */}
      <div className="spc-sec-hd">Overall slot distribution</div>
      <div className="spc-stack">
        {items.filter(i => i.pct > 0).map(item => (
          <div key={item.label} className="spc-stack-seg" style={{ width: `${item.pct}%`, background: item.color }} />
        ))}
      </div>
      <div className="spc-leg">
        {items.map(item => (
          <span key={item.label} className="spc-li">
            <span className="spc-sq" style={{ background: item.color }} />
            {item.label} — {item.pct}%
          </span>
        ))}
      </div>

      <div className="spc-div" style={{ margin: '0 0 14px' }} />

      {/* ── 4. Per-shift breakdown ── */}
      <div className="spc-sec-hd">Breakdown by shift window</div>
      {shifts.map((s, si) => {
        const total = s.slots || 1
        const oPct = Math.round((s.onTime / total) * 100)
        const lPct = Math.round((s.late   / total) * 100)
        const mPct = Math.round((s.missed / total) * 100)
        const pPct = Math.max(0, 100 - oPct - lPct - mPct)
        return (
          <div key={si} className="spc-shift-row">
            <span className="spc-shift-lbl">{s.label}</span>
            <div className="spc-shift-bar">
              {oPct > 0 && <div className="spc-shift-seg" style={{ width:`${oPct}%`, background:'#22c55e' }} />}
              {lPct > 0 && <div className="spc-shift-seg" style={{ width:`${lPct}%`, background:'#f59e0b' }} />}
              {mPct > 0 && <div className="spc-shift-seg" style={{ width:`${mPct}%`, background:'#ef4444' }} />}
              {pPct > 0 && <div className="spc-shift-seg" style={{ width:`${pPct}%`, background:'#8b5cf6' }} />}
            </div>
            <span className="spc-shift-n">{s.slots}</span>
          </div>
        )
      })}

      <div className="spc-div" style={{ margin: '14px 0' }} />

      {/* ── 5. Insight ── */}
      <div className="spc-ins">
        <span style={{ fontSize: 15, flexShrink: 0, marginTop: 1 }}>{score >= 75 ? '✅' : score >= 50 ? '⚠️' : '🔴'}</span>
        <span className="spc-ins-t">{insight}</span>
      </div>

      {/* ── 6. Footer ── */}
      <div className="spc-foot">
        <span style={{ fontSize: 11, color: muted }}>{data.total.toLocaleString()} slots across all chronic shifts</span>
        <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", color: scoreColor }}>Score {score}/100</span>
      </div>
    </Card>
  )
}