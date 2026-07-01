'use client'

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from 'react-leaflet'
import type { Map as LeafletMap, CircleMarker as LCircleMarker } from 'leaflet'
import type { FeederPoint, ComplianceReport } from '@/lib/dashboardQueries'

// ─── Types ─────────────────────────────────────────────────────────────────

interface PointsMapProps {
  points: FeederPoint[]
  reports?: ComplianceReport[]   // used to compute per-point stats in detail panel
  dark: boolean
  accentColor?: string
  onSelectPoint?: (p: FeederPoint) => void
}

// Per-point stats derived from ComplianceReport[]
interface PointStats {
  total: number
  approved: number
  pending: number
  rejected: number
}

// ─── Status color map ───────────────────────────────────────────────────────

function getMarkerColor(point: FeederPoint): string {
  if (point.isEliminated) return '#a855f7' // purple  – eliminated
  if (point.status === 'active') return '#22c55e' // green   – active
  if (point.status === 'inactive') return '#ef4444' // red     – inactive
  if (point.status === 'maintenance') return '#f59e0b' // amber – maintenance
  return '#6b7280'                                   // gray    – unknown
}

function getStatusBadge(status: string, eliminated: boolean) {
  if (eliminated) return { label: 'Eliminated', cls: 'badge-purple' }
  if (status === 'active') return { label: 'Active', cls: 'badge-green' }
  if (status === 'inactive') return { label: 'Inactive', cls: 'badge-red' }
  if (status === 'maintenance') return { label: 'Maintenance', cls: 'badge-amber' }
  return { label: status, cls: 'badge-gray' }
}

// ─── Density-based auto zoom ────────────────────────────────────────────────

function DensityZoom({ points }: { points: { lat: number; lng: number }[] }) {
  const map = useMap()
  const fitted = useRef(false)

  useEffect(() => {
    if (points.length === 0 || fitted.current) return
    fitted.current = true

    const GRID = 0.05
    const cells: Record<string, { lat: number; lng: number; count: number }> = {}
    for (const p of points) {
      const key = `${Math.floor(p.lat / GRID)}_${Math.floor(p.lng / GRID)}`
      if (!cells[key]) cells[key] = { lat: p.lat, lng: p.lng, count: 0 }
      cells[key].count++
    }
    const densest = Object.values(cells).sort((a, b) => b.count - a.count)[0]
    const bounds = points.map(p => [p.lat, p.lng] as [number, number])

    let flyTimer: ReturnType<typeof setTimeout> | null = null

    try {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 })
      if (densest && densest.count > 1) {
        flyTimer = setTimeout(() => {
          try {
            if (map && (map as any)._loaded && map.getContainer()) {
              map.flyTo([densest.lat, densest.lng], Math.min(15, map.getZoom() + 2), {
                animate: true, duration: 1.8,
              })
            }
          } catch (_) { }
        }, 700)
      }
    } catch { /* ignore */ }

    return () => {
      if (flyTimer) clearTimeout(flyTimer)
      try { if ((map as any)._loaded) map.stop() } catch { /* ignore */ }
    }
  }, [points, map])

  return null
}

// ─── Map bridge ─────────────────────────────────────────────────────────────

function MapBridge({ onReady }: { onReady: (m: LeafletMap) => void }) {
  const map = useMap()
  useEffect(() => {
    onReady(map)
    return () => {
      try { if ((map as any)._loaded) map.stop() } catch { /* ignore */ }
    }
  }, [map, onReady])
  return null
}

// ─── Smart marker — imperatively syncs style so Leaflet always re-renders ──

