import { useEffect, useMemo, useState } from 'react'
import {
    Activity, CheckCircle, Clock, Eye, MapPin, Search,
    Users, X, Zap, Download, RefreshCw, Calendar, AlertTriangle,
} from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { DataService } from '@/lib/dataService'
import type { FeederPoint, ShiftReport, ComplianceReport, ShiftSlot } from '@/lib/dataService'
import { useTheme } from '@/contexts/ThemeContext'
import { getTokens, ThemeTokens } from '@/lib/dashboardTheme'
import * as XLSX from 'xlsx'
import { saveAs } from 'file-saver'

function SBadge({ status, T }: { status?: string; T: any }) {
    const map: Record<string, string> = {
        approved: T.green, rejected: T.red, pending: T.amber,
        requires_action: T.red, action_taken: T.accent,
        completed: T.green, in_progress: T.amber,
    }
    const c = map[status ?? ''] ?? T.textMuted
    return (
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
            style={{ background: `${c}20`, border: `1px solid ${c}30`, color: c }}>
            {status?.replace(/_/g, ' ') ?? 'unknown'}
        </span>
    )
}

function getSlots(shift: ShiftReport): ShiftSlot[] {
    const s = shift.slots as ShiftSlot[] | Record<string, ShiftSlot> | null | undefined
    if (Array.isArray(s)) return s
    if (s && typeof s === 'object') return Object.values(s)
    return []
}

function coerceDate(v: any): Date | null {
    if (!v) return null
    if (v instanceof Date) return v
    if (typeof v.toDate === 'function') return v.toDate()
    if (typeof v === 'string' || typeof v === 'number') { const p = new Date(v); return isNaN(p.getTime()) ? null : p }
    return null
}

function getReportDate(r: ComplianceReport): Date | null {
    return coerceDate(r.submittedAt) || coerceDate(r.updatedAt) || coerceDate(r.createdAt) || coerceDate(r.tripDate)
}

function statusBadge(s: string | undefined, T: ThemeTokens) {
    const colorMap: Record<string, string> = {
        approved: T.green,
        completed: T.green,
        rejected: T.red,
        requires_action: T.red,
        pending: T.amber,
        in_progress: T.accent,
        action_taken: T.accent,
    }
    const color = colorMap[s ?? ''] ?? T.textMuted
    const label = s?.replace(/_/g, ' ') ?? 'unknown'
    return {
        label,
        style: {
            background: `${color}20`,
            border: `1px solid ${color}30`,
            color,
        } as React.CSSProperties,
    }
}

const PAGE_SIZE = 25

