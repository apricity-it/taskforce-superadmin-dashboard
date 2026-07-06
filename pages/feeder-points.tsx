import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  MapPin, Search, Eye, Edit, Trash2, Users, Calendar,
  CheckCircle, Settings, Activity, Zap, User as UserIcon,
  X, Filter, Download, RefreshCw, TrendingUp, AlertTriangle,
} from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { DataService } from '@/lib/dataService'
import type { FeederPoint, Team, User, Zone, Ward, Kothi, ComplianceReport, ComplianceAnswer } from '@/lib/dataService'
import { useTheme } from '@/contexts/ThemeContext'
import { getTokens } from '@/lib/dashboardTheme'
import { AIService } from '@/lib/aiService'
import * as XLSX from 'xlsx'
import { saveAs } from 'file-saver'

// ─── Constants ────────────────────────────────────────────────────────────────
const YES_VALUES = new Set(['yes', 'y', 'true', 'clean', 'present', 'available', 'segregated', '1'])
const NO_VALUES = new Set(['no', 'n', 'false', 'dirty', 'absent', 'not present', 'not available', 'not clean', 'not segregated', '0'])
const REPORT_QUESTION_KEYS = {
  zone: ['q1', 'q1_zone_name', 'zone_name', 'zone'],
  ward: ['q2', 'q2_ward_number', 'ward_number'],
  cleanliness: ['q4', 'feeder_point_clean', 'scp_area_clean'],
  segregation: ['q7', 'waste_segregated', 'wet_dry_waste_segregation'],
  vehicle: ['vehicle_separate_compartments', 'vehicle_available', 'vehicle_present'],
  swach: ['swach_workers_present', 'swach_workers_count', 'staff_present'],
  nearbyArea: ['q5', 'surrounding_area_clean', 'surrounding_area_maintained'],
  signboard: ['q11', 'signboard_qr_display', 'qr_display', 'visible_signboard'],
  compliance: ['q12', 'overall_score', 'overall_compliance_rating'],
} as const
const TRIP_SEQ = [1, 2, 3] as const
const PAGE_SIZE = 25

// ─── Helpers ──────────────────────────────────────────────────────────────────
function coerceDate(v: any): Date | null {
  if (!v) return null
  if (v instanceof Date) return v
  if (typeof v.toDate === 'function') return v.toDate()
  if (typeof v === 'string' || typeof v === 'number') {
    const p = new Date(v); return isNaN(p.getTime()) ? null : p
  }
  return null
}
function getReportDate(r: ComplianceReport): Date | null {
  return coerceDate(r.submittedAt) || coerceDate(r.updatedAt) || coerceDate(r.createdAt) || coerceDate(r.tripDate)
}
function getAnswer(report: ComplianceReport | undefined, keys: readonly string[]): string | null {
  if (!report?.answers) return null
  const ks = keys.map(k => k.toLowerCase())
  for (const a of report.answers) {
    if (ks.includes((a.questionId || '').toLowerCase()) || ks.includes((a.description || '').toLowerCase()))
      return a.answer?.toString() || null
  }
  return null
}
function fmtBool(v: string | null, yes: string, no: string, fallback: string) {
  if (!v) return fallback
  const n = v.trim().toLowerCase()
  if (YES_VALUES.has(n)) return yes
  if (NO_VALUES.has(n)) return no
  return v
}
function fmtWorkers(v: string | null) {
  if (!v) return 'Not Documented'
  const n = v.trim().toLowerCase(); const num = Number(n)
  if (!isNaN(num) && num > 0) return `${num} worker${num === 1 ? '' : 's'} present`
  if (YES_VALUES.has(n)) return 'Present'
  if (NO_VALUES.has(n)) return 'Not Present'
  return v
}
function humanizeKey(v: string) {
  return v.split(/[_-]+/).map(p => p ? p[0].toUpperCase() + p.slice(1) : '').join(' ').trim() || v
}
function collectPhotos(r?: ComplianceReport): string[] {
  if (!r) return []
  const s = new Set<string>()
  r.attachments?.forEach(a => { if (a.type === 'photo' && a.url) s.add(a.url) })
  r.answers?.forEach(a => a.photos?.forEach(p => { if (p) s.add(p) }))
  return Array.from(s)
}
function statusBadge(s?: ComplianceReport['status']) {
  switch (s) {
    case 'approved': return { label: 'Approved', cls: 'bg-green-100 text-green-700' }
    case 'rejected': return { label: 'Rejected', cls: 'bg-red-100 text-red-700' }
    case 'requires_action': return { label: 'Requires Action', cls: 'bg-orange-100 text-orange-700' }
    case 'pending': return { label: 'Pending', cls: 'bg-yellow-100 text-yellow-700' }
    default: return { label: 'Unknown', cls: 'bg-gray-100 text-gray-700' }
  }
}