function SmartMarker({
  point,
  dark,
  isSelected,
  onSelect,
}: {
  point: FeederPoint
  dark: boolean
  isSelected: boolean
  onSelect: (p: FeederPoint) => void
}) {
  const markerRef = useRef<LCircleMarker | null>(null)
  const baseColor = getMarkerColor(point)

  // Imperatively update pathOptions whenever selection changes
  useEffect(() => {
    const m = markerRef.current
    if (!m) return
    try {
      m.setStyle({
        fillColor: isSelected ? '#ffffff' : baseColor,
        fillOpacity: isSelected ? 1 : 0.88,
        color: isSelected ? baseColor : (dark ? '#0a0c10' : '#ffffff'),
        weight: isSelected ? 3 : 1.5,
      })
      m.setRadius(isSelected ? 11 : 7)
    } catch (_) { /* layer was removed mid-transition, safe to ignore */ }
  }, [isSelected, baseColor, dark])

  return (
    <CircleMarker
      ref={markerRef}
      center={[point.location.latitude, point.location.longitude]}
      radius={7}
      pathOptions={{
        fillColor: baseColor,
        fillOpacity: 0.88,
        color: dark ? '#0a0c10' : '#ffffff',
        weight: 1.5,
      }}
      eventHandlers={{ click: () => onSelect(point) }}
    >
      <Tooltip direction="top" offset={[0, -8]} opacity={1} sticky>
        <span style={{ fontSize: 12, fontWeight: 600 }}>{point.name}</span>
      </Tooltip>
    </CircleMarker>
  )
}

// ─── Detail panel ───────────────────────────────────────────────────────────

function DetailPanel({
  point,
  pointStats,
  dark,
  onClose,
}: {
  point: FeederPoint
  pointStats: PointStats
  dark: boolean
  onClose: () => void
}) {
  const badge = getStatusBadge(point.status, !!point.isEliminated)
  const isChronic = point.type === 'chronic'
  const color = getMarkerColor(point)

  const fields = [
    { icon: '🗺️', label: 'Zone', value: point.zoneName },
    { icon: '🏘️', label: 'Ward', value: point.wardName },
    { icon: '🏠', label: 'Kothi', value: point.kothiName },
    { icon: '👥', label: 'Team', value: point.assignmentDetails?.name },
    { icon: '🔁', label: 'Frequency', value: point.inspectionFrequency?.type },
    {
      icon: '📍', label: 'Coords',
      value: point.location?.latitude
        ? `${point.location.latitude.toFixed(4)}, ${point.location.longitude.toFixed(4)}`
        : null,
    },
  ].filter(f => f.value)

  return (
    <div className="detail-panel">
      <div className="detail-header">
        <div className="detail-type-pill" data-type={isChronic ? 'chronic' : 'feeder'}>
          {isChronic ? '⚡ Chronic' : '📍 Feeder'}
        </div>
        <button className="close-btn" onClick={onClose} aria-label="Close panel">✕</button>
      </div>

      {/* Color bar */}
      <div className="color-bar" style={{ background: color }} />

      <h3 className="detail-name">{point.name}</h3>
      <span className={`status-badge ${badge.cls}`}>{badge.label}</span>

      <div className="detail-fields">
        {fields.map(f => (
          <div key={f.label} className="detail-field">
            <span className="fi">{f.icon}</span>
            <span className="fl">{f.label}</span>
            <span className="fv">{f.value}</span>
          </div>
        ))}
      </div>

      <div className="detail-stats">
        <div className="stat-chip">
          <span className="sc-num">{pointStats.total}</span>
          <span className="sc-lbl">Reports</span>
        </div>
        <div className="stat-chip">
          <span className="sc-num" style={{ color: '#22c55e' }}>{pointStats.approved}</span>
          <span className="sc-lbl">Approved</span>
        </div>
        <div className="stat-chip">
          <span className="sc-num" style={{ color: '#f59e0b' }}>{pointStats.pending}</span>
          <span className="sc-lbl">Pending</span>
        </div>
        <div className="stat-chip">
          <span className="sc-num" style={{ color: '#ef4444' }}>{pointStats.rejected}</span>
          <span className="sc-lbl">Rejected</span>
        </div>
      </div>
    </div>
  )
}

// ─── Table ──────────────────────────────────────────────────────────────────

