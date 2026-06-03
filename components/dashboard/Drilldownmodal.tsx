import { useState, useEffect, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import { getTokens, getStatusColor } from '@/lib/dashboardTheme'
import { AnimatedNumber, MiniBar, ExportButton } from './DashboardUI'
import { exportToCSV } from '@/lib/dashboardExport'
import type {
  DashboardKPIs, ComplianceReport, FeederPoint, ShiftReport,
  ApprovedUser, Team,
} from '@/lib/dashboardQueries'

export type DrillDownMetric =
  | 'totalReports' | 'pendingReports' | 'requiresAction'
  | 'approvedReports' | 'actionTaken'
  | 'feederPoints' | 'chronicPoints' | 'shiftReports'
  | 'activeUsers' | 'pendingRequests'
  | null

interface DrillDownModalProps {
  metric: DrillDownMetric
  onClose: () => void
  dark: boolean
  kpis: DashboardKPIs
  reports: ComplianceReport[]
  points: FeederPoint[]
  shifts: ShiftReport[]
  users: ApprovedUser[]
  teams: Team[]
}

function ChartTooltip({ active, payload, label, dark }: any) {
  if (!active || !payload?.length) return null
  const T = getTokens(dark)
  return (
    <div style={{
      background: dark ? '#1a2030' : '#fff',
      border: `1px solid ${T.cardBorder}`,
      borderRadius: 8, padding: '10px 14px',
      fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: T.textPrimary,
      boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
    }}>
      <p style={{ margin: '0 0 4px', color: T.textSecondary }}>{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ margin: '2px 0', color: p.color }}>
          {p.name ?? p.dataKey}: <strong>{p.value?.toLocaleString()}</strong>
        </p>
      ))}
    </div>
  )
}

