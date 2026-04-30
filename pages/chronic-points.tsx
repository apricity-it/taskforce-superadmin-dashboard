import { useEffect, useMemo, useState } from 'react'
import {
    Activity,
    CheckCircle,
    Clock,
    Eye,
    MapPin,
    Search,
    Users,
    X,
    Zap
} from 'lucide-react'
import {
    DataService,
    FeederPoint,
    ShiftReport,
    ComplianceReport,
    ShiftSlot
} from '@/lib/dataService'

function getShiftSlots(shift: ShiftReport): ShiftSlot[] {
    const rawSlots = shift.slots as ShiftSlot[] | Record<string, ShiftSlot> | null | undefined

    if (Array.isArray(rawSlots)) return rawSlots
    if (rawSlots && typeof rawSlots === 'object') return Object.values(rawSlots)
    return []
}

export default function ChronicPointsPage() {
    const [chronicPoints, setChronicPoints] = useState<FeederPoint[]>([])
    const [shiftReports, setShiftReports] = useState<ShiftReport[]>([])
    const [complianceReports, setComplianceReports] = useState<ComplianceReport[]>([])
    const [selectedPoint, setSelectedPoint] = useState<FeederPoint | null>(null)
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')
    const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all')

    useEffect(() => {
        loadData()
    }, [])

    const loadData = async () => {
        setLoading(true)

        const [points, shifts, reports] = await Promise.all([
            DataService.getChronicPoints(),
            DataService.getShiftReports(),
            DataService.getAllComplianceReports()
        ])

        const chronicReports = reports.filter(
            report => (report.feederPointType ?? 'feeder') === 'chronic'
        )

        setChronicPoints(points)
        setShiftReports(shifts)
        setComplianceReports(chronicReports)
        setLoading(false)
    }

    const getPointShiftReports = (pointId: string) =>
        shiftReports.filter(report => report.feederPointId === pointId)

    const getPointComplianceReports = (pointId: string) =>
        complianceReports.filter(report => report.feederPointId === pointId)

    const getCompletionRate = (pointId: string) => {
        const slots = getPointShiftReports(pointId).flatMap(getShiftSlots)
        if (!slots.length) return 0

        const completed = slots.filter(slot => slot.status === 'completed').length
        return Math.round((completed / slots.length) * 100)
    }

    const filteredPoints = useMemo(() => {
        return chronicPoints.filter(point => {
            const matchesSearch =
                point.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                point.location?.address?.toLowerCase().includes(searchTerm.toLowerCase())

            if (!matchesSearch) return false

            if (statusFilter === 'all') return true

            return getPointComplianceReports(point.id).some(
                report => report.status === statusFilter
            )
        })
    }, [chronicPoints, searchTerm, statusFilter, complianceReports])

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-orange-500" />
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* HEADER */}
            <div className="rounded-2xl border border-orange-100 bg-gradient-to-r from-orange-50 via-white to-white p-6 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-start gap-4">
                        <div className="rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 p-3 shadow-lg">
                            <Zap className="h-7 w-7 text-white" />
                        </div>

                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">
                                Chronic Points Monitor
                            </h1>
                            <p className="mt-1 text-sm text-gray-600">
                                Real-time monitoring of chronic points, compliance & shift analytics
                            </p>
                        </div>
                    </div>

                    <div className="inline-flex items-center rounded-xl border border-green-100 bg-green-50 px-4 py-2 text-sm font-medium text-green-700">
                        <span className="mr-2 h-2 w-2 rounded-full bg-green-500" />
                        Live Monitoring
                    </div>
                </div>
            </div>

            {/* STAT CARDS */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <PremiumStatCard
                    title="Total Chronic Points"
                    value={chronicPoints.length}
                    icon={<Zap className="h-5 w-5 text-white" />}
                    color="from-orange-500 to-orange-600"
                />
                <PremiumStatCard
                    title="Compliance Reports"
                    value={complianceReports.length}
                    icon={<CheckCircle className="h-5 w-5 text-white" />}
                    color="from-indigo-500 to-indigo-600"
                />
                <PremiumStatCard
                    title="Pending Reports"
                    value={complianceReports.filter(r => r.status === 'pending').length}
                    icon={<Clock className="h-5 w-5 text-white" />}
                    color="from-yellow-500 to-yellow-600"
                />
                <PremiumStatCard
                    title="Approved Reports"
                    value={complianceReports.filter(r => r.status === 'approved').length}
                    icon={<CheckCircle className="h-5 w-5 text-white" />}
                    color="from-green-500 to-green-600"
                />
                <PremiumStatCard
                    title="Rejected Reports"
                    value={complianceReports.filter(r => r.status === 'rejected').length}
                    icon={<Activity className="h-5 w-5 text-white" />}
                    color="from-red-500 to-red-600"
                />
                <PremiumStatCard
                    title="Total Shifts"
                    value={shiftReports.length}
                    icon={<Users className="h-5 w-5 text-white" />}
                    color="from-purple-500 to-purple-600"
                />
            </div>

            {/* FILTER BAR */}
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="relative w-full lg:max-w-md">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search chronic points..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-4 text-sm focus:border-orange-400 focus:outline-none"
                        />
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {['all', 'pending', 'approved', 'rejected'].map(status => (
                            <button
                                key={status}
                                onClick={() =>
                                    setStatusFilter(
                                        status as 'all' | 'pending' | 'approved' | 'rejected'
                                    )
                                }
                                className={`rounded-lg px-4 py-2 text-sm font-medium transition ${statusFilter === status
                                    ? 'bg-orange-500 text-white'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                    }`}
                            >
                                {status.charAt(0).toUpperCase() + status.slice(1)}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* TABLE */}
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                <div className="overflow-x-auto">
                    <table className="min-w-full">
                        <thead className="bg-orange-50">
                            <tr>
                                {[
                                    'Point',
                                    'Location',
                                    'Reports',
                                    'Pending',
                                    'Approved',
                                    'Rejected',
                                    'Shifts',
                                    'Status',
                                    'Action'
                                ].map(header => (
                                    <th
                                        key={header}
                                        className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-500"
                                    >
                                        {header}
                                    </th>
                                ))}
                            </tr>
                        </thead>

                        <tbody className="divide-y divide-gray-100">
                            {filteredPoints.map(point => {
                                const reports = getPointComplianceReports(point.id)
                                const shifts = getPointShiftReports(point.id)

                                return (
                                    <tr key={point.id} className="hover:bg-orange-50/50">
                                        <td className="px-6 py-4">
                                            <div className="font-semibold text-gray-900">{point.name}</div>
                                            <div className="text-xs text-gray-400">{point.id}</div>
                                        </td>

                                        <td className="px-6 py-4 text-sm text-gray-600">
                                            <div className="flex items-center gap-2">
                                                <MapPin className="h-4 w-4 text-gray-400" />
                                                {point.location?.address || 'No Address'}
                                            </div>
                                        </td>

                                        <td className="px-6 py-4 font-semibold text-indigo-600">
                                            {reports.length}
                                        </td>

                                        <td className="px-6 py-4 font-semibold text-yellow-600">
                                            {reports.filter(r => r.status === 'pending').length}
                                        </td>

                                        <td className="px-6 py-4 font-semibold text-green-600">
                                            {reports.filter(r => r.status === 'approved').length}
                                        </td>

                                        <td className="px-6 py-4 font-semibold text-red-600">
                                            {reports.filter(r => r.status === 'rejected').length}
                                        </td>

                                        <td className="px-6 py-4 font-semibold text-purple-600">
                                            {shifts.length}
                                        </td>

                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <ProgressCircle percent={getCompletionRate(point.id)} />
                                                <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-700">
                                                    Chronic
                                                </span>
                                            </div>
                                        </td>

                                        <td className="px-6 py-4">
                                            <button
                                                onClick={() => setSelectedPoint(point)}
                                                className="inline-flex items-center rounded-lg bg-gradient-to-r from-orange-500 to-orange-600 px-4 py-2 text-sm font-medium text-white shadow hover:opacity-90"
                                            >
                                                <Eye className="mr-2 h-4 w-4" />
                                                View
                                            </button>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>

                    {filteredPoints.length === 0 && (
                        <div className="py-12 text-center text-gray-500">
                            No chronic points found
                        </div>
                    )}
                </div>
            </div>

            {/* MODAL */}
            {selectedPoint && (
                <ChronicDetailsModal
                    point={selectedPoint}
                    reports={getPointComplianceReports(selectedPoint.id)}
                    shifts={getPointShiftReports(selectedPoint.id)}
                    onClose={() => setSelectedPoint(null)}
                />
            )}
        </div>
    )
}

function PremiumStatCard({
    title,
    value,
    icon,
    color
}: {
    title: string
    value: number
    icon: React.ReactNode
    color: string
}) {
    return (
        <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-md">
            <div className={`absolute right-0 top-0 h-20 w-20 rounded-bl-full bg-gradient-to-br ${color} opacity-10`} />
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                        {title}
                    </p>
                    <p className="mt-2 text-3xl font-bold text-gray-900">{value}</p>
                </div>

                <div className={`rounded-xl bg-gradient-to-br ${color} p-3 shadow-lg`}>
                    {icon}
                </div>
            </div>
        </div>
    )
}

function ProgressCircle({ percent }: { percent: number }) {
    return (
        <div className="flex items-center gap-2">
            <div className="h-10 w-10 rounded-full border-4 border-orange-100 flex items-center justify-center text-xs font-bold text-orange-600">
                {percent}%
            </div>
        </div>
    )
}

function MiniMetric({
    label,
    value,
    color
}: {
    label: string
    value: number
    color: 'green' | 'yellow' | 'red'
}) {
    const colors = {
        green: 'bg-green-100 text-green-700',
        yellow: 'bg-yellow-100 text-yellow-700',
        red: 'bg-red-100 text-red-700'
    }

    return (
        <div className={`rounded-xl px-3 py-2 text-center ${colors[color]}`}>
            <p className="text-lg font-bold">{value}</p>
            <p className="text-xs font-medium">{label}</p>
        </div>
    )
}

function InspectionField({
    label,
    value
}: {
    label: string
    value: string
}) {
    return (
        <div className="rounded-xl bg-white p-3 border border-gray-200">
            <p className="text-xs font-semibold uppercase text-gray-500">{label}</p>
            <p className="mt-1 text-sm font-medium text-gray-900">{value}</p>
        </div>
    )
}

function EmptyModalState({ text }: { text: string }) {
    return (
        <div className="rounded-2xl border border-dashed border-gray-300 py-10 text-center text-gray-500">
            {text}
        </div>
    )
}

function ChronicDetailsModal({
    point,
    reports,
    shifts,
    onClose
}: {
    point: FeederPoint
    reports: ComplianceReport[]
    shifts: ShiftReport[]
    onClose: () => void
}) {
    const [activeTab, setActiveTab] = useState<'shifts' | 'inspections'>('shifts')

    const getAnswerValue = (report: ComplianceReport, questionId: string) => {
        const answer = report.answers?.find(a => a.questionId === questionId)
        return answer?.answer ? String(answer.answer) : '—'
    }

    const shiftSummary = shifts.reduce(
        (acc, shift) => {
            const slots = getShiftSlots(shift)

            slots.forEach(slot => {
                if (slot?.status === 'completed') acc.completed++
                else if (slot?.status === 'late') acc.late++
                else if (slot?.status === 'missed') acc.missed++
            })
            return acc
        },
        { completed: 0, late: 0, missed: 0 }
    )

    const totalSlots =
        shiftSummary.completed + shiftSummary.late + shiftSummary.missed

    const compliancePct =
        totalSlots > 0
            ? Math.round((shiftSummary.completed / totalSlots) * 100)
            : 0

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
                <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-6 py-5">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900">{point.name}</h2>
                        <p className="text-sm text-gray-500">Chronic Point Details</p>
                    </div>

                    <button
                        onClick={onClose}
                        className="rounded-lg bg-gray-100 p-2 hover:bg-gray-200"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="space-y-6 p-6">
                    {/* Summary */}
                    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                        <DetailCard title="Inspections" value={reports.length} />
                        <DetailCard title="Shifts" value={shifts.length} />
                        <DetailCard title="Completed Slots" value={shiftSummary.completed} />
                        <DetailCard title="Compliance %" value={compliancePct} suffix="%" />
                    </div>

                    {/* Tabs */}
                    <div className="flex rounded-xl bg-gray-100 p-1">
                        <button
                            onClick={() => setActiveTab('shifts')}
                            className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition ${activeTab === 'shifts'
                                ? 'bg-orange-500 text-white'
                                : 'text-gray-600'
                                }`}
                        >
                            Shift Reports ({shifts.length})
                        </button>

                        <button
                            onClick={() => setActiveTab('inspections')}
                            className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition ${activeTab === 'inspections'
                                ? 'bg-blue-500 text-white'
                                : 'text-gray-600'
                                }`}
                        >
                            Inspections ({reports.length})
                        </button>
                    </div>

                    {/* SHIFT TAB */}
                    {activeTab === 'shifts' && (
                        <div className="space-y-4">
                            {shifts.length === 0 && (
                                <EmptyModalState text="No shift reports found." />
                            )}

                            {shifts.map(shift => {
                                const slots = getShiftSlots(shift)

                                const completed = slots.filter(
                                    s => s.status === 'completed'
                                ).length

                                const late = slots.filter(
                                    s => s.status === 'late'
                                ).length

                                const missed = slots.filter(
                                    s => s.status === 'missed'
                                ).length

                                const pct =
                                    slots.length > 0
                                        ? Math.round((completed / slots.length) * 100)
                                        : 0

                                return (
                                    <div
                                        key={shift.id}
                                        className="rounded-2xl border border-orange-100 bg-orange-50/40 p-5"
                                    >
                                        <div className="mb-4 flex items-start justify-between">
                                            <div>
                                                <h4 className="font-semibold text-gray-900">
                                                    {shift.shiftType || 'Shift'}
                                                </h4>
                                                <p className="text-sm text-gray-500">
                                                    {shift.userName || '—'} • {shift.shiftDate || '—'}
                                                </p>
                                            </div>

                                            <span className="rounded-full bg-orange-100 px-3 py-1 text-sm font-bold text-orange-700">
                                                {pct}%
                                            </span>
                                        </div>

                                        <div className="grid grid-cols-3 gap-3 mb-4">
                                            <MiniMetric label="Completed" value={completed} color="green" />
                                            <MiniMetric label="Late" value={late} color="yellow" />
                                            <MiniMetric label="Missed" value={missed} color="red" />
                                        </div>

                                        <div className="h-2 w-full rounded-full bg-gray-200">
                                            <div
                                                className="h-2 rounded-full bg-orange-500"
                                                style={{ width: `${pct}%` }}
                                            />
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}

                    {/* INSPECTIONS TAB */}
                    {activeTab === 'inspections' && (
                        <div className="space-y-4">
                            {reports.length === 0 && (
                                <EmptyModalState text="No inspections found." />
                            )}

                            {reports.map(report => (
                                <div
                                    key={report.id}
                                    className="rounded-2xl border border-blue-100 bg-blue-50/40 p-5"
                                >
                                    <div className="mb-4 flex items-center justify-between">
                                        <div>
                                            <h4 className="font-semibold text-gray-900">
                                                {getAnswerValue(report, 'citizen_name')}
                                            </h4>
                                            <p className="text-sm text-gray-500">
                                                {report.tripDate || '—'}
                                            </p>
                                        </div>

                                        <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
                                            Chronic
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                        <InspectionField
                                            label="Property Type"
                                            value={getAnswerValue(report, 'property_type')}
                                        />
                                        <InspectionField
                                            label="Phone"
                                            value={getAnswerValue(report, 'phone_number')}
                                        />
                                        <InspectionField
                                            label="Address"
                                            value={getAnswerValue(report, 'address')}
                                        />
                                        <InspectionField
                                            label="Reason"
                                            value={getAnswerValue(report, 'reason')}
                                        />
                                        <InspectionField
                                            label="Remarks"
                                            value={getAnswerValue(report, 'remarks')}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

function DetailCard({
    title,
    value,
    suffix
}: {
    title: string
    value: number
    suffix?: string
}) {
    return (
        <div className="rounded-2xl bg-gray-50 p-4 text-center">
            <p className="text-sm text-gray-500">{title}</p>
            <p className="mt-2 text-2xl font-bold text-gray-900">
                {value}{suffix || ''}
            </p>
        </div>
    )
}

function HistorySection({
    title,
    children
}: {
    title: string
    children: React.ReactNode
}) {
    return (
        <div>
            <h3 className="mb-3 text-lg font-semibold text-gray-900">{title}</h3>
            <div className="space-y-2">{children}</div>
        </div>
    )
}

function HistoryRow({
    primary,
    secondary,
    status
}: {
    primary: string
    secondary: string
    status: string
}) {
    const statusColor =
        status === 'approved'
            ? 'bg-green-100 text-green-700'
            : status === 'rejected'
                ? 'bg-red-100 text-red-700'
                : status === 'pending'
                    ? 'bg-yellow-100 text-yellow-700'
                    : 'bg-blue-100 text-blue-700'

    return (
        <div className="flex items-center justify-between rounded-xl border border-gray-200 p-4">
            <div>
                <p className="font-medium text-gray-900">{primary}</p>
                <p className="text-xs text-gray-500">{secondary}</p>
            </div>

            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusColor}`}>
                {status}
            </span>
        </div>
    )
}
