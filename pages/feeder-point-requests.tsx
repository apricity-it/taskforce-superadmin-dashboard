import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  AlertCircle, CheckCircle, Clock, Download, Eye,
  MapPin, X, XCircle, Search, RefreshCw, Zap, Filter,
} from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { DataService, FeederPointRequest } from '@/lib/dataService'
import { useTheme } from '@/contexts/ThemeContext'
import { getTokens } from '@/lib/dashboardTheme'

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(value: any): string {
  if (!value) return 'N/A'
  try {
    const d = typeof value.toDate === 'function' ? value.toDate()
      : typeof value._seconds === 'number' ? new Date(value._seconds * 1000)
        : value instanceof Date ? value
          : new Date(value)
    return isNaN(d.getTime()) ? 'N/A' : d.toLocaleString()
  } catch { return 'N/A' }
}

function getPointType(r: FeederPointRequest): 'feeder' | 'chronic' {
  return (r as any).pointType === 'chronic' ? 'chronic' : 'feeder'
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function FeederPointRequestsPage() {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const T = getTokens(dark)
  const qc = useQueryClient()

  // ── Data via React Query ──
  const { data: requests = [], isLoading } = useQuery<FeederPointRequest[]>({
    queryKey: ['feederPointRequests'],
    queryFn: () => new Promise<FeederPointRequest[]>(resolve => {
      const unsub = DataService.onFeederPointRequestsChange((data: FeederPointRequest[]) => { resolve(data); unsub() })
    }),
    staleTime: 2 * 60_000,
  })
  // ── Filters ──
  const [statusF, setStatusF] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all')
  const [typeF, setTypeF] = useState<'all' | 'feeder' | 'chronic'>('all')
  const [zoneF, setZoneF] = useState('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<FeederPointRequest | null>(null)

  // ── Bulk select ──
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkZone, setBulkZone] = useState('')
  const [bulkUpdating, setBulkUpdating] = useState(false)

  // ── Inline zone edit ──
  const [editingZone, setEditingZone] = useState(false)
  const [editZoneValue, setEditZoneValue] = useState('')
  const [zoneUpdating, setZoneUpdating] = useState(false)

  // ── Acting ──
  const [acting, setActing] = useState<string | null>(null)

  const ITEMS = 50

 const uniqueZones = useMemo(() => {
    const zones = new Set<string>(requests.map((r: FeederPointRequest) => (r.zoneNumber || (r as any).ward || '')).filter(Boolean))
    return Array.from(zones).sort((a, b) => {
      const na = Number(a), nb = Number(b)
      return (!isNaN(na) && !isNaN(nb)) ? na - nb : String(a).localeCompare(String(b))
    })
  }, [requests])

  // Base filter (search + zone + type)
  const base = useMemo(() => {
    const q = search.trim().toLowerCase()
    return requests.filter((r: FeederPointRequest) => {
      if (zoneF !== 'all' && String(r.zoneNumber || '') !== zoneF) return false
      if (typeF !== 'all' && getPointType(r) !== typeF) return false
      if (!q) return true
      return [
        r.feederPointName, r.areaName, r.nearestLandmark, r.userName,
        r.userEmail, (r as any).userPhone, r.zoneNumber, r.wardNumber,
        r.kothiName, r.areaDescription,
      ].some(f => (f || '').toString().toLowerCase().includes(q))
    })
  }, [requests, zoneF, typeF, search])

  const stats = useMemo(() => ({
    total: base.length,
    pending: base.filter((r: FeederPointRequest) => r.status === 'pending').length,
    approved: base.filter((r: FeederPointRequest) => r.status === 'approved').length,
    rejected: base.filter((r: FeederPointRequest) => r.status === 'rejected').length,
    feeder: base.filter((r: FeederPointRequest) => getPointType(r) === 'feeder').length,
    chronic: base.filter((r: FeederPointRequest) => getPointType(r) === 'chronic').length,
  }), [base])

  const filtered = useMemo(() =>
    statusF === 'all' ? base : base.filter((r: FeederPointRequest) => r.status === statusF),
    [base, statusF]
  )

  useEffect(() => { setPage(1) }, [statusF, zoneF, typeF, search])

  const totalPages = Math.ceil(filtered.length / ITEMS)
  const paged = filtered.slice((page - 1) * ITEMS, page * ITEMS)

  // ── Actions ──
  const handleApprove = async (r: FeederPointRequest) => {
    if (!confirm(`Approve "${r.feederPointName || r.areaName}"?`)) return
    setActing(r.id)
    try {
      await DataService.createFeederPoint({
        name: r.feederPointName || r.areaName,
        kothiId: r.kothiName,
        kothiName: r.kothiName,
        status: 'active',
        priority: r.priority || 'medium',
        location: {
          address: r.nearestLandmark || r.areaName || '',
          latitude: r.coordinates?.latitude || 0,
          longitude: r.coordinates?.longitude || 0,
        },
      })
      await DataService.updateFeederPointRequest(r.id, { status: 'approved', reviewedAt: new Date() })
      qc.invalidateQueries({ queryKey: ['feederPointRequests'] })
      if (selected?.id === r.id) setSelected({ ...r, status: 'approved' })
    } catch (e) { console.error(e); alert('Error approving request') }
    finally { setActing(null) }
  }

  const handleReject = async (r: FeederPointRequest) => {
    const reason = prompt('Enter rejection reason:')
    if (!reason) return
    setActing(r.id)
    try {
      await DataService.updateFeederPointRequest(r.id, { status: 'rejected', rejectionReason: reason, reviewedAt: new Date() })
      qc.invalidateQueries({ queryKey: ['feederPointRequests'] })
      if (selected?.id === r.id) setSelected({ ...r, status: 'rejected' })
    } catch (e) { console.error(e); alert('Error rejecting request') }
    finally { setActing(null) }
  }

  const handleEditZone = async () => {
    if (!selected) return
    setZoneUpdating(true)
    try {
      await DataService.updateFeederPointRequest(selected.id, { zoneNumber: editZoneValue })
      setSelected({ ...selected, zoneNumber: editZoneValue })
      qc.invalidateQueries({ queryKey: ['feederPointRequests'] })
      setEditingZone(false)
    } catch (e) { console.error(e) }
    setZoneUpdating(false)
  }

  const handleBulkZone = async () => {
    if (!selectedIds.size || !bulkZone.trim()) return
    setBulkUpdating(true)
    try {
      await Promise.all(Array.from(selectedIds).map(id =>
        DataService.updateFeederPointRequest(id, { zoneNumber: bulkZone })
      ))
      qc.invalidateQueries({ queryKey: ['feederPointRequests'] })
      setSelectedIds(new Set()); setBulkZone('')
    } catch (e) { console.error(e) }
    setBulkUpdating(false)
  }

  const handleDownload = async () => {
    if (!filtered.length) return
    const XLSX = await import('xlsx')
    const rows = filtered.map((r: FeederPointRequest) => ({
      'Request ID': r.id,
      'Point Type': getPointType(r).toUpperCase(),
      'Feeder Point': r.feederPointName || r.areaName || 'N/A',
      'Area Name': r.areaName || '',
      Zone: r.zoneNumber || '',
      Ward: r.wardNumber || '',
      Kothi: r.kothiName || '',
      Priority: r.priority || 'N/A',
      Status: (r.status || '').toUpperCase(),
      'Requested By': r.userName || '',
      'User Email': r.userEmail || '',
      'User Phone': (r as any).userPhone || '',
      'Submitted At': formatDate(r.submittedAt),
      Coordinates: r.coordinates ? `${r.coordinates.latitude}, ${r.coordinates.longitude}` : '',
      'Nearest Landmark': r.nearestLandmark || '',
      'Households (Approx)': r.approximateHouseholds || '',
      'Vehicle Type': r.vehicleType || '',
      'Additional Details': r.additionalDetails || '',
      'Area Description': r.areaDescription || '',
      'Image URL': r.imageURL || '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'FP Requests')
    XLSX.writeFile(wb, `feeder-point-requests-${statusF}.xlsx`)
  }

  // ── Color helpers ──
  const statusColor = (s: string) => s === 'approved' ? T.green : s === 'rejected' ? T.red : T.amber
  const typeColor = (t: 'feeder' | 'chronic') => t === 'chronic' ? T.gold : T.accent

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-12 w-12 border-4 border-t-transparent"
        style={{ borderColor: `${T.accent}30`, borderTopColor: T.accent }} />
    </div>
  )

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl"
            style={{ background: T.accentDim, border: `1px solid ${T.accentBorder}` }}>
            <MapPin className="h-6 w-6" style={{ color: T.accent }} />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight" style={{ color: T.textPrimary }}>Feeder Point Requests</h1>
            <p className="text-sm" style={{ color: T.textMuted }}>
              {requests.length} total · {stats.feeder} feeder · {stats.chronic} chronic · {stats.pending} pending
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => qc.invalidateQueries({ queryKey: ['feederPointRequests'] })}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold"
            style={{ background: T.surface, border: `1px solid ${T.cardBorder}`, color: T.textSecondary, cursor: 'pointer' }}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
          <button onClick={handleDownload} disabled={!filtered.length}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold disabled:opacity-40"
            style={{ background: T.green, color: '#fff', border: 'none', cursor: 'pointer' }}>
            <Download className="h-4 w-4" /> Export
          </button>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {[
          { label: 'Total', value: stats.total, color: T.accent },
          { label: 'Pending', value: stats.pending, color: T.amber },
          { label: 'Approved', value: stats.approved, color: T.green },
          { label: 'Rejected', value: stats.rejected, color: T.red },
          { label: 'Feeder', value: stats.feeder, color: T.accent },
          { label: 'Chronic', value: stats.chronic, color: T.gold },
        ].map((s, i) => (
          <div key={s.label} className="rounded-xl p-3"
            style={{ background: T.card, border: `1px solid ${T.cardBorder}`, animation: `slideUp 0.4s ease ${i * 40}ms both` }}>
            <p className="text-[9px] font-semibold uppercase tracking-wider mb-1" style={{ color: T.textSecondary }}>{s.label}</p>
            <p className="text-[20px] font-bold leading-none" style={{ color: s.color, fontFamily: "'JetBrains Mono', monospace" }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="rounded-2xl p-4 space-y-3" style={{ background: T.card, border: `1px solid ${T.cardBorder}` }}>
        <div className="flex flex-wrap gap-2 items-center">
          {/* Search */}
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: T.textMuted }} />
            <input type="text" placeholder="Search feeder point, area, kothi, requester..."
              value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-8 py-2 rounded-xl text-sm"
              style={{ background: T.surface, border: `1px solid ${T.cardBorder}`, color: T.textPrimary, outline: 'none' }} />
            {search && (
              <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: T.textMuted }}>
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {/* Zone */}
          <select value={zoneF} onChange={e => setZoneF(e.target.value)}
            style={{ background: T.surface, border: `1px solid ${T.cardBorder}`, color: T.textPrimary, borderRadius: 10, padding: '8px 12px', fontSize: 13, outline: 'none' }}>
            <option value="all">All Zones</option>
            {uniqueZones.map(z => <option key={String(z)} value={String(z)}>Zone {z}</option>)}
          </select>
        </div>

        {/* Status + Type pills */}
        <div className="flex flex-wrap gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider flex items-center" style={{ color: T.textMuted }}>
            <Filter className="h-3 w-3 mr-1" /> Status:
          </span>
          {(['all', 'pending', 'approved', 'rejected'] as const).map(s => (
            <button key={s} onClick={() => setStatusF(s)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold"
              style={{
                background: statusF === s ? (s === 'all' ? T.accent : statusColor(s)) : T.surface,
                color: statusF === s ? (dark ? '#000' : '#fff') : T.textSecondary,
                border: `1px solid ${statusF === s ? (s === 'all' ? T.accent : statusColor(s)) : T.cardBorder}`,
                cursor: 'pointer',
              }}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
          <span className="text-[10px] font-semibold uppercase tracking-wider flex items-center ml-2" style={{ color: T.textMuted }}>
            <Zap className="h-3 w-3 mr-1" /> Type:
          </span>
          {(['all', 'feeder', 'chronic'] as const).map(t => (
            <button key={t} onClick={() => setTypeF(t)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold"
              style={{
                background: typeF === t ? (t === 'chronic' ? T.gold : t === 'feeder' ? T.accent : T.accent) : T.surface,
                color: typeF === t ? (dark ? '#000' : '#fff') : T.textSecondary,
                border: `1px solid ${typeF === t ? (t === 'chronic' ? T.gold : T.accent) : T.cardBorder}`,
                cursor: 'pointer',
              }}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Bulk zone bar */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3"
          style={{ background: T.accentDim, border: `1px solid ${T.accentBorder}` }}>
          <span className="text-sm font-semibold" style={{ color: T.accent }}>{selectedIds.size} selected</span>
          <input type="text" placeholder="Enter Zone"
            value={bulkZone} onChange={e => setBulkZone(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-sm w-32"
            style={{ background: T.card, border: `1px solid ${T.cardBorder}`, color: T.textPrimary, outline: 'none' }} />
          <button onClick={handleBulkZone} disabled={bulkUpdating || !bulkZone.trim()}
            className="px-4 py-1.5 rounded-lg text-sm font-semibold disabled:opacity-40"
            style={{ background: T.accent, color: dark ? '#000' : '#fff', border: 'none', cursor: 'pointer' }}>
            {bulkUpdating ? 'Updating…' : 'Update Zone'}
          </button>
          <button onClick={() => setSelectedIds(new Set())}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textSecondary, fontSize: 12, fontWeight: 600 }}>
            Clear
          </button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-2xl overflow-hidden" style={{ background: T.card, border: `1px solid ${T.cardBorder}` }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${T.cardBorder}` }}>
          <h2 className="text-sm font-semibold" style={{ color: T.textPrimary }}>
            Requests ({filtered.length})
          </h2>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <AlertCircle className="h-10 w-10 opacity-20" style={{ color: T.accent }} />
            <p className="text-sm" style={{ color: T.textMuted }}>No feeder point requests found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" style={{ fontSize: 12 }}>
              <thead>
                <tr style={{ background: T.surface, borderBottom: `1px solid ${T.cardBorder}` }}>
                  <th className="px-3 py-3 text-center" style={{ width: 40 }}>
                    <input type="checkbox"
                      checked={paged.length > 0 && paged.every((r: FeederPointRequest) => selectedIds.has(r.id))}
                      onChange={e => {
                        const s = new Set(selectedIds)
                        paged.forEach((r: FeederPointRequest) => e.target.checked ? s.add(r.id) : s.delete(r.id))
                        setSelectedIds(s)
                      }}
                      style={{ accentColor: T.accent, cursor: 'pointer' }} />
                  </th>
                  {['Feeder Point', 'Type', 'Requester', 'Zone / Ward / Kothi', 'Priority', 'Status', 'Submitted', 'Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-3 font-semibold uppercase tracking-wider whitespace-nowrap"
                      style={{ fontSize: 10, color: T.accent }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map((r: FeederPointRequest) => {
                  const pt = getPointType(r)
                  const tc = typeColor(pt)
                  const sc = statusColor(r.status || 'pending')
                  const isAct = acting === r.id
                  const isSel = selectedIds.has(r.id)
                  return (
                    <tr key={r.id}
                      style={{ borderBottom: `1px solid ${T.gridLine}`, background: isSel ? `${T.accent}08` : 'transparent', opacity: isAct ? 0.5 : 1 }}
                      onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = T.surface }}
                      onMouseLeave={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = 'transparent' }}>

                      <td className="px-3 py-3 text-center">
                        <input type="checkbox" checked={isSel}
                          onChange={e => {
                            const s = new Set(selectedIds)
                            e.target.checked ? s.add(r.id) : s.delete(r.id)
                            setSelectedIds(s)
                          }}
                          style={{ accentColor: T.accent, cursor: 'pointer' }} />
                      </td>

                      <td className="px-4 py-3" style={{ minWidth: 180 }}>
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg"
                            style={{ background: `${tc}15` }}>
                            <MapPin className="h-4 w-4" style={{ color: tc }} />
                          </div>
                          <div>
                            <p className="font-semibold truncate max-w-[160px]" style={{ color: T.textPrimary }}>
                              {r.feederPointName || r.areaName || 'Unnamed'}
                            </p>
                            <p className="text-[10px] truncate max-w-[160px]" style={{ color: T.textMuted }}>
                              {r.areaName || '—'}{r.nearestLandmark ? ` · ${r.nearestLandmark}` : ''}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase"
                          style={{ background: `${tc}20`, color: tc, border: `1px solid ${tc}30` }}>
                          {pt}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        <p style={{ color: T.textPrimary }}>{r.userName || '—'}</p>
                        <p className="text-[10px]" style={{ color: T.textMuted }}>{r.userEmail || '—'}</p>
                      </td>

                      <td className="px-4 py-3" style={{ whiteSpace: 'nowrap' }}>
                        <p style={{ color: T.textSecondary }}>Zone: {r.zoneNumber || '—'}</p>
                        <p className="text-[10px]" style={{ color: T.textMuted }}>Ward: {r.wardNumber || '—'}</p>
                        {r.kothiName && <p className="text-[10px]" style={{ color: T.textMuted }}>Kothi: {r.kothiName}</p>}
                      </td>

                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold capitalize"
                          style={{ background: `${T.textMuted}15`, color: T.textSecondary }}>
                          {r.priority || 'medium'}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {(r.status || 'pending') === 'approved' && <CheckCircle className="h-3.5 w-3.5" style={{ color: sc }} />}
                          {(r.status || 'pending') === 'rejected' && <XCircle className="h-3.5 w-3.5" style={{ color: sc }} />}
                          {(r.status || 'pending') === 'pending' && <Clock className="h-3.5 w-3.5" style={{ color: sc }} />}
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase"
                            style={{ background: `${sc}15`, color: sc }}>
                            {r.status || 'pending'}
                          </span>
                        </div>
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap" style={{ color: T.textSecondary }}>
                        {formatDate(r.submittedAt)}
                      </td>

                      <td className="px-4 py-3">
                        <button
                          onClick={() => { setSelected(r); setEditingZone(false); setTimeout(() => document.getElementById('details-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100) }}
                          className="p-1.5 rounded-lg"
                          style={{ background: T.accentDim, color: T.accent, border: 'none', cursor: 'pointer' }}>
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3" style={{ borderTop: `1px solid ${T.cardBorder}` }}>
            <span className="text-xs" style={{ color: T.textMuted }}>
              {(page - 1) * ITEMS + 1}–{Math.min(page * ITEMS, filtered.length)} of {filtered.length}
            </span>
            <div className="flex items-center gap-2">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="text-xs px-3 py-1.5 rounded-lg disabled:opacity-30"
                style={{ border: `1px solid ${T.cardBorder}`, color: T.textSecondary, background: 'transparent', cursor: page === 1 ? 'not-allowed' : 'pointer' }}>← Prev</button>
              <span className="text-xs" style={{ color: T.textMuted }}>Page {page} of {totalPages}</span>
              <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)} className="text-xs px-3 py-1.5 rounded-lg disabled:opacity-30"
                style={{ border: `1px solid ${T.cardBorder}`, color: T.textSecondary, background: 'transparent', cursor: page === totalPages ? 'not-allowed' : 'pointer' }}>Next →</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Detail Card ── */}
      {selected && (
        <div id="details-card" className="rounded-2xl p-6 space-y-5"
          style={{ background: T.card, border: `2px solid ${T.accent}` }}>

          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase"
                  style={{ background: `${typeColor(getPointType(selected))}20`, color: typeColor(getPointType(selected)) }}>
                  {getPointType(selected)}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase"
                  style={{ background: `${statusColor(selected.status || 'pending')}15`, color: statusColor(selected.status || 'pending') }}>
                  {selected.status || 'pending'}
                </span>
              </div>
              <h2 className="text-xl font-bold" style={{ color: T.textPrimary }}>
                {selected.feederPointName || selected.areaName || 'Unnamed Request'}
              </h2>
              <p className="text-sm mt-0.5" style={{ color: T.textMuted }}>
                {selected.areaDescription || selected.additionalDetails || 'No description provided.'}
              </p>
            </div>
            <button onClick={() => setSelected(null)} className="flex items-center justify-center w-8 h-8 rounded-xl flex-shrink-0"
              style={{ background: T.surface, border: `1px solid ${T.cardBorder}`, color: T.textSecondary, cursor: 'pointer' }}>
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Info grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: 'Requested By', value: selected.userName },
              { label: 'Email', value: selected.userEmail },
              { label: 'Phone', value: (selected as any).userPhone },
              { label: 'Priority', value: selected.priority || 'medium' },
              { label: 'Submitted', value: formatDate(selected.submittedAt) },
              { label: 'Ward', value: selected.wardNumber },
              { label: 'Kothi', value: selected.kothiName },
              { label: 'Feeder Point', value: selected.feederPointName },
              { label: 'Landmark', value: selected.nearestLandmark },
              { label: 'Households', value: selected.approximateHouseholds },
              { label: 'Vehicle Type', value: selected.vehicleType },
              { label: 'Population', value: selected.populationDensity },
              { label: 'Accessibility', value: selected.accessibility },
            ].map(row => (
              <div key={row.label} className="rounded-xl px-3 py-2.5"
                style={{ background: T.surface, border: `1px solid ${T.cardBorder}` }}>
                <p className="text-[9px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: T.textMuted }}>{row.label}</p>
                <p className="text-sm font-medium" style={{ color: T.textPrimary }}>{row.value || '—'}</p>
              </div>
            ))}

            {/* Zone — editable */}
            <div className="rounded-xl px-3 py-2.5" style={{ background: T.surface, border: `1px solid ${T.cardBorder}` }}>
              <p className="text-[9px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: T.textMuted }}>Zone</p>
              {editingZone ? (
                <div className="flex items-center gap-1.5 mt-1">
                  <input value={editZoneValue} onChange={e => setEditZoneValue(e.target.value)}
                    className="flex-1 px-2 py-1 rounded-lg text-xs"
                    style={{ background: T.card, border: `1px solid ${T.cardBorder}`, color: T.textPrimary, outline: 'none' }} />
                  <button onClick={handleEditZone} disabled={zoneUpdating}
                    className="text-[10px] px-2 py-1 rounded-lg font-semibold disabled:opacity-40"
                    style={{ background: T.accent, color: dark ? '#000' : '#fff', border: 'none', cursor: 'pointer' }}>Save</button>
                  <button onClick={() => setEditingZone(false)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textMuted, fontSize: 12 }}>✕</button>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium" style={{ color: T.textPrimary }}>{selected.zoneNumber || '—'}</p>
                  <button onClick={() => { setEditZoneValue(selected.zoneNumber || ''); setEditingZone(true) }}
                    className="text-[10px] px-1.5 py-0.5 rounded font-semibold opacity-0 group-hover:opacity-100 hover:opacity-100"
                    style={{ background: T.accentDim, color: T.accent, border: 'none', cursor: 'pointer' }}>Edit</button>
                </div>
              )}
            </div>
          </div>

          {/* Coordinates */}
          {selected.coordinates && (
            <div className="rounded-xl px-3 py-2.5" style={{ background: T.surface, border: `1px solid ${T.cardBorder}` }}>
              <p className="text-[9px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: T.textMuted }}>Coordinates</p>
              <p className="text-sm font-medium" style={{ color: T.textPrimary, fontFamily: "'JetBrains Mono', monospace" }}>
                {selected.coordinates.latitude}, {selected.coordinates.longitude}
              </p>
            </div>
          )}

          {/* Image */}
          {selected.imageURL && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: T.textSecondary }}>Location Photo</p>
              <img src={selected.imageURL} alt="Location"
                className="rounded-xl max-h-64 object-cover"
                style={{ border: `1px solid ${T.cardBorder}` }} />
            </div>
          )}

          {/* Admin notes */}
          {(selected as any).adminNotes && (
            <div className="rounded-xl px-4 py-3" style={{ background: T.accentDim, border: `1px solid ${T.accentBorder}` }}>
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: T.accent }}>Admin Notes</p>
              <p className="text-sm" style={{ color: T.textPrimary }}>{(selected as any).adminNotes}</p>
            </div>
          )}

          {/* Rejection reason */}
          {(selected as any).rejectionReason && (
            <div className="rounded-xl px-4 py-3" style={{ background: `${T.red}10`, border: `1px solid ${T.red}30` }}>
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: T.red }}>Rejection Reason</p>
              <p className="text-sm" style={{ color: T.textPrimary }}>{(selected as any).rejectionReason}</p>
            </div>
          )}

          {/* Actions */}
          {selected.status === 'pending' && (
            <div className="flex gap-3 pt-2">
              <button onClick={() => handleApprove(selected)} disabled={acting === selected.id}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40"
                style={{ background: T.green, color: '#fff', border: 'none', cursor: 'pointer' }}>
                <CheckCircle className="h-4 w-4" /> Approve
              </button>
              <button onClick={() => handleReject(selected)} disabled={acting === selected.id}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40"
                style={{ background: T.red, color: '#fff', border: 'none', cursor: 'pointer' }}>
                <XCircle className="h-4 w-4" /> Reject
              </button>
            </div>
          )}
        </div>
      )}

      <style>{`@keyframes slideUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }`}</style>
    </div>
  )
}