// ─── Derived last-inspection map from reports ─────────────────────────────────
function buildLastInspectionMap(reports: ComplianceReport[]): Record<string, Date> {
  const map: Record<string, Date> = {}
  reports.forEach(r => {
    if (!r.feederPointId) return
    const d = getReportDate(r)
    if (d && (!map[r.feederPointId] || d > map[r.feederPointId])) map[r.feederPointId] = d
  })
  return map
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function FeederPointsPage() {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const T = getTokens(dark)
  const qc = useQueryClient()

  // ── Data via React Query (cached, no re-fetch on navigate) ──
  const { data: allPoints = [], isLoading: loadingPoints } = useQuery<FeederPoint[]>({
    queryKey: ['feederPoints'],
    queryFn: () => DataService.getAllFeederPoints(),
    staleTime: 5 * 60_000,
  })
  const { data: teams = [] } = useQuery<Team[]>({
    queryKey: ['teams'],
    queryFn: () => DataService.getAllUsers().then(() => []).catch(() => []) as unknown as Promise<Team[]>,
    staleTime: 10 * 60_000,
    // Real fetch via onTeamsChange subscription below
  })
  const { data: users = [] } = useQuery<User[]>({
    queryKey: ['approvedUsers'],
    queryFn: () => DataService.getAllUsers(),
    staleTime: 5 * 60_000,
  })
  const { data: allReports = [] } = useQuery<ComplianceReport[]>({
    queryKey: ['complianceReports', 'all'],
    queryFn: () => DataService.getAllComplianceReports(),
    staleTime: 5 * 60_000,
  })

  const [teamsData, setTeamsData] = useState<Team[]>([])
  const [zones, setZones] = useState<Zone[]>([])
  const [wards, setWards] = useState<Ward[]>([])
  const [kothis, setKothis] = useState<Kothi[]>([])

  useEffect(() => {
    const u1 = DataService.onTeamsChange(setTeamsData)
    const u2 = DataService.onZonesChange(setZones)
    const u3 = DataService.onWardsChange(setWards)
    const u4 = DataService.onKothisChange(setKothis)
    return () => { u1(); u2(); u3(); u4() }
  }, [])

  // ── Filters ──
  const [search, setSearch] = useState('')
  const [statusF, setStatusF] = useState('active')
  const [assignF, setAssignF] = useState('all')
  const [zoneF, setZoneF] = useState('')
  const [wardF, setWardF] = useState('')
  const [kothiF, setKothiF] = useState('')
  const [page, setPage] = useState(1)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  // ── Modals ──
  const [detailFP, setDetailFP] = useState<any | null>(null)
  const [detailReports, setDetailReports] = useState<ComplianceReport[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [editFP, setEditFP] = useState<any | null>(null)

  // ── Derived last inspection from reports ──
  const lastInspMap = useMemo(() => buildLastInspectionMap(allReports.filter((r: ComplianceReport) => (r.feederPointType ?? 'feeder') === 'feeder')), [allReports])

  // ── Feeder-only + enrich assignmentDetails ──
  const feederPoints = useMemo(() => {
    return allPoints
      .filter((fp: FeederPoint) => (fp.type ?? 'feeder') === 'feeder')
      .map((fp: FeederPoint) => {
        let aDetails = (fp as any).assignmentDetails || null
        if (!aDetails && fp.assignedUserId) {
          const u = users.find((u: User) => u.id === fp.assignedUserId)
          if (u) aDetails = { type: 'individual', name: u.name || 'Unknown', email: u.email, id: fp.assignedUserId, role: u.role }
        }
        if (!aDetails && fp.assignedTeamId) {
          const t = teamsData.find((t: Team) => t.id === fp.assignedTeamId)
          if (t) {
            const active = (t.members || []).filter((m: any) => m.isActive)
            aDetails = { type: 'team', name: t.name, memberCount: active.length, id: fp.assignedTeamId, members: active }
          }
        }
        return { ...fp, assignmentDetails: aDetails, lastInspectionDerived: lastInspMap[fp.id] || null }
      })
  }, [allPoints, users, teamsData, lastInspMap])

  // ── Stats ──
const stats = useMemo(() => {
    const isAssignedPoint = (p: any) =>
      !!(p.assignedTeamId || p.assignedUserId || p.assignedUserIds?.length)
    return {
      total: feederPoints.length,
      active: feederPoints.filter((p: any) => p.status === 'active' && !p.isEliminated).length,
      maintenance: feederPoints.filter((p: any) => p.status === 'maintenance' && !p.isEliminated).length,
      inactive: feederPoints.filter((p: any) => p.status === 'inactive' && !p.isEliminated).length,
      eliminated: feederPoints.filter((p: any) => p.isEliminated).length,
      assigned: feederPoints.filter(isAssignedPoint).length,
      unassigned: feederPoints.filter((p: any) => !isAssignedPoint(p)).length,
      withGPS: feederPoints.filter((p: any) => p.location?.latitude && p.location?.longitude).length,
      neverInsp: feederPoints.filter((p: any) => !p.lastInspectionDerived && !p.isEliminated).length,
    }
  }, [feederPoints])
  // ── Filtered ──
  const filtered = useMemo(() => {
    let r = feederPoints
    if (search) {
      const s = search.toLowerCase()
      r = r.filter((fp: any) =>
        fp.name?.toLowerCase().includes(s) ||
        fp.location?.address?.toLowerCase().includes(s) ||
        fp.assignmentDetails?.name?.toLowerCase().includes(s) ||
        fp.zoneName?.toLowerCase().includes(s) ||
        fp.wardName?.toLowerCase().includes(s)
      )
    }
    if (statusF === 'eliminated') r = r.filter((fp: any) => fp.isEliminated)
    else {
      r = r.filter((fp: any) => !fp.isEliminated)
      if (statusF !== 'all') r = r.filter((fp: any) => fp.status === statusF)
    }
    if (assignF === 'assigned') r = r.filter((fp: any) => !!fp.assignmentDetails)
    if (assignF === 'unassigned') r = r.filter((fp: any) => !fp.assignmentDetails)
    if (assignF === 'individual') r = r.filter((fp: any) => fp.assignmentDetails?.type === 'individual')
    if (assignF === 'team') r = r.filter((fp: any) => fp.assignmentDetails?.type === 'team')

    if (kothiF) {
      r = r.filter((fp: any) => fp.kothiId === kothiF)
    } else if (wardF) {
      const kIds = kothis.filter((k: Kothi) => k.wardId === wardF).map((k: Kothi) => k.id)
      r = r.filter((fp: any) => fp.wardId === wardF || kIds.includes(fp.kothiId || ''))
    } else if (zoneF) {
      const wIds = wards.filter((w: Ward) => w.zoneId === zoneF).map((w: Ward) => w.id)
      const kIds = kothis.filter((k: Kothi) => wIds.includes(k.wardId)).map((k: Kothi) => k.id)
      r = r.filter((fp: any) => fp.zoneId === zoneF || wIds.includes(fp.wardId || '') || kIds.includes(fp.kothiId || ''))
    }
    return r
  }, [feederPoints, search, statusF, assignF, zoneF, wardF, kothiF, zones, wards, kothis])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // Reset page on filter change
  useEffect(() => { setPage(1) }, [search, statusF, assignF, zoneF, wardF, kothiF])

  // ── Actions ──
  const handleToggleEliminated = async (fp: any) => {
    const msg = fp.isEliminated
      ? `Remove "${fp.name}" from eliminated and mark active?`
      : `Eliminate "${fp.name}"? It will be hidden from active points.`
    if (!confirm(msg)) return
    setTogglingId(fp.id)
    try {
      await DataService.updateFeederPoint(fp.id, { isEliminated: !fp.isEliminated })
      qc.invalidateQueries({ queryKey: ['feederPoints'] })
    } catch (e) { console.error(e) }
    setTogglingId(null)
  }

  const handleViewDetails = async (fp: any) => {
    setDetailFP(fp); setDetailLoading(true); setDetailReports([])
    try {
      const reports = await DataService.getFeederPointReports(fp.id, fp.name)
      setDetailReports(reports.filter(r => (r.feederPointType ?? 'feeder') === 'feeder'))
    } catch { setDetailReports([]) }
    setDetailLoading(false)
  }

  const handleSaveEdit = async () => {
    if (!editFP) return
    try {
      await DataService.updateFeederPoint(editFP.id, editFP)
      qc.invalidateQueries({ queryKey: ['feederPoints'] })
      setEditFP(null)
    } catch (e) { alert('Error saving. Try again.') }
  }

  const handleDelete = async (fp: any) => {
    if (!confirm(`Delete "${fp.name}"?`)) return
    try {
      await DataService.deleteFeederPoint(fp.id)
      qc.invalidateQueries({ queryKey: ['feederPoints'] })
    } catch { alert('Error deleting.') }
  }

  const handleExport = () => {
    const data = filtered.map((fp: any, i: number) => ({
      Sr_No: i + 1,
      Name: fp.name || '',
      ID: fp.id,
      Zone: fp.zoneName || '',
      Ward: fp.wardName || '',
      Kothi: fp.kothiName || '',
      Status: fp.status || '',
      Priority: fp.priority || '',
      Address: fp.location?.address || '',
      Lat: fp.location?.latitude || '',
      Lng: fp.location?.longitude || '',
      Assignment: fp.assignmentDetails?.name || 'Unassigned',
      Assignment_Type: fp.assignmentDetails?.type || '',
      Eliminated: fp.isEliminated ? 'Yes' : 'No',
      Last_Inspection: fp.lastInspectionDerived?.toLocaleDateString() || 'Never',
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Feeder Points')
    saveAs(new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })],
      { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      `FeederPoints_${Date.now()}.xlsx`)
  }

  const wardOpts = wards.filter(w => w.zoneId === zoneF)
  const kothiOpts = kothis.filter(k => k.wardId === wardF)

  const statusCls = (s: string) => ({
    active: 'bg-emerald-100 text-emerald-800',
    maintenance: 'bg-amber-100 text-amber-800',
    inactive: 'bg-red-100 text-red-800',
  }[s] || 'bg-gray-100 text-gray-700')

  const priorityCls = (p: string) => ({
    high: 'bg-red-100 text-red-800',
    medium: 'bg-amber-100 text-amber-800',
    low: 'bg-green-100 text-green-800',
  }[p] || 'bg-gray-100 text-gray-700')

  if (loadingPoints) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: T.accent }} />
      </div>
    )
  }

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: `${T.accent}20`, border: `1px solid ${T.accentBorder}` }}>
            <Zap className="h-6 w-6" style={{ color: T.accent }} />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight" style={{ color: T.textPrimary }}>Feeder Points</h1>
            <p className="text-sm" style={{ color: T.textMuted }}>{stats.total} total · {stats.active} active · {stats.neverInsp} never inspected</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => qc.invalidateQueries({ queryKey: ['feederPoints'] })}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold transition hover:opacity-80"
            style={{ background: T.surface, border: `1px solid ${T.cardBorder}`, color: T.textSecondary }}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
          <button onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold transition hover:opacity-90"
            style={{ background: T.green, color: '#fff', border: 'none' }}>
            <Download className="h-4 w-4" /> Export
          </button>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
        {[
          { label: 'Total', value: stats.total, color: T.accent },
          { label: 'Active', value: stats.active, color: T.green },
          { label: 'Maintenance', value: stats.maintenance, color: T.amber },
          { label: 'Inactive', value: stats.inactive, color: T.textMuted },
          { label: 'Eliminated', value: stats.eliminated, color: T.red },
          { label: 'Assigned', value: stats.assigned, color: T.purple },
          { label: 'Unassigned', value: stats.unassigned, color: T.amber },
          { label: 'Never Inspected', value: stats.neverInsp, color: T.red },
        ].map((s, i) => (
          <div key={s.label} className="rounded-xl p-3"
            style={{ background: T.card, border: `1px solid ${T.cardBorder}`, animation: `slideUp 0.4s ease ${i * 40}ms both` }}>
            <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: T.textSecondary, margin: '0 0 3px' }}>{s.label}</p>
            <p className="text-[20px] font-bold leading-none" style={{ color: s.color, fontFamily: "'JetBrains Mono', monospace" }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* ── Assignment Breakdown ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[
          {
            title: 'Assignment Status', items: [
              { label: 'Assigned', value: stats.assigned, max: stats.total, color: T.green },
              { label: 'Unassigned', value: stats.unassigned, max: stats.total, color: T.red },
            ]
          },
          {
            title: 'Inspection Coverage', items: [
              { label: 'Inspected (ever)', value: stats.total - stats.neverInsp - stats.eliminated, max: stats.total, color: T.green },
              { label: 'Never inspected', value: stats.neverInsp, max: stats.total, color: T.amber },
            ]
          },
        ].map(card => (
          <div key={card.title} className="rounded-2xl p-4" style={{ background: T.card, border: `1px solid ${T.cardBorder}` }}>
            <p className="text-sm font-semibold mb-3" style={{ color: T.textPrimary }}>{card.title}</p>
            <div className="space-y-3">
              {card.items.map(item => (
                <div key={item.label} className="flex items-center gap-3">
                  <span className="text-sm w-32 flex-shrink-0" style={{ color: T.textSecondary }}>{item.label}</span>
                  <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: T.cardBorder }}>
                    <div className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${item.max > 0 ? (item.value / item.max) * 100 : 0}%`, background: item.color }} />
                  </div>
                  <span className="text-sm font-bold w-8 text-right" style={{ color: item.color, fontFamily: "'JetBrains Mono', monospace" }}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* ── Filters ── */}
      <div className="rounded-2xl p-4 space-y-3" style={{ background: T.card, border: `1px solid ${T.cardBorder}` }}>
        <div className="flex flex-wrap gap-3 items-center">
          {/* Search */}
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: T.textMuted }} />
            <input type="text" placeholder="Search feeder points..."
              value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-xl text-sm"
              style={{ background: T.surface, border: `1px solid ${T.cardBorder}`, color: T.textPrimary, outline: 'none' }}
            />
          </div>

          {/* Status */}
          <select value={statusF} onChange={e => setStatusF(e.target.value)}
            style={{ background: T.surface, border: `1px solid ${T.cardBorder}`, color: T.textPrimary, borderRadius: 10, padding: '8px 12px', fontSize: 13, outline: 'none' }}>
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="maintenance">Maintenance</option>
            <option value="inactive">Inactive</option>
            <option value="eliminated">Eliminated</option>
          </select>

          {/* Assignment */}
          <select value={assignF} onChange={e => setAssignF(e.target.value)}
            style={{ background: T.surface, border: `1px solid ${T.cardBorder}`, color: T.textPrimary, borderRadius: 10, padding: '8px 12px', fontSize: 13, outline: 'none' }}>
            <option value="all">All Assignments</option>
            <option value="assigned">Assigned</option>
            <option value="unassigned">Unassigned</option>
            <option value="individual">Individual</option>
            <option value="team">Team</option>
          </select>
        </div>

        {/* Zone → Ward → Kothi cascade */}
        <div className="flex flex-wrap gap-2 items-center">
          <Filter className="h-4 w-4 flex-shrink-0" style={{ color: T.textMuted }} />
          {[
            { value: zoneF, options: zones, placeholder: 'All Zones', onChange: (v: string) => { setZoneF(v); setWardF(''); setKothiF('') } },
            { value: wardF, options: wardOpts, placeholder: 'All Wards', disabled: !zoneF, onChange: (v: string) => { setWardF(v); setKothiF('') } },
            { value: kothiF, options: kothiOpts, placeholder: 'All Kothis', disabled: !wardF, onChange: (v: string) => setKothiF(v) },
          ].map((sel, i) => (
            <select key={i} value={sel.value} disabled={sel.disabled}
              onChange={e => sel.onChange(e.target.value)}
              style={{
                background: T.surface, border: `1px solid ${T.cardBorder}`,
                color: sel.disabled ? T.textMuted : T.textPrimary,
                borderRadius: 10, padding: '7px 10px', fontSize: 12, outline: 'none',
                opacity: sel.disabled ? 0.5 : 1,
              }}>
              <option value="">{sel.placeholder}</option>
              {sel.options.map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          ))}
          {(zoneF || wardF || kothiF) && (
            <button onClick={() => { setZoneF(''); setWardF(''); setKothiF('') }}
              className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg"
              style={{ border: `1px solid ${T.cardBorder}`, color: T.textSecondary, background: 'transparent', cursor: 'pointer' }}>
              <X className="h-3 w-3" /> Clear
            </button>
          )}
        </div>
      </div>

      {/* ── Table ── */}
      <div className="rounded-2xl overflow-hidden" style={{ background: T.card, border: `1px solid ${T.cardBorder}` }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${T.cardBorder}` }}>
          <h2 className="text-sm font-semibold" style={{ color: T.textPrimary }}>
            Feeder Points ({filtered.length})
          </h2>
          <div className="flex items-center gap-2 text-xs" style={{ color: T.textMuted }}>
            <Activity className="h-3.5 w-3.5" /> Real-time data
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full" style={{ fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${T.cardBorder}` }}>
                {['Elim.', 'Name', 'Location', 'Zone / Ward', 'Status', 'Assignment', 'Priority', 'Last Insp.', 'Actions'].map(h => (
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
                  <td colSpan={9} className="text-center py-16" style={{ color: T.textMuted }}>
                    <Zap className="h-10 w-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">
                      {feederPoints.length === 0 ? 'No feeder points in database' : 'No points match your filters'}
                    </p>
                  </td>
                </tr>
              ) : paged.map((fp: any, i: number) => (
                <tr key={fp.id || i}
                  className="transition-colors"
                  style={{ borderBottom: `1px solid ${T.gridLine}`, opacity: fp.isEliminated ? 0.6 : 1 }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = dark ? T.surface : '#f8f9fb'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                >
                  {/* Eliminated checkbox */}
                  <td className="px-4 py-3 text-center">
                    <input type="checkbox" checked={!!fp.isEliminated}
                      disabled={togglingId === fp.id}
                      onChange={() => handleToggleEliminated(fp)}
                      className="h-4 w-4 rounded cursor-pointer"
                      style={{ accentColor: T.red }}
                      title={fp.isEliminated ? 'Mark as active' : 'Mark as eliminated'}
                    />
                  </td>

                  {/* Name */}
                  <td className="px-4 py-3" style={{ minWidth: 180 }}>
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg"
                        style={{ background: `${T.accent}15` }}>
                        <Zap className="h-4 w-4" style={{ color: T.accent }} />
                      </div>
                      <div>
                        <p className="font-semibold truncate max-w-[160px]" style={{ color: T.textPrimary }}>
                          {fp.name || `Point ${i + 1}`}
                        </p>
                        <p className="text-[10px]" style={{ color: T.textMuted }}>
                          {fp.id.slice(-8)}
                        </p>
                      </div>
                    </div>
                  </td>

                  {/* Location */}
                  <td className="px-4 py-3" style={{ maxWidth: 160 }}>
                    <div className="flex items-start gap-1">
                      <MapPin className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" style={{ color: T.textMuted }} />
                      <div>
                        <p className="truncate" style={{ color: T.textPrimary, maxWidth: 140 }}>
                          {fp.location?.address || 'No location'}
                        </p>
                        {fp.location?.latitude && (
                          <p className="text-[10px]" style={{ color: T.textMuted }}>
                            {fp.location.latitude.toFixed(4)}, {fp.location.longitude.toFixed(4)}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Zone / Ward */}
                  <td className="px-4 py-3" style={{ whiteSpace: 'nowrap' }}>
                    <p style={{ color: T.textPrimary }}>{fp.zoneName || '—'}</p>
                    <p className="text-[10px]" style={{ color: T.textMuted }}>{fp.wardName || fp.kothiName || '—'}</p>
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 text-[10px] font-semibold rounded-full ${statusCls(fp.status)}`}>
                      {fp.status || 'unknown'}
                    </span>
                  </td>

                  {/* Assignment */}
                  <td className="px-4 py-3" style={{ minWidth: 140 }}>
                    {fp.assignmentDetails ? (
                      <div className="flex items-center gap-1.5">
                        {fp.assignmentDetails.type === 'individual'
                          ? <UserIcon className="h-3.5 w-3.5 flex-shrink-0" style={{ color: T.accent }} />
                          : <Users className="h-3.5 w-3.5 flex-shrink-0" style={{ color: T.purple }} />
                        }
                        <div>
                          <p className="font-medium truncate max-w-[120px]" style={{ color: T.textPrimary }}>
                            {fp.assignmentDetails.name}
                          </p>
                          <p className="text-[10px]" style={{ color: T.textMuted }}>
                            {fp.assignmentDetails.type === 'individual' ? 'Individual' : `Team · ${fp.assignmentDetails.memberCount} members`}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: `${T.amber}15`, color: T.amber }}>
                        Unassigned
                      </span>
                    )}
                  </td>

                  {/* Priority */}
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 text-[10px] font-semibold rounded-full ${priorityCls(fp.priority)}`}>
                      {fp.priority || 'normal'}
                    </span>
                  </td>

                  {/* Last Inspection */}
                  <td className="px-4 py-3" style={{ whiteSpace: 'nowrap' }}>
                    {fp.lastInspectionDerived ? (
                      <div className="flex items-center gap-1" style={{ color: T.textSecondary }}>
                        <Calendar className="h-3.5 w-3.5" />
                        <span>{fp.lastInspectionDerived.toLocaleDateString()}</span>
                      </div>
                    ) : (
                      <span className="text-[11px]" style={{ color: T.red }}>Never</span>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleViewDetails(fp)} title="View Details"
                        className="p-1.5 rounded-lg transition hover:opacity-80"
                        style={{ background: `${T.accent}15`, color: T.accent }}>
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => setEditFP({ ...fp })} title="Edit"
                        className="p-1.5 rounded-lg transition hover:opacity-80"
                        style={{ background: `${T.amber}15`, color: T.amber }}>
                        <Edit className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => handleDelete(fp)} title="Delete"
                        className="p-1.5 rounded-lg transition hover:opacity-80"
                        style={{ background: `${T.red}15`, color: T.red }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
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

      {/* ── Detail Modal ── */}
      {detailFP && (
        <DetailModal
          fp={detailFP} reports={detailReports} loading={detailLoading} dark={dark} T={T}
          onClose={() => { setDetailFP(null); setDetailReports([]) }}
        />
      )}

      {/* ── Edit Modal ── */}
      {editFP && (
        <EditModal fp={editFP} dark={dark} T={T}
          onChange={(field: string, value: string) => setEditFP((p: any) => ({ ...p, [field]: value }))}
          onSave={handleSaveEdit} onClose={() => setEditFP(null)}
        />
      )}

      <style>{`
        @keyframes slideUp { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:translateY(0) } }
      `}</style>
    </div>
  )
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────
function EditModal({ fp, dark, T, onChange, onSave, onClose }: any) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl p-6 shadow-2xl" style={{ background: T.card, border: `1px solid ${T.cardBorder}` }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold" style={{ color: T.textPrimary }}>Edit Feeder Point</h3>
          <button onClick={onClose} style={{ color: T.textMuted, background: 'none', border: 'none', cursor: 'pointer', fontSize: 20 }}>×</button>
        </div>
        <div className="space-y-3">
          {[
            { label: 'Name', field: 'name', value: fp.name || '' },
            { label: 'Address', field: 'location.address', value: fp.location?.address || '' },
          ].map(f => (
            <div key={f.field}>
              <label className="text-[10px] font-semibold uppercase tracking-wider block mb-1" style={{ color: T.textSecondary }}>{f.label}</label>
              <input value={f.value} onChange={e => onChange(f.field, e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ background: T.surface, border: `1px solid ${T.cardBorder}`, color: T.textPrimary, outline: 'none' }} />
            </div>
          ))}
          {[
            { label: 'Status', field: 'status', value: fp.status, options: ['active', 'maintenance', 'inactive'] },
            { label: 'Priority', field: 'priority', value: fp.priority, options: ['low', 'medium', 'high'] },
          ].map(f => (
            <div key={f.field}>
              <label className="text-[10px] font-semibold uppercase tracking-wider block mb-1" style={{ color: T.textSecondary }}>{f.label}</label>
              <select value={f.value} onChange={e => onChange(f.field, e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ background: T.surface, border: `1px solid ${T.cardBorder}`, color: T.textPrimary, outline: 'none' }}>
                {f.options.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onSave}
            className="flex-1 py-2 rounded-xl text-sm font-semibold"
            style={{ background: T.accent, color: '#fff', border: 'none', cursor: 'pointer' }}>
            Save
          </button>
          <button onClick={onClose}
            className="flex-1 py-2 rounded-xl text-sm font-semibold"
            style={{ background: T.surface, border: `1px solid ${T.cardBorder}`, color: T.textSecondary, cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Detail Modal ─────────────────────────────────────────────────────────────
function DetailModal({ fp, reports, loading, dark, T, onClose }: any) {
  const [histFilter, setHistFilter] = useState('all')
  const [histPage, setHistPage] = useState(1)
  const [selReport, setSelReport] = useState<ComplianceReport | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiResult, setAiResult] = useState<string | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)

  useEffect(() => { setHistFilter('all'); setSelReport(null); setHistPage(1) }, [reports])
  useEffect(() => { setAiResult(null); setAiError(null) }, [selReport])

  const latestReport = reports[0]
  const statusSummary = {
    total: reports.length,
    approved: reports.filter((r: ComplianceReport) => r.status === 'approved').length,
    rejected: reports.filter((r: ComplianceReport) => r.status === 'rejected').length,
    requiresAction: reports.filter((r: ComplianceReport) => r.status === 'requires_action').length,
    pending: reports.filter((r: ComplianceReport) => r.status === 'pending').length,
  }

  const history = useMemo(() => {
    const sorted = [...reports].sort((a: ComplianceReport, b: ComplianceReport) => {
      return (getReportDate(a)?.getTime() ?? 0) - (getReportDate(b)?.getTime() ?? 0)
    })
    return sorted.map((r: ComplianceReport, i: number) => {
      const badge = statusBadge(r.status)
      return {
        key: r.id || `${i}`,
        id: r.id || 'N/A',
        date: getReportDate(r)?.toLocaleString() || 'Unknown',
        trip: r.tripNumber ? `Trip ${r.tripNumber}` : 'N/A',
        status: r.status,
        badge,
        submittedBy: r.userName || 'Unknown',
        ref: r,
      }
    })
  }, [reports])

  const filteredHist = histFilter === 'all' ? history : history.filter((h: any) => h.status === histFilter)
  const histPages = Math.ceil(filteredHist.length / 10)
  const pagedHist = filteredHist.slice((histPage - 1) * 10, histPage * 10)

  const tripRows = useMemo(() => TRIP_SEQ.map(n => {
    const r = reports.find((x: ComplianceReport) => x.tripNumber === n) || reports[n - 1]
    const d = r ? getReportDate(r) : null
    const photos = collectPhotos(r)
    return {
      label: `Trip ${n}`,
      time: d ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—',
      distance: typeof r?.distanceFromFeederPoint === 'number' ? `${Math.round(r.distanceFromFeederPoint)}m` : '—',
      clean: fmtBool(getAnswer(r, REPORT_QUESTION_KEYS.cleanliness), 'Yes', 'No', '—'),
      segregated: fmtBool(getAnswer(r, REPORT_QUESTION_KEYS.segregation), 'Yes', 'No', '—'),
      vehicle: fmtBool(getAnswer(r, REPORT_QUESTION_KEYS.vehicle), 'Yes', 'No', '—'),
      workers: fmtWorkers(getAnswer(r, REPORT_QUESTION_KEYS.swach)),
      photo: r ? (photos.length > 0 ? 'Yes' : 'No') : '—',
      photos,
      hasData: !!r,
    }
  }), [reports])

  const handleAI = async () => {
    if (!selReport) return
    setAiLoading(true); setAiError(null)
    try {
      const res = await AIService.analyzeReportCompliance({ report: selReport, feederPointName: fp.name })
      setAiResult(res)
    } catch { setAiError('Unable to analyze. Try again.') }
    setAiLoading(false)
  }

  const cell = (label: string, value: string) => (
    <div key={label}>
      <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: T.textMuted }}>{label}</p>
      <p className="mt-0.5 text-sm font-semibold" style={{ color: T.textPrimary }}>{value || '—'}</p>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }} onClick={onClose}>
      <div className="relative w-full max-w-4xl my-8 rounded-2xl shadow-2xl" style={{ background: T.card, border: `1px solid ${T.cardBorder}` }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 rounded-t-2xl" style={{ background: T.card, borderBottom: `1px solid ${T.cardBorder}` }}>
          <div>
            <h3 className="text-lg font-bold" style={{ color: T.textPrimary }}>{fp.name}</h3>
            <p className="text-xs" style={{ color: T.textMuted }}>Feeder Point Report · {new Date().toLocaleDateString()}</p>
          </div>
          <button onClick={onClose} className="flex items-center justify-center w-8 h-8 rounded-xl transition hover:opacity-80"
            style={{ background: T.surface, border: `1px solid ${T.cardBorder}`, color: T.textSecondary, cursor: 'pointer' }}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading && (
          <div className="mx-6 mt-4 rounded-xl px-4 py-3 text-sm" style={{ background: `${T.accent}15`, color: T.accent }}>
            Loading compliance data...
          </div>
        )}
        {!loading && reports.length === 0 && (
          <div className="mx-6 mt-4 rounded-xl px-4 py-3 text-sm" style={{ background: `${T.amber}15`, color: T.amber }}>
            No compliance reports linked to this feeder point yet.
          </div>
        )}

        <div className="p-6 space-y-6">
          {/* 1. Basic Info */}
          <section>
            <p className="text-sm font-bold mb-3" style={{ color: T.textPrimary }}>1. Basic Information</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 p-4 rounded-xl" style={{ background: T.surface, border: `1px solid ${T.cardBorder}` }}>
              {cell('Name', fp.name)}
              {cell('Zone', fp.zoneName || '—')}
              {cell('Ward', fp.wardName || '—')}
              {cell('Kothi', fp.kothiName || '—')}
              {cell('Status', fp.status)}
              {cell('Priority', fp.priority)}
              {cell('Assignment', fp.assignmentDetails?.name || 'Unassigned')}
              {cell('Total Reports', String(reports.length))}
              {cell('Last Submitted', latestReport ? (getReportDate(latestReport)?.toLocaleDateString() || '—') : 'Never')}
            </div>
          </section>

          <div style={{ borderTop: `1px dashed ${T.cardBorder}` }} />

          {/* 2. Status Summary */}
          <section>
            <p className="text-sm font-bold mb-3" style={{ color: T.textPrimary }}>2. Report Status Summary</p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {[
                { label: 'Total', value: statusSummary.total, color: T.accent },
                { label: 'Approved', value: statusSummary.approved, color: T.green },
                { label: 'Rejected', value: statusSummary.rejected, color: T.red },
                { label: 'Requires Action', value: statusSummary.requiresAction, color: T.amber },
                { label: 'Pending', value: statusSummary.pending, color: T.textMuted },
              ].map(s => (
                <div key={s.label} className="rounded-xl px-3 py-2.5 text-center"
                  style={{ background: `${s.color}10`, border: `1px solid ${s.color}25` }}>
                  <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: s.color }}>{s.label}</p>
                  <p className="text-[20px] font-bold" style={{ color: s.color, fontFamily: "'JetBrains Mono', monospace" }}>{s.value}</p>
                </div>
              ))}
            </div>
          </section>

          <div style={{ borderTop: `1px dashed ${T.cardBorder}` }} />

          {/* 3. Trip Summary */}
          <section>
            <p className="text-sm font-bold mb-3" style={{ color: T.textPrimary }}>3. Trip-wise Summary</p>
            <div className="overflow-x-auto rounded-xl" style={{ border: `1px solid ${T.cardBorder}` }}>
              <table className="w-full" style={{ fontSize: 12 }}>
                <thead>
                  <tr style={{ background: T.surface, borderBottom: `1px solid ${T.cardBorder}` }}>
                    {['Trip', 'Time', 'Distance', 'Clean', 'Segregated', 'Vehicle', 'Workers', 'Photos'].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-semibold uppercase tracking-wider" style={{ fontSize: 10, color: T.textSecondary }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tripRows.map(row => (
                    <tr key={row.label} style={{ borderBottom: `1px solid ${T.gridLine}` }}>
                      <td className="px-3 py-2 font-semibold" style={{ color: T.textPrimary }}>{row.label}</td>
                      <td className="px-3 py-2" style={{ color: T.textSecondary }}>{row.time}</td>
                      <td className="px-3 py-2" style={{ color: T.textSecondary }}>{row.distance}</td>
                      <td className="px-3 py-2" style={{ color: row.clean === 'Yes' ? T.green : row.clean === 'No' ? T.red : T.textMuted }}>{row.clean}</td>
                      <td className="px-3 py-2" style={{ color: row.segregated === 'Yes' ? T.green : row.segregated === 'No' ? T.red : T.textMuted }}>{row.segregated}</td>
                      <td className="px-3 py-2" style={{ color: row.vehicle === 'Yes' ? T.green : row.vehicle === 'No' ? T.red : T.textMuted }}>{row.vehicle}</td>
                      <td className="px-3 py-2" style={{ color: T.textSecondary }}>{row.workers}</td>
                      <td className="px-3 py-2" style={{ color: row.photo === 'Yes' ? T.green : T.textMuted }}>
                        {row.photos.length > 0 ? `${row.photos.length} photo${row.photos.length > 1 ? 's' : ''}` : row.hasData ? 'None' : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Photo Evidence */}
          {tripRows.some(r => r.photos.length > 0) && (
            <>
              <div style={{ borderTop: `1px dashed ${T.cardBorder}` }} />
              <section>
                <p className="text-sm font-bold mb-3" style={{ color: T.textPrimary }}>4. Photo Evidence</p>
                <div className="space-y-3">
                  {tripRows.filter(r => r.photos.length > 0).map(row => (
                    <div key={row.label} className="rounded-xl p-3" style={{ border: `1px solid ${T.cardBorder}` }}>
                      <p className="text-xs font-semibold mb-2" style={{ color: T.textSecondary }}>{row.label}</p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {row.photos.map((url: string, pi: number) => (
                          <a key={pi} href={url} target="_blank" rel="noreferrer"
                            className="relative block overflow-hidden rounded-lg group"
                            style={{ border: `1px solid ${T.cardBorder}` }}>
                            <img src={url} alt={`${row.label} ${pi + 1}`}
                              className="h-28 w-full object-cover transition group-hover:scale-105" />
                            <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-xs font-semibold text-white transition group-hover:bg-black/40">
                              View
                            </span>
                          </a>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}

          <div style={{ borderTop: `1px dashed ${T.cardBorder}` }} />

          {/* Report History */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold" style={{ color: T.textPrimary }}>5. Report History ({history.length})</p>
              <select value={histFilter} onChange={e => { setHistFilter(e.target.value); setHistPage(1) }}
                style={{ background: T.surface, border: `1px solid ${T.cardBorder}`, color: T.textPrimary, borderRadius: 8, padding: '4px 8px', fontSize: 11, outline: 'none' }}>
                <option value="all">All</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="pending">Pending</option>
                <option value="requires_action">Requires Action</option>
              </select>
            </div>

            <div className="overflow-x-auto rounded-xl" style={{ border: `1px solid ${T.cardBorder}` }}>
              <table className="w-full" style={{ fontSize: 11 }}>
                <thead>
                  <tr style={{ background: T.surface, borderBottom: `1px solid ${T.cardBorder}` }}>
                    {['Date', 'Trip', 'Status', 'Submitted By', 'ID'].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-semibold uppercase tracking-wider" style={{ fontSize: 9, color: T.textSecondary }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagedHist.length > 0 ? pagedHist.map((item: any) => (
                    <tr key={item.key} onClick={() => setSelReport(item.ref)}
                      style={{
                        borderBottom: `1px solid ${T.gridLine}`,
                        background: selReport === item.ref ? `${T.accent}10` : 'transparent',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={e => { if (selReport !== item.ref) (e.currentTarget as HTMLElement).style.background = dark ? T.surface : '#f8f9fb' }}
                      onMouseLeave={e => { if (selReport !== item.ref) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                    >
                      <td className="px-3 py-2" style={{ color: T.textPrimary }}>{item.date}</td>
                      <td className="px-3 py-2" style={{ color: T.textSecondary }}>{item.trip}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex px-2 py-0.5 text-[10px] font-semibold rounded-full ${item.badge.cls}`}>
                          {item.badge.label}
                        </span>
                      </td>
                      <td className="px-3 py-2" style={{ color: T.textSecondary }}>{item.submittedBy}</td>
                      <td className="px-3 py-2 font-mono text-[10px]" style={{ color: T.textMuted }}>{item.id.slice(-8)}</td>
                    </tr>
                  )) : (
                    <tr><td colSpan={5} className="px-3 py-6 text-center text-xs" style={{ color: T.textMuted }}>No reports match this filter</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {histPages > 1 && (
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs" style={{ color: T.textMuted }}>Page {histPage} of {histPages}</span>
                <div className="flex gap-2">
                  <button disabled={histPage === 1} onClick={() => setHistPage(p => p - 1)}
                    className="text-xs px-2.5 py-1 rounded-lg disabled:opacity-30"
                    style={{ border: `1px solid ${T.cardBorder}`, color: T.textSecondary, background: 'transparent', cursor: histPage === 1 ? 'not-allowed' : 'pointer' }}>
                    Prev
                  </button>
                  <button disabled={histPage === histPages} onClick={() => setHistPage(p => p + 1)}
                    className="text-xs px-2.5 py-1 rounded-lg disabled:opacity-30"
                    style={{ border: `1px solid ${T.cardBorder}`, color: T.textSecondary, background: 'transparent', cursor: histPage === histPages ? 'not-allowed' : 'pointer' }}>
                    Next
                  </button>
                </div>
              </div>
            )}

            {/* Selected report detail */}
            {selReport && (
              <div className="mt-4 rounded-xl p-4" style={{ background: T.surface, border: `1px solid ${T.accentBorder}` }}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-bold" style={{ color: T.accent }}>Report Detail</p>
                  <button onClick={() => setSelReport(null)} style={{ color: T.textMuted, background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}>×</button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm mb-3">
                  {cell('Status', statusBadge(selReport.status).label)}
                  {cell('Trip', selReport.tripNumber ? `Trip ${selReport.tripNumber}` : '—')}
                  {cell('Date', getReportDate(selReport)?.toLocaleString() || '—')}
                  {cell('Submitted By', `${selReport.userName || '—'}${selReport.teamName ? ` (${selReport.teamName})` : ''}`)}
                  {cell('Distance', typeof selReport.distanceFromFeederPoint === 'number' ? `${Math.round(selReport.distanceFromFeederPoint)}m` : '—')}
                  {cell('Report ID', selReport.id?.slice(-8) || '—')}
                </div>

                {selReport.answers && selReport.answers.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: T.textSecondary }}>Responses</p>
                      <button onClick={handleAI} disabled={aiLoading}
                        className="text-[11px] font-semibold px-2.5 py-1 rounded-lg transition hover:opacity-80 disabled:opacity-50"
                        style={{ background: `${T.accent}20`, color: T.accent, border: `1px solid ${T.accentBorder}`, cursor: aiLoading ? 'wait' : 'pointer' }}>
                        {aiLoading ? 'Analyzing…' : '✦ Analyze with AI'}
                      </button>
                    </div>
                    <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${T.cardBorder}` }}>
                      {selReport.answers.map((a: ComplianceAnswer, i: number) => (
                        <div key={i} className="px-3 py-2.5" style={{ borderBottom: i < selReport.answers!.length - 1 ? `1px solid ${T.gridLine}` : 'none' }}>
                          <p className="text-[10px] font-semibold" style={{ color: T.textMuted }}>
                            {a.description?.trim() || humanizeKey(a.questionId || `Q${i + 1}`)}
                          </p>
                          <p className="text-sm mt-0.5" style={{ color: T.textPrimary }}>{a.answer?.toString() || '—'}</p>
                          {a.notes && <p className="text-[10px] mt-0.5" style={{ color: T.textMuted }}>Note: {a.notes}</p>}
                          {a.photos && a.photos.length > 0 && (
                            <div className="flex gap-2 mt-1.5 flex-wrap">
                              {a.photos.map((url: string, pi: number) => (
                                <a key={pi} href={url} target="_blank" rel="noreferrer"
                                  className="text-[10px] font-semibold px-2 py-0.5 rounded-lg"
                                  style={{ background: `${T.accent}15`, color: T.accent }}>
                                  Photo {pi + 1}
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    {aiError && <p className="mt-2 text-xs rounded-lg px-3 py-2" style={{ background: `${T.red}10`, color: T.red }}>{aiError}</p>}
                    {aiResult && (
                      <div className="mt-2 rounded-xl p-3" style={{ background: `${T.accent}10`, border: `1px solid ${T.accentBorder}` }}>
                        <p className="text-[10px] font-bold mb-1" style={{ color: T.accent }}>AI Assessment</p>
                        <pre className="whitespace-pre-wrap text-sm" style={{ color: T.textPrimary }}>{aiResult}</pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}