export function DrillDownModal({
  metric, onClose, dark, kpis, reports, points, shifts, users, teams,
}: DrillDownModalProps) {
  const T = getTokens(dark)
  const [tab, setTab] = useState<'overview' | 'data'>('overview')

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Reset tab when metric changes
  useEffect(() => { setTab('overview') }, [metric])

  const content = useMemo(() => {
    if (!metric) return null

    switch (metric) {
      case 'totalReports':
      case 'pendingReports':
      case 'requiresAction':
      case 'approvedReports':
      case 'actionTaken': {
        const statusFilter = {
          totalReports: null,
          pendingReports: 'pending',
          requiresAction: 'requires_action',
          approvedReports: 'approved',
          actionTaken: 'action_taken',
        }[metric]

        const filtered = statusFilter
          ? reports.filter(r => r.status === statusFilter)
          : reports

        const titles: Record<string, string> = {
          totalReports: 'Total Reports',
          pendingReports: 'Pending Reports',
          requiresAction: 'Requires Action',
          approvedReports: 'Approved Reports',
          actionTaken: 'Action Taken',
        }

        const byTeam: Record<string, number> = {}
        filtered.forEach(r => {
          const tn = r.teamName || 'Unknown'
          byTeam[tn] = (byTeam[tn] || 0) + 1
        })
        const teamChart = Object.entries(byTeam)
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value).slice(0, 10)

        const byPoint: Record<string, number> = {}
        filtered.forEach(r => {
          const pn = r.feederPointName || 'Unknown'
          byPoint[pn] = (byPoint[pn] || 0) + 1
        })
        const pointChart = Object.entries(byPoint)
          .map(([name, value]) => ({ name: name.length > 20 ? name.slice(0, 18) + '…' : name, value }))
          .sort((a, b) => b.value - a.value).slice(0, 10)

        // Trip number breakdown
        const trip1 = filtered.filter(r => r.tripNumber === 1).length
        const trip2 = filtered.filter(r => r.tripNumber === 2).length
        const trip3 = filtered.filter(r => r.tripNumber === 3).length
        const tripChart = [
          { name: 'Trip 1', value: trip1 },
          { name: 'Trip 2', value: trip2 },
          { name: 'Trip 3', value: trip3 },
        ].filter(t => t.value > 0)

        // Feeder vs chronic split
        const feederReports  = filtered.filter(r => (r.feederPointType ?? 'feeder') === 'feeder').length
        const chronicReports = filtered.filter(r => r.feederPointType === 'chronic').length

        const statusBreakdown = !statusFilter ? [
          { status: 'approved',        count: kpis.approvedReports, color: T.green  },
          { status: 'pending',         count: kpis.pendingReports,  color: T.amber  },
          { status: 'rejected',        count: kpis.rejectedReports, color: T.red    },
          { status: 'requires action', count: kpis.requiresAction,  color: dark ? '#ff6b81' : '#e74c3c' },
          { status: 'action taken',    count: kpis.actionTaken,     color: dark ? '#70a1ff' : '#3b82f6' },
        ] : null

        const distances = filtered
          .map(r => r.distanceFromFeederPoint)
          .filter((d): d is number => d != null && d > 0)
        const avgDist  = distances.length > 0 ? Math.round(distances.reduce((a, b) => a + b, 0) / distances.length) : 0
        const maxDist  = distances.length > 0 ? Math.round(Math.max(...distances)) : 0
        const over100m = distances.filter(d => d > 100).length

        return {
          title: titles[metric] || metric,
          mainValue: filtered.length,
          accent: statusFilter ? getStatusColor(statusFilter, dark) : T.accent,
          subMetrics: [
            { label: 'Feeder reports',   value: feederReports,              color: T.accent  },
            { label: 'Chronic reports',  value: chronicReports,             color: T.gold    },
            { label: 'Trip 1',           value: trip1,                      color: T.green   },
            { label: 'Trip 2',           value: trip2,                      color: T.amber   },
            { label: 'Trip 3',           value: trip3,                      color: T.purple  },
            { label: 'Avg distance',     value: `${avgDist}m`,              color: T.textSecondary },
            { label: 'GPS anomalies',    value: over100m,                   color: T.red     },
            { label: 'Unique points',    value: Object.keys(byPoint).length, color: T.accent },
          ],
          charts: [
            { title: 'By team (top 10)',         data: teamChart,  color: T.accent  },
            { title: 'By feeder point (top 10)', data: pointChart, color: T.purple  },
            { title: 'By trip number',           data: tripChart,  color: T.gold    },
          ],
          statusBreakdown,
          tableData: filtered.slice(0, 100).map(r => ({
            ID:       r.id.slice(0, 8),
            Status:   r.status,
            Type:     r.feederPointType ?? 'feeder',
            Point:    r.feederPointName || '—',
            Team:     r.teamName || '—',
            User:     r.userName || '—',
            Trip:     r.tripNumber ?? '—',
            'Dist(m)': r.distanceFromFeederPoint?.toFixed(0) || '—',
            Date:     r.tripDate || '—',
          })),
          exportData: filtered.map(r => ({
            ID: r.id, Status: r.status, Type: r.feederPointType ?? 'feeder',
            Point: r.feederPointName, Team: r.teamName, User: r.userName,
            Trip: r.tripNumber, Distance: r.distanceFromFeederPoint, Date: r.tripDate,
          })),
          exportName: `reports-${statusFilter || 'all'}`,
        }
      }

      case 'feederPoints':
      case 'chronicPoints': {
        const type = metric === 'feederPoints' ? 'feeder' : 'chronic'
        const filtered = points.filter(p => (p.type ?? 'feeder') === type)

        const active      = filtered.filter(p => p.status === 'active' && !p.isEliminated).length
        const maintenance = filtered.filter(p => p.status === 'maintenance' && !p.isEliminated).length
        const eliminated  = filtered.filter(p => p.isEliminated).length
        const inactive    = filtered.filter(p => p.status === 'inactive' && !p.isEliminated).length
        const assigned    = filtered.filter(p => !p.isEliminated && (p.assignedTeamId || p.assignedUserId || (p as any).assignedUserIds?.length)).length
        const unassigned  = filtered.filter(p => !p.isEliminated && !p.assignedTeamId && !p.assignedUserId && !((p as any).assignedUserIds?.length)).length

        const byZone: Record<string, number> = {}
        filtered.forEach(p => { const z = p.zoneName || 'Unknown'; byZone[z] = (byZone[z] || 0) + 1 })
        const zoneChart = Object.entries(byZone).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)

        const byWard: Record<string, number> = {}
        filtered.forEach(p => { const w = p.wardName || 'Unknown'; byWard[w] = (byWard[w] || 0) + 1 })
        const wardChart = Object.entries(byWard)
          .map(([name, value]) => ({ name: name.length > 15 ? name.slice(0, 13) + '…' : name, value }))
          .sort((a, b) => b.value - a.value).slice(0, 10)

        const byKothi: Record<string, number> = {}
        filtered.forEach(p => { const k = p.kothiName || 'Unknown'; byKothi[k] = (byKothi[k] || 0) + 1 })
        const kothiChart = Object.entries(byKothi)
          .map(([name, value]) => ({ name: name.length > 15 ? name.slice(0, 13) + '…' : name, value }))
          .sort((a, b) => b.value - a.value).slice(0, 8)

        return {
          title: metric === 'feederPoints' ? 'Feeder Points' : 'Chronic Points',
          mainValue: filtered.length,
          accent: metric === 'feederPoints' ? T.accent : T.gold,
          subMetrics: [
            { label: 'Active',      value: active,      color: T.green   },
            { label: 'Maintenance', value: maintenance,  color: T.amber   },
            { label: 'Inactive',    value: inactive,     color: T.textMuted },
            { label: 'Eliminated',  value: eliminated,   color: T.red     },
            { label: 'Assigned',    value: assigned,     color: T.accent  },
            { label: 'Unassigned',  value: unassigned,   color: T.purple  },
          ],
          charts: [
            { title: 'By zone',         data: zoneChart,  color: T.accent  },
            { title: 'By ward (top 10)', data: wardChart,  color: T.purple  },
            { title: 'By kothi (top 8)', data: kothiChart, color: T.gold    },
          ],
          statusBreakdown: [
            { status: 'active',      count: active,      color: T.green   },
            { status: 'maintenance', count: maintenance,  color: T.amber   },
            { status: 'inactive',    count: inactive,     color: T.textMuted },
            { status: 'eliminated',  count: eliminated,   color: T.red     },
          ],
          tableData: filtered.slice(0, 100).map(p => ({
            Name:     p.name,
            Status:   p.isEliminated ? 'eliminated' : p.status,
            Zone:     p.zoneName || '—',
            Ward:     p.wardName || '—',
            Kothi:    p.kothiName || '—',
            Team:     p.assignmentDetails?.name || '—',
            Priority: p.priority || '—',
          })),
          exportData: filtered.map(p => ({
            ID: p.id, Name: p.name, Status: p.status, Zone: p.zoneName,
            Ward: p.wardName, Kothi: p.kothiName, Team: p.assignmentDetails?.name,
            Lat: p.location?.latitude, Lng: p.location?.longitude, Eliminated: p.isEliminated,
          })),
          exportName: `${type}-points`,
        }
      }

      case 'shiftReports': {
        const completed   = shifts.filter(s => s.status === 'completed').length
        const inProgress  = shifts.filter(s => s.status === 'in_progress').length

        // Slot completion stats
        let totalSlots = 0, capturedSlots = 0, lateSlots = 0, missedSlots = 0
        shifts.forEach(s => {
          const slots = Array.isArray(s.slots) ? s.slots : Object.values(s.slots || {})
          slots.forEach((sl: any) => {
            totalSlots++
            if (sl.status === 'submitted' || sl.photoUrl) capturedSlots++
            else if (sl.status === 'late') lateSlots++
            else if (sl.status === 'missed') missedSlots++
          })
        })
        const slotRate = totalSlots > 0 ? Math.round((capturedSlots / totalSlots) * 100) : 0

        const byUser: Record<string, number> = {}
        shifts.forEach(s => { const u = s.userName || 'Unknown'; byUser[u] = (byUser[u] || 0) + 1 })
        const userChart = Object.entries(byUser).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 10)

        const byPoint: Record<string, number> = {}
        shifts.forEach(s => { const p = s.feederPointName || 'Unknown'; byPoint[p] = (byPoint[p] || 0) + 1 })
        const pointChart = Object.entries(byPoint)
          .map(([name, value]) => ({ name: name.length > 18 ? name.slice(0, 16) + '…' : name, value }))
          .sort((a, b) => b.value - a.value).slice(0, 10)

        const byShiftType: Record<string, number> = {}
        shifts.forEach(s => { const t = s.shiftType || 'Unknown'; byShiftType[t] = (byShiftType[t] || 0) + 1 })
        const shiftTypeChart = Object.entries(byShiftType).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)

        return {
          title: 'Shift Reports',
          mainValue: shifts.length,
          accent: T.purple,
          subMetrics: [
            { label: 'Completed',    value: completed,   color: T.green   },
            { label: 'In progress',  value: inProgress,  color: T.amber   },
            { label: 'Total slots',  value: totalSlots,  color: T.accent  },
            { label: 'Captured',     value: capturedSlots, color: T.green },
            { label: 'Late',         value: lateSlots,   color: T.amber   },
            { label: 'Missed',       value: missedSlots, color: T.red     },
            { label: 'Slot rate',    value: `${slotRate}%`, color: slotRate >= 70 ? T.green : slotRate >= 40 ? T.amber : T.red },
            { label: 'Unique users', value: Object.keys(byUser).length, color: T.purple },
          ],
          charts: [
            { title: 'By user (top 10)',       data: userChart,       color: T.purple },
            { title: 'By chronic point',       data: pointChart,      color: T.gold   },
            { title: 'By shift type',          data: shiftTypeChart,  color: T.accent },
          ],
          statusBreakdown: [
            { status: 'completed',   count: completed,  color: T.green },
            { status: 'in progress', count: inProgress, color: T.amber },
          ],
          tableData: shifts.slice(0, 100).map(s => ({
            ID:     s.id.slice(0, 8),
            Point:  s.feederPointName || '—',
            User:   s.userName || '—',
            Shift:  s.shiftType || '—',
            Date:   s.shiftDate || '—',
            Status: s.status,
            Slots:  Array.isArray(s.slots) ? s.slots.length : Object.keys(s.slots || {}).length,
          })),
          exportData: shifts.map(s => ({
            ID: s.id, Point: s.feederPointName, User: s.userName,
            ShiftType: s.shiftType, Date: s.shiftDate, Status: s.status,
          })),
          exportName: 'shift-reports',
        }
      }

      case 'activeUsers': {
        const byRole: Record<string, number> = {}
        users.forEach(u => { byRole[u.role] = (byRole[u.role] || 0) + 1 })
        const roleChart = Object.entries(byRole)
          .map(([name, value]) => ({ name: name.replace(/_/g, ' '), value }))
          .sort((a, b) => b.value - a.value)

        const active   = users.filter(u => u.isActive).length
        const inactive = users.filter(u => !u.isActive).length

        const byZone: Record<string, number> = {}
        users.forEach(u => { if (u.zoneNumber) { byZone[`Zone ${u.zoneNumber}`] = (byZone[`Zone ${u.zoneNumber}`] || 0) + 1 } })
        const zoneChart = Object.entries(byZone).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)

        return {
          title: 'Users',
          mainValue: users.length,
          accent: T.green,
          subMetrics: [
            { label: 'Active',       value: active,              color: T.green  },
            { label: 'Inactive',     value: inactive,            color: T.red    },
            { label: 'Admins',       value: kpis.adminUsers,     color: T.purple },
            { label: 'QC',           value: kpis.qcUsers,        color: T.accent },
            { label: 'Task force',   value: kpis.taskForceUsers, color: T.amber  },
            { label: 'Commissioners',value: kpis.commissionerUsers, color: T.gold },
          ],
          charts: [
            { title: 'By role',  data: roleChart, color: T.accent },
            { title: 'By zone',  data: zoneChart, color: T.purple },
          ],
          statusBreakdown: [
            { status: 'active',   count: active,   color: T.green },
            { status: 'inactive', count: inactive, color: T.red   },
          ],
          tableData: users.slice(0, 100).map(u => ({
            Name:   u.name,
            Email:  u.email,
            Role:   u.role.replace(/_/g, ' '),
            Status: u.isActive ? 'active' : 'inactive',
            Zone:   u.zoneNumber || '—',
          })),
          exportData: users.map(u => ({
            ID: u.id, Name: u.name, Email: u.email, Phone: u.phone,
            Role: u.role, Active: u.isActive, Zone: u.zoneNumber,
          })),
          exportName: 'users',
        }
      }

      case 'pendingRequests': {
        const total = kpis.pendingPointRequests + kpis.pendingFreqRequests + kpis.pendingAccessRequests
        return {
          title: 'Pending Requests',
          mainValue: total,
          accent: T.amber,
          subMetrics: [
            { label: 'Point requests',     value: kpis.pendingPointRequests, color: T.accent },
            { label: 'Frequency requests', value: kpis.pendingFreqRequests,  color: T.amber  },
            { label: 'Access requests',    value: kpis.pendingAccessRequests, color: T.purple },
          ],
          charts: [{
            title: 'By type',
            data: [
              { name: 'Point requests',     value: kpis.pendingPointRequests  },
              { name: 'Frequency requests', value: kpis.pendingFreqRequests   },
              { name: 'Access requests',    value: kpis.pendingAccessRequests },
            ],
            color: T.amber,
          }],
          statusBreakdown: null,
          tableData: [],
          exportData: [
            { Type: 'Point Requests',     Count: kpis.pendingPointRequests  },
            { Type: 'Frequency Requests', Count: kpis.pendingFreqRequests   },
            { Type: 'Access Requests',    Count: kpis.pendingAccessRequests },
          ],
          exportName: 'pending-requests',
        }
      }

      default:
        return null
    }
  }, [metric, reports, points, shifts, users, kpis, dark, T])

  if (!metric || !content) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl max-h-[88vh] overflow-y-auto rounded-2xl shadow-2xl"
        style={{ background: T.card, border: `1px solid ${T.cardBorder}`, animation: 'slideUp 0.3s ease' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 rounded-t-2xl"
          style={{
            background: `linear-gradient(135deg, ${content.accent}15, ${content.accent}06)`,
            borderBottom: `1px solid ${T.cardBorder}`,
            backdropFilter: 'blur(12px)',
          }}
        >
          <div className="flex items-center gap-4">
            <div>
              <h2 className="text-lg font-bold" style={{ color: T.textPrimary, margin: 0 }}>{content.title}</h2>
              <p className="text-sm mt-0.5" style={{ color: T.textSecondary, margin: 0 }}>Drill-down analysis</p>
            </div>
            <span className="text-3xl font-bold" style={{ color: content.accent, fontFamily: "'JetBrains Mono', monospace" }}>
              <AnimatedNumber value={content.mainValue} />
            </span>
          </div>
          <div className="flex items-center gap-2">
            <ExportButton onClick={() => exportToCSV(content.exportData, content.exportName)} label="Export CSV" dark={dark} />
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:opacity-80"
              style={{ background: `${T.textMuted}20`, border: 'none', cursor: 'pointer', color: T.textSecondary }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6 flex flex-col gap-5">
          {/* Sub-metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {content.subMetrics.map((sm: any, i: number) => (
              <div
                key={sm.label}
                className="rounded-xl p-3"
                style={{
                  background: dark ? T.surface : '#f8f7f5',
                  borderLeft: `3px solid ${sm.color || content.accent}`,
                  animation: `slideUp 0.35s ease ${i * 40}ms both`,
                }}
              >
                <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: T.textSecondary, margin: '0 0 4px' }}>
                  {sm.label}
                </p>
                <p className="text-[18px] font-bold" style={{ color: sm.color || T.textPrimary, fontFamily: "'JetBrains Mono', monospace", margin: 0 }}>
                  {typeof sm.value === 'number' ? sm.value.toLocaleString() : sm.value}
                </p>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 p-1 rounded-lg" style={{ background: dark ? T.surface : '#f5f5f5' }}>
            {(['overview', 'data'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="flex-1 py-2 rounded-md text-xs font-semibold capitalize transition-all"
                style={{
                  background: tab === t ? T.card : 'transparent',
                  color: tab === t ? T.textPrimary : T.textSecondary,
                  border: tab === t ? `1px solid ${T.cardBorder}` : '1px solid transparent',
                  cursor: 'pointer',
                  boxShadow: tab === t ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                }}
              >
                {t === 'overview' ? 'Charts & breakdown' : 'Data table'}
              </button>
            ))}
          </div>

          {tab === 'overview' && (
            <div className="flex flex-col gap-4">
              {content.statusBreakdown && content.statusBreakdown.length > 0 && (
                <div className="grid grid-cols-[180px_1fr] gap-4">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: T.textSecondary }}>
                      Status distribution
                    </p>
                    <ResponsiveContainer width="100%" height={160}>
                      <PieChart>
                        <Pie
                          data={content.statusBreakdown}
                          dataKey="count" nameKey="status"
                          cx="50%" cy="50%"
                          innerRadius={35} outerRadius={60}
                          strokeWidth={2} stroke={dark ? '#0f1623' : '#fff'}
                          animationDuration={600}
                        >
                          {content.statusBreakdown.map((s: any) => (
                            <Cell key={s.status} fill={s.color} />
                          ))}
                        </Pie>
                        <Tooltip content={(p: any) => <ChartTooltip {...p} dark={dark} />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex flex-col justify-center gap-2">
                    {content.statusBreakdown.filter((s: any) => s.count > 0).map((s: any) => (
                      <div key={s.status} className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: s.color }} />
                        <span className="text-xs capitalize flex-1" style={{ color: T.textSecondary }}>
                          {s.status.replace(/_/g, ' ')}
                        </span>
                        <span className="text-xs font-bold w-10 text-right" style={{ fontFamily: "'JetBrains Mono', monospace", color: T.textPrimary }}>
                          {s.count.toLocaleString()}
                        </span>
                        <div className="w-16">
                          <MiniBar value={s.count} max={content.mainValue} color={s.color} dark={dark} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {content.charts.map((chart: any) => (
                <div key={chart.title}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: T.textSecondary }}>
                    {chart.title}
                  </p>
                  {chart.data.length === 0 ? (
                    <p className="text-xs" style={{ color: T.textMuted }}>No data</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={Math.min(chart.data.length * 30 + 20, 260)}>
                      <BarChart data={chart.data} layout="vertical" margin={{ left: 0, right: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={T.gridLine} />
                        <XAxis type="number" tick={{ fontSize: 10, fill: T.textSecondary }} axisLine={false} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: T.textSecondary }} width={130} axisLine={false} />
                        <Tooltip content={(p: any) => <ChartTooltip {...p} dark={dark} />} />
                        <Bar dataKey="value" fill={chart.color} radius={[0, 4, 4, 0]} animationDuration={500} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              ))}
            </div>
          )}

          {tab === 'data' && (
            <div className="overflow-x-auto rounded-xl" style={{ border: `1px solid ${T.cardBorder}` }}>
              {content.tableData.length === 0 ? (
                <div className="text-center py-10" style={{ color: T.textSecondary, fontSize: 13 }}>
                  No detailed data available. Visit the relevant page for full details.
                </div>
              ) : (
                <table className="w-full border-collapse" style={{ fontSize: 11 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${T.cardBorder}` }}>
                      {Object.keys(content.tableData[0]).map(h => (
                        <th key={h} className="text-left" style={{
                          padding: '8px 10px', fontSize: 9, letterSpacing: '0.06em',
                          textTransform: 'uppercase', color: T.textSecondary,
                          fontWeight: 600, background: dark ? T.surface : '#f8f7f5',
                          whiteSpace: 'nowrap',
                        }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {content.tableData.map((row: any, i: number) => (
                      <tr
                        key={i}
                        style={{
                          borderBottom: `1px solid ${T.gridLine}`,
                          animation: `slideInLeft 0.25s ease ${Math.min(i * 15, 300)}ms both`,
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = dark ? T.surface : '#f8f7f5' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                      >
                        {Object.entries(row).map(([key, val]) => (
                          <td key={key} style={{
                            padding: '7px 10px', color: T.textPrimary,
                            fontFamily: ['ID', 'Dist(m)', 'Slots', 'Trip'].includes(key) ? "'JetBrains Mono', monospace" : 'inherit',
                            whiteSpace: 'nowrap',
                          }}>
                            {key === 'Status' ? (
                              <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold"
                                style={{
                                  background: `${getStatusColor(String(val), dark)}18`,
                                  color: getStatusColor(String(val), dark),
                                }}>
                                {String(val).replace(/_/g, ' ')}
                              </span>
                            ) : key === 'Type' ? (
                              <span className="inline-block px-2 py-0.5 rounded-full text-[9px] font-bold"
                                style={{
                                  background: String(val) === 'chronic' ? `${T.gold}20` : `${T.accent}20`,
                                  color: String(val) === 'chronic' ? T.gold : T.accent,
                                }}>
                                {String(val)}
                              </span>
                            ) : String(val ?? '—')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {content.tableData.length >= 100 && (
                <p className="text-center py-2 text-[11px]" style={{ color: T.textMuted, borderTop: `1px solid ${T.gridLine}` }}>
                  Showing first 100 records · Export CSV for full data
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)    scale(1);    }
        }
        @keyframes slideInLeft {
          from { opacity: 0; transform: translateX(-8px); }
          to   { opacity: 1; transform: translateX(0);    }
        }
      `}</style>
    </div>
  )
}