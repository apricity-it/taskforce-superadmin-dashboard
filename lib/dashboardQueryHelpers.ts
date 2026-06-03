import type { ComplianceReport, FeederPoint, DashboardKPIs } from './dashboardQueries'

function tsToMs(v: any): number | null {
  if (!v) return null
  if (typeof v.toDate === 'function') return v.toDate().getTime()
  if (typeof v.seconds === 'number') return v.seconds * 1000
  if (typeof v._seconds === 'number') return v._seconds * 1000
  if (v instanceof Date) return v.getTime()
  return null
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10)
}

// ─── Trend Arrows: compare this week vs last week ─────────────────────────

export interface TrendArrow {
  direction: 'up' | 'down' | 'flat'
  percent: number
  label: string
}

export function buildTrendArrows(
  reports: ComplianceReport[],
  points: FeederPoint[],
  kpis: DashboardKPIs
): Record<string, TrendArrow> {
  const now = Date.now()
  const thisWeekStart = now - 7 * 86400000
  const lastWeekStart = now - 14 * 86400000

  let thisWeek = 0
  let lastWeek = 0
  let thisWeekApproved = 0
  let lastWeekApproved = 0
  let thisWeekPending = 0
  let lastWeekPending = 0

  reports.forEach(r => {
    const ms = tsToMs(r.submittedAt ?? r.createdAt)
    if (!ms) return
    if (ms >= thisWeekStart) {
      thisWeek++
      if (r.status === 'approved') thisWeekApproved++
      if (r.status === 'pending') thisWeekPending++
    } else if (ms >= lastWeekStart && ms < thisWeekStart) {
      lastWeek++
      if (r.status === 'approved') lastWeekApproved++
      if (r.status === 'pending') lastWeekPending++
    }
  })

  function calc(curr: number, prev: number): TrendArrow {
    if (prev === 0 && curr === 0) return { direction: 'flat', percent: 0, label: '—' }
    if (prev === 0) return { direction: 'up', percent: 100, label: '+100%' }
    const pct = Math.round(((curr - prev) / prev) * 100)
    if (pct === 0) return { direction: 'flat', percent: 0, label: '0%' }
    return {
      direction: pct > 0 ? 'up' : 'down',
      percent: Math.abs(pct),
      label: `${pct > 0 ? '+' : ''}${pct}%`,
    }
  }

  return {
    totalReports: calc(thisWeek, lastWeek),
    pendingReports: calc(thisWeekPending, lastWeekPending),
    approvedReports: calc(thisWeekApproved, lastWeekApproved),
  }
}

// ─── Trend arrow display string ───────────────────────────────────────────

export function trendLabel(t: TrendArrow | undefined): string {
  if (!t) return ''
  const arrow = t.direction === 'up' ? '↑' : t.direction === 'down' ? '↓' : '→'
  return `${arrow}${t.label} vs last week`
}