export default function ChronicPointsPage() {
    const { theme } = useTheme()
    const dark = theme === 'dark'
    const T = getTokens(dark)
    const qc = useQueryClient()

    const { data: allPoints = [], isLoading: loadingPoints } = useQuery<FeederPoint[]>({
        queryKey: ['feederPoints'],
        queryFn: () => DataService.getAllFeederPoints(),
        staleTime: 5 * 60_000,
    })

    const { data: allShifts = [], isLoading: loadingShifts } = useQuery<ShiftReport[]>({
        queryKey: ['shiftReports'],
        queryFn: () => DataService.getShiftReports(),
        staleTime: 5 * 60_000,
    })

    const { data: allReports = [], isLoading: loadingReports } = useQuery<ComplianceReport[]>({
        queryKey: ['complianceReports', 'all'],
        queryFn: () => DataService.getAllComplianceReports(),
        staleTime: 5 * 60_000,
    })

    const chronicPoints = useMemo(() => allPoints.filter((p: FeederPoint) => p.type === 'chronic'), [allPoints])

    const chronicReports = useMemo(() =>
        allReports.filter((r: ComplianceReport) => r.feederPointType === 'chronic'),
        [allReports]
    )
    // Reports/shifts per point lookup maps
    const reportsByPoint = useMemo(() => {
        const m: Record<string, ComplianceReport[]> = {}
        chronicReports.forEach((r: ComplianceReport) => {
            if (!r.feederPointId) return
            if (!m[r.feederPointId]) m[r.feederPointId] = []
            m[r.feederPointId].push(r)
        })
        return m
    }, [chronicReports])

    const shiftsByPoint = useMemo(() => {
        const m: Record<string, ShiftReport[]> = {}
        allShifts.forEach((s: ShiftReport) => {
            if (!s.feederPointId) return
            if (!m[s.feederPointId]) m[s.feederPointId] = []
            m[s.feederPointId].push(s)
        })
        return m
    }, [allShifts])

    const getCompletionRate = (pointId: string) => {
        const slots = (shiftsByPoint[pointId] || []).flatMap(getSlots)
        if (!slots.length) return 0
        const done = slots.filter(s => s.status === 'completed' || (s as any).status === 'submitted' || (s as any).photoUrl).length
        return Math.round((done / slots.length) * 100)
    }

    // Stats
    const stats = useMemo(() => ({
        total: chronicPoints.length,
        active: chronicPoints.filter((p: FeederPoint) => p.status === 'active' && !p.isEliminated).length,
        eliminated: chronicPoints.filter((p: FeederPoint) => p.isEliminated).length,
        totalReports: chronicReports.length,
        pending: chronicReports.filter((r: ComplianceReport) => r.status === 'pending').length,
        approved: chronicReports.filter((r: ComplianceReport) => r.status === 'approved').length,
        rejected: chronicReports.filter((r: ComplianceReport) => r.status === 'rejected').length,
        requiresAction: chronicReports.filter((r: ComplianceReport) => r.status === 'requires_action').length,
        totalShifts: allShifts.length,
        completedShifts: allShifts.filter((s: ShiftReport) => s.status === 'completed').length,
        inProgress: allShifts.filter((s: ShiftReport) => s.status === 'in_progress').length,
        assigned: chronicPoints.filter((p: FeederPoint) => (p as any).assignedTeamId || (p as any).assignedUserId).length,
    }), [chronicPoints, chronicReports, allShifts])

    // Filters
    const [search, setSearch] = useState('')
    const [statusF, setStatusF] = useState('all')
    const [page, setPage] = useState(1)
    const [selPoint, setSelPoint] = useState<FeederPoint | null>(null)

    useEffect(() => { setPage(1) }, [search, statusF])

    const filtered = useMemo(() => {
        let r = chronicPoints
        if (search) {
            const s = search.toLowerCase()
            r = r.filter((p: FeederPoint) => p.name?.toLowerCase().includes(s) || p.location?.address?.toLowerCase().includes(s))
        }
        if (statusF === 'eliminated') r = r.filter((p: FeederPoint) => p.isEliminated)
        else if (statusF === 'active') r = r.filter((p: FeederPoint) => p.status === 'active' && !p.isEliminated)
        else if (statusF !== 'all') r = r.filter((p: FeederPoint) => (reportsByPoint[p.id] || []).some((rp: ComplianceReport) => rp.status === statusF))
        return r
    }, [chronicPoints, search, statusF, reportsByPoint])

    const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
    const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

    const handleExport = () => {
        const data = filtered.map((p: FeederPoint, i: number) => ({
            Sr: i + 1,
            Name: p.name,
            ID: p.id,
            Status: p.status,
            Address: p.location?.address || '',
            Reports: (reportsByPoint[p.id] || []).length,
            Shifts: (shiftsByPoint[p.id] || []).length,
            Completion: `${getCompletionRate(p.id)}%`,
        }))
        const ws = XLSX.utils.json_to_sheet(data)
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Chronic Points')
        saveAs(new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })],
            { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
            `ChronicPoints_${Date.now()}.xlsx`)
    }

    const loading = loadingPoints || loadingShifts || loadingReports

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: T.gold }} />
        </div>
    )

    return (
        <div className="space-y-6">

            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl"
                        style={{ background: `${T.gold}20`, border: `1px solid ${T.gold}40` }}>
                        <Zap className="h-6 w-6" style={{ color: T.gold }} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black tracking-tight" style={{ color: T.textPrimary }}>Chronic Points</h1>
                        <p className="text-sm" style={{ color: T.textMuted }}>
                            {stats.total} total · {stats.active} active · {stats.inProgress} shifts in progress
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => qc.invalidateQueries({ queryKey: ['feederPoints'] })}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold transition hover:opacity-80"
                        style={{ background: T.surface, border: `1px solid ${T.cardBorder}`, color: T.textSecondary }}>
                        <RefreshCw className="h-4 w-4" /> Refresh
                    </button>
                    <button onClick={handleExport}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold"
                        style={{ background: T.green, color: '#fff', border: 'none' }}>
                        <Download className="h-4 w-4" /> Export
                    </button>
                </div>
            </div>

            {/* KPI Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                {[
                    { label: 'Total', value: stats.total, color: T.gold },
                    { label: 'Active', value: stats.active, color: T.green },
                    { label: 'Reports', value: stats.totalReports, color: T.accent },
                    { label: 'Pending', value: stats.pending, color: T.amber },
                    { label: 'Approved', value: stats.approved, color: T.green },
                    { label: 'Requires Action', value: stats.requiresAction, color: T.red },
                ].map((s, i) => (
                    <div key={s.label} className="rounded-xl p-3"
                        style={{ background: T.card, border: `1px solid ${T.cardBorder}`, animation: `slideUp 0.4s ease ${i * 40}ms both` }}>
                        <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: T.textSecondary, margin: '0 0 3px' }}>{s.label}</p>
                        <p className="text-[20px] font-bold leading-none" style={{ color: s.color, fontFamily: "'JetBrains Mono', monospace" }}>{s.value}</p>
                    </div>
                ))}
            </div>

            {/* Shift Summary Row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                    { label: 'Total Shifts', value: stats.totalShifts, color: T.purple, icon: <Users className="h-4 w-4" /> },
                    { label: 'Completed Shifts', value: stats.completedShifts, color: T.green, icon: <CheckCircle className="h-4 w-4" /> },
                    { label: 'In Progress', value: stats.inProgress, color: T.amber, icon: <Activity className="h-4 w-4" /> },
                ].map(s => (
                    <div key={s.label} className="flex items-center gap-3 rounded-2xl p-4"
                        style={{ background: T.card, border: `1px solid ${T.cardBorder}` }}>
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl flex-shrink-0"
                            style={{ background: `${s.color}20`, color: s.color }}>
                            {s.icon}
                        </div>
                        <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: T.textSecondary }}>{s.label}</p>
                            <p className="text-[22px] font-bold" style={{ color: s.color, fontFamily: "'JetBrains Mono', monospace" }}>{s.value}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-3 items-center rounded-2xl p-4"
                style={{ background: T.card, border: `1px solid ${T.cardBorder}` }}>
                <div className="relative flex-1 min-w-48">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: T.textMuted }} />
                    <input type="text" placeholder="Search chronic points..."
                        value={search} onChange={e => setSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 rounded-xl text-sm"
                        style={{ background: T.surface, border: `1px solid ${T.cardBorder}`, color: T.textPrimary, outline: 'none' }}
                    />
                </div>
                <div className="flex gap-1.5 flex-wrap">
                    {['all', 'active', 'pending', 'approved', 'rejected', 'eliminated'].map(s => (
                        <button key={s} onClick={() => setStatusF(s)}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold transition"
                            style={{
                                background: statusF === s ? T.gold : T.surface,
                                color: statusF === s ? '#fff' : T.textSecondary,
                                border: `1px solid ${statusF === s ? T.gold : T.cardBorder}`,
                                cursor: 'pointer',
                            }}>
                            {s.charAt(0).toUpperCase() + s.slice(1)}
                        </button>
                    ))}
                </div>
            </div>

            {/* Table */}
            <div className="rounded-2xl overflow-hidden" style={{ background: T.card, border: `1px solid ${T.cardBorder}` }}>
                <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${T.cardBorder}` }}>
                    <h2 className="text-sm font-semibold" style={{ color: T.textPrimary }}>Chronic Points ({filtered.length})</h2>
                    <div className="flex items-center gap-2 text-xs" style={{ color: T.textMuted }}>
                        <Activity className="h-3.5 w-3.5" /> Real-time
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full" style={{ fontSize: 12 }}>
                        <thead>
                            <tr style={{ borderBottom: `1px solid ${T.cardBorder}` }}>
                                {['Point', 'Location', 'Zone/Ward', 'Reports', 'Pending', 'Approved', 'Action', 'Shifts', 'Completion', 'Status', 'View'].map(h => (
                                    <th key={h} className="text-left px-4 py-3 font-semibold uppercase tracking-wider"
                                        style={{ fontSize: 10, color: T.textSecondary, background: T.surface, whiteSpace: 'nowrap' }}>
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {paged.length === 0 ? (
                                <tr>
                                    <td colSpan={11} className="text-center py-16" style={{ color: T.textMuted }}>
                                        <Zap className="h-10 w-10 mx-auto mb-2 opacity-30" />
                                        <p className="text-sm">No chronic points found</p>
                                    </td>
                                </tr>
                            ) : paged.map((point: FeederPoint, i: number) => {
                                const rpts = reportsByPoint[point.id] || []
                                const shfts = shiftsByPoint[point.id] || []
                                const pct = getCompletionRate(point.id)
                                const badge = statusBadge(point.status, T)

                                return (
                                    <tr key={point.id}
                                        style={{ borderBottom: `1px solid ${T.gridLine}` }}
                                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = dark ? T.surface : '#f8f9fb'}
                                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                                    >
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg"
                                                    style={{ background: `${T.gold}15` }}>
                                                    <Zap className="h-4 w-4" style={{ color: T.gold }} />
                                                </div>
                                                <div>
                                                    <p className="font-semibold truncate max-w-[140px]" style={{ color: T.textPrimary }}>{point.name}</p>
                                                    <p className="text-[10px]" style={{ color: T.textMuted }}>{point.id.slice(-8)}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3" style={{ maxWidth: 140 }}>
                                            <div className="flex items-start gap-1">
                                                <MapPin className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" style={{ color: T.textMuted }} />
                                                <p className="truncate text-[11px]" style={{ color: T.textSecondary, maxWidth: 120 }}>
                                                    {point.location?.address || '—'}
                                                </p>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3" style={{ whiteSpace: 'nowrap' }}>
                                            <p className="text-[11px]" style={{ color: T.textPrimary }}>{(point as any).zoneName || '—'}</p>
                                            <p className="text-[10px]" style={{ color: T.textMuted }}>{(point as any).wardName || '—'}</p>
                                        </td>
                                        <td className="px-4 py-3 font-bold" style={{ color: T.accent, fontFamily: "'JetBrains Mono', monospace" }}>{rpts.length}</td>
                                        <td className="px-4 py-3 font-bold" style={{ color: T.amber, fontFamily: "'JetBrains Mono', monospace" }}>{rpts.filter(r => r.status === 'pending').length}</td>
                                        <td className="px-4 py-3 font-bold" style={{ color: T.green, fontFamily: "'JetBrains Mono', monospace" }}>{rpts.filter(r => r.status === 'approved').length}</td>
                                        <td className="px-4 py-3 font-bold" style={{ color: T.red, fontFamily: "'JetBrains Mono', monospace" }}>{rpts.filter(r => r.status === 'requires_action').length}</td>
                                        <td className="px-4 py-3 font-bold" style={{ color: T.purple, fontFamily: "'JetBrains Mono', monospace" }}>{shfts.length}</td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: T.cardBorder, minWidth: 40 }}>
                                                    <div className="h-full rounded-full"
                                                        style={{ width: `${pct}%`, background: pct >= 70 ? T.green : pct >= 40 ? T.amber : T.red, transition: 'width 0.7s ease' }} />
                                                </div>
                                                <span className="text-[11px] font-bold" style={{ color: pct >= 70 ? T.green : pct >= 40 ? T.amber : T.red, fontFamily: "'JetBrains Mono', monospace", minWidth: 28 }}>
                                                    {pct}%
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="inline-flex px-2 py-0.5 text-[10px] font-semibold rounded-full"
                                                style={badge.style}>                        {badge.label}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <button onClick={() => setSelPoint(point)}
                                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition hover:opacity-80"
                                                style={{ background: `${T.gold}20`, color: T.gold, border: `1px solid ${T.gold}30`, cursor: 'pointer' }}>
                                                <Eye className="h-3.5 w-3.5" /> View
                                            </button>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>

                {totalPages > 1 && (
                    <div className="flex items-center justify-between px-5 py-3" style={{ borderTop: `1px solid ${T.cardBorder}` }}>
                        <span className="text-xs" style={{ color: T.textMuted }}>
                            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
                        </span>
                        <div className="flex items-center gap-2">
                            <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
                                className="text-xs font-medium px-3 py-1.5 rounded-lg disabled:opacity-30"
                                style={{ border: `1px solid ${T.cardBorder}`, color: T.textSecondary, background: 'transparent', cursor: page === 1 ? 'not-allowed' : 'pointer' }}>
                                ← Prev
                            </button>
                            <span className="text-xs" style={{ color: T.textMuted }}>Page {page} of {totalPages}</span>
                            <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)}
                                className="text-xs font-medium px-3 py-1.5 rounded-lg disabled:opacity-30"
                                style={{ border: `1px solid ${T.cardBorder}`, color: T.textSecondary, background: 'transparent', cursor: page === totalPages ? 'not-allowed' : 'pointer' }}>
                                Next →
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {selPoint && (
                <ChronicDetailModal
                    point={selPoint}
                    reports={reportsByPoint[selPoint.id] || []}
                    shifts={shiftsByPoint[selPoint.id] || []}
                    dark={dark} T={T}
                    onClose={() => setSelPoint(null)}
                />
            )}

            <style>{`@keyframes slideUp { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:translateY(0) } }`}</style>
        </div>
    )
}

function ChronicDetailModal({ point, reports, shifts, dark, T, onClose }: any) {
    const [tab, setTab] = useState<'shifts' | 'reports'>('shifts')

    const shiftSummary = useMemo(() => {
        let completed = 0, late = 0, missed = 0, pending = 0, total = 0
        shifts.forEach((s: ShiftReport) => {
            getSlots(s).forEach((sl: ShiftSlot) => {
                total++
                if (sl.status === 'completed' || (sl as any).status === 'submitted' || (sl as any).photoUrl) completed++
                else if (sl.status === 'late') late++
                else if (sl.status === 'missed') missed++
                else pending++
            })
        })
        const pct = total > 0 ? Math.round((completed / total) * 100) : 0
        return { completed, late, missed, pending, total, pct }
    }, [shifts])

    const reportSummary = useMemo(() => ({
        total: reports.length,
        approved: reports.filter((r: ComplianceReport) => r.status === 'approved').length,
        rejected: reports.filter((r: ComplianceReport) => r.status === 'rejected').length,
        pending: reports.filter((r: ComplianceReport) => r.status === 'pending').length,
        action: reports.filter((r: ComplianceReport) => r.status === 'requires_action').length,
    }), [reports])

    const getVal = (r: ComplianceReport, qid: string) =>
        r.answers?.find(a => a.questionId === qid)?.answer?.toString() || '—'

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto"
            style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }} onClick={onClose}>
            <div className="relative w-full max-w-4xl my-8 rounded-2xl shadow-2xl"
                style={{ background: T.card, border: `1px solid ${T.cardBorder}` }} onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 rounded-t-2xl"
                    style={{ background: T.card, borderBottom: `1px solid ${T.cardBorder}` }}>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-lg font-bold" style={{ color: T.textPrimary }}>{point.name}</h2>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                                style={{ background: `${T.gold}20`, color: T.gold }}>CHRONIC</span>
                        </div>
                        <p className="text-xs" style={{ color: T.textMuted }}>
                            {(point as any).zoneName || ''}{(point as any).wardName ? ` · ${(point as any).wardName}` : ''}
                            {point.location?.address ? ` · ${point.location.address}` : ''}
                        </p>
                    </div>
                    <button onClick={onClose} className="flex items-center justify-center w-8 h-8 rounded-xl"
                        style={{ background: T.surface, border: `1px solid ${T.cardBorder}`, color: T.textSecondary, cursor: 'pointer' }}>
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="p-6 space-y-5">
                    {/* Summary stats */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {[
                            { label: 'Inspections', value: reportSummary.total, color: T.accent },
                            { label: 'Shifts', value: shifts.length, color: T.purple },
                            { label: 'Slot Rate', value: `${shiftSummary.pct}%`, color: shiftSummary.pct >= 70 ? T.green : shiftSummary.pct >= 40 ? T.amber : T.red },
                            { label: 'Requires Action', value: reportSummary.action, color: T.red },
                        ].map(s => (
                            <div key={s.label} className="rounded-xl p-3 text-center"
                                style={{ background: `${s.color}10`, border: `1px solid ${s.color}25` }}>
                                <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: s.color }}>{s.label}</p>
                                <p className="text-[20px] font-bold" style={{ color: s.color, fontFamily: "'JetBrains Mono', monospace" }}>{s.value}</p>
                            </div>
                        ))}
                    </div>

                    {/* Slot progress bar */}
                    {shiftSummary.total > 0 && (
                        <div className="rounded-xl p-4" style={{ background: T.surface, border: `1px solid ${T.cardBorder}` }}>
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-xs font-semibold" style={{ color: T.textSecondary }}>Overall slot completion</p>
                                <span className="text-sm font-bold" style={{ color: shiftSummary.pct >= 70 ? T.green : T.amber, fontFamily: "'JetBrains Mono', monospace" }}>
                                    {shiftSummary.pct}%
                                </span>
                            </div>
                            <div className="flex h-3 rounded-full overflow-hidden gap-px" style={{ background: T.cardBorder }}>
                                {[
                                    { v: shiftSummary.completed, c: T.green },
                                    { v: shiftSummary.late, c: T.amber },
                                    { v: shiftSummary.missed, c: T.red },
                                    { v: shiftSummary.pending, c: T.textMuted },
                                ].filter(x => x.v > 0).map((x, i) => (
                                    <div key={i} className="h-full" style={{ width: `${(x.v / shiftSummary.total) * 100}%`, background: x.c, minWidth: x.v > 0 ? 3 : 0 }} />
                                ))}
                            </div>
                            <div className="flex gap-4 mt-2 text-[10px]" style={{ color: T.textMuted }}>
                                <span style={{ color: T.green }}>✓ {shiftSummary.completed} completed</span>
                                <span style={{ color: T.amber }}>⚡ {shiftSummary.late} late</span>
                                <span style={{ color: T.red }}>✗ {shiftSummary.missed} missed</span>
                                <span>○ {shiftSummary.pending} pending</span>
                            </div>
                        </div>
                    )}

                    {/* Tabs */}
                    <div className="flex gap-1 p-1 rounded-xl" style={{ background: T.surface }}>
                        {[
                            { id: 'shifts', label: `Shift Reports (${shifts.length})` },
                            { id: 'reports', label: `Inspections (${reports.length})` },
                        ].map(t => (
                            <button key={t.id} onClick={() => setTab(t.id as any)}
                                className="flex-1 py-2 rounded-lg text-xs font-semibold transition"
                                style={{
                                    background: tab === t.id ? T.card : 'transparent',
                                    color: tab === t.id ? T.textPrimary : T.textSecondary,
                                    border: tab === t.id ? `1px solid ${T.cardBorder}` : '1px solid transparent',
                                    cursor: 'pointer',
                                }}>
                                {t.label}
                            </button>
                        ))}
                    </div>

                    {/* Shifts tab */}
                    {tab === 'shifts' && (
                        <div className="space-y-3">
                            {shifts.length === 0 ? (
                                <div className="py-10 text-center text-sm" style={{ color: T.textMuted }}>No shift reports for this point</div>
                            ) : shifts.map((shift: ShiftReport) => {
                                const slots = getSlots(shift)
                                const done = slots.filter(s => s.status === 'completed' || (s as any).photoUrl).length
                                const late = slots.filter(s => s.status === 'late').length
                                const miss = slots.filter(s => s.status === 'missed').length
                                const pct = slots.length > 0 ? Math.round((done / slots.length) * 100) : 0
                                const badge = statusBadge(shift.status, T)

                                return (
                                    <div key={shift.id} className="rounded-xl p-4"
                                        style={{ background: T.surface, border: `1px solid ${T.cardBorder}` }}>
                                        <div className="flex items-start justify-between mb-3">
                                            <div>
                                                <p className="font-semibold text-sm" style={{ color: T.textPrimary }}>{shift.shiftType || 'Shift'}</p>
                                                <p className="text-[11px]" style={{ color: T.textMuted }}>
                                                    {shift.userName || '—'} · {shift.shiftDate || '—'}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-bold" style={{ color: pct >= 70 ? T.green : T.amber, fontFamily: "'JetBrains Mono', monospace" }}>{pct}%</span>
                                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                                                    style={badge.style}>{badge.label}</span>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-3 gap-2 mb-3">
                                            {[
                                                { label: 'Done', value: done, color: T.green },
                                                { label: 'Late', value: late, color: T.amber },
                                                { label: 'Missed', value: miss, color: T.red },
                                            ].map(m => (
                                                <div key={m.label} className="rounded-lg p-2 text-center"
                                                    style={{ background: `${m.color}10` }}>
                                                    <p className="text-[18px] font-bold" style={{ color: m.color, fontFamily: "'JetBrains Mono', monospace" }}>{m.value}</p>
                                                    <p className="text-[9px] font-semibold uppercase" style={{ color: m.color }}>{m.label}</p>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: T.cardBorder }}>
                                            <div className="h-full rounded-full transition-all duration-700"
                                                style={{ width: `${pct}%`, background: pct >= 70 ? T.green : T.amber }} />
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}

                    {/* Inspections tab */}
                    {tab === 'reports' && (
                        <div className="space-y-3">
                            {reports.length === 0 ? (
                                <div className="py-10 text-center text-sm" style={{ color: T.textMuted }}>No inspection reports yet</div>
                            ) : reports.map((r: ComplianceReport) => {
                                const badge = statusBadge(r.status, T)
                                const date = getReportDate(r)
                                return (
                                    <div key={r.id} className="rounded-xl p-4"
                                        style={{ background: T.surface, border: `1px solid ${T.cardBorder}` }}>
                                        <div className="flex items-center justify-between mb-3">
                                            <div>
                                                <p className="font-semibold text-sm" style={{ color: T.textPrimary }}>
                                                    {r.userName || 'Unknown'}{r.teamName ? ` · ${r.teamName}` : ''}
                                                </p>
                                                <p className="text-[11px]" style={{ color: T.textMuted }}>
                                                    {date?.toLocaleString() || r.tripDate || '—'}
                                                </p>
                                            </div>
                                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                                                style={badge.style}>{badge.label}</span>
                                        </div>
                                        {r.answers && r.answers.length > 0 && (
                                            <div className="grid grid-cols-2 gap-2">
                                                {['property_type', 'phone_number', 'address', 'reason', 'remarks'].map(qid => {
                                                    const val = getVal(r, qid)
                                                    if (val === '—') return null
                                                    return (
                                                        <div key={qid} className="rounded-lg px-3 py-2"
                                                            style={{ background: T.card, border: `1px solid ${T.cardBorder}` }}>
                                                            <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: T.textMuted }}>
                                                                {qid.replace(/_/g, ' ')}
                                                            </p>
                                                            <p className="text-xs mt-0.5" style={{ color: T.textPrimary }}>{val}</p>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}