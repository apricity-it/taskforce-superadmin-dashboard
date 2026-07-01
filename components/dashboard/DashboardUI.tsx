import Link from 'next/link'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { getTokens } from '@/lib/dashboardTheme'

export function AnimatedNumber({ value, duration = 900 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0)
  const raf  = useRef(0)
  const prev = useRef(0)

  useEffect(() => {
    const start = performance.now()
    const from  = prev.current
    const step  = (now: number) => {
      const p    = Math.min((now - start) / duration, 1)
      const ease = 1 - Math.pow(1 - p, 3)
      setDisplay(Math.round(from + (value - from) * ease))
      if (p < 1) raf.current = requestAnimationFrame(step)
      else prev.current = value
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
  }, [value, duration])

  return <>{display.toLocaleString()}</>
}

export function PulseDot({ color, size = 8 }: { color: string; size?: number }) {
  return (
    <span className="relative inline-flex items-center justify-center"
      style={{ width: size + 4, height: size + 4 }}>
      <span className="absolute rounded-full animate-ping"
        style={{ width: size + 4, height: size + 4, background: color, opacity: 0.3 }} />
      <span className="rounded-full" style={{ width: size, height: size, background: color }} />
    </span>
  )
}

export function MiniBar({ value, max, color, dark }: { value: number; max: number; color: string; dark: boolean }) {
  const T = getTokens(dark)
  const w = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: T.cardBorder }}>
      <div className="h-full rounded-full transition-all duration-700 ease-out"
        style={{ width: `${w}%`, background: color }} />
    </div>
  )
}

export function Card({
  children, dark, className = '', style, onClick, animDelay = 0,
}: {
  children: ReactNode; dark: boolean; className?: string
  style?: CSSProperties; onClick?: () => void; animDelay?: number
}) {
  const T = getTokens(dark)
  return (
    <div
      onClick={onClick}
      className={`rounded-xl transition-all duration-300 ${onClick ? 'cursor-pointer hover:-translate-y-0.5' : ''} ${className}`}
      style={{
        background: T.card, border: `1px solid ${T.cardBorder}`,
        padding: '20px 22px',
        animation: `slideUp 0.5s ease ${animDelay}ms both`,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

export function SectionHeader({
  title, sub, accent, dark, icon, rightSlot,
}: {
  title: string; sub?: string; accent?: string; dark: boolean
  icon?: ReactNode; rightSlot?: ReactNode
}) {
  const T = getTokens(dark)
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="w-[3px] h-[22px] rounded-sm flex-shrink-0"
        style={{ background: accent || T.accent }} />
      <div className="flex-1 min-w-0">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] flex items-center gap-2"
          style={{ color: T.textPrimary, margin: 0 }}>
          {icon}{title}
        </h2>
        {sub && (
          <p className="text-[11px] mt-0.5" style={{ color: T.textSecondary, margin: 0 }}>{sub}</p>
        )}
      </div>
      {rightSlot}
    </div>
  )
}

export function KPICard({
  label, value, sub, accent, urgent, dark, delay = 0, href, onClick,
}: {
  label: string; value: number; sub?: string; accent?: string
  urgent?: boolean; dark: boolean; delay?: number; href?: string; onClick?: () => void
}) {
  const T = getTokens(dark)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay)
    return () => clearTimeout(t)
  }, [delay])

  const accentColor = accent || T.accent

  const inner = (
    <div
      className={`rounded-xl relative overflow-hidden transition-all duration-500 ${onClick || href ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-lg' : ''}`}
      style={{
        background: T.card,
        border: `1px solid ${urgent ? `${T.red}40` : T.cardBorder}`,
        borderTop: `2px solid ${urgent ? T.red : accentColor}`,
        padding: '16px 18px',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(12px)',
        transition: `opacity 0.5s ease ${delay}ms, transform 0.5s ease ${delay}ms`,
      }}
      onClick={onClick}
    >
      {urgent && (
        <div className="absolute top-2.5 right-2.5"><PulseDot color={T.red} /></div>
      )}
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em]"
        style={{ color: T.textSecondary, margin: '0 0 10px' }}>
        {label}
      </p>
      <p className="text-[28px] font-bold leading-none"
        style={{ color: accentColor, fontFamily: "'JetBrains Mono', monospace", margin: 0 }}>
        <AnimatedNumber value={value} />
      </p>
      {sub && (
        <p className="text-[11px]" style={{ color: T.textMuted, margin: '6px 0 0' }}>{sub}</p>
      )}
    </div>
  )

  if (href) return <Link href={href} className="block no-underline">{inner}</Link>
  return inner
}

