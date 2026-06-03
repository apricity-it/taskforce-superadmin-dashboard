import { useState } from 'react'
import { getTokens } from '@/lib/dashboardTheme'
import { Card, SectionHeader, AlertCard } from './DashboardUI'
import type { AlertItem } from '@/lib/dashboardQueries'

export function AlertsPanel({ alerts, dark }: { alerts: AlertItem[]; dark: boolean }) {
  const T = getTokens(dark)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  if (alerts.length === 0) return null

  const visible  = alerts.filter(a => !dismissed.has(a.id))
  if (visible.length === 0) return null

  const critical = visible.filter(a => a.level === 'critical').length
  const warning  = visible.filter(a => a.level === 'warning').length
  const info     = visible.filter(a => a.level === 'info').length

  const subParts = [
    critical > 0 ? `${critical} critical` : null,
    warning  > 0 ? `${warning} warning`   : null,
    info     > 0 ? `${info} info`         : null,
  ].filter(Boolean).join(' · ')

  return (
    <Card dark={dark} animDelay={200}>
      <SectionHeader
        title="Active alerts"
        sub={`${subParts} · auto-detected on every refresh`}
        accent={T.red}
        dark={dark}
        icon={
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.red} strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        }
        rightSlot={
          <div className="flex items-center gap-2">
            {/* Level badges */}
            {critical > 0 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: `${T.red}20`, color: T.red }}>
                {critical} critical
              </span>
            )}
            {warning > 0 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: `${T.amber}20`, color: T.amber }}>
                {warning} warning
              </span>
            )}
            <button
              onClick={() => setDismissed(new Set(alerts.map(a => a.id)))}
              className="text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-all hover:opacity-80"
              style={{
                background: 'transparent',
                border: `1px solid ${T.cardBorder}`,
                color: T.textSecondary,
                cursor: 'pointer',
              }}
            >
              Dismiss all
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {visible.map((alert, i) => (
          <div
            key={alert.id}
            className="relative group"
            style={{ animation: `slideInLeft 0.4s ease ${i * 80}ms both` }}
          >
            <AlertCard level={alert.level} title={alert.title} meta={alert.meta} dark={dark} />
            <button
              onClick={() => setDismissed(prev => new Set([...prev, alert.id]))}
              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
              style={{
                width: 18, height: 18, borderRadius: '50%',
                background: dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                border: 'none', color: T.textSecondary, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes slideInLeft {
          from { opacity: 0; transform: translateX(-12px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </Card>
  )
}