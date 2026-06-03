import Link from 'next/link'
import { getTokens } from '@/lib/dashboardTheme'
import { TOP_PERFORMER_ICONS, TOP_PERFORMER_COLORS } from '@/lib/dashboardTheme'
import { Card, SectionHeader, MiniBar, ExportButton, PulseDot } from './DashboardUI'
import type { TeamLeaderboardEntry, TopPerformer } from '@/lib/dashboardQueries'

// ─── Team Leaderboard ──────────────────────────────────────────────────────

export function TeamLeaderboard({
  data, dark, onExport,
}: {
  data: TeamLeaderboardEntry[]
  dark: boolean
  onExport?: () => void
}) {
  const T = getTokens(dark)
  const medals = ['🥇', '🥈', '🥉']

  const rateColor = (rate: number) => {
    if (rate >= 70) return T.green
    if (rate >= 40) return T.amber
    return T.red
  }

  const headers = ['Rank', 'Team', 'Total', '✓ Approved', '✗ Rejected', '⚡ Action', 'Rate']

  return (
    <Card dark={dark} animDelay={500}>
      <SectionHeader
        title="Team leaderboard"
        sub={`${data.length} teams · ranked by approval rate`}
        accent={T.gold}
        dark={dark}
        icon={<span style={{ fontSize: 14 }}>🏆</span>}
        rightSlot={onExport ? <ExportButton onClick={onExport} dark={dark} /> : undefined}
      />
      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={{ fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${T.cardBorder}` }}>
              {headers.map(h => (
                <th
                  key={h}
                  className="text-left"
                  style={{
                    padding: '8px 10px',
                    fontSize: 10,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: T.textSecondary,
                    fontWeight: 600,
                    fontFamily: "'JetBrains Mono', monospace",
                    whiteSpace: 'nowrap',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center" style={{ padding: '28px 12px', color: T.textSecondary }}>
                  <div className="flex flex-col items-center gap-2">
                    <span style={{ fontSize: 28 }}>🏆</span>
                    <span style={{ fontSize: 13 }}>No team data in selected range</span>
                  </div>
                </td>
              </tr>
            ) : (
              data.map((team, i) => (
                <tr
                  key={team.teamId}
                  style={{
                    borderBottom: `1px solid ${T.gridLine}`,
                    animation: `slideInLeft 0.35s ease ${i * 45}ms both`,
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = dark ? T.surface : '#f8f7f5' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                >
                  <td style={{ padding: '10px 10px', color: i < 3 ? T.gold : T.textMuted, fontSize: i < 3 ? 16 : 12, fontFamily: "'JetBrains Mono', monospace" }}>
                    {i < 3 ? medals[i] : `#${i + 1}`}
                  </td>
                  <td style={{ padding: '10px 10px', color: T.textPrimary, fontWeight: 600, maxWidth: 140 }}>
                    <span className="truncate block">{team.teamName || 'Unknown team'}</span>
                  </td>
                  <td style={{ padding: '10px 10px', color: T.textSecondary, fontFamily: "'JetBrains Mono', monospace" }}>
                    {team.total.toLocaleString()}
                  </td>
                  <td style={{ padding: '10px 10px', color: T.green, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
                    {team.approved.toLocaleString()}
                  </td>
                  <td style={{ padding: '10px 10px', color: T.red, fontFamily: "'JetBrains Mono', monospace" }}>
                    {team.rejected.toLocaleString()}
                  </td>
                  <td style={{ padding: '10px 10px', color: T.amber, fontFamily: "'JetBrains Mono', monospace" }}>
                    {team.pending.toLocaleString()}
                  </td>
                  <td style={{ padding: '10px 10px', minWidth: 120 }}>
                    <div className="flex items-center gap-2">
                      <MiniBar value={team.approved} max={team.total} color={rateColor(team.approvalRate)} dark={dark} />
                      <span style={{ minWidth: 36, fontFamily: "'JetBrains Mono', monospace", color: rateColor(team.approvalRate), fontWeight: 700, fontSize: 12 }}>
                        {team.approvalRate}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

// ─── Top Performers Grid ───────────────────────────────────────────────────

export function TopPerformersGrid({ data, dark }: { data: TopPerformer[]; dark: boolean }) {
  const T = getTokens(dark)

  if (data.length === 0) return null

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-[3px] h-[18px] rounded-sm" style={{ background: T.gold }} />
        <div>
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] flex items-center gap-2" style={{ color: T.textPrimary, margin: 0 }}>
            <span style={{ fontSize: 14 }}>🏅</span>
            Top performers
          </h2>
          <p className="text-[11px] mt-0.5" style={{ color: T.textSecondary, margin: 0 }}>
            Best-performing entities across all dimensions
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
        {data.map((item, i) => {
          const icon = TOP_PERFORMER_ICONS[item.metric] ?? '📊'
          const colorSet = TOP_PERFORMER_COLORS[item.metric]
          const color = colorSet ? (dark ? colorSet.dark : colorSet.light) : T.accent

          return (
            <Card
              key={item.metric}
              dark={dark}
              animDelay={650 + i * 50}
              style={{ padding: '16px 14px' }}
            >
              {/* Rank badge */}
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.06em] flex items-center gap-1" style={{ color: T.textSecondary, margin: 0 }}>
                  <span style={{ fontSize: 13 }}>{icon}</span>
                  {item.metric}
                </p>
                <span
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ background: `${color}20`, color, fontFamily: "'JetBrains Mono', monospace" }}
                >
                  {typeof item.value === 'number' ? item.value.toLocaleString() : item.value}
                </span>
              </div>

              <p className="text-[15px] font-bold leading-tight truncate" style={{ color, margin: '0 0 4px' }}>
                {item.name}
              </p>
              <p className="text-[11px]" style={{ color: T.textMuted, margin: 0 }}>{item.sub}</p>

              {/* Bottom accent bar */}
              <div className="mt-3 h-0.5 rounded-full" style={{ background: `${color}30` }}>
                <div className="h-full rounded-full w-2/3" style={{ background: color, opacity: 0.6 }} />
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

// ─── Requests Pipeline ─────────────────────────────────────────────────────

export function RequestsPipeline({
  pendingPR, pendingFR, pendingAR, dark,
}: {
  pendingPR: number
  pendingFR: number
  pendingAR: number
  dark: boolean
}) {
  const T = getTokens(dark)

  const items = [
    { label: 'New point requests', count: pendingPR, color: T.accent,  icon: '📍', href: '/feeder-point-requests' },
    { label: 'Frequency changes',  count: pendingFR, color: T.amber,   icon: '🔄', href: '/frequency-requests'    },
    { label: 'Access requests',    count: pendingAR, color: T.purple,  icon: '🔑', href: '/access-requests'       },
  ]

  const total = pendingPR + pendingFR + pendingAR

  return (
    <Card dark={dark} animDelay={700}>
      <SectionHeader
        title="Requests pipeline"
        sub={total > 0 ? `${total} pending approval${total !== 1 ? 's' : ''} across all types` : 'No pending requests'}
        accent={T.amber}
        dark={dark}
        icon={
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.amber} strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
          </svg>
        }
      />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {items.map((item, i) => (
          <Link
            key={item.label}
            href={item.href}
            className="flex items-center gap-3 rounded-xl p-4 no-underline transition-all hover:-translate-y-0.5 hover:shadow-md"
            style={{
              background: dark ? T.surface : '#f8f7f5',
              border: `1px solid ${item.count > 0 ? `${item.color}35` : T.cardBorder}`,
              animation: `slideUp 0.4s ease ${i * 80}ms both`,
            }}
          >
            <div
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-xl"
              style={{ background: item.count > 0 ? `${item.color}15` : T.cardBorder }}
            >
              {item.icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.06em]" style={{ color: T.textSecondary, margin: '0 0 4px' }}>
                {item.label}
              </p>
              <p className="text-[24px] font-bold leading-none" style={{ color: item.count > 0 ? item.color : T.textMuted, fontFamily: "'JetBrains Mono', monospace", margin: 0 }}>
                {item.count}
              </p>
            </div>
            {item.count > 0 && <PulseDot color={item.color} />}
          </Link>
        ))}
      </div>
    </Card>
  )
}