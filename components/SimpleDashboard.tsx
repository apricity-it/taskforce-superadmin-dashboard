import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import Link from 'next/link'
import {
  fetchComplianceReports, fetchFeederPoints, fetchShiftReports,
  fetchUsers, fetchTeams, fetchZones, fetchWards, fetchKothis,
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
  DashboardKeyframes, FilterBar, KPICard,
  AlertsPanel, ComplianceTrendChart, StatusDonutChart, ChecklistHeatmap,
  ShiftPunctualityCard, TeamLeaderboard, TopPerformersGrid, RequestsPipeline,
  PointsOverview, DrillDownModal, ComparisonEngine,
  HeatmapCalendar, ResponseTimeAnalytics, OverdueTracker,
  TeamWorkloadChart, DashboardSkeleton, ToastProvider, useToast,
  type DashboardFilters, type DrillDownMetric,
} from '@/components/dashboard'
import {
  FileText, MapPin, Users, Zap, ChevronRight, CheckCircle, Settings, RefreshCw,
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

const emptyKpis: DashboardKPIs = {
  totalReports: 0, pendingReports: 0, approvedReports: 0, rejectedReports: 0,
  requiresAction: 0, actionTaken: 0, totalFeederPoints: 0, activeFeederPoints: 0,
  totalChronicPoints: 0, activeChronicPoints: 0, eliminatedPoints: 0, unassignedPoints: 0,
  totalShiftReports: 0, completedShifts: 0, inProgressShifts: 0,
  totalUsers: 0, activeUsers: 0, adminUsers: 0, qcUsers: 0, taskForceUsers: 0, commissionerUsers: 0,
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
  const itemsPerPage = 5
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const loadCount = useRef(0)

  async function safe<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
    try { return await fn() } catch (e) { console.error(`❌ ${label}:`, e); return fallback }
  }

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [zoneData, wardData, kothiData, teamData, userData, kpiData] = await Promise.all([
        safe('Zones', fetchZones, []),
        safe('Wards', fetchWards, []),
        safe('Kothis', fetchKothis, []),
        safe('Teams', fetchTeams, []),
        safe('Users', fetchUsers, []),
        safe('KPIs', buildDashboardKPIs, emptyKpis),
      ])
      setZones(zoneData)
      setWards(wardData)
      setKothis(kothiData)
      setTeams(teamData)
      setUsers(userData)
      setKpis(kpiData)

      const [reportData, pointData, shiftData] = await Promise.all([
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
      ])

      setReports(reportData)
      setPoints(pointData)
      setShifts(shiftData)
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
    <div style={{ minHeight: '100vh' }}>
      <DashboardKeyframes />
      <style>{`@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap');`}</style>

      {/* ── Page meta bar (replaces DashboardHeader) ── */}
      <div
        className="flex items-center justify-between flex-wrap gap-2 mb-5 rounded-xl px-4 py-3"
        style={{ background: T.surface, border: `1px solid ${T.cardBorder}` }}
      >
        <p className="text-[11px] font-medium" style={{ color: T.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>
          Last updated {ago(lastRefresh)} · Auto-refresh 60s · {reports.length} reports in view
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all active:scale-95"
            style={{ background: 'transparent', border: `1px solid ${T.cardBorder}`, color: T.green, cursor: 'pointer' }}
          >
            <FileText className="h-3 w-3" /> Excel
          </button>
          <button
            onClick={handleExportPDF}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all active:scale-95"
            style={{ background: 'transparent', border: `1px solid ${T.cardBorder}`, color: T.red, cursor: 'pointer' }}
          >
            <FileText className="h-3 w-3" /> PDF
          </button>
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all active:scale-95"
            style={{ background: 'transparent', border: `1px solid ${T.cardBorder}`, color: T.textSecondary, cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.5 : 1 }}
          >
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      <FilterBar filters={filters} onChange={setFilters} zones={zones} wards={wards} dark={dark} />

      <div className="flex flex-col gap-5">
        <AlertsPanel alerts={alerts} dark={dark} />

        {kpis && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            <KPICard label="Total reports" value={kpis.totalReports} sub={`${totalInRange} in range · ${trendLabel(trends.totalReports)}`} accent={T.accent} dark={dark} delay={0} onClick={() => setDrillDownMetric('totalReports')} />
            <KPICard label="Pending review" value={kpis.pendingReports} sub={`Awaiting QC · ${trendLabel(trends.pendingReports)}`} accent={T.amber} urgent={kpis.pendingReports > 10} dark={dark} delay={60} onClick={() => setDrillDownMetric('pendingReports')} />
            <KPICard label="Requires action" value={kpis.requiresAction} sub="Flagged reports" accent={T.red} urgent={kpis.requiresAction > 0} dark={dark} delay={120} onClick={() => setDrillDownMetric('requiresAction')} />
            <KPICard label="Approved" value={kpis.approvedReports} sub={`Cleared · ${trendLabel(trends.approvedReports)}`} accent={T.green} dark={dark} delay={180} onClick={() => setDrillDownMetric('approvedReports')} />
            <KPICard label="Action taken" value={kpis.actionTaken} sub="Resolved flags" accent={dark ? '#70a1ff' : '#3b82f6'} dark={dark} delay={240} onClick={() => setDrillDownMetric('actionTaken')} />
            <KPICard label="Feeder points" value={kpis.totalFeederPoints} sub={`${kpis.activeFeederPoints} active`} accent={T.accent} dark={dark} delay={300} onClick={() => setDrillDownMetric('feederPoints')} />
            <KPICard label="Chronic points" value={kpis.totalChronicPoints} sub={`${kpis.activeChronicPoints} active`} accent={T.gold} dark={dark} delay={360} onClick={() => setDrillDownMetric('chronicPoints')} />
            <KPICard label="Shift reports" value={kpis.totalShiftReports} sub={`${kpis.completedShifts} completed`} accent={T.purple} dark={dark} delay={420} onClick={() => setDrillDownMetric('shiftReports')} />
            <KPICard label="Active users" value={kpis.activeUsers} sub={`of ${kpis.totalUsers} total`} accent={T.green} dark={dark} delay={480} onClick={() => setDrillDownMetric('activeUsers')} />
            <KPICard label="Pending requests" value={kpis.pendingPointRequests + kpis.pendingFreqRequests + kpis.pendingAccessRequests} sub="Points + freq + access" accent={T.amber} urgent dark={dark} delay={540} onClick={() => setDrillDownMetric('pendingRequests')} />
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
        <HeatmapCalendar reports={reports} dark={dark} />

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

        {/* ── Feeder Points ── */}
        <div
          className="rounded-2xl p-5"
          style={{ background: T.card, border: `1px solid ${T.cardBorder}` }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: T.textPrimary }}>
              <div className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: T.accentDim }}>
                <MapPin className="h-4 w-4" style={{ color: T.accent }} strokeWidth={1.8} />
              </div>
              Feeder points overview
            </h2>
            <Link
              href="/feeder-points"
              className="flex items-center gap-1 text-xs font-semibold rounded-full px-3 py-1 transition hover:opacity-80"
              style={{ color: T.accent, background: T.accentDim, border: `1px solid ${T.accentBorder}` }}
            >
              View all <ChevronRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Total feeder', value: feederOnly.length, icon: Zap, color: T.accent },
                { label: 'Active', value: feederOnly.filter(p => p.status === 'active').length, icon: CheckCircle, color: T.green },
                { label: 'Maintenance', value: feederOnly.filter(p => p.status === 'maintenance').length, icon: Settings, color: T.amber },
                { label: 'Assigned', value: feederOnly.filter(p => p.assignedUserId || p.assignedTeamId).length, icon: Users, color: T.purple },
              ].map(item => (
                <div
                  key={item.label}
                  className="rounded-xl p-4 flex items-center gap-3"
                  style={{ background: T.surface, border: `1px solid ${T.cardBorder}` }}
                >
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg" style={{ background: T.accentDim }}>
                    <item.icon className="h-4 w-4" style={{ color: item.color }} strokeWidth={1.8} />
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: T.textSecondary }}>{item.label}</p>
                    <p className="text-xl font-semibold leading-none mt-0.5" style={{ color: T.textPrimary, fontFamily: "'JetBrains Mono', monospace" }}>{item.value}</p>
                  </div>
                </div>
              ))}
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-3" style={{ color: T.textPrimary }}>Recent feeder points</h3>
              <div className="space-y-2">
                {pagedPoints.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10" style={{ color: T.textMuted }}>
                    <Zap className="h-10 w-10 mb-2 opacity-30" />
                    <p className="text-sm">No feeder points yet</p>
                  </div>
                ) : pagedPoints.map((fp, index) => {
                  const sc = statusClass(fp.status)
                  return (
                    <div
                      key={fp.id || index}
                      className="flex items-center gap-3 p-3 rounded-xl transition"
                      style={{ background: T.surface, border: `1px solid ${T.cardBorder}` }}
                    >
                      <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${sc.dot}`}>
                        <Zap className={`h-3.5 w-3.5 ${sc.icon}`} strokeWidth={1.8} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate" style={{ color: T.textPrimary }}>
                          {fp.name || `Feeder Point ${(currentPage - 1) * itemsPerPage + index + 1}`}
                        </p>
                        <div className="flex items-center gap-1 mt-0.5">
                          <MapPin className="h-2.5 w-2.5 flex-shrink-0" style={{ color: T.textMuted }} />
                          <span className="text-[10px] truncate" style={{ color: T.textMuted }}>
                            {fp.location?.address || 'No location'}
                          </span>
                        </div>
                      </div>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${sc.badge}`}>
                        {fp.status}
                      </span>
                    </div>
                  )
                })}
              </div>

              {feederOnly.length > itemsPerPage && (
                <div className="flex items-center justify-between mt-4">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg transition disabled:opacity-30"
                    style={{ border: `1px solid ${T.cardBorder}`, color: T.textSecondary, background: 'transparent', cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}
                  >
                    ← Prev
                  </button>
                  <span className="text-xs" style={{ color: T.textMuted }}>Page {currentPage} of {totalPages}</span>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg transition disabled:opacity-30"
                    style={{ border: `1px solid ${T.cardBorder}`, color: T.textSecondary, background: 'transparent', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer' }}
                  >
                    Next →
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

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

      {drillDownMetric && kpis && (
        <DrillDownModal metric={drillDownMetric} onClose={() => setDrillDownMetric(null)} dark={dark} kpis={kpis} reports={reports} points={points} shifts={shifts} users={users} teams={teams} />
      )}
    </div>
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


//theme dashboard new

// import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
// import {
//   fetchComplianceReports, fetchFeederPoints, fetchShiftReports,
//   fetchUsers, fetchTeams, fetchZones, fetchWards, fetchKothis,
//   fetchPendingPointRequests, fetchPendingFrequencyRequests, fetchPendingAccessRequests,
//   buildDashboardKPIs, buildDailyTrend, buildStatusBreakdown, buildChecklistFailures,
//   buildSlotPunctuality, buildTeamLeaderboard, buildAlerts, buildTopPerformers, prepareExportData,
//   toISO,
//   type DashboardKPIs, type ComplianceReport, type FeederPoint, type ShiftReport,
//   type Team, type ApprovedUser, type Zone, type Ward, type Kothi,
// } from '@/lib/dashboardQueries'
// import { exportToExcel, exportToCSV, exportToPDF } from '@/lib/dashboardExport'
// import { buildTrendArrows, trendLabel } from '@/lib/dashboardQueryHelpers'
// import { getTokens } from '@/lib/dashboardTheme'
// import {
//   DashboardKeyframes, DashboardHeader, FilterBar, KPICard,
//   AlertsPanel, ComplianceTrendChart, StatusDonutChart, ChecklistHeatmap,
//   ShiftPunctualityCard, TeamLeaderboard, TopPerformersGrid, RequestsPipeline,
//   PointsOverview, DrillDownModal, ComparisonEngine,
//   HeatmapCalendar, ResponseTimeAnalytics, OverdueTracker,
//   TeamWorkloadChart, DashboardSkeleton, ToastProvider, useToast,
//   type DashboardFilters, type DrillDownMetric,
// } from '@/components/dashboard'
// import {
//   FileText,
//   MapPin,
//   Users,
//   Zap,
//   ChevronRight,
//   CheckCircle,
//   Settings,
// } from 'lucide-react'

// const AUTO_REFRESH_MS = 60_000
// function daysAgo(n: number) { return toISO(new Date(Date.now() - n * 86400000)) }
// function todayISO() { return toISO(new Date()) }

// function DashboardInner() {
//   const [dark, setDark] = useState(false)
//   const { toast } = useToast()
//   const [filters, setFilters] = useState<DashboardFilters>({
//     dateFrom: daysAgo(29), dateTo: todayISO(), zoneId: '', wardId: '', status: '', pointType: '',
//   })
//   const [kpis, setKpis] = useState<DashboardKPIs | null>(null)
//   const [reports, setReports] = useState<ComplianceReport[]>([])
//   const [points, setPoints] = useState<FeederPoint[]>([])
//   const [shifts, setShifts] = useState<ShiftReport[]>([])
//   const [teams, setTeams] = useState<Team[]>([])
//   const [users, setUsers] = useState<ApprovedUser[]>([])
//   const [zones, setZones] = useState<Zone[]>([])
//   const [wards, setWards] = useState<Ward[]>([])
//   const [kothis, setKothis] = useState<Kothi[]>([])
//   const [pendingPR, setPendingPR] = useState(0)
//   const [pendingFR, setPendingFR] = useState(0)
//   const [pendingAR, setPendingAR] = useState(0)
//   const [loading, setLoading] = useState(true)
//   const [lastRefresh, setLastRefresh] = useState(new Date())
//   const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null)
//   const [drillDownMetric, setDrillDownMetric] = useState<DrillDownMetric>(null)
//   const [currentPage, setCurrentPage] = useState(1)
//   const itemsPerPage = 5
//   const isFirstLoad = useRef(true)

//   async function safe<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
//     try { const r = await fn(); return r } catch (e) { console.error(`❌ ${label}:`, e); return fallback }
//   }

//   const emptyKpis: DashboardKPIs = {
//     totalReports: 0, pendingReports: 0, approvedReports: 0, rejectedReports: 0,
//     requiresAction: 0, actionTaken: 0, totalFeederPoints: 0, activeFeederPoints: 0,
//     totalChronicPoints: 0, activeChronicPoints: 0, eliminatedPoints: 0, unassignedPoints: 0,
//     totalShiftReports: 0, completedShifts: 0, inProgressShifts: 0,
//     totalUsers: 0, activeUsers: 0, adminUsers: 0, qcUsers: 0, taskForceUsers: 0, commissionerUsers: 0,
//     pendingPointRequests: 0, pendingFreqRequests: 0, pendingAccessRequests: 0,
//     totalNotifications: 0, unreadNotifications: 0,
//   }

//   const loadData = useCallback(async () => {
//     setLoading(true)
//     try {
//       const [zoneData, wardData, kothiData, teamData, userData, kpiData] = await Promise.all([
//         safe('Zones', fetchZones, []), safe('Wards', fetchWards, []), safe('Kothis', fetchKothis, []),
//         safe('Teams', fetchTeams, []), safe('Users', fetchUsers, []),
//         safe('KPIs', buildDashboardKPIs, emptyKpis),
//       ])
//       setZones(zoneData); setWards(wardData); setKothis(kothiData)
//       setTeams(teamData); setUsers(userData); setKpis(kpiData)

//       const [reportData, pointData, shiftData, prData, frData, arData] = await Promise.all([
//         safe('Reports', () => fetchComplianceReports({ dateFrom: filters.dateFrom, dateTo: filters.dateTo, status: (filters.status as any) || undefined, limitCount: 5000 }), []),
//         safe('Points', () => fetchFeederPoints({ type: (filters.pointType as any) || 'all', zoneId: filters.zoneId || undefined, wardId: filters.wardId || undefined, includeEliminated: true }), []),
//         safe('Shifts', () => fetchShiftReports({ dateFrom: filters.dateFrom, dateTo: filters.dateTo }), []),
//         safe('PendingPR', fetchPendingPointRequests, []),
//         safe('PendingFR', fetchPendingFrequencyRequests, []),
//         safe('PendingAR', fetchPendingAccessRequests, []),
//       ])

//       let filtered = reportData
//       if (filters.pointType) filtered = reportData.filter(r => (r.feederPointType ?? 'feeder') === filters.pointType)

//       setReports(filtered); setPoints(pointData); setShifts(shiftData)
//       setPendingPR(prData.length); setPendingFR(frData.length); setPendingAR(arData.length)
//       setLastRefresh(new Date())

//       if (!isFirstLoad.current) {
//         toast(`Updated ${filtered.length} reports · ${pointData.length} points · ${shiftData.length} shifts`, 'success')
//       }
//       isFirstLoad.current = false
//     } catch (err) { console.error('Dashboard load error:', err) }
//     finally { setLoading(false) }
//   }, [filters])

//   useEffect(() => { loadData() }, [loadData])
//   useEffect(() => {
//     refreshTimer.current = setInterval(loadData, AUTO_REFRESH_MS)
//     return () => { if (refreshTimer.current) clearInterval(refreshTimer.current) }
//   }, [loadData])

//   const trendData = useMemo(() => buildDailyTrend(reports, filters.dateFrom, filters.dateTo), [reports, filters.dateFrom, filters.dateTo])
//   const statusData = useMemo(() => buildStatusBreakdown(reports), [reports])
//   const checklistData = useMemo(() => buildChecklistFailures(reports).slice(0, 12), [reports])
//   const slotData = useMemo(() => buildSlotPunctuality(shifts), [shifts])
//   const teamLB = useMemo(() => buildTeamLeaderboard(reports).slice(0, 10), [reports])
//   const totalInRange = useMemo(() => trendData.reduce((s, d) => s + d.count, 0), [trendData])
//   const alerts = useMemo(() => kpis ? buildAlerts(reports, points, shifts, kpis, pendingPR, pendingFR, pendingAR) : [], [kpis, reports, points, shifts, pendingPR, pendingFR, pendingAR])
//   const topPerformers = useMemo(() => buildTopPerformers(reports, points, teams, users, zones, wards, kothis), [reports, points, teams, users, zones, wards, kothis])
//   const trends = useMemo(() => kpis ? buildTrendArrows(reports, points, kpis) : {}, [reports, points, kpis])
//   const dateRange = `${filters.dateFrom} → ${filters.dateTo}`
//   const T = getTokens(dark)
//   // Feeder points alias
//   const feederPoints = points

//   // Status styles
//   const statusClass = (status: string) => {
//     if (status === 'active') {
//       return {
//         dot: 'bg-emerald-100',
//         icon: 'text-emerald-600',
//         badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
//       }
//     }

//     if (status === 'maintenance') {
//       return {
//         dot: 'bg-amber-100',
//         icon: 'text-amber-600',
//         badge: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
//       }
//     }

//     return {
//       dot: 'bg-red-100',
//       icon: 'text-red-500',
//       badge: 'bg-red-50 text-red-700 ring-1 ring-red-200',
//     }
//   }

//   // Pagination
//   const totalPages = Math.ceil(feederPoints.length / itemsPerPage)

//   const pagedPoints = feederPoints.slice(
//     (currentPage - 1) * itemsPerPage,
//     currentPage * itemsPerPage
//   )

//   const handleExportExcel = () => { if (!kpis) return; exportToExcel(prepareExportData(kpis, reports, points, shifts, teamLB, alerts, topPerformers), 'taskforce-dashboard-report') }
//   const handleExportPDF = () => { if (!kpis) return; exportToPDF({ kpis, alerts, teamLeaderboard: teamLB, topPerformers, dateRange, checklistFailures: checklistData, slotPunctuality: slotData }) }

//   if (loading && !kpis) return <DashboardSkeleton dark={dark} />

//   return (
//     <div style={{ minHeight: '100vh' }}>
//       <DashboardKeyframes />
//       <style>{`@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap');`}</style>

//       <DashboardHeader dark={dark} onToggleTheme={() => setDark(d => !d)} onRefresh={loadData} loading={loading} lastRefresh={lastRefresh} />
//       <FilterBar filters={filters} onChange={setFilters} zones={zones} wards={wards} dark={dark} onExportAll={handleExportExcel} />

//       <div className="flex gap-2 mb-4 justify-end">
//         <button onClick={handleExportExcel} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all active:scale-95" style={{ background: dark ? T.surface : '#f8f7f5', border: `1px solid ${T.cardBorder}`, color: T.green, cursor: 'pointer' }}>
//           <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>Export Excel
//         </button>
//         <button onClick={handleExportPDF} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all active:scale-95" style={{ background: dark ? T.surface : '#f8f7f5', border: `1px solid ${T.cardBorder}`, color: T.red, cursor: 'pointer' }}>
//           <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>Export PDF
//         </button>
//       </div>

//       <div className="flex flex-col gap-5">
//         <AlertsPanel alerts={alerts} dark={dark} />

//         {/* KPIs with trend arrows — mobile: 2-col */}
//         {kpis && (
//           <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
//             <KPICard label="Total reports" value={kpis.totalReports} sub={`${totalInRange} in range · ${trendLabel(trends.totalReports)}`} accent={T.accent} dark={dark} delay={0} onClick={() => setDrillDownMetric('totalReports')} />
//             <KPICard label="Pending review" value={kpis.pendingReports} sub={`Awaiting QC · ${trendLabel(trends.pendingReports)}`} accent={T.amber} urgent={kpis.pendingReports > 10} dark={dark} delay={60} onClick={() => setDrillDownMetric('pendingReports')} />
//             <KPICard label="Requires action" value={kpis.requiresAction} sub="Flagged reports" accent={T.red} urgent={kpis.requiresAction > 0} dark={dark} delay={120} onClick={() => setDrillDownMetric('requiresAction')} />
//             <KPICard label="Approved" value={kpis.approvedReports} sub={`Cleared · ${trendLabel(trends.approvedReports)}`} accent={T.green} dark={dark} delay={180} onClick={() => setDrillDownMetric('approvedReports')} />
//             <KPICard label="Action taken" value={kpis.actionTaken} sub="Resolved flags" accent={dark ? '#70a1ff' : '#3b82f6'} dark={dark} delay={240} onClick={() => setDrillDownMetric('actionTaken')} />
//             <KPICard label="Feeder points" value={kpis.totalFeederPoints} sub={`${kpis.activeFeederPoints} active`} accent={T.accent} dark={dark} delay={300} onClick={() => setDrillDownMetric('feederPoints')} />
//             <KPICard label="Chronic points" value={kpis.totalChronicPoints} sub={`${kpis.activeChronicPoints} active`} accent={T.gold} dark={dark} delay={360} onClick={() => setDrillDownMetric('chronicPoints')} />
//             <KPICard label="Shift reports" value={kpis.totalShiftReports} sub={`${kpis.completedShifts} completed`} accent={T.purple} dark={dark} delay={420} onClick={() => setDrillDownMetric('shiftReports')} />
//             <KPICard label="Active users" value={kpis.activeUsers} sub={`of ${kpis.totalUsers} total`} accent={T.green} dark={dark} delay={480} onClick={() => setDrillDownMetric('activeUsers')} />
//             <KPICard label="Pending requests" value={kpis.pendingPointRequests + kpis.pendingFreqRequests + kpis.pendingAccessRequests} sub="Points + freq + access" accent={T.amber} urgent dark={dark} delay={540} onClick={() => setDrillDownMetric('pendingRequests')} />
//           </div>
//         )}

//         {/* Compliance trend + Status donut */}
//         <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-3">
//           <ComplianceTrendChart data={trendData} totalInRange={totalInRange} dateRange={dateRange} dark={dark} onExport={() => exportToCSV(trendData.map(d => ({ Date: d.date, Total: d.count, Approved: d.approved, Rejected: d.rejected, Pending: d.pending })), 'compliance-trend')} />
//           <StatusDonutChart data={statusData} dark={dark} />
//         </div>

//         {/* Heatmap calendar */}
//         <HeatmapCalendar reports={reports} dark={dark} />

//         {/* Checklist + Shift punctuality */}
//         <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
//           <ChecklistHeatmap data={checklistData} dark={dark} onExport={() => exportToCSV(checklistData.map(c => ({ Question: c.label, Total: c.total, Failed: c.failed, Rate: `${c.rate}%` })), 'checklist-failures')} />
//           <ShiftPunctualityCard data={slotData} dark={dark} />
//         </div>

//         {/* Team leaderboard + Team workload */}
//         <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
//           <TeamLeaderboard data={teamLB} dark={dark} onExport={() => exportToCSV(teamLB.map((t, i) => ({ Rank: i + 1, Team: t.teamName, Reports: t.total, Approved: t.approved, Rate: `${t.approvalRate}%` })), 'team-leaderboard')} />
//           <TeamWorkloadChart reports={reports} teams={teams} dark={dark} />
//         </div>

//         {/* Response time + Overdue tracker */}
//         <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
//           <ResponseTimeAnalytics reports={reports} dark={dark} />
//           <OverdueTracker points={points} reports={reports} dark={dark} />
//         </div>

//         {/* Points overview */}
//         <PointsOverview points={points} dark={dark} />

//         {/* Top performers */}
//         <TopPerformersGrid data={topPerformers} dark={dark} />

//         {/* Comparison engine */}
//         <ComparisonEngine dark={dark} reports={reports} points={points} teams={teams} users={users} zones={zones} wards={wards} />

//         {/* Requests pipeline */}
//         <RequestsPipeline pendingPR={pendingPR} pendingFR={pendingFR} pendingAR={pendingAR} dark={dark} />

//         <div className="text-center py-3" style={{ borderTop: `1px solid ${T.cardBorder}` }}>
//           <p className="text-[10px]" style={{ color: T.textMuted, fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.04em', margin: 0 }}>
//             READ ONLY · ALL DATA FROM FIREBASE · AUTO-REFRESH 60S · {new Date().getFullYear()} TASKFORCE ADMIN
//           </p>
//         </div>
//       </div>
//       {/* ── Feeder Points ────────────────────────────────────────────────── */}
//       <div className="rounded-2xl bg-white border border-slate-100 p-5 shadow-sm">
//         <div className="flex items-center justify-between mb-4">
//           <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
//             <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50">
//               <MapPin className="h-4 w-4 text-blue-600" strokeWidth={1.8} />
//             </div>
//             Feeder points overview
//           </h2>
//           <a
//             href="/feeder-points"
//             className="flex items-center gap-1 text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-100 rounded-full px-3 py-1 hover:bg-blue-100 transition"
//           >
//             View all <ChevronRight className="h-3 w-3" />
//           </a>
//         </div>

//         <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
//           {/* Mini stats */}
//           <div className="grid grid-cols-2 gap-3">
//             {[
//               {
//                 label: 'Total points',
//                 value: feederPoints.filter((fp: FeederPoint) => (fp.type ?? 'feeder') === 'feeder').length,
//                 bg: '#EFF6FF', iconBg: '#DBEAFE', iconColor: '#1D4ED8',
//                 labelColor: '#1E40AF', valueColor: '#1E3A8A',
//                 icon: Zap,
//               },
//               {
//                 label: 'Active',
//                 value: feederPoints.filter((fp: FeederPoint) => (fp.type ?? 'feeder') === 'feeder' && fp.status === 'active').length,
//                 bg: '#ECFDF5', iconBg: '#D1FAE5', iconColor: '#065F46',
//                 labelColor: '#047857', valueColor: '#064E3B',
//                 icon: CheckCircle,
//               },
//               {
//                 label: 'Maintenance',
//                 value: feederPoints.filter((fp: FeederPoint) => (fp.type ?? 'feeder') === 'feeder' && fp.status === 'maintenance').length,
//                 bg: '#FFF7ED', iconBg: '#FFEDD5', iconColor: '#C2410C',
//                 labelColor: '#9A3412', valueColor: '#431407',
//                 icon: Settings,
//               },
//               {
//                 label: 'Assigned',
//                 value: feederPoints.filter((fp: FeederPoint) => (fp.type ?? 'feeder') === 'feeder' && (fp.assignedUserId || fp.assignedTeamId)).length,
//                 bg: '#F5F3FF', iconBg: '#EDE9FE', iconColor: '#6D28D9',
//                 labelColor: '#5B21B6', valueColor: '#3B0764',
//                 icon: Users,
//               },
//             ].map((item) => (
//               <div
//                 key={item.label}
//                 className="rounded-xl p-4 flex items-center gap-3"
//                 style={{ background: item.bg }}
//               >
//                 <div
//                   className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg"
//                   style={{ background: item.iconBg }}
//                 >
//                   <item.icon className="h-4 w-4" style={{ color: item.iconColor }} strokeWidth={1.8} />
//                 </div>
//                 <div>
//                   <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: item.labelColor }}>
//                     {item.label}
//                   </p>
//                   <p className="text-xl font-semibold leading-none mt-0.5" style={{ color: item.valueColor }}>
//                     {item.value}
//                   </p>
//                 </div>
//               </div>
//             ))}
//           </div>

//           {/* Paginated list */}
//           <div>
//             <h3 className="text-sm font-semibold text-slate-700 mb-3">Recent feeder points</h3>
//             <div className="space-y-2">
//               {pagedPoints.length === 0 ? (
//                 <div className="flex flex-col items-center justify-center py-10 text-slate-400">
//                   <Zap className="h-10 w-10 mb-2 opacity-30" />
//                   <p className="text-sm">No feeder points yet</p>
//                 </div>
//               ) : (
//                 pagedPoints.map((fp: FeederPoint, index: number) => {
//                   const sc = statusClass(fp.status)
//                   return (
//                     <div
//                       key={fp.id || index}
//                       className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100 hover:border-slate-200 transition"
//                     >
//                       <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${sc.dot}`}>
//                         <Zap className={`h-3.5 w-3.5 ${sc.icon}`} strokeWidth={1.8} />
//                       </div>
//                       <div className="flex-1 min-w-0">
//                         <p className="text-xs font-semibold text-slate-800 truncate">
//                           {fp.name || `Feeder Point ${(currentPage - 1) * itemsPerPage + index + 1}`}
//                         </p>
//                         <div className="flex items-center gap-1 mt-0.5">
//                           <MapPin className="h-2.5 w-2.5 text-slate-400 flex-shrink-0" />
//                           <span className="text-[10px] text-slate-400 truncate">
//                             {fp.location?.address || 'No location'}
//                           </span>
//                         </div>
//                       </div>
//                       <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${sc.badge}`}>
//                         {fp.status}
//                       </span>
//                     </div>
//                   )
//                 })
//               )}
//             </div>

//             {feederPoints.length > itemsPerPage && (
//               <div className="flex items-center justify-between mt-4">
//                 <button
//                   onClick={() => setCurrentPage((p: number) => Math.max(1, p - 1))}
//                   disabled={currentPage === 1}
//                   className="text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition"
//                 >
//                   ← Prev
//                 </button>
//                 <span className="text-xs text-slate-400">
//                   Page {currentPage} of {totalPages}
//                 </span>
//                 <button
//                   onClick={() => setCurrentPage((p: number) => Math.min(totalPages, p + 1))}
//                   disabled={currentPage === totalPages}
//                   className="text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition"
//                 >
//                   Next →
//                 </button>
//               </div>
//             )}
//           </div>
//         </div>
//       </div>

//       {/* ── Quick Actions ─────────────────────────────────────────────────── */}
//       <div className="rounded-2xl bg-white border border-slate-100 p-5 shadow-sm">
//         <h2 className="text-base font-semibold text-slate-800 mb-4">Quick actions</h2>
//         <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
//           {[
//             {
//               label: 'View all users',
//               href: '/users',
//               bg: '#1E3A8A', text: '#EFF6FF',
//               icon: Users,
//             },
//             {
//               label: 'Report review',
//               href: '/report-review',
//               bg: '#3B0764', text: '#F5F3FF',
//               icon: FileText,
//             },
//             {
//               label: 'Feeder points',
//               href: '/feeder-points',
//               bg: '#0C4A6E', text: '#ECFEFF',
//               icon: MapPin,
//             },
//             {
//               label: 'Chronic points',
//               href: '/chronic-points',
//               bg: '#431407', text: '#FFF7ED',
//               icon: Zap,
//             },
//           ].map((action) => (
//             <a
//               key={action.label}
//               href={action.href}
//               className="flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition hover:opacity-90 active:scale-[0.97]"
//               style={{ background: action.bg, color: action.text }}
//             >
//               <action.icon className="h-4 w-4" strokeWidth={1.8} />
//               {action.label}
//             </a>
//           ))}
//         </div>
//       </div>

//       {drillDownMetric && kpis && (
//         <DrillDownModal metric={drillDownMetric} onClose={() => setDrillDownMetric(null)} dark={dark} kpis={kpis} reports={reports} points={points} shifts={shifts} users={users} teams={teams} />
//       )}
//     </div>
//   )
// }

// export default function AdminDashboard() {
//   const [dark, setDark] = useState(false)
//   return (
//     <ToastProvider dark={dark}>
//       <DashboardInner />
//     </ToastProvider>
//   )
// }

// old dashboard

// import { useEffect, useState } from 'react'
// import {
//   Users,
//   UserCheck,
//   MessageSquare,
//   Shield,
//   Activity,
//   TrendingUp,
//   CheckCircle,
//   Zap,
//   MapPin,
//   Settings,
//   RefreshCw,
//   Clock,
//   FileText,
//   ChevronRight,
// } from 'lucide-react'
// import { DataService, DashboardStats, ComplianceReport } from '@/lib/dataService'
// import { ReportsLineChart } from '@/components/charts/ReportsLineChart'

// interface ReportsTrendPoint {
//   day: string
//   submissions: number
// }

// const formatISODate = (date: Date) => date.toISOString().slice(0, 10)

// const utcDateFormatter = new Intl.DateTimeFormat(undefined, {
//   month: 'short',
//   day: 'numeric',
//   timeZone: 'UTC',
// })

// const normalizeDateKey = (value: any): string | null => {
//   if (!value) return null
//   if (typeof value === 'string') return value.slice(0, 10)
//   if (value instanceof Date) return formatISODate(value)
//   if (typeof value === 'object') {
//     if (typeof value.toDate === 'function') return formatISODate(value.toDate())
//     if (typeof value.seconds === 'number') return formatISODate(new Date(value.seconds * 1000))
//   }
//   return null
// }

// const buildReportsTrend = (
//   reports: ComplianceReport[],
//   startKey: string,
//   endKey: string
// ): ReportsTrendPoint[] => {
//   if (!startKey || !endKey || startKey > endKey) return []

//   const startDate = new Date(`${startKey}T00:00:00Z`)
//   const endDate = new Date(`${endKey}T00:00:00Z`)
//   if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return []

//   const dayKeys: string[] = []
//   const cursor = new Date(startDate)
//   while (cursor <= endDate) {
//     dayKeys.push(formatISODate(cursor))
//     cursor.setUTCDate(cursor.getUTCDate() + 1)
//   }

//   const counts = dayKeys.reduce<Record<string, number>>((acc, day) => {
//     acc[day] = 0
//     return acc
//   }, {})

//   reports.forEach(report => {
//     const key = normalizeDateKey(report.submittedAt ?? report.createdAt)
//     if (key && counts[key] !== undefined) counts[key] += 1
//   })

//   return dayKeys.map(day => ({
//     day: utcDateFormatter.format(new Date(`${day}T00:00:00Z`)),
//     submissions: counts[day],
//   }))
// }

// // ─── Stat card colour tokens ──────────────────────────────────────────────────
// const CARD_THEMES = [
//   {
//     bg: '#EFF6FF',
//     border: '#BFDBFE',
//     iconBg: '#DBEAFE',
//     iconColor: '#1D4ED8',
//     stripe: 'linear-gradient(90deg,#3B82F6,#06B6D4)',
//     labelColor: '#1E40AF',
//     valueColor: '#1E3A8A',
//     subColor: '#3B82F6',
//   },
//   {
//     bg: '#F5F3FF',
//     border: '#DDD6FE',
//     iconBg: '#EDE9FE',
//     iconColor: '#6D28D9',
//     stripe: 'linear-gradient(90deg,#7C3AED,#A78BFA)',
//     labelColor: '#5B21B6',
//     valueColor: '#3B0764',
//     subColor: '#7C3AED',
//   },
//   {
//     bg: '#ECFDF5',
//     border: '#A7F3D0',
//     iconBg: '#D1FAE5',
//     iconColor: '#065F46',
//     stripe: 'linear-gradient(90deg,#10B981,#34D399)',
//     labelColor: '#047857',
//     valueColor: '#064E3B',
//     subColor: '#10B981',
//   },
//   {
//     bg: '#EEF2FF',
//     border: '#C7D2FE',
//     iconBg: '#E0E7FF',
//     iconColor: '#4338CA',
//     stripe: 'linear-gradient(90deg,#6366F1,#818CF8)',
//     labelColor: '#3730A3',
//     valueColor: '#1E1B4B',
//     subColor: '#6366F1',
//   },
//   {
//     bg: '#FFF1F2',
//     border: '#FECDD3',
//     iconBg: '#FFE4E6',
//     iconColor: '#BE123C',
//     stripe: 'linear-gradient(90deg,#F43F5E,#FB7185)',
//     labelColor: '#9F1239',
//     valueColor: '#4C0519',
//     subColor: '#F43F5E',
//   },
//   {
//     bg: '#ECFEFF',
//     border: '#A5F3FC',
//     iconBg: '#CFFAFE',
//     iconColor: '#0E7490',
//     stripe: 'linear-gradient(90deg,#06B6D4,#22D3EE)',
//     labelColor: '#0C4A6E',
//     valueColor: '#083344',
//     subColor: '#06B6D4',
//   },
//   {
//     bg: '#FFF7ED',
//     border: '#FED7AA',
//     iconBg: '#FFEDD5',
//     iconColor: '#C2410C',
//     stripe: 'linear-gradient(90deg,#F97316,#FBBF24)',
//     labelColor: '#9A3412',
//     valueColor: '#431407',
//     subColor: '#F97316',
//   },
//   {
//     bg: '#F5F3FF',
//     border: '#C4B5FD',
//     iconBg: '#EDE9FE',
//     iconColor: '#7C3AED',
//     stripe: 'linear-gradient(90deg,#8B5CF6,#C4B5FD)',
//     labelColor: '#5B21B6',
//     valueColor: '#2E1065',
//     subColor: '#8B5CF6',
//   },
//   {
//     bg: '#F0FDF4',
//     border: '#BBF7D0',
//     iconBg: '#DCFCE7',
//     iconColor: '#15803D',
//     stripe: 'linear-gradient(90deg,#22C55E,#86EFAC)',
//     labelColor: '#166534',
//     valueColor: '#14532D',
//     subColor: '#22C55E',
//   },
//   {
//     bg: '#FFF7ED',
//     border: '#FDBA74',
//     iconBg: '#FED7AA',
//     iconColor: '#EA580C',
//     stripe: 'linear-gradient(90deg,#EA580C,#FB923C)',
//     labelColor: '#C2410C',
//     valueColor: '#7C2D12',
//     subColor: '#EA580C',
//   },
// ] as const

// export default function SimpleDashboard() {
//   const [stats, setStats] = useState<DashboardStats | null>(null)
//   const [feederPoints, setFeederPoints] = useState<any[]>([])
//   const [allReports, setAllReports] = useState<ComplianceReport[]>([])
//   const [reportTrendData, setReportTrendData] = useState<ReportsTrendPoint[]>([])
//   const [rangeStart, setRangeStart] = useState('')
//   const [rangeEnd, setRangeEnd] = useState('')
//   const [loading, setLoading] = useState(true)
//   const [currentPage, setCurrentPage] = useState(1)
//   const itemsPerPage = 5

//   useEffect(() => {
//     loadDashboardData()
//   }, [])

//   const loadDashboardData = async () => {
//     setLoading(true)
//     try {
//       const [statsData, feederPointsData, complianceReports] = await Promise.all([
//         DataService.getDashboardStats(),
//         DataService.getAllFeederPoints(),
//         DataService.getAllComplianceReports(),
//       ])
//       setStats(statsData)
//       setFeederPoints(feederPointsData)
//       setAllReports(complianceReports)

//       if (!rangeStart || !rangeEnd) {
//         const defaultEnd = new Date()
//         const defaultStart = new Date(defaultEnd)
//         defaultStart.setDate(defaultEnd.getDate() - 6)
//         setRangeStart(formatISODate(defaultStart))
//         setRangeEnd(formatISODate(defaultEnd))
//       }
//     } catch (error) {
//       console.error('Error loading dashboard data:', error)
//       setAllReports([])
//     } finally {
//       setLoading(false)
//     }
//   }

//   useEffect(() => {
//     if (!rangeStart || !rangeEnd || rangeStart > rangeEnd) {
//       setReportTrendData([])
//       return
//     }
//     setReportTrendData(buildReportsTrend(allReports, rangeStart, rangeEnd))
//   }, [allReports, rangeStart, rangeEnd])

//   if (loading) {
//     return (
//       <div className="flex items-center justify-center h-screen bg-slate-50">
//         <div className="flex flex-col items-center gap-3">
//           <div className="w-12 h-12 border-4 border-blue-100 border-t-blue-500 rounded-full animate-spin" />
//           <p className="text-sm text-slate-400 font-medium">Loading dashboard…</p>
//         </div>
//       </div>
//     )
//   }

//   // ─── Stat cards (10 cards, 5 per row) ────────────────────────────────────
//   const statCards = [
//     {
//       title: 'Total Users',
//       value: stats?.totalUsers ?? 0,
//       icon: Users,
//       sub: `${stats?.activeUsers ?? 0} active`,
//       theme: CARD_THEMES[0],
//       href: '/users',
//     },
//     {
//       title: 'Admin Users',
//       value: stats?.adminUsers ?? 0,
//       icon: Shield,
//       sub: `${stats?.activeAdmins ?? 0} active`,
//       theme: CARD_THEMES[1],
//       href: '/users',
//     },
//     {
//       title: 'Task Force Team',
//       value: stats?.taskForceUsers ?? 0,
//       icon: Activity,
//       sub: `${stats?.activeTaskForce ?? 0} active`,
//       theme: CARD_THEMES[2],
//       href: '/users',
//     },
//     {
//       title: 'Commissioners',
//       value: stats?.commissionerUsers ?? 0,
//       icon: UserCheck,
//       sub: `${stats?.activeCommissioners ?? 0} active`,
//       theme: CARD_THEMES[3],
//       href: '/users',
//     },
//     {
//       title: 'Pending Requests',
//       value: stats?.pendingRequests ?? 0,
//       icon: Clock,
//       sub: 'Awaiting approval',
//       theme: CARD_THEMES[4],
//       href: '/access-requests',
//     },
//     {
//       title: 'Total Reports',
//       value: stats?.totalComplaints ?? 0,
//       icon: MessageSquare,
//       sub: 'Compliance reports',
//       theme: CARD_THEMES[5],
//       href: '/report-review',
//     },
//     {
//       title: 'Feeder Points',
//       value: stats?.totalFeederPoints ?? 0,
//       icon: MapPin,
//       sub: 'Standard monitoring',
//       theme: CARD_THEMES[6],
//       href: '/feeder-points',
//     },
//     {
//       title: 'Chronic Points',
//       value: stats?.totalChronicPoints ?? 0,
//       icon: Zap,
//       sub: 'Advanced monitored',
//       theme: CARD_THEMES[7],
//       href: '/chronic-points',
//     },
//     {
//       title: 'Shift Reports',
//       value: stats?.totalShiftReports ?? 0,
//       icon: FileText,
//       sub: 'Chronic submissions',
//       theme: CARD_THEMES[8],
//       href: '/report-review',
//     },
//     {
//       title: 'Eliminated Points',
//       value: stats?.totalEliminatedPoints ?? 0,
//       icon: CheckCircle,
//       sub: 'Converted / eliminated',
//       theme: CARD_THEMES[9],
//       href: '/chronic-points',
//     },
//   ]

//   // ─── Derived values ───────────────────────────────────────────────────────
//   const totalReportsInRange = reportTrendData.reduce((t, d) => t + d.submissions, 0)
//   const chronicPoints = feederPoints.filter(fp => fp.type === 'chronic')
//   const chronicComplianceReports = allReports.filter(
//     r => (r.feederPointType ?? 'feeder') === 'chronic'
//   ).length
//   const chronicShiftCompletion =
//     stats?.totalShiftReports && stats.totalShiftReports > 0
//       ? Math.round((chronicComplianceReports / stats.totalShiftReports) * 100)
//       : 0

//   const invalidRange = rangeStart && rangeEnd && rangeStart > rangeEnd
//   const rangeLabel =
//     rangeStart && rangeEnd && !invalidRange
//       ? `${utcDateFormatter.format(new Date(`${rangeStart}T00:00:00Z`))} → ${utcDateFormatter.format(new Date(`${rangeEnd}T00:00:00Z`))}`
//       : undefined

//   const statusClass = (status: string) => {
//     if (status === 'active') return { dot: 'bg-emerald-100', icon: 'text-emerald-600', badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' }
//     if (status === 'maintenance') return { dot: 'bg-amber-100', icon: 'text-amber-600', badge: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' }
//     return { dot: 'bg-red-100', icon: 'text-red-500', badge: 'bg-red-50 text-red-700 ring-1 ring-red-200' }
//   }

//   const totalPages = Math.ceil(feederPoints.length / itemsPerPage)
//   const pagedPoints = feederPoints.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)

//   return (
//     <div className="space-y-6 pb-8">

//       {/* ── Hero ─────────────────────────────────────────────────────────── */}
//       <div
//         className="relative overflow-hidden rounded-2xl p-7 text-white"
//         style={{ background: 'linear-gradient(135deg,#1e3a5f 0%,#1e1b4b 55%,#1a1a2e 100%)' }}
//       >
//         {/* Decorative orbs */}
//         <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-blue-500 opacity-20" />
//         <div className="pointer-events-none absolute right-24 -bottom-20 h-44 w-44 rounded-full bg-indigo-500 opacity-15" />
//         <div className="pointer-events-none absolute left-1/3 -top-8 h-28 w-28 rounded-full bg-cyan-400 opacity-10" />

//         <div className="relative z-10 flex items-center justify-between">
//           <div>
//             <h1 className="text-2xl font-semibold tracking-tight mb-1">
//               Taskforce Command Center
//             </h1>
//             <p className="text-sm opacity-70 tracking-wide">
//               Real-time monitoring and management of your entire Taskforce ecosystem
//             </p>
//           </div>
//           <button
//             onClick={loadDashboardData}
//             className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white/90 backdrop-blur-sm transition hover:bg-white/20 active:scale-95"
//           >
//             <RefreshCw className="h-4 w-4" />
//             Refresh
//           </button>
//         </div>
//       </div>

//       {/* ── Stat Grid (5 × 2) ────────────────────────────────────────────── */}
//       <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
//         {statCards.map((card) => {
//           const t = card.theme
//           return (
//             <a
//               key={card.title}
//               href={card.href}
//               className="group relative overflow-hidden rounded-2xl transition-transform hover:-translate-y-1 active:scale-[0.98] focus:outline-none"
//               style={{ background: t.bg, border: `1px solid ${t.border}` }}
//             >
//               <div className="p-4 pb-5">
//                 {/* Label + icon row */}
//                 <div className="flex items-start justify-between mb-3">
//                   <p
//                     className="text-[10px] font-semibold uppercase tracking-widest leading-tight"
//                     style={{ color: t.labelColor }}
//                   >
//                     {card.title}
//                   </p>
//                   <div
//                     className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg"
//                     style={{ background: t.iconBg }}
//                   >
//                     <card.icon
//                       className="h-4 w-4"
//                       style={{ color: t.iconColor }}
//                       strokeWidth={1.8}
//                     />
//                   </div>
//                 </div>

//                 {/* Value */}
//                 <p
//                   className="text-3xl font-semibold leading-none mb-1 tracking-tight"
//                   style={{ color: t.valueColor }}
//                 >
//                   {card.value.toLocaleString()}
//                 </p>

//                 {/* Sub */}
//                 <p className="text-[11px] font-medium" style={{ color: t.subColor }}>
//                   {card.sub}
//                 </p>
//               </div>

//               {/* Bottom stripe */}
//               <div
//                 className="absolute bottom-0 left-0 right-0 h-[3px]"
//                 style={{ background: t.stripe }}
//               />

//               {/* Hover chevron */}
//               <ChevronRight
//                 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 opacity-0 transition-opacity group-hover:opacity-40"
//                 style={{ color: t.iconColor }}
//               />
//             </a>
//           )
//         })}
//       </div>

//       {/* ── Compliance Trend ─────────────────────────────────────────────── */}
//       <div className="rounded-2xl bg-white border border-slate-100 p-5 shadow-sm">
//         <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-1">
//           <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
//             <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50">
//               <TrendingUp className="h-4 w-4 text-blue-600" strokeWidth={1.8} />
//             </div>
//             Compliance activity trend
//           </h2>

//           <div className="flex flex-col sm:flex-row sm:items-center gap-2">
//             <div className="flex items-center gap-2">
//               <label htmlFor="rangeStart" className="text-xs font-medium text-slate-500">From</label>
//               <input
//                 id="rangeStart"
//                 type="date"
//                 value={rangeStart}
//                 max={rangeEnd || undefined}
//                 onChange={e => setRangeStart(e.target.value)}
//                 className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
//               />
//             </div>
//             <div className="flex items-center gap-2">
//               <label htmlFor="rangeEnd" className="text-xs font-medium text-slate-500">To</label>
//               <input
//                 id="rangeEnd"
//                 type="date"
//                 value={rangeEnd}
//                 min={rangeStart || undefined}
//                 onChange={e => setRangeEnd(e.target.value)}
//                 className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
//               />
//             </div>
//             <span className="text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-100 rounded-full px-3 py-1 whitespace-nowrap">
//               {totalReportsInRange} {totalReportsInRange === 1 ? 'report' : 'reports'}
//             </span>
//           </div>
//         </div>

//         {rangeLabel && (
//           <p className="text-[10px] text-slate-400 mb-4">Showing activity for {rangeLabel}</p>
//         )}
//         {invalidRange && (
//           <p className="text-xs text-red-500 mb-4">Start date must be before end date.</p>
//         )}
//         {!invalidRange && reportTrendData.length > 0 && (
//           <ReportsLineChart data={reportTrendData} />
//         )}
//         {!invalidRange && reportTrendData.length === 0 && (
//           <div className="flex items-center justify-center h-32 text-sm text-slate-400">
//             No compliance activity recorded for this date range.
//           </div>
//         )}
//       </div>

//       {/* ── Chronic Points ───────────────────────────────────────────────── */}
//       <div className="rounded-2xl bg-white border border-slate-100 p-5 shadow-sm">
//         <div className="flex items-center justify-between mb-4">
//           <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
//             <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-50">
//               <Zap className="h-4 w-4 text-orange-500" strokeWidth={1.8} />
//             </div>
//             Chronic points overview
//           </h2>
//           <a
//             href="/chronic-points"
//             className="flex items-center gap-1 text-xs font-semibold text-orange-600 bg-orange-50 border border-orange-100 rounded-full px-3 py-1 hover:bg-orange-100 transition"
//           >
//             View all <ChevronRight className="h-3 w-3" />
//           </a>
//         </div>

//         <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
//           {[
//             {
//               label: 'Total chronic',
//               value: chronicPoints.length,
//               bg: '#FFF7ED', iconBg: '#FED7AA', iconColor: '#C2410C',
//               labelColor: '#9A3412', valueColor: '#431407',
//               icon: Zap,
//             },
//             {
//               label: 'Shift reports',
//               value: stats?.totalShiftReports ?? 0,
//               bg: '#ECFEFF', iconBg: '#CFFAFE', iconColor: '#0E7490',
//               labelColor: '#0C4A6E', valueColor: '#083344',
//               icon: Activity,
//             },
//             {
//               label: 'Compliance reports',
//               value: chronicComplianceReports,
//               bg: '#F5F3FF', iconBg: '#EDE9FE', iconColor: '#6D28D9',
//               labelColor: '#5B21B6', valueColor: '#3B0764',
//               icon: CheckCircle,
//             },
//             {
//               label: 'Shift efficiency',
//               value: `${chronicShiftCompletion}%`,
//               bg: '#ECFDF5', iconBg: '#D1FAE5', iconColor: '#065F46',
//               labelColor: '#047857', valueColor: '#064E3B',
//               icon: TrendingUp,
//             },
//           ].map((item) => (
//             <div
//               key={item.label}
//               className="rounded-xl p-4 flex items-center gap-3"
//               style={{ background: item.bg }}
//             >
//               <div
//                 className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
//                 style={{ background: item.iconBg }}
//               >
//                 <item.icon className="h-5 w-5" style={{ color: item.iconColor }} strokeWidth={1.8} />
//               </div>
//               <div>
//                 <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: item.labelColor }}>
//                   {item.label}
//                 </p>
//                 <p className="text-2xl font-semibold leading-none mt-0.5" style={{ color: item.valueColor }}>
//                   {item.value}
//                 </p>
//               </div>
//             </div>
//           ))}
//         </div>
//       </div>

//       {/* ── Feeder Points ────────────────────────────────────────────────── */}
//       <div className="rounded-2xl bg-white border border-slate-100 p-5 shadow-sm">
//         <div className="flex items-center justify-between mb-4">
//           <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
//             <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50">
//               <MapPin className="h-4 w-4 text-blue-600" strokeWidth={1.8} />
//             </div>
//             Feeder points overview
//           </h2>
//           <a
//             href="/feeder-points"
//             className="flex items-center gap-1 text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-100 rounded-full px-3 py-1 hover:bg-blue-100 transition"
//           >
//             View all <ChevronRight className="h-3 w-3" />
//           </a>
//         </div>

//         <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
//           {/* Mini stats */}
//           <div className="grid grid-cols-2 gap-3">
//             {[
//               {
//                 label: 'Total points',
//                 value: feederPoints.filter(fp => (fp.type ?? 'feeder') === 'feeder').length,
//                 bg: '#EFF6FF', iconBg: '#DBEAFE', iconColor: '#1D4ED8',
//                 labelColor: '#1E40AF', valueColor: '#1E3A8A',
//                 icon: Zap,
//               },
//               {
//                 label: 'Active',
//                 value: feederPoints.filter(fp => (fp.type ?? 'feeder') === 'feeder' && fp.status === 'active').length,
//                 bg: '#ECFDF5', iconBg: '#D1FAE5', iconColor: '#065F46',
//                 labelColor: '#047857', valueColor: '#064E3B',
//                 icon: CheckCircle,
//               },
//               {
//                 label: 'Maintenance',
//                 value: feederPoints.filter(fp => (fp.type ?? 'feeder') === 'feeder' && fp.status === 'maintenance').length,
//                 bg: '#FFF7ED', iconBg: '#FFEDD5', iconColor: '#C2410C',
//                 labelColor: '#9A3412', valueColor: '#431407',
//                 icon: Settings,
//               },
//               {
//                 label: 'Assigned',
//                 value: feederPoints.filter(fp => (fp.type ?? 'feeder') === 'feeder' && (fp.assignedUserId || fp.assignedTeamId)).length,
//                 bg: '#F5F3FF', iconBg: '#EDE9FE', iconColor: '#6D28D9',
//                 labelColor: '#5B21B6', valueColor: '#3B0764',
//                 icon: Users,
//               },
//             ].map((item) => (
//               <div
//                 key={item.label}
//                 className="rounded-xl p-4 flex items-center gap-3"
//                 style={{ background: item.bg }}
//               >
//                 <div
//                   className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg"
//                   style={{ background: item.iconBg }}
//                 >
//                   <item.icon className="h-4 w-4" style={{ color: item.iconColor }} strokeWidth={1.8} />
//                 </div>
//                 <div>
//                   <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: item.labelColor }}>
//                     {item.label}
//                   </p>
//                   <p className="text-xl font-semibold leading-none mt-0.5" style={{ color: item.valueColor }}>
//                     {item.value}
//                   </p>
//                 </div>
//               </div>
//             ))}
//           </div>

//           {/* Paginated list */}
//           <div>
//             <h3 className="text-sm font-semibold text-slate-700 mb-3">Recent feeder points</h3>
//             <div className="space-y-2">
//               {pagedPoints.length === 0 ? (
//                 <div className="flex flex-col items-center justify-center py-10 text-slate-400">
//                   <Zap className="h-10 w-10 mb-2 opacity-30" />
//                   <p className="text-sm">No feeder points yet</p>
//                 </div>
//               ) : (
//                 pagedPoints.map((fp, index) => {
//                   const sc = statusClass(fp.status)
//                   return (
//                     <div
//                       key={fp.id || index}
//                       className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100 hover:border-slate-200 transition"
//                     >
//                       <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${sc.dot}`}>
//                         <Zap className={`h-3.5 w-3.5 ${sc.icon}`} strokeWidth={1.8} />
//                       </div>
//                       <div className="flex-1 min-w-0">
//                         <p className="text-xs font-semibold text-slate-800 truncate">
//                           {fp.name || `Feeder Point ${(currentPage - 1) * itemsPerPage + index + 1}`}
//                         </p>
//                         <div className="flex items-center gap-1 mt-0.5">
//                           <MapPin className="h-2.5 w-2.5 text-slate-400 flex-shrink-0" />
//                           <span className="text-[10px] text-slate-400 truncate">
//                             {fp.location?.address || 'No location'}
//                           </span>
//                         </div>
//                       </div>
//                       <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${sc.badge}`}>
//                         {fp.status}
//                       </span>
//                     </div>
//                   )
//                 })
//               )}
//             </div>

//             {feederPoints.length > itemsPerPage && (
//               <div className="flex items-center justify-between mt-4">
//                 <button
//                   onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
//                   disabled={currentPage === 1}
//                   className="text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition"
//                 >
//                   ← Prev
//                 </button>
//                 <span className="text-xs text-slate-400">
//                   Page {currentPage} of {totalPages}
//                 </span>
//                 <button
//                   onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
//                   disabled={currentPage === totalPages}
//                   className="text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition"
//                 >
//                   Next →
//                 </button>
//               </div>
//             )}
//           </div>
//         </div>
//       </div>

//       {/* ── Quick Actions ─────────────────────────────────────────────────── */}
//       <div className="rounded-2xl bg-white border border-slate-100 p-5 shadow-sm">
//         <h2 className="text-base font-semibold text-slate-800 mb-4">Quick actions</h2>
//         <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
//           {[
//             {
//               label: 'View all users',
//               href: '/users',
//               bg: '#1E3A8A', text: '#EFF6FF',
//               icon: Users,
//             },
//             {
//               label: 'Report review',
//               href: '/report-review',
//               bg: '#3B0764', text: '#F5F3FF',
//               icon: FileText,
//             },
//             {
//               label: 'Feeder points',
//               href: '/feeder-points',
//               bg: '#0C4A6E', text: '#ECFEFF',
//               icon: MapPin,
//             },
//             {
//               label: 'Chronic points',
//               href: '/chronic-points',
//               bg: '#431407', text: '#FFF7ED',
//               icon: Zap,
//             },
//           ].map((action) => (
//             <a
//               key={action.label}
//               href={action.href}
//               className="flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition hover:opacity-90 active:scale-[0.97]"
//               style={{ background: action.bg, color: action.text }}
//             >
//               <action.icon className="h-4 w-4" strokeWidth={1.8} />
//               {action.label}
//             </a>
//           ))}
//         </div>
//       </div>

//     </div>
//   )
// }