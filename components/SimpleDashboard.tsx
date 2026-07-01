import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import Link from 'next/link'
import {
  fetchComplianceReports, fetchFeederPoints, fetchShiftReports,
  fetchUsers, fetchTeams, fetchZones, fetchWards, fetchKothis,
  fetchPendingPointRequests, fetchPendingFrequencyRequests, fetchPendingAccessRequests,
  buildDashboardKPIs, buildDailyTrend, buildStatusBreakdown, buildChecklistFailures,
  buildSlotPunctuality, buildTeamLeaderboard, buildAlerts, buildTopPerformers, prepareExportData,
  toISO,
  type DashboardKPIs, type ComplianceReport, type FeederPoint, type ShiftReport,
  type Team, type ApprovedUser, type Zone, type Ward, type Kothi,
} from '@/lib/dashboardQueries'
import { exportToExcel, exportToCSV, exportToPDF } from '@/lib/dashboardExport'
import { buildTrendArrows, trendLabel } from '@/lib/dashboardQueryHelpers'
import { getTokens } from '@/lib/dashboardTheme'
import { useTheme } from '@/contexts/ThemeContext'
import {
  DashboardKeyframes, FilterBar,
  AlertsPanel, ComplianceTrendChart, StatusDonutChart, ChecklistHeatmap,
  ShiftPunctualityCard, TeamLeaderboard, TopPerformersGrid, RequestsPipeline,
  PointsOverview, DrillDownModal, ComparisonEngine,
  HeatmapCalendar, ResponseTimeAnalytics, OverdueTracker,
  TeamWorkloadChart, DashboardSkeleton, ToastProvider, useToast,
  AnimatedNumber,
  type DashboardFilters, type DrillDownMetric,
} from '@/components/dashboard'
import FeederPointInsights from '@/components/dashboard/FeederPointInsights'
import GlobalFilterBar from '@/components/dashboard/GlobalFilterBar'
import {
  FileText, MapPin, Users, Zap, ChevronRight, CheckCircle, Settings, RefreshCw, Bell,
} from 'lucide-react'

const AUTO_REFRESH_MS = 60_000

function daysAgo(n: number) { return toISO(new Date(Date.now() - n * 86400000)) }
function todayISO() { return toISO(new Date()) }

function ago(d: Date): string {
  const m = Math.floor((Date.now() - d.getTime()) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function KPIStyles() {
  return (
    <style>{`
      @keyframes kpiSlideUp {
        from { opacity: 0; transform: translateY(10px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      @keyframes kpiPulseDot {
        0%, 100% { opacity: 1; transform: scale(1); }
        50%      { opacity: 0.55; transform: scale(1.35); }
      }
    `}</style>
  )
}

function KPICard({
  label, value, sub, accent, dark, delay = 0, urgent = false, onClick,
}: {
  label: string
  value: number
  sub?: string
  accent: string
  dark: boolean
  delay?: number
  urgent?: boolean
  onClick?: () => void
}) {
  const T = getTokens(dark)
  const [hover, setHover] = useState(false)

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative',
        textAlign: 'left',
        width: '100%',
        border: `1px solid ${hover ? accent + '55' : T.cardBorder}`,
        borderRadius: 16,
        padding: '14px 16px 16px',
        background: dark
          ? `linear-gradient(135deg, ${accent}18, ${T.card})`
          : `linear-gradient(135deg, ${accent}0d, #ffffff)`,
        cursor: onClick ? 'pointer' : 'default',
        overflow: 'hidden',
        transform: hover ? 'translateY(-3px)' : 'translateY(0)',
        boxShadow: hover ? `0 10px 22px -10px ${accent}66` : '0 1px 2px rgba(0,0,0,0.04)',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease',
        animation: `kpiSlideUp 0.4s ease ${delay}ms both`,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: -22,
          right: -22,
          width: 72,
          height: 72,
          borderRadius: '50%',
          background: accent,
          opacity: dark ? 0.14 : 0.09,
          filter: 'blur(2px)',
          pointerEvents: 'none',
        }}
      />

      {urgent && (
        <span
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: T.red,
            boxShadow: `0 0 0 3px ${T.red}22`,
            animation: 'kpiPulseDot 1.6s ease-in-out infinite',
          }}
        />
      )}

      <p
        style={{
          position: 'relative',
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          color: T.textSecondary,
          margin: '0 0 8px',
        }}
      >
        {label}
      </p>

      <p
        style={{
          position: 'relative',
          fontSize: 26,
          fontWeight: 800,
          lineHeight: 1,
          margin: '0 0 6px',
          color: accent,
          fontFamily: "'JetBrains Mono', monospace",
          letterSpacing: '-0.02em',
        }}
      >
        <AnimatedNumber value={value} />
      </p>

      {sub && (
        <p
          style={{
            position: 'relative',
            fontSize: 11,
            fontWeight: 500,
            color: T.textMuted,
            margin: 0,
          }}
        >
          {sub}
        </p>
      )}

      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          height: 3,
          borderRadius: '0 3px 3px 0',
          width: hover ? '100%' : '38%',
          background: accent,
          opacity: 0.75,
          transition: 'width 0.35s ease',
        }}
      />
    </button>
  )
}

