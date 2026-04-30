import dynamic from 'next/dynamic'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import Link from 'next/link'
import {
    PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
    BarChart, Bar, XAxis, YAxis, CartesianGrid,
    LineChart, Line, Legend,
} from 'recharts'
import {
    Users, Activity, Clock, TrendingUp, AlertTriangle,
    ChevronRight, Zap, BarChart3, Eye, FileText,
    Calendar, RefreshCw, Sparkles,
} from 'lucide-react'
import { DataService, ComplianceReport } from '@/lib/dataService'

// ─── Constants ────────────────────────────────────────────────────────────────
const PIE_COLORS = ['#10b981', '#ef4444', '#f59e0b']
const TOOLTIP_STYLE = {
    borderRadius: '12px', border: 'none',
    boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
    padding: '10px 14px', fontSize: '12px',
}

const FILTERS = [
    { key: 'today', label: 'Today' },
    { key: 'yesterday', label: 'Yesterday' },
    { key: 'week', label: 'This Week' },
    { key: 'month', label: 'This Month' },
    { key: 'custom', label: 'Custom' },
]

const STAT_META = [
    { key: 'feederPoints', label: 'Feeder Points', icon: Activity, g: 'from-teal-500 to-emerald-600', s: 'shadow-teal-500/30', link: '/feeder-points' },
    { key: 'users', label: 'Users', icon: Users, g: 'from-blue-500 to-indigo-600', s: 'shadow-blue-500/30', link: '/users' },
    { key: 'pending', label: 'Pending', icon: Clock, g: 'from-amber-400 to-orange-500', s: 'shadow-orange-500/30', link: '/report-review?tab=pending' },
    { key: 'approved', label: 'Approved', icon: TrendingUp, g: 'from-emerald-400 to-green-600', s: 'shadow-green-500/30', link: '/report-review?tab=approved' },
    { key: 'rejected', label: 'Rejected', icon: AlertTriangle, g: 'from-rose-400 to-red-600', s: 'shadow-red-500/30', link: '/report-review?tab=rejected' },
    { key: 'actionRequired', label: 'Action Req.', icon: Zap, g: 'from-yellow-400 to-amber-500', s: 'shadow-yellow-500/30', link: '/report-review?tab=requires_action' },
    { key: 'totalReports', label: 'Total Reports', icon: FileText, g: 'from-violet-500 to-purple-600', s: 'shadow-violet-500/30', link: '/report-review' },
    {
        key: 'chronicPoints',
        label: 'Chronic Points',
        icon: Zap,
        g: 'from-purple-500 to-violet-600',
        s: 'shadow-violet-500/30',
        link: '/chronic-points'
    },
    {
        key: 'chronicShiftReports',
        label: 'Shift Reports',
        icon: TrendingUp,
        g: 'from-cyan-500 to-sky-600',
        s: 'shadow-cyan-500/30',
        link: '/chronic-points'
    },
    {
        key: 'eliminatedChronic',
        label: 'Eliminated Chronic',
        icon: AlertTriangle,
        g: 'from-rose-500 to-pink-600',
        s: 'shadow-rose-500/30',
        link: '/chronic-points'
    },
] as const

const QUICK_LINKS = [
    { title: 'User Requests', link: '/access-requests', icon: Users, color: 'from-blue-500 to-indigo-600', accent: 'group-hover:border-blue-200   group-hover:bg-blue-50/50' },
    { title: 'Feeder Points', link: '/feeder-points', icon: Activity, color: 'from-teal-500 to-emerald-600', accent: 'group-hover:border-teal-200   group-hover:bg-teal-50/50' },
    { title: 'Feeder Requests', link: '/feeder-point-requests', icon: Clock, color: 'from-orange-400 to-amber-500', accent: 'group-hover:border-orange-200 group-hover:bg-orange-50/50' },
    { title: 'Eliminated FP', link: '/eliminated-feeder-points', icon: AlertTriangle, color: 'from-rose-500 to-red-600', accent: 'group-hover:border-rose-200   group-hover:bg-rose-50/50' },
    { title: 'Reports', link: '/qc-reports', icon: TrendingUp, color: 'from-emerald-500 to-green-600', accent: 'group-hover:border-emerald-200 group-hover:bg-emerald-50/50' },
    { title: 'Frequency Req.', link: '/frequency-requests', icon: RefreshCw, color: 'from-violet-500 to-purple-600', accent: 'group-hover:border-violet-200 group-hover:bg-violet-50/50' },
]