function PointsTable({
  points, dark, selectedId, onSelect, filterType, filterStatus, onFilterType, onFilterStatus,
}: {
  points: FeederPoint[]
  dark: boolean
  selectedId: string | null
  onSelect: (p: FeederPoint) => void
  filterType: 'all' | 'feeder' | 'chronic'
  filterStatus: 'all' | 'active' | 'inactive' | 'maintenance' | 'eliminated'
  onFilterType: (v: 'all' | 'feeder' | 'chronic') => void
  onFilterStatus: (v: 'all' | 'active' | 'inactive' | 'maintenance' | 'eliminated') => void
}) {
  const [search, setSearch] = useState('')
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({})
  const panelRef = useRef<HTMLDivElement | null>(null)

  // Auto-scroll selected row into view (and bring the panel itself into view first)
  useEffect(() => {
    if (selectedId && rowRefs.current[selectedId]) {
      panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      rowRefs.current[selectedId]!.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [selectedId])

  const filtered = useMemo(() => points.filter(p => {
    const mt = filterType === 'all'
      || (filterType === 'chronic' ? p.type === 'chronic' : p.type !== 'chronic')
    const ms = filterStatus === 'all'
      || (filterStatus === 'eliminated' ? p.isEliminated : p.status === filterStatus)
    const mq = !search
      || p.name?.toLowerCase().includes(search.toLowerCase())
      || p.zoneName?.toLowerCase().includes(search.toLowerCase())
      || p.wardName?.toLowerCase().includes(search.toLowerCase())
    return mt && ms && mq
  }), [points, filterType, filterStatus, search])

  const counts = useMemo(() => ({
    all: points.length,
    feeder: points.filter(p => p.type !== 'chronic').length,
    chronic: points.filter(p => p.type === 'chronic').length,
  }), [points])

  return (
    <div className="table-panel" ref={panelRef}>
      <div className="table-toolbar">
        {(['all', 'feeder', 'chronic'] as const).map(t => (
          <button
            key={t}
            className={`chip ${filterType === t ? 'chip-active' : ''} chip-${t}`}
            onClick={() => onFilterType(t)}
          >
            {t === 'all' ? 'All' : t === 'feeder' ? '📍 Feeder' : '⚡ Chronic'}
            <span className="chip-n">{counts[t]}</span>
          </button>
        ))}

        <div style={{ flex: 1 }} />

        <select
          className="tf-select"
          value={filterStatus}
          onChange={e => onFilterStatus(e.target.value as any)}
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="maintenance">Maintenance</option>
          <option value="eliminated">Eliminated</option>
        </select>

        <input
          className="tf-search"
          placeholder="Search…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="table-scroll">
        <table className="pt">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Zone</th>
              <th>Ward</th>
              <th>Team</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={6} className="empty">No matching points</td></tr>
            ) : filtered.map(p => {
              const badge = getStatusBadge(p.status, !!p.isEliminated)
              const isChronic = p.type === 'chronic'
              const color = getMarkerColor(p)
              const sel = p.id === selectedId
              return (
                <tr
                  key={p.id}
                  ref={el => { rowRefs.current[p.id] = el }}
                  className={`ptr ${sel ? 'ptr-sel' : ''}`}
                  onClick={() => onSelect(p)}
                >
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span className="ndot" style={{ background: color }} />
                      <span style={{ fontWeight: sel ? 600 : 400 }}>{p.name}</span>
                    </div>
                  </td>
                  <td>
                    <span className={`tpill ${isChronic ? 'tpill-c' : 'tpill-f'}`}>
                      {isChronic ? 'Chronic' : 'Feeder'}
                    </span>
                  </td>
                  <td className="tm">{p.zoneName ?? '—'}</td>
                  <td className="tm">{p.wardName ?? '—'}</td>
                  <td className="tm">{p.assignmentDetails?.name ?? '—'}</td>
                  <td>
                    <span className={`status-badge ${badge.cls}`}>{badge.label}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="table-foot">Showing {filtered.length} of {points.length} points</div>
    </div>
  )
}

// ─── Legend ─────────────────────────────────────────────────────────────────

function MapLegend({ dark }: { dark: boolean }) {
  const items = [
    { color: '#22c55e', label: 'Active' },
    { color: '#ef4444', label: 'Inactive' },
    { color: '#f59e0b', label: 'Maintenance' },
    { color: '#a855f7', label: 'Eliminated' },
    { color: '#6b7280', label: 'Unknown' },
  ]
  return (
    <div className="map-legend">
      {items.map(i => (
        <div key={i.label} className="legend-item">
          <span className="legend-dot" style={{ background: i.color }} />
          <span className="legend-lbl">{i.label}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Main component ─────────────────────────────────────────────────────────

export default function PointsMapLeaflet({ points, reports = [], dark, onSelectPoint }: PointsMapProps) {
  const [selectedPoint, setSelectedPoint] = useState<FeederPoint | null>(null)
  const [filterType, setFilterType] = useState<'all' | 'feeder' | 'chronic'>('all')
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive' | 'maintenance' | 'eliminated'>('all')
  const mapRef = useRef<LeafletMap | null>(null)

  const tileUrl = dark
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'

  const coords = useMemo(
    () => points
      .filter(p => p.location?.latitude && p.location?.longitude)
      .map(p => ({ lat: p.location.latitude, lng: p.location.longitude })),
    [points]
  )

  const center: [number, number] = coords.length > 0
    ? [
      coords.reduce((s, c) => s + c.lat, 0) / coords.length,
      coords.reduce((s, c) => s + c.lng, 0) / coords.length,
    ]
    : [23.2599, 77.4126]

  const handleSelect = useCallback((p: FeederPoint) => {
    setSelectedPoint(p)
    setFilterType('all')
    setFilterStatus('all')
    if (mapRef.current && (mapRef.current as any)._loaded && p.location?.latitude && p.location?.longitude) {
      mapRef.current.flyTo(
        [p.location.latitude, p.location.longitude],
        16,
        { animate: true, duration: 1.0 }
      )
    }
    onSelectPoint?.(p)
  }, [onSelectPoint])

  useEffect(() => {
    return () => {
      mapRef.current = null
    }
  }, [])

  const stats = useMemo(() => ({
    total: points.length,
    feeder: points.filter(p => p.type !== 'chronic').length,
    chronic: points.filter(p => p.type === 'chronic').length,
    active: points.filter(p => p.status === 'active' && !p.isEliminated).length,
    inactive: points.filter(p => p.status === 'inactive' && !p.isEliminated).length,
    eliminated: points.filter(p => p.isEliminated).length,
  }), [points])

  // Build per-point report stats from ComplianceReport[]
  const pointStatsMap = useMemo(() => {
    const map: Record<string, PointStats> = {}
    for (const r of reports) {
      if (!r.feederPointId) continue
      if (!map[r.feederPointId]) map[r.feederPointId] = { total: 0, approved: 0, pending: 0, rejected: 0 }
      map[r.feederPointId].total++
      if (r.status === 'approved') map[r.feederPointId].approved++
      else if (r.status === 'pending') map[r.feederPointId].pending++
      else if (r.status === 'rejected') map[r.feederPointId].rejected++
    }
    return map
  }, [reports])

  const bg = dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'
  const bdr = dark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.08)'
  const txt = dark ? '#fff' : '#111'
  const muted = dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'
  const surf = dark ? 'rgba(255,255,255,0.02)' : '#fff'

  return (
    <>
      <style>{`
        .pmw { display:flex; flex-direction:column; gap:12px; font-family:'Geist','Inter',system-ui,sans-serif; }

        /* stats */
        .stats-row { display:flex; gap:8px; flex-wrap:wrap; }
        .sc { flex:1; min-width:80px; background:${bg}; border:1px solid ${bdr}; border-radius:10px; padding:10px 14px; transition:background .2s,border-color .2s; }
        .sc:hover { background:${dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)'}; border-color:${dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.15)'}; }
        .sc-lbl { font-size:10.5px; font-weight:600; letter-spacing:.05em; text-transform:uppercase; color:${muted}; margin-bottom:3px; }
        .sc-val { font-size:22px; font-weight:700; line-height:1; color:${txt}; }

        /* map row */
        .map-row { display:flex; gap:12px; height:420px; }
        .map-wrap { flex:1; border-radius:12px; overflow:hidden; border:1px solid ${bdr}; position:relative; }
        .map-wrap:hover { box-shadow:0 4px 20px ${dark ? 'rgba(0,0,0,.5)' : 'rgba(0,0,0,.1)'}; transition:box-shadow .3s; }

        /* legend */
        .map-legend {
          position:absolute; bottom:28px; left:10px; z-index:1000;
          background:${dark ? 'rgba(10,12,16,.82)' : 'rgba(255,255,255,.88)'};
          border:1px solid ${bdr}; border-radius:8px; padding:6px 10px;
          display:flex; flex-direction:column; gap:4px;
          pointer-events:none; backdrop-filter:blur(6px);
        }
        .legend-item { display:flex; align-items:center; gap:6px; }
        .legend-dot  { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
        .legend-lbl  { font-size:11px; color:${dark ? 'rgba(255,255,255,.7)' : 'rgba(0,0,0,.65)'}; }

        /* detail panel */
        .detail-panel {
          width:255px; flex-shrink:0;
          background:${surf}; border:1px solid ${bdr}; border-radius:12px;
          padding:14px; overflow-y:auto;
          animation:dpIn .22s cubic-bezier(.22,1,.36,1);
        }
        @keyframes dpIn { from{opacity:0;transform:translateX(10px)} to{opacity:1;transform:translateX(0)} }
        .detail-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
        .detail-type-pill { font-size:11px; font-weight:600; padding:3px 8px; border-radius:6px; }
        .detail-type-pill[data-type="chronic"] { background:rgba(239,68,68,.12); color:#ef4444; }
        .detail-type-pill[data-type="feeder"]  { background:rgba(59,130,246,.12); color:#3b82f6; }
        .close-btn { background:none; border:none; cursor:pointer; color:${muted}; font-size:14px; padding:2px 6px; border-radius:4px; transition:background .15s,color .15s; }
        .close-btn:hover { background:${dark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.05)'}; color:${txt}; }
        .color-bar { height:3px; border-radius:2px; margin:6px 0 10px; }
        .detail-name { font-size:14px; font-weight:700; color:${txt}; margin:0 0 7px; line-height:1.3; }
        .detail-fields { margin:10px 0; display:flex; flex-direction:column; gap:5px; }
        .detail-field { display:flex; align-items:center; gap:6px; font-size:12px; }
        .fi { font-size:12px; flex-shrink:0; }
        .fl { color:${muted}; min-width:58px; font-size:10.5px; text-transform:uppercase; letter-spacing:.03em; }
        .fv { color:${dark ? 'rgba(255,255,255,.85)' : '#222'}; font-size:11.5px; }
        .detail-stats { display:flex; gap:6px; margin-top:12px; }
        .stat-chip { flex:1; text-align:center; background:${dark ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.04)'}; border-radius:8px; padding:7px 4px; }
        .sc-num { display:block; font-size:17px; font-weight:700; color:${txt}; }
        .sc-lbl { font-size:10px; text-transform:uppercase; letter-spacing:.04em; color:${muted}; }

        /* badges */
        .status-badge { display:inline-block; font-size:10.5px; font-weight:600; padding:2px 8px; border-radius:20px; letter-spacing:.02em; white-space:nowrap; }
        .badge-green  { background:rgba(34,197,94,.13);   color:#16a34a; }
        .badge-red    { background:rgba(239,68,68,.13);   color:#dc2626; }
        .badge-amber  { background:rgba(245,158,11,.13);  color:#d97706; }
        .badge-purple { background:rgba(168,85,247,.13);  color:#9333ea; }
        .badge-gray   { background:rgba(107,114,128,.13); color:#6b7280; }

        /* table */
        .table-panel { background:${surf}; border:1px solid ${bdr}; border-radius:12px; overflow:hidden; }
        .table-toolbar { display:flex; align-items:center; gap:6px; flex-wrap:wrap; padding:10px 12px; border-bottom:1px solid ${bdr}; }
        .chip { display:flex; align-items:center; gap:5px; font-size:12px; font-weight:500; padding:4px 10px; border-radius:20px; border:1px solid ${bdr}; background:none; color:${muted}; cursor:pointer; transition:all .15s; }
        .chip:hover { background:${dark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.04)'}; }
        .chip-active { background:${dark ? 'rgba(255,255,255,.1)' : 'rgba(0,0,0,.07)'}; border-color:${dark ? 'rgba(255,255,255,.25)' : 'rgba(0,0,0,.2)'}; color:${txt}; }
        .chip-n { background:${dark ? 'rgba(255,255,255,.14)' : 'rgba(0,0,0,.09)'}; border-radius:10px; padding:1px 6px; font-size:10.5px; }
        .tf-select,.tf-search { font-size:12px; padding:4px 8px; border-radius:8px; border:1px solid ${bdr}; background:${bg}; color:${dark ? 'rgba(255,255,255,.8)' : '#333'}; outline:none; }
        .tf-search { width:150px; transition:border-color .15s; }
        .tf-search:focus { border-color:#3b82f6; }
        .tf-search::placeholder { color:${muted}; }
        .table-scroll { overflow-x:auto; max-height:300px; overflow-y:auto; }
        .pt { width:100%; border-collapse:collapse; font-size:12.5px; }
        .pt thead th { padding:7px 12px; text-align:left; font-size:10.5px; font-weight:600; text-transform:uppercase; letter-spacing:.05em; color:${muted}; background:${dark ? 'rgba(255,255,255,.02)' : 'rgba(0,0,0,.02)'}; border-bottom:1px solid ${bdr}; position:sticky; top:0; z-index:1; }
        .ptr { cursor:pointer; transition:background .1s; }
        .ptr:hover { background:${dark ? 'rgba(255,255,255,.04)' : 'rgba(59,130,246,.04)'}; }
        .ptr-sel { background:${dark ? 'rgba(59,130,246,.14)' : 'rgba(59,130,246,.08)'}!important; }
        .ptr td { padding:8px 12px; border-bottom:1px solid ${dark ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.04)'}; color:${dark ? 'rgba(255,255,255,.85)' : '#222'}; vertical-align:middle; }
        .ndot { display:inline-block; width:8px; height:8px; border-radius:50%; flex-shrink:0; }
        .tm { color:${muted}; }
        .tpill { font-size:10.5px; font-weight:600; padding:2px 7px; border-radius:12px; white-space:nowrap; }
        .tpill-c { background:rgba(239,68,68,.1);  color:#ef4444; }
        .tpill-f { background:rgba(59,130,246,.1); color:#3b82f6; }
        .empty { text-align:center; padding:26px!important; color:${muted}; }
        .table-foot { padding:7px 12px; font-size:11px; color:${muted}; border-top:1px solid ${bdr}; }
      `}</style>

      <div className="pmw">
        {/* Map */}
        <div className="map-row">
          <div className="map-wrap">
            <MapContainer
              center={center}
              zoom={12}
              style={{ height: '100%', width: '100%' }}
              scrollWheelZoom
              zoomControl
            >
              <TileLayer
                url={tileUrl}
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'
              />
              <DensityZoom points={coords} />
              <MapBridge onReady={m => { mapRef.current = m }} />

              {points.map(p => {
                if (!p.location?.latitude || !p.location?.longitude) return null
                return (
                  <SmartMarker
                    key={p.id}
                    point={p}
                    dark={dark}
                    isSelected={selectedPoint?.id === p.id}
                    onSelect={handleSelect}
                  />
                )
              })}
            </MapContainer>

            <MapLegend dark={dark} />
          </div>
        </div>
      </div>
    </>
  )
}