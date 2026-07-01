import { useMemo, useState, useCallback, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import { getTokens } from '@/lib/dashboardTheme'
import { Card, SectionHeader } from './DashboardUI'
import type { FeederPoint } from '@/lib/dashboardQueries'

const PointsMap = dynamic(() => import('./PointsMapLeaflet'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-[200px] rounded-lg" style={{ background: 'rgba(0,0,0,0.05)' }}>
      <p className="text-xs animate-pulse" style={{ color: '#888' }}>Loading map…</p>
    </div>
  ),
})

function getStatusDot(status: string, isEliminated: boolean, dark: boolean) {
  const T = getTokens(dark)
  if (isEliminated) return T.red
  if (status === 'active') return T.green
  if (status === 'maintenance') return T.amber
  return T.textMuted
}

export function PointsOverview({ points, dark }: { points: FeederPoint[]; dark: boolean }) {
  const T = getTokens(dark)

  const feederPts  = useMemo(() => points.filter(p => (p.type ?? 'feeder') === 'feeder'), [points])
  const chronicPts = useMemo(() => points.filter(p => p.type === 'chronic'), [points])

  const totalActive    = points.filter(p => p.status === 'active' && !p.isEliminated).length
  const totalEliminated = points.filter(p => p.isEliminated).length
  const totalAssigned  = points.filter(p => !p.isEliminated && (p.assignedTeamId || p.assignedUserId || (p as any).assignedUserIds?.length)).length
  const totalUnassigned = points.filter(p => !p.isEliminated && !p.assignedTeamId && !p.assignedUserId && !((p as any).assignedUserIds?.length)).length

  return (
    <div className="flex flex-col gap-3">
      {/* Summary bar */}
      <div
        className="grid grid-cols-2 sm:grid-cols-4 gap-2 rounded-xl p-3"
        style={{ background: T.surface, border: `1px solid ${T.cardBorder}` }}
      >
        {[
          { label: 'Feeder',      value: feederPts.length,  color: T.accent  },
          { label: 'Chronic',     value: chronicPts.length, color: T.gold    },
          { label: 'Active',      value: totalActive,       color: T.green   },
          { label: 'Unassigned',  value: totalUnassigned,   color: T.amber   },
        ].map((s, i) => (
          <div
            key={s.label}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg"
            style={{ animation: `slideUp 0.4s ease ${i * 60}ms both` }}
          >
            <div className="w-2 h-8 rounded-full flex-shrink-0" style={{ background: s.color }} />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: T.textSecondary, margin: 0 }}>
                {s.label}
              </p>
              <p className="text-[20px] font-bold leading-none" style={{ color: s.color, fontFamily: "'JetBrains Mono', monospace", margin: 0 }}>
                {s.value}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Two cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <PointsCard
          title="Feeder points"
          points={feederPts.filter(p => !p.isEliminated)}
          allPoints={feederPts}
          accent={T.accent}
          markerColor={T.green}
          dark={dark}
          delay={550}
          typeLabel="feeder"
        />
        <PointsCard
          title="Chronic points"
          points={chronicPts.filter(p => !p.isEliminated)}
          allPoints={chronicPts}
          accent={T.gold}
          markerColor={T.gold}
          dark={dark}
          delay={600}
          typeLabel="chronic"
        />
      </div>
    </div>
  )
}

function PointsCard({
  title, points, allPoints, accent, markerColor, dark, delay, typeLabel,
}: {
  title: string
  points: FeederPoint[]
  allPoints: FeederPoint[]
  accent: string
  markerColor: string
  dark: boolean
  delay: number
  typeLabel: 'feeder' | 'chronic'
}) {
  const T = getTokens(dark)
  const [showList, setShowList] = useState(false)
  const [highlightedId, setHighlightedId] = useState<string | null>(null)
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const active      = allPoints.filter(p => p.status === 'active' && !p.isEliminated).length
  const maintenance = allPoints.filter(p => p.status === 'maintenance' && !p.isEliminated).length
  const eliminated  = allPoints.filter(p => p.isEliminated).length
  const inactive    = allPoints.filter(p => p.status === 'inactive' && !p.isEliminated).length
  const assigned    = allPoints.filter(p => !p.isEliminated && (p.assignedTeamId || p.assignedUserId || (p as any).assignedUserIds?.length)).length
  const unassigned  = allPoints.filter(p => !p.isEliminated && !p.assignedTeamId && !p.assignedUserId && !((p as any).assignedUserIds?.length)).length

  const mappable = points.filter(p => p.location?.latitude && p.location?.longitude)

  const stats = [
    { label: 'Active',      value: active,      color: T.green    },
    { label: 'Maint.',      value: maintenance,  color: T.amber    },
    { label: 'Inactive',    value: inactive,     color: T.textMuted },
    { label: 'Eliminated',  value: eliminated,   color: T.red      },
    { label: 'Assigned',    value: assigned,     color: T.accent   },
    { label: 'Unassigned',  value: unassigned,   color: T.purple   },
  ].filter(s => s.value > 0)

  const handleMarkerSelect = useCallback((p: FeederPoint) => {
    setShowList(true)
    setHighlightedId(p.id)
  }, [])

  useEffect(() => {
    if (!showList || !highlightedId) return
    const t = setTimeout(() => {
      rowRefs.current[highlightedId]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 50)
    return () => clearTimeout(t)
  }, [showList, highlightedId])

  useEffect(() => {
    if (!highlightedId) return
    const t = setTimeout(() => setHighlightedId(null), 2000)
    return () => clearTimeout(t)
  }, [highlightedId])

  return (
    <Card dark={dark} animDelay={delay}>
      <SectionHeader
        title={`${title} (${allPoints.length})`}
        sub={`${active} active · ${assigned} assigned · ${eliminated} eliminated`}
        dark={dark}
        accent={accent}
      />

      {/* Map */}
      <div className="rounded-xl overflow-hidden mb-3" style={{ height: 200 }}>
        {mappable.length > 0 ? (
          <PointsMap points={mappable} dark={dark} accentColor={markerColor} onSelectPoint={handleMarkerSelect} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-2 rounded-xl" style={{ background: dark ? T.surface : '#f0f4f0' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: T.textMuted, opacity: 0.5 }}>
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            <p className="text-xs" style={{ color: T.textSecondary }}>No points with coordinates</p>
          </div>
        )}
      </div>

      {/* Stats chips */}
      <div className="flex gap-1.5 flex-wrap mb-3">
        {stats.map(s => (
          <span
            key={s.label}
            className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
            style={{ background: `${s.color}15`, color: s.color, border: `1px solid ${s.color}25` }}
          >
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: s.color }} />
            {s.label} {s.value}
          </span>
        ))}
      </div>

      {/* Toggle list */}
      <button
        onClick={() => setShowList(v => !v)}
        className="w-full text-left text-[11px] font-semibold px-3 py-2 rounded-lg transition-all hover:opacity-80"
        style={{ background: dark ? T.surface : '#f8f7f5', color: T.textSecondary, border: `1px solid ${T.cardBorder}`, cursor: 'pointer' }}
      >
        {showList ? '▼ Hide list' : '▶ Show point list'} ({points.length} active)
      </button>

      {showList && (
        <div className="flex flex-col gap-1 mt-2 max-h-[220px] overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
          {points.length === 0 ? (
            <p className="text-[12px] text-center py-4" style={{ color: T.textMuted }}>No active {typeLabel} points</p>
          ) : (
            points.slice(0, 60).map((p, i) => {
              const isHighlighted = p.id === highlightedId
              return (
                <div
                  key={p.id}
                  ref={el => { rowRefs.current[p.id] = el }}
                  className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-colors duration-300"
                  style={{
                    background: isHighlighted ? `${accent}20` : (dark ? T.surface : '#f8f7f5'),
                    border: isHighlighted ? `1px solid ${accent}50` : '1px solid transparent',
                    animation: `slideInLeft 0.3s ease ${i * 20}ms both`,
                  }}
                >
                  <div className="w-[7px] h-[7px] rounded-full flex-shrink-0" style={{ background: getStatusDot(p.status, p.isEliminated ?? false, dark) }} />
                  <span className="flex-1 text-[12px] truncate" style={{ color: T.textPrimary, fontWeight: isHighlighted ? 600 : 400 }}>{p.name}</span>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {p.wardName && (
                      <span className="text-[10px]" style={{ color: T.textMuted }}>{p.wardName}</span>
                    )}
                    <span
                      className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                      style={{ background: `${accent}20`, color: accent }}
                    >
                      {typeLabel}
                    </span>
                  </div>
                </div>
              )
            })
          )}
          {points.length > 60 && (
            <p className="text-[11px] text-center py-2" style={{ color: T.textMuted }}>
              +{points.length - 60} more points
            </p>
          )}
        </div>
      )}
    </Card>
  )
}