// ─── Weekly trend ─────────────────────────────────────────────────────────────
const buildWeeklyTrend = (reports: ComplianceReport[]) => {
    const result = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => ({ day, reports: 0 }))
    reports.forEach(r => {
        if (!r.createdAt) return
        const d = new Date(r.createdAt.seconds * 1000).getDay()
        result[d === 0 ? 6 : d - 1].reports += 1
    })
    return result
}

// ─────────────────────────────────────────────────────────────────────────────
function QCDashboardComponent() {
    const { user } = useAuth()
    const [mounted, setMounted] = useState(false)
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)
    const [dateFilter, setDateFilter] = useState('today')
    const [customRange, setCustomRange] = useState({ start: '', end: '' })
    const [stats, setStats] = useState({
        feederPoints: 0,
        chronicPoints: 0,
        chronicShiftReports: 0,
        eliminatedChronic: 0,
        users: 0,
        pending: 0,
        approved: 0,
        rejected: 0,
        eliminated: 0,
        actionRequired: 0,
        totalReports: 0,
    })
    const [weeklyData, setWeeklyData] = useState<{ day: string; reports: number }[]>([])
    const [insights, setInsights] = useState<string[]>([])

    useEffect(() => setMounted(true), [])

    const getDateRange = useCallback(() => {
        const end = new Date()
        let start: Date
        switch (dateFilter) {
            case 'today':
                start = new Date(); start.setHours(0, 0, 0, 0); break
            case 'yesterday':
                start = new Date(); start.setDate(start.getDate() - 1); start.setHours(0, 0, 0, 0)
                end.setDate(end.getDate() - 1); end.setHours(23, 59, 59, 999); break
            case 'week':
                start = new Date(); start.setDate(start.getDate() - 7); break
            case 'month':
                start = new Date(); start.setMonth(start.getMonth() - 1); break
            case 'custom':
                if (!customRange.start || !customRange.end) return { start: new Date(0), end: new Date() }
                const ce = new Date(customRange.end); ce.setHours(23, 59, 59, 999)
                return { start: new Date(customRange.start), end: ce }
            default:
                start = new Date(0)
        }
        return { start, end }
    }, [dateFilter, customRange])

    const filterReports = useCallback((reps: ComplianceReport[], s: Date, e: Date) =>
        reps.filter(r => {
            const d = r.submittedAt?.toDate?.() ?? (r.createdAt?.seconds ? new Date(r.createdAt.seconds * 1000) : new Date())
            return d >= s && d <= e
        }), [])

    const loadData = useCallback(async () => {
        try {
            setLoading(true)
            const { start, end } = getDateRange()
            const [fps, users, reports, fpReqs] = await Promise.all([
                DataService.getAllFeederPoints(),
                DataService.getAllUsers(),
                DataService.getAllComplianceReports(),
                DataService.getFeederPointRequests('pending'),
            ])
            const fr = filterReports(reports, start, end)
            const pending = fr.filter(r => r.status === 'pending').length
            const approved = fr.filter(r => r.status === 'approved').length
            const rejected = fr.filter(r => r.status === 'rejected').length
            setStats({
                feederPoints: fps.filter(fp => (fp.type ?? 'feeder') === 'feeder').length,
                chronicPoints: fps.filter(fp => fp.type === 'chronic').length,
                chronicShiftReports: reports.filter(
                    r => (r.feederPointType ?? 'feeder') === 'chronic'
                ).length,
                eliminatedChronic: fps.filter(
                    fp => fp.type === 'chronic' && fp.isEliminated
                ).length,

                users: users.length,
                pending,
                approved,
                rejected,
                eliminated: fps.filter(fp => fp.isEliminated).length,
                actionRequired: fr.filter(r => r.status === 'requires_action').length,
                totalReports: fr.length,
            })
            setWeeklyData(buildWeeklyTrend(fr))
            const ins: string[] = []
            if (pending > 10) ins.push('High number of pending QC approvals need attention')
            if (rejected > approved) ins.push('Rejection rate exceeds approval rate — review submissions')
            if (approved > 20) ins.push('Strong QC throughput this period')
            if (fpReqs.length > 5) ins.push('Multiple feeder point requests awaiting review')
            setInsights(ins)
        } catch (e) { console.error(e) }
        finally { setLoading(false) }
    }, [getDateRange, filterReports])

    const handleRefresh = useCallback(async () => {
        setRefreshing(true); await loadData(); setRefreshing(false)
    }, [loadData])

    useEffect(() => {
        if (!mounted) return
        if (dateFilter === 'custom' && (!customRange.start || !customRange.end)) return
        loadData()
    }, [mounted, dateFilter, customRange, loadData])

    const pieData = useMemo(() => [
        { name: 'Approved', value: stats.approved },
        { name: 'Rejected', value: stats.rejected },
        { name: 'Pending', value: stats.pending },
    ], [stats])

    const barData = useMemo(() => [
        { name: 'Active', value: Math.max(0, stats.feederPoints - stats.eliminated) },
        { name: 'Eliminated', value: stats.eliminated },
    ], [stats])

    if (!mounted || loading) return <Skeleton />

    const hour = new Date().getHours()
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
    const firstName = user?.name?.split(' ')[0] ?? 'QC'

    return (
        /**
         * No extra wrapper div needed — layout's <main> already provides:
         *   max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6
         * and the sidebar transition handles lg:pl-[70px] → lg:pl-64.
         * We just add vertical spacing between sections.
         */
        <div className="flex flex-col gap-5">

            {/* ── HERO CARD ───────────────────────────────────────────── */}
            <div
                className="relative overflow-hidden rounded-2xl p-7 text-white"
                style={{
                    background:
                        'linear-gradient(135deg,#0f766e 0%,#115e59 45%,#134e4a 100%)',
                }}
            >
                <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white opacity-10" />
                <div className="pointer-events-none absolute right-20 -bottom-20 h-40 w-40 rounded-full bg-emerald-300 opacity-10" />

                <div className="relative z-10 flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-semibold tracking-tight mb-1">
                            {greeting}, {firstName} 👋
                        </h1>
                        <p className="text-sm opacity-80 tracking-wide">
                            Here&apos;s your QC overview for today
                        </p>
                    </div>

                    <button
                        onClick={handleRefresh}
                        className="flex items-center gap-2 rounded-xl border border-white/20
                bg-white/10 px-4 py-2 text-sm font-medium text-white/90
                backdrop-blur-sm transition hover:bg-white/20 active:scale-95"
                    >
                        <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                </div>
            </div>
            {/* ── MAIN CARD — one white container, everything inside ─────── */}
            <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">

                {/* ── FILTER BAR ── */}
                <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-5 py-3.5">
                    <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                        <Calendar className="h-3.5 w-3.5" />
                        Period
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                        {FILTERS.map(f => (
                            <button
                                key={f.key}
                                onClick={() => setDateFilter(f.key)}
                                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150
                                    ${dateFilter === f.key
                                        ? 'bg-gradient-to-r from-teal-500 to-emerald-500 text-white shadow-sm shadow-teal-400/30'
                                        : 'bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                                    }`}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>
                    {dateFilter === 'custom' && (
                        <div className="ml-auto flex flex-wrap items-center gap-2">
                            <input
                                type="date"
                                onChange={e => setCustomRange(p => ({ ...p, start: e.target.value }))}
                                className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs
                                    focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                            />
                            <span className="text-xs text-gray-300">→</span>
                            <input
                                type="date"
                                onChange={e => setCustomRange(p => ({ ...p, end: e.target.value }))}
                                className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs
                                    focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                            />
                        </div>
                    )}
                </div>

                {/* ── STAT CARDS ── */}
                <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-3 lg:grid-cols-5">
                    {STAT_META.map(s => (
                        <Link href={s.link} key={s.key}>
                            <div className={`group relative cursor-pointer overflow-hidden rounded-xl
                                bg-gradient-to-br p-4 text-white shadow-md
                                ${s.g} ${s.s}
                                transition-all duration-200 hover:scale-[1.03] hover:shadow-lg active:scale-[0.97]`}
                            >
                                {/* decorative circles */}
                                <span className="absolute -right-2 -top-2 h-10 w-10 rounded-full bg-white/10" />
                                <span className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-white/5" />
                                <div className="relative z-10">
                                    <s.icon className="mb-2.5 h-4 w-4 opacity-75" />
                                    <p className="text-2xl font-bold leading-none tracking-tight">
                                        {(stats as any)[s.key]}
                                    </p>
                                    <p className="mt-1.5 truncate text-[10px] font-medium opacity-80">
                                        {s.label}
                                    </p>
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>

                <HR />

                {/* ── CHARTS ROW ── */}
                <div className="grid grid-cols-1 gap-4 p-5 lg:grid-cols-2">

                    {/* Pie — compliance */}
                    <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-4">
                        <CardHeader
                            icon={BarChart3} iconBg="bg-teal-50" iconColor="text-teal-600"
                            title="Compliance Overview" sub="Report status distribution"
                        />
                        {pieData.every(d => d.value === 0)
                            ? <Empty />
                            : <ResponsiveContainer height={220} className="mt-3">
                                <PieChart>
                                    <Pie data={pieData} dataKey="value" cx="50%" cy="50%"
                                        innerRadius={52} outerRadius={85}
                                        paddingAngle={3} strokeWidth={0}
                                        onClick={() => (window.location.href = '/daily-reports')}
                                        className="cursor-pointer"
                                    >
                                        {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                                    </Pie>
                                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                                    <Legend verticalAlign="bottom" iconType="circle" iconSize={7}
                                        formatter={v => <span className="ml-1 text-xs text-gray-500">{v}</span>}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        }
                    </div>

                    {/* Bar — system */}
                    <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-4">
                        <CardHeader
                            icon={Activity} iconBg="bg-blue-50" iconColor="text-blue-600"
                            title="System Overview" sub="Feeder points breakdown"
                        />
                        <ResponsiveContainer height={220} className="mt-3">
                            <BarChart data={barData} barCategoryGap="40%">
                                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#9ca3af' }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#9ca3af' }} />
                                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(20,184,166,0.04)' }} />
                                <defs>
                                    <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#14b8a6" />
                                        <stop offset="100%" stopColor="#0d9488" />
                                    </linearGradient>
                                </defs>
                                <Bar dataKey="value" fill="url(#barGrad)" radius={[6, 6, 0, 0]}
                                    onClick={(d: any) => {
                                        if (d.name === 'Active') window.location.href = '/feeder-points'
                                        if (d.name === 'Eliminated') window.location.href = '/eliminated-feeder-points'
                                    }}
                                    className="cursor-pointer"
                                />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <HR />

                {/* ── WEEKLY TREND ── */}
                <div className="p-5">
                    <CardHeader
                        icon={TrendingUp}
                        iconBg="bg-gradient-to-br from-teal-500 to-emerald-500"
                        iconColor="text-white" solid
                        title="Weekly Trend" sub="Reports submitted per day"
                    />
                    <ResponsiveContainer height={230} className="mt-4">
                        <LineChart
                            data={weeklyData}
                            onClick={(d: any) => {
                                if (d?.activeLabel) window.location.href = `/qc-reports?day=${d.activeLabel}`
                            }}
                        >
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                            <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#9ca3af' }} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#9ca3af' }} />
                            <Tooltip contentStyle={TOOLTIP_STYLE} />
                            <Line
                                type="monotone" dataKey="reports"
                                stroke="#14b8a6" strokeWidth={2.5}
                                dot={{ r: 4, fill: '#fff', stroke: '#14b8a6', strokeWidth: 2 }}
                                activeDot={{ r: 6, fill: '#14b8a6', stroke: '#fff', strokeWidth: 2.5, className: 'cursor-pointer' }}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>

                <HR />

                {/* ── INSIGHTS ── */}
                <div className="p-5">
                    <div className="flex items-start justify-between gap-3">
                        <CardHeader
                            icon={Sparkles}
                            iconBg="bg-gradient-to-br from-violet-500 to-purple-600"
                            iconColor="text-white" solid
                            title="Insights" sub="Automated analysis"
                        />
                        <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-100
                            bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-600">
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                            Live
                        </span>
                    </div>

                    <div className="mt-4">
                        {insights.length === 0 ? (
                            <div className="flex flex-col items-center py-8 text-center">
                                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl
                                    border border-teal-100 bg-teal-50 text-xl">
                                    ✅
                                </div>
                                <p className="text-sm font-medium text-gray-600">All clear</p>
                                <p className="mt-0.5 text-xs text-gray-400">No issues detected this period</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {insights.map((ins, i) => {
                                    const warn = ins.includes('reject') || ins.includes('pending')
                                    return (
                                        <div key={i} className={`flex items-start gap-3 rounded-xl px-4 py-3
                                            ${warn
                                                ? 'border border-amber-100 bg-amber-50/70'
                                                : 'border border-teal-100/80 bg-teal-50/50'
                                            }`}
                                        >
                                            <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full
                                                ${warn ? 'bg-amber-400' : 'bg-teal-400'}`} />
                                            <p className="text-sm text-gray-700">{ins}</p>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                </div>

                <HR />

                {/* ── QUICK ACTIONS ───────────────────────────────────────── */}
                <div className="p-5">
                    <CardHeader
                        icon={Zap}
                        iconBg="bg-gray-800"
                        iconColor="text-white"
                        solid
                        title="Quick Actions"
                        sub="Jump to any module instantly"
                    />

                    <div className="mt-4 grid grid-cols-2 lg:grid-cols-3 gap-3">
                        {[
                            {
                                label: 'User Requests',
                                href: '/access-requests',
                                bg: '#1E3A8A',
                                text: '#EFF6FF',
                                icon: Users,
                            },
                            {
                                label: 'Feeder Points',
                                href: '/feeder-points',
                                bg: '#0F766E',
                                text: '#ECFEFF',
                                icon: Activity,
                            },
                            {
                                label: 'Feeder Requests',
                                href: '/feeder-point-requests',
                                bg: '#C2410C',
                                text: '#FFF7ED',
                                icon: Clock,
                            },
                            {
                                label: 'Eliminated FP',
                                href: '/eliminated-feeder-points',
                                bg: '#BE123C',
                                text: '#FFF1F2',
                                icon: AlertTriangle,
                            },
                            {
                                label: 'Reports',
                                href: '/qc-reports',
                                bg: '#15803D',
                                text: '#F0FDF4',
                                icon: TrendingUp,
                            },
                            {
                                label: 'Frequency Req.',
                                href: '/frequency-requests',
                                bg: '#6D28D9',
                                text: '#F5F3FF',
                                icon: RefreshCw,
                            },
                        ].map((action) => (
                            <Link href={action.href} key={action.label}>
                                <div
                                    className="flex items-center justify-center gap-2 rounded-xl px-4 py-3
                        text-sm font-semibold transition hover:opacity-90
                        active:scale-[0.97] cursor-pointer"
                                    style={{
                                        background: action.bg,
                                        color: action.text,
                                    }}
                                >
                                    <action.icon className="h-4 w-4" strokeWidth={1.8} />
                                    {action.label}
                                </div>
                            </Link>
                        ))}
                    </div>
                </div>

            </div>{/* /main card */}
        </div>
    )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Thin rule that separates sections inside the main card */
function HR() {
    return <div className="mx-5 h-px bg-gray-100" />
}

/** Section heading with coloured icon */
function CardHeader({ icon: Icon, iconBg, iconColor, title, sub, solid = false }: {
    icon: any
    iconBg: string
    iconColor: string
    title: string
    sub?: string
    solid?: boolean
}) {
    return (
        <div className="flex items-center gap-3">
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl
                ${iconBg} ${solid ? 'shadow-sm' : ''}`}>
                <Icon className={`h-[15px] w-[15px] ${iconColor}`} />
            </div>
            <div className="min-w-0">
                <p className="text-[13px] font-semibold leading-none text-gray-800">{title}</p>
                {sub && <p className="mt-0.5 text-[11px] leading-none text-gray-400">{sub}</p>}
            </div>
        </div>
    )
}

/** Empty chart placeholder */
function Empty() {
    return (
        <div className="flex h-[220px] flex-col items-center justify-center text-gray-300">
            <Eye className="mb-2 h-8 w-8 opacity-40" />
            <p className="text-xs">No data for this period</p>
        </div>
    )
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────
function Skeleton() {
    return (
        <div className="flex flex-col gap-5 animate-pulse">
            {/* header */}
            <div className="flex items-center justify-between">
                <div className="space-y-2">
                    <div className="h-6 w-48 rounded-lg bg-gray-200" />
                    <div className="h-4 w-64 rounded-lg bg-gray-100" />
                </div>
                <div className="h-9 w-24 rounded-xl bg-gray-200" />
            </div>
            {/* main card */}
            <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                {/* filter bar */}
                <div className="flex gap-2 border-b border-gray-100 px-5 py-3.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="h-7 w-20 rounded-lg bg-gray-100" />
                    ))}
                </div>
                {/* stat cards */}
                <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-3 lg:grid-cols-5">
                    {Array.from({ length: 7 }).map((_, i) => (
                        <div key={i} className="h-24 rounded-xl bg-gray-200" />
                    ))}
                </div>
                <div className="mx-5 h-px bg-gray-100" />
                {/* charts */}
                <div className="grid grid-cols-1 gap-4 p-5 lg:grid-cols-2">
                    <div className="h-72 rounded-xl bg-gray-100" />
                    <div className="h-72 rounded-xl bg-gray-100" />
                </div>
                <div className="mx-5 h-px bg-gray-100" />
                {/* trend */}
                <div className="p-5">
                    <div className="h-56 rounded-xl bg-gray-100" />
                </div>
            </div>
        </div>
    )
}

export default dynamic(() => Promise.resolve(QCDashboardComponent), { ssr: false })