const emptyKpis: DashboardKPIs = {
  totalReports: 0, pendingReports: 0, approvedReports: 0, rejectedReports: 0,
  requiresAction: 0, actionTaken: 0, totalFeederPoints: 0, activeFeederPoints: 0,
  assignedFeederPoints: 0, unassignedFeederPoints: 0,
  totalChronicPoints: 0, activeChronicPoints: 0,
  assignedChronicPoints: 0, unassignedChronicPoints: 0,
  eliminatedPoints: 0, unassignedPoints: 0,
  totalShiftReports: 0, completedShifts: 0, inProgressShifts: 0,
  totalUsers: 0, activeUsers: 0, inactiveUsers: 0,
  adminUsers: 0, qcUsers: 0, taskForceUsers: 0, actionOfficerUsers: 0, commissionerUsers: 0,
  pendingPointRequests: 0, pendingFreqRequests: 0, pendingAccessRequests: 0,
  totalNotifications: 0, unreadNotifications: 0,
}
function DashboardInner() {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const T = getTokens(dark)
  const { toast } = useToast()

  const [filters, setFilters] = useState<DashboardFilters>({
    dateFrom: daysAgo(29), dateTo: todayISO(), zoneId: '', wardId: '', status: '', pointType: '',
  })
  const [kpis, setKpis] = useState<DashboardKPIs | null>(null)
  const [reports, setReports] = useState<ComplianceReport[]>([])
  const [points, setPoints] = useState<FeederPoint[]>([])
  const [shifts, setShifts] = useState<ShiftReport[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [users, setUsers] = useState<ApprovedUser[]>([])
  const [zones, setZones] = useState<Zone[]>([])
  const [wards, setWards] = useState<Ward[]>([])
  const [kothis, setKothis] = useState<Kothi[]>([])
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState(new Date())
  const [drillDownMetric, setDrillDownMetric] = useState<DrillDownMetric>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [alertsOpen, setAlertsOpen] = useState(false)
  const alertsAutoOpened = useRef(false)
  const itemsPerPage = 5
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const loadCount = useRef(0)

  async function safe<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
    try { return await fn() } catch (e) { console.error(`❌ ${label}:`, e); return fallback }
  }

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [zoneData, wardData, kothiData, teamData, userData] = await Promise.all([
        safe('Zones', fetchZones, []),
        safe('Wards', fetchWards, []),
        safe('Kothis', fetchKothis, []),
        safe('Teams', fetchTeams, []),
        safe('Users', fetchUsers, []),
      ])
      setZones(zoneData)
      setWards(wardData)
      setKothis(kothiData)
      setTeams(teamData)
      setUsers(userData)

      const [reportData, pointData, shiftData, pointRequests, freqRequests, accessRequests] = await Promise.all([
        safe('Reports', () => fetchComplianceReports({
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo,
          status: (filters.status as any) || undefined,
          pointType: (filters.pointType as any) || undefined,
          limitCount: 5000,
        }), []),
        safe('Points', () => fetchFeederPoints({
          type: (filters.pointType as any) || 'all',
          zoneId: filters.zoneId || undefined,
          wardId: filters.wardId || undefined,
          includeEliminated: true,
        }), []),
        safe('Shifts', () => fetchShiftReports({
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo,
        }), []),
        safe('PendingPointRequests', fetchPendingPointRequests, []),
        safe('PendingFreqRequests', fetchPendingFrequencyRequests, []),
        safe('PendingAccessRequests', fetchPendingAccessRequests, []),
      ])

      setReports(reportData)
      setPoints(pointData)
      setShifts(shiftData)

      const isAssignedPoint = (p: FeederPoint) =>
        !!(p.assignedTeamId || p.assignedUserId || (p as any).assignedUserIds?.length)
      const isUnassignedPoint = (p: FeederPoint) =>
        !p.assignedTeamId && !p.assignedUserId && !((p as any).assignedUserIds?.length)

      // Derive KPIs from already date-filtered data
      const derivedKpis: DashboardKPIs = {
        totalReports: reportData.length,
        pendingReports: reportData.filter(r => r.status === 'pending').length,
        approvedReports: reportData.filter(r => r.status === 'approved').length,
        rejectedReports: reportData.filter(r => r.status === 'rejected').length,
        requiresAction: reportData.filter(r => r.status === 'requires_action').length,
        actionTaken: reportData.filter(r => r.status === 'action_taken').length,

        totalFeederPoints: pointData.filter(p => (p.type ?? 'feeder') === 'feeder').length,
        activeFeederPoints: pointData.filter(p => (p.type ?? 'feeder') === 'feeder' && p.status === 'active').length,
        assignedFeederPoints: pointData.filter(p => (p.type ?? 'feeder') === 'feeder' && isAssignedPoint(p)).length,
        unassignedFeederPoints: pointData.filter(p => (p.type ?? 'feeder') === 'feeder' && isUnassignedPoint(p)).length,
        totalChronicPoints: pointData.filter(p => p.type === 'chronic').length,
        activeChronicPoints: pointData.filter(p => p.type === 'chronic' && p.status === 'active').length,
        assignedChronicPoints: pointData.filter(p => p.type === 'chronic' && isAssignedPoint(p)).length,
        unassignedChronicPoints: pointData.filter(p => p.type === 'chronic' && isUnassignedPoint(p)).length,
        eliminatedPoints: pointData.filter(p => p.isEliminated).length,
        unassignedPoints: pointData.filter(isUnassignedPoint).length,

        totalShiftReports: shiftData.length,
        completedShifts: shiftData.filter(s => s.status === 'completed').length,
        inProgressShifts: shiftData.filter(s => s.status === 'in_progress').length,

        // All-time fields — not date-filtered by nature
        totalUsers: userData.length,
        activeUsers: userData.filter((u: ApprovedUser) => u.isActive).length,
        inactiveUsers: userData.filter((u: ApprovedUser) => !u.isActive).length,
       adminUsers: userData.filter((u: ApprovedUser) => u.role === 'admin').length,
        qcUsers: userData.filter((u: ApprovedUser) => u.role === 'qc').length,
        taskForceUsers: userData.filter((u: ApprovedUser) => u.role === 'task_force_team').length,
        actionOfficerUsers: userData.filter((u: ApprovedUser) => u.role === 'pmc_member').length,
        commissionerUsers: userData.filter((u: ApprovedUser) => u.role === 'commissioner').length,
        pendingPointRequests: pointRequests.length,
        pendingFreqRequests: freqRequests.length,
        pendingAccessRequests: accessRequests.length,
        totalNotifications: 0,
        unreadNotifications: 0,
      }
      setKpis(derivedKpis)
      setLastRefresh(new Date())
      loadCount.current += 1

      if (loadCount.current > 1) {
        toast(`Refreshed · ${reportData.length} reports · ${pointData.length} points`, 'success')
      }
    } catch (err) {
      console.error('Dashboard load error:', err)
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => { loadData() }, [loadData])

  useEffect(() => {
    refreshTimer.current = setInterval(loadData, AUTO_REFRESH_MS)
    return () => { if (refreshTimer.current) clearInterval(refreshTimer.current) }
  }, [loadData])

  const trendData = useMemo(() => buildDailyTrend(reports, filters.dateFrom, filters.dateTo), [reports, filters.dateFrom, filters.dateTo])
  const statusData = useMemo(() => buildStatusBreakdown(reports), [reports])
  const checklistData = useMemo(() => buildChecklistFailures(reports).slice(0, 12), [reports])
  const slotData = useMemo(() => buildSlotPunctuality(shifts), [shifts])
  const teamLB = useMemo(() => buildTeamLeaderboard(reports).slice(0, 10), [reports])
  const totalInRange = useMemo(() => trendData.reduce((s, d) => s + d.count, 0), [trendData])
  const alerts = useMemo(() => kpis ? buildAlerts(reports, points, shifts, kpis, kpis.pendingPointRequests, kpis.pendingFreqRequests, kpis.pendingAccessRequests) : [], [kpis, reports, points, shifts])
  const topPerformers = useMemo(() => buildTopPerformers(reports, points, teams, users, zones, wards, kothis), [reports, points, teams, users, zones, wards, kothis])
  const trends = useMemo(() => kpis ? buildTrendArrows(reports, points, kpis) : {}, [reports, points, kpis])
  const dateRange = `${filters.dateFrom} → ${filters.dateTo}`

  useEffect(() => {
    if (!alertsAutoOpened.current && alerts.length > 0) {
      setAlertsOpen(true)
      alertsAutoOpened.current = true
    }
  }, [alerts])

  const feederOnly = useMemo(() => points.filter(p => (p.type ?? 'feeder') === 'feeder'), [points])
  const totalPages = Math.ceil(feederOnly.length / itemsPerPage)
  const pagedPoints = feederOnly.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)

  const handleExportExcel = () => {
    if (!kpis) return
    exportToExcel(prepareExportData(kpis, reports, points, shifts, teamLB, alerts, topPerformers), 'taskforce-dashboard-report')
  }
  const handleExportPDF = () => {
    if (!kpis) return
    exportToPDF({ kpis, alerts, teamLeaderboard: teamLB, topPerformers, dateRange, checklistFailures: checklistData, slotPunctuality: slotData })
  }

  const statusClass = (status: string) => {
    if (status === 'active') return {
      dot: 'bg-emerald-100', icon: 'text-emerald-600',
      badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
    }
    if (status === 'maintenance') return {
      dot: 'bg-amber-100', icon: 'text-amber-600',
      badge: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
    }
    return {
      dot: 'bg-red-100', icon: 'text-red-500',
      badge: 'bg-red-50 text-red-700 ring-1 ring-red-200',
    }
  }

  if (loading && !kpis) return <DashboardSkeleton dark={dark} />

  return (
    <>
      <div style={{ minHeight: '100vh' }}>
        <DashboardKeyframes />
         <KPIStyles />
        <style>{`@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap');`}</style>

       {/* ── Page meta bar ── */}
        <div
          className="flex items-center justify-between flex-wrap gap-3 mb-5 rounded-2xl px-5 py-3.5"
          style={{
            background: dark
              ? `linear-gradient(135deg, ${T.surface}, rgba(255,255,255,0.02))`
              : `linear-gradient(135deg, #ffffff, ${T.accentDim})`,
            border: `1px solid ${T.cardBorder}`,
            boxShadow: dark ? 'none' : '0 1px 3px rgba(0,0,0,0.04)',
          }}
        >
          <div className="flex items-center gap-2">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: T.green, animation: 'kpiPulseDot 1.8s ease-in-out infinite' }}
            />
            <p className="text-[11px] font-medium" style={{ color: T.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>
              Last updated {ago(lastRefresh)} · Auto-refresh 60s · {reports.length} reports in view
            </p>
          </div>

          <div className="flex items-center gap-2">
            {alerts.length > 0 && (
              <button
                onClick={() => setAlertsOpen(true)}
                className="relative flex items-center justify-center h-8 w-8 rounded-lg transition-all active:scale-95 hover:opacity-85"
                style={{ background: 'transparent', border: `1px solid ${T.cardBorder}`, color: T.textSecondary, cursor: 'pointer' }}
                aria-label={`${alerts.length} alerts`}
                title="View alerts"
              >
                <Bell className="h-3.5 w-3.5" />
                <span
                  className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold"
                  style={{ background: T.red, color: '#fff', boxShadow: `0 0 0 2px ${T.surface}` }}
                >
                  {alerts.length > 9 ? '9+' : alerts.length}
                </span>
              </button>
            )}
            <button
              onClick={handleExportExcel}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all active:scale-95 hover:opacity-85"
              style={{ background: 'transparent', border: `1px solid ${T.cardBorder}`, color: T.green, cursor: 'pointer' }}
            >
              <FileText className="h-3 w-3" /> Excel
            </button>
            <button
              onClick={handleExportPDF}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all active:scale-95 hover:opacity-85"
              style={{ background: 'transparent', border: `1px solid ${T.cardBorder}`, color: T.red, cursor: 'pointer' }}
            >
              <FileText className="h-3 w-3" /> PDF
            </button>
            <button
              onClick={loadData}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all active:scale-95 hover:opacity-85"
              style={{ background: 'transparent', border: `1px solid ${T.cardBorder}`, color: T.textSecondary, cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.5 : 1 }}
            >
              <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>
        </div>

        <GlobalFilterBar
          filters={filters}
          onChange={setFilters}
          zones={zones}
          wards={wards}
          dark={dark}
        />

        <div className="flex flex-col gap-5">

          {/* ── Alerts popup overlay ── */}
          {alertsOpen && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center px-4"
              style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)' }}
              onClick={() => setAlertsOpen(false)}
            >
              <div
                className="w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden"
                style={{ background: T.card, border: `1px solid ${T.cardBorder}`, maxHeight: '85vh', overflowY: 'auto' }}
                onClick={e => e.stopPropagation()}
              >
                {/* Modal header */}
                <div
                  className="flex items-center justify-between px-5 py-4 sticky top-0"
                  style={{ background: T.card, borderBottom: `1px solid ${T.cardBorder}` }}
                >
                  <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: T.textPrimary }}>
                    <span
                      className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold"
                      style={{ background: T.red, color: '#fff' }}
                    >
                      {alerts.length}
                    </span>
                    Active alerts
                  </h2>
                  <button
                    onClick={() => setAlertsOpen(false)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-sm font-bold transition hover:opacity-70"
                    style={{ background: T.surface, color: T.textSecondary, border: `1px solid ${T.cardBorder}`, cursor: 'pointer' }}
                  >
                    ✕
                  </button>
                </div>

                {/* Alerts list */}
                <div className="p-4">
                  <AlertsPanel alerts={alerts} dark={dark} />
                </div>
              </div>
            </div>
          )}

          {kpis && (
            <div className="flex flex-col gap-2">
              {/* Row 1 — Feeder & Chronic point assignment */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                <KPICard label="Total feeder points" value={kpis.totalFeederPoints} sub={`${kpis.activeFeederPoints} active`} accent={T.accent} dark={dark} delay={0} onClick={() => setDrillDownMetric('feederPoints')} />
                <KPICard label="Assigned feeder points" value={kpis.assignedFeederPoints} sub="Has team/user" accent={T.green} dark={dark} delay={60} onClick={() => setDrillDownMetric('assignedFeederPoints')} />
                <KPICard label="Unassigned feeder points" value={kpis.unassignedFeederPoints} sub="No team/user" accent={T.purple} urgent={kpis.unassignedFeederPoints > 0} dark={dark} delay={120} onClick={() => setDrillDownMetric('unassignedFeederPoints')} />
                <KPICard label="Total chronic points" value={kpis.totalChronicPoints} sub={`${kpis.activeChronicPoints} active`} accent={T.gold} dark={dark} delay={180} onClick={() => setDrillDownMetric('chronicPoints')} />
                <KPICard label="Assigned chronic points" value={kpis.assignedChronicPoints} sub="Has team/user" accent={T.green} dark={dark} delay={240} onClick={() => setDrillDownMetric('assignedChronicPoints')} />
                <KPICard label="Unassigned chronic points" value={kpis.unassignedChronicPoints} sub="No team/user" accent={T.purple} urgent={kpis.unassignedChronicPoints > 0} dark={dark} delay={300} onClick={() => setDrillDownMetric('unassignedChronicPoints')} />
              </div>

              {/* Row 2 — Feeder point reports */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                <KPICard label="Feeder points reports" value={kpis.totalReports} sub={`${totalInRange} in range · ${trendLabel(trends.totalReports)}`} accent={T.accent} dark={dark} delay={0} onClick={() => setDrillDownMetric('totalReports')} />
                <KPICard label="Pending review" value={kpis.pendingReports} sub={`Awaiting QC · ${trendLabel(trends.pendingReports)}`} accent={T.amber} urgent={kpis.pendingReports > 10} dark={dark} delay={60} onClick={() => setDrillDownMetric('pendingReports')} />
                <KPICard label="Approved feeder points report" value={kpis.approvedReports} sub={`Cleared · ${trendLabel(trends.approvedReports)}`} accent={T.green} dark={dark} delay={120} onClick={() => setDrillDownMetric('approvedReports')} />
                <KPICard label="Rejected points report" value={kpis.rejectedReports} sub={`${trendLabel(trends.rejectedReports)}`} accent={T.red} dark={dark} delay={180} onClick={() => setDrillDownMetric('rejectedReports')} />
                <KPICard label="Action required points report" value={kpis.requiresAction} sub="Flagged reports" accent={T.red} urgent={kpis.requiresAction > 0} dark={dark} delay={240} onClick={() => setDrillDownMetric('requiresAction')} />
                <KPICard label="Action taken" value={kpis.actionTaken} sub="Resolved flags" accent={dark ? '#70a1ff' : '#3b82f6'} dark={dark} delay={300} onClick={() => setDrillDownMetric('actionTaken')} />
              </div>

              {/* Row 3 — Users & roles */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                <KPICard label="Active users" value={kpis.activeUsers} sub={`of ${kpis.totalUsers} total`} accent={T.green} dark={dark} delay={0} onClick={() => setDrillDownMetric('activeUsers')} />
                <KPICard label="Inactive users" value={kpis.inactiveUsers} sub={`of ${kpis.totalUsers} total`} accent={T.red} dark={dark} delay={60} onClick={() => setDrillDownMetric('inactiveUsers')} />
                <KPICard label="Total admin" value={kpis.adminUsers} sub="Admin role" accent={T.purple} dark={dark} delay={120} onClick={() => setDrillDownMetric('adminUsers')} />
                <KPICard label="Total QC" value={kpis.qcUsers} sub="QC role" accent={T.accent} dark={dark} delay={180} onClick={() => setDrillDownMetric('qcUsers')} />
                <KPICard label="Total action officer" value={kpis.actionOfficerUsers} sub="Action officer role" accent={T.amber} dark={dark} delay={240} onClick={() => setDrillDownMetric('actionOfficerUsers')} />
                <KPICard label="Total taskforce members" value={kpis.taskForceUsers} sub="Taskforce role" accent={T.gold} dark={dark} delay={300} onClick={() => setDrillDownMetric('taskForceUsers')} />
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-3">
            <ComplianceTrendChart
              data={trendData}
              totalInRange={totalInRange}
              dateRange={dateRange}
              dark={dark}
              feederCount={kpis?.totalFeederPoints}
              chronicCount={kpis?.totalChronicPoints}
              onExport={() => exportToCSV(
                trendData.map(d => ({ Date: d.date, Total: d.count, Approved: d.approved, Rejected: d.rejected, Pending: d.pending, 'Requires Action': d.requiresAction })),
                'compliance-trend'
              )}
            />
            <StatusDonutChart data={statusData} dark={dark} />
          </div>
          <HeatmapCalendar
            complianceReports={reports}
            shiftReports={shifts}
            dark={dark}
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <ChecklistHeatmap data={checklistData} dark={dark} onExport={() => exportToCSV(checklistData.map(c => ({ Question: c.label, Total: c.total, Failed: c.failed, Rate: `${c.rate}%` })), 'checklist-failures')} />
            <ShiftPunctualityCard data={slotData} dark={dark} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <TeamLeaderboard data={teamLB} dark={dark} onExport={() => exportToCSV(teamLB.map((t, i) => ({ Rank: i + 1, Team: t.teamName, Reports: t.total, Approved: t.approved, Rate: `${t.approvalRate}%` })), 'team-leaderboard')} />
            <TeamWorkloadChart reports={reports} teams={teams} dark={dark} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <ResponseTimeAnalytics reports={reports} dark={dark} />
            <OverdueTracker points={points} reports={reports} dark={dark} />
          </div>

          <PointsOverview points={points} dark={dark} />
          <TopPerformersGrid data={topPerformers} dark={dark} />
          <ComparisonEngine dark={dark} reports={reports} points={points} teams={teams} users={users} zones={zones} wards={wards} />
          <RequestsPipeline pendingPR={kpis?.pendingPointRequests ?? 0} pendingFR={kpis?.pendingFreqRequests ?? 0} pendingAR={kpis?.pendingAccessRequests ?? 0} dark={dark} />
          {/* <FeederPointInsights T={T} /> */}

          {/* ── Quick Actions ── */}
          <div className="rounded-2xl p-5" style={{ background: T.card, border: `1px solid ${T.cardBorder}` }}>
            <h2 className="text-sm font-semibold mb-4" style={{ color: T.textPrimary }}>Quick actions</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: 'View all users', href: '/users', icon: Users },
                { label: 'Report review', href: '/report-review', icon: FileText },
                { label: 'Feeder points', href: '/feeder-points', icon: MapPin },
                { label: 'Chronic points', href: '/chronic-points', icon: Zap },
              ].map(action => (
                <Link
                  key={action.label}
                  href={action.href}
                  className="flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition hover:opacity-80 active:scale-[0.97]"
                  style={{ background: T.accentDim, color: T.accent, border: `1px solid ${T.accentBorder}` }}
                >
                  <action.icon className="h-4 w-4" strokeWidth={1.8} />
                  {action.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="text-center py-3" style={{ borderTop: `1px solid ${T.cardBorder}` }}>
            <p className="text-[10px]" style={{ color: T.textMuted, fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.04em' }}>
              READ ONLY · ALL DATA FROM FIREBASE · AUTO-REFRESH 60S · {new Date().getFullYear()} TASKFORCE ADMIN
            </p>
          </div>

        </div>

      </div>
      {drillDownMetric && kpis && (
        <DrillDownModal metric={drillDownMetric} onClose={() => setDrillDownMetric(null)} dark={dark} kpis={kpis} reports={reports} points={points} shifts={shifts} users={users} teams={teams} />
      )}
    </>
  )
}

export default function AdminDashboard() {
  const { theme } = useTheme()
  return (
    <ToastProvider dark={theme === 'dark'}>
      <DashboardInner />
    </ToastProvider>
  )
}