export function AlertCard({
  level, title, meta, dark,
}: {
  level: 'critical' | 'warning' | 'info'; title: string; meta: string; dark: boolean
}) {
  const T = getTokens(dark)
  const c = { critical: T.red, warning: T.amber, info: T.accent }[level]
  return (
    <div className="flex items-start gap-3"
      style={{ padding: '11px 14px', borderLeft: `3px solid ${c}`, background: `${c}08`, borderRadius: '0 8px 8px 0' }}>
      <PulseDot color={c} />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold" style={{ color: T.textPrimary, margin: 0 }}>{title}</p>
        <p className="text-[11px] mt-0.5" style={{ color: T.textSecondary, margin: '3px 0 0' }}>{meta}</p>
      </div>
    </div>
  )
}

export function ExportButton({ onClick, label = 'Excel', dark }: { onClick: () => void; label?: string; dark: boolean }) {
  const T = getTokens(dark)
  return (
    <button onClick={onClick}
      className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-all hover:opacity-80 active:scale-95"
      style={{ background: 'transparent', border: `1px solid ${T.cardBorder}`, color: T.textSecondary, cursor: 'pointer' }}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
      </svg>
      {label}
    </button>
  )
}

export interface DashboardFilters {
  dateFrom: string
  dateTo: string
  zoneId: string
  wardId: string
  status: string
  pointType: string
}

export function FilterBar({
  filters, onChange, zones, wards, dark, onExportAll,
}: {
  filters: DashboardFilters
  onChange: (f: DashboardFilters) => void
  zones: { id: string; name: string }[]
  wards: { id: string; name: string }[]
  dark: boolean
  onExportAll?: () => void
}) {
  const T = getTokens(dark)

  // Count active filters (non-empty, non-date fields)
  const activeCount = [filters.zoneId, filters.wardId, filters.status, filters.pointType]
    .filter(Boolean).length

  const inputStyle: CSSProperties = {
    background: dark ? T.surface : '#f8f7f5',
    border: `1px solid ${T.cardBorder}`,
    borderRadius: 7, padding: '6px 10px',
    color: T.textPrimary, fontSize: 12,
    fontFamily: "'JetBrains Mono', monospace",
    outline: 'none', cursor: 'pointer',
    colorScheme: dark ? 'dark' : 'light',
  }

  const set = (key: keyof DashboardFilters) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      onChange({ ...filters, [key]: e.target.value })

  const clearAll = () => onChange({ ...filters, zoneId: '', wardId: '', status: '', pointType: '' })

  return (
    <div className="flex flex-wrap gap-2 items-center rounded-xl mb-5"
      style={{ padding: '12px 16px', background: dark ? T.surface : '#f8f7f5', border: `1px solid ${T.cardBorder}` }}>

      {/* Label + active badge */}
      <span className="text-[10px] font-semibold uppercase tracking-[0.06em] flex items-center gap-1.5"
        style={{ color: T.textSecondary }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
        </svg>
        Filters
        {activeCount > 0 && (
          <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full"
            style={{ background: T.accent, color: '#fff', lineHeight: 1 }}>
            {activeCount}
          </span>
        )}
      </span>

     

      <select style={inputStyle} value={filters.zoneId} onChange={set('zoneId')}>
        <option value="">All zones</option>
        {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
      </select>

      <select style={inputStyle} value={filters.wardId} onChange={set('wardId')}>
        <option value="">All wards</option>
        {wards.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
      </select>

      <select style={inputStyle} value={filters.status} onChange={set('status')}>
        <option value="">All statuses</option>
        <option value="pending">Pending</option>
        <option value="approved">Approved</option>
        <option value="rejected">Rejected</option>
        <option value="requires_action">Requires action</option>
        <option value="action_taken">Action taken</option>
      </select>

      <select style={inputStyle} value={filters.pointType} onChange={set('pointType')}>
        <option value="">All point types</option>
        <option value="feeder">Feeder</option>
        <option value="chronic">Chronic</option>
      </select>

      {/* Clear filters */}
      {activeCount > 0 && (
        <button onClick={clearAll}
          className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg transition-all hover:opacity-80"
          style={{ background: 'transparent', border: `1px solid ${T.cardBorder}`, color: T.textSecondary, cursor: 'pointer' }}>
          ✕ Clear
        </button>
      )}

      {onExportAll && (
        <button onClick={onExportAll}
          className="ml-auto flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-all hover:opacity-90 active:scale-95"
          style={{ background: T.green, color: '#fff', border: 'none', cursor: 'pointer' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
          </svg>
          Export all
        </button>
      )}
    </div>
  )
}

export function DashboardKeyframes() {
  return (
    <style>{`
      @keyframes slideUp {
        from { opacity: 0; transform: translateY(16px); }
        to   { opacity: 1; transform: translateY(0);    }
      }
      @keyframes fadeIn {
        from { opacity: 0; }
        to   { opacity: 1; }
      }
      @keyframes slideInLeft {
        from { opacity: 0; transform: translateX(-12px); }
        to   { opacity: 1; transform: translateX(0);     }
      }
    `}</style>
  )
}