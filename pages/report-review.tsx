'use client'

import { useEffect, useMemo, useState, useCallback, useRef, Fragment } from 'react'
import {
  CheckCircle, X, AlertTriangle, Clock, Calendar,
  ChevronDown, Eye, FileText, MapPin, User, Users,
  Loader2, Image as ImageIcon, ZoomIn, ExternalLink,
  Search, RefreshCw, ArrowUpDown, Inbox, Truck,
  MessageSquare, Filter, Zap,
} from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { DataService, ComplianceReport } from '@/lib/dataService'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'
import { getTokens } from '@/lib/dashboardTheme'
import { useSearchParams } from 'next/navigation'

// ─── Types ────────────────────────────────────────────────────────────────────
type TabKey     = 'total' | 'pending' | 'approved' | 'rejected' | 'requires_action'
type DatePreset = 'today' | 'yesterday' | 'week' | 'month' | 'all' | 'custom'
type SortField = 'date' | 'feederPoint' | 'userName'
type PointType = 'all' | 'feeder' | 'chronic'

const PAGE_SIZE = 20
const LOAD_MORE_SIZE = 20

// ─── Helpers ──────────────────────────────────────────────────────────────────
const todayStr = () => new Date().toISOString().split('T')[0]

function getDateRange(preset: DatePreset, customStart?: string, customEnd?: string) {
  const today = todayStr()
  switch (preset) {
    case 'today': return { start: today, end: today }
    case 'yesterday': { const d = new Date(); d.setDate(d.getDate() - 1); const y = d.toISOString().split('T')[0]; return { start: y, end: y } }
    case 'week': { const d = new Date(); d.setDate(d.getDate() - 7); return { start: d.toISOString().split('T')[0], end: today } }
    case 'month': { const d = new Date(); return { start: new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0], end: today } }
    case 'all': return { start: '2020-01-01', end: today }
    case 'custom': return { start: customStart || '2020-01-01', end: customEnd || today }
  }
}

function getReportAnswers(r: ComplianceReport): any[] {
  if (Array.isArray(r.answers)) return r.answers
  // Legacy reports store answers as numbered keys on the root object
  const ans: any[] = []
  let i = 0
  while ((r as any)[i] !== undefined) { ans.push((r as any)[i]); i++ }
  return ans
}

function getReportType(r: ComplianceReport): 'feeder' | 'chronic' {
  return (r.feederPointType === 'chronic') ? 'chronic' : 'feeder'
}

function getTS(r: ComplianceReport): number {
  try {
    const v = r.submittedAt
    const d = v?.toDate ? v.toDate() : new Date(v)
    if (!isNaN(d.getTime())) return d.getTime()
  } catch { }
  return 0
}

function fmtShort(r: ComplianceReport): string {
  try {
    const ts = getTS(r)
    if (ts) return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch { }
  return '—'
}

function fmtFull(r: ComplianceReport): string {
  try {
    const ts = getTS(r)
    if (ts) return new Date(ts).toLocaleString()
  } catch { }
  return '—'
}

function timeSince(r: ComplianceReport): string {
  const diff = Date.now() - getTS(r)
  const m = Math.floor(diff / 60000), h = Math.floor(m / 60), dy = Math.floor(h / 24)
  if (m < 1) return 'Just now'
  if (m < 60) return `${m}m ago`
  if (h < 24) return `${h}h ago`
  if (dy < 7) return `${dy}d ago`
  return `${Math.floor(dy / 7)}w ago`
}

function inDateRange(r: ComplianceReport, start: string, end: string): boolean {
  if (start === '2020-01-01') return true // 'all' preset
  try {
    const td = r.tripDate
    if (typeof td === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(td)) return td >= start && td <= end
    const ts = getTS(r)
    if (ts) {
      const d = new Date(ts).toISOString().split('T')[0]
      return d >= start && d <= end
    }
  } catch { }
  return false
}

// ─── Tab config (using T tokens, set at render time) ─────────────────────────
const TABS: TabKey[] = ['total', 'pending', 'approved', 'rejected', 'requires_action']
const TAB_LABELS: Record<TabKey, string> = { total: 'Total', pending: 'Pending', approved: 'Approved', rejected: 'Rejected', requires_action: 'Action Req.' }
const TAB_FULL:   Record<TabKey, string> = { total: 'All Reports', pending: 'Pending Reports', approved: 'Approved Reports', rejected: 'Rejected Reports', requires_action: 'Action Required' }
const DATE_PRESETS: { key: DatePreset; label: string }[] = [
  { key: 'today', label: 'Today' }, { key: 'yesterday', label: 'Yesterday' },
  { key: 'week', label: 'This Week' }, { key: 'month', label: 'This Month' },
  { key: 'all', label: 'All' }, { key: 'custom', label: 'Custom' },
]

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ReportReviewPage() {
  const { user } = useAuth()
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const T = getTokens(dark)
  const qc = useQueryClient()
  const searchParams = useSearchParams()
  const isPmc = user?.role === 'pmc_member'

  const getInitialTab = (): TabKey => {
    const t = searchParams.get('tab')
    return (TABS.includes(t as TabKey)) ? t as TabKey : 'pending'
  }

  const [activeTab, setActiveTab] = useState<TabKey>(getInitialTab())
  const [datePreset, setDatePreset] = useState<DatePreset>('today')
  const [pointType, setPointType] = useState<PointType>('all')
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<SortField>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [dispCount, setDispCount] = useState(PAGE_SIZE)
  const [selected, setSelected] = useState<ComplianceReport | null>(null)
  const [changing, setChanging] = useState<string | null>(null)
  const [allReports, setAllReports] = useState<ComplianceReport[]>([])
  const [loading, setLoading] = useState(true)
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')

  const loadMoreRef = useRef<HTMLDivElement>(null)

  const dateRange = useMemo(() => getDateRange(datePreset, customStart, customEnd), [datePreset, customStart, customEnd])

  // Live subscription
  useEffect(() => {
    setLoading(true)
    const unsub = DataService.onComplianceReportsChange((reports: ComplianceReport[]) => {
      setAllReports(reports)
      setLoading(false)
    })
    return () => unsub()
  }, [])

  // Tab counts — by status + date + type
 const tabCounts = useMemo(() => {
    const c: Record<TabKey, number> = { total:0, pending:0, approved:0, rejected:0, requires_action:0 }
    const q = search.trim().toLowerCase()
    allReports.forEach(r => {
      if (!inDateRange(r, dateRange.start, dateRange.end)) return
      if (pointType !== 'all' && getReportType(r) !== pointType) return
      if (q && !([(r.feederPointName||''),(r.userName||''),(r.teamName||''),(r.description||'')].some(v=>v.toLowerCase().includes(q)))) return
      c.total++
      if (r.status in c) c[r.status as TabKey]++
    })
    return c
  }, [allReports, dateRange, pointType, search])

const typeSplit = useMemo(() => {
    const q = search.trim().toLowerCase()
    const matchesSearch = (r: ComplianceReport) =>
      !q || [(r.feederPointName||''),(r.userName||''),(r.teamName||''),(r.description||'')].some(v=>v.toLowerCase().includes(q))
    const matchesStatus = (r: ComplianceReport) => activeTab === 'total' || r.status === activeTab
    const feeder  = allReports.filter(r => matchesStatus(r) && inDateRange(r, dateRange.start, dateRange.end) && getReportType(r) === 'feeder' && matchesSearch(r)).length
    const chronic = allReports.filter(r => matchesStatus(r) && inDateRange(r, dateRange.start, dateRange.end) && getReportType(r) === 'chronic' && matchesSearch(r)).length
    return { feeder, chronic }
  }, [allReports, activeTab, dateRange, search])

  const filtered = useMemo(() => {
   let list = allReports.filter(r => {
      if (activeTab !== 'total' && r.status !== activeTab) return false
      if (!inDateRange(r, dateRange.start, dateRange.end)) return false
      if (pointType !== 'all' && getReportType(r) !== pointType) return false
      if (search.trim()) {
        const q = search.trim().toLowerCase()
        if (![(r.feederPointName || ''), (r.userName || ''), (r.teamName || ''), (r.description || '')].some(v => v.toLowerCase().includes(q))) return false
      }
      return true
    })
    list.sort((a, b) => {
      let cmp = 0
      if (sortField === 'date') cmp = getTS(a) - getTS(b)
      if (sortField === 'feederPoint') cmp = (a.feederPointName || '').localeCompare(b.feederPointName || '')
      if (sortField === 'userName') cmp = (a.userName || '').localeCompare(b.userName || '')
      return sortDir === 'desc' ? -cmp : cmp
    })
    return list
  }, [allReports, activeTab, dateRange, pointType, search, sortField, sortDir])

  const displayed = useMemo(() => filtered.slice(0, dispCount), [filtered, dispCount])
  const hasMore = dispCount < filtered.length

  useEffect(() => { setDispCount(PAGE_SIZE) }, [activeTab, search, sortField, sortDir, datePreset, pointType])

  useEffect(() => {
    if (!hasMore || !loadMoreRef.current) return
    const obs = new IntersectionObserver(entries => {
      if (entries[0]?.isIntersecting) setDispCount(p => p + LOAD_MORE_SIZE)
    }, { threshold: 0.1, rootMargin: '200px' })
    obs.observe(loadMoreRef.current)
    return () => obs.disconnect()
  }, [hasMore, displayed.length])

  const handleSort = (f: SortField) => {
    if (sortField === f) setSortDir(p => p === 'asc' ? 'desc' : 'asc')
    else { setSortField(f); setSortDir('desc') }
  }

  const handleQuickStatus = async (r: ComplianceReport, s: ComplianceReport['status']) => {
    if (!user) return
    setChanging(r.id)
    try { await DataService.updateComplianceReportStatus(r.id, s, '', user.name) }
    catch { alert('Failed to update status.') }
    finally { setChanging(null) }
  }

  const handleDetailStatus = async (r: ComplianceReport, s: ComplianceReport['status'], notes: string) => {
    if (!user) return
    await DataService.updateComplianceReportStatus(r.id, s, notes, user.name)
  }

  const total = Object.values(tabCounts).reduce((a, b) => a + b, 0)
  const tabColor  = (tab: TabKey) => ({ total: T.accent, pending: T.amber, approved: T.green, rejected: T.red, requires_action: T.red }[tab])
  const activeColor = tabColor(activeTab)

  return (
    <div className="flex flex-col gap-5">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl"
            style={{ background: T.accentDim, border: `1px solid ${T.accentBorder}` }}>
            <FileText className="h-6 w-6" style={{ color: T.accent }} />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight" style={{ color: T.textPrimary }}>Report Review</h1>
            <p className="text-sm" style={{ color: T.textMuted }}>
              {total} reports in range · {typeSplit.feeder} feeder · {typeSplit.chronic} chronic
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {tabCounts.pending > 0 && (
            <button onClick={() => setActiveTab('pending')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold animate-pulse"
              style={{ background: `${T.amber}15`, border: `1px solid ${T.amber}40`, color: T.amber, cursor: 'pointer' }}>
              <Clock className="h-3.5 w-3.5" /> {tabCounts.pending} Pending
            </button>
          )}
          <button onClick={() => qc.invalidateQueries()} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold disabled:opacity-50"
            style={{ background: T.surface, border: `1px solid ${T.cardBorder}`, color: T.textSecondary, cursor: 'pointer' }}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {/* ── Main Card ── */}
      <div className="rounded-2xl overflow-hidden" style={{ background: T.card, border: `1px solid ${T.cardBorder}` }}>

        {/* Date + Type filters */}
        <div className="flex flex-wrap items-center gap-3 px-5 py-3.5" style={{ borderBottom: `1px solid ${T.cardBorder}`, background: T.surface }}>
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: T.textMuted }}>
            <Calendar className="h-3.5 w-3.5" /> Period
          </div>
          <div className="flex flex-wrap gap-1.5">
            {DATE_PRESETS.map(p => (
              <button key={p.key} onClick={() => setDatePreset(p.key)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                style={{ background: datePreset === p.key ? T.accent : T.card, color: datePreset === p.key ? (dark ? '#000' : '#fff') : T.textSecondary, border: `1px solid ${datePreset === p.key ? T.accent : T.cardBorder}`, cursor: 'pointer' }}>
                {p.label}
              </button>
            ))}
          </div>
          {datePreset === 'custom' && (
            <div className="flex items-center gap-2">
              <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
                max={customEnd || todayStr()}
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold"
                style={{ background: T.card, border: `1px solid ${T.cardBorder}`, color: T.textPrimary, outline: 'none', colorScheme: dark ? 'dark' : 'light' }} />
              <span className="text-xs" style={{ color: T.textMuted }}>to</span>
              <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
                min={customStart} max={todayStr()}
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold"
                style={{ background: T.card, border: `1px solid ${T.cardBorder}`, color: T.textPrimary, outline: 'none', colorScheme: dark ? 'dark' : 'light' }} />
            </div>
          )}
          <div className="flex items-center gap-1 ml-auto">
            {(['all', 'feeder', 'chronic'] as PointType[]).map(pt => (
              <button key={pt} onClick={() => setPointType(pt)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold"
                style={{
                  background: pointType === pt ? (pt === 'chronic' ? `${T.gold}20` : T.accentDim) : T.card,
                  color: pointType === pt ? (pt === 'chronic' ? T.gold : T.accent) : T.textSecondary,
                  border: `1px solid ${pointType === pt ? (pt === 'chronic' ? T.gold : T.accent) : T.cardBorder}`,
                  cursor: 'pointer',
                }}>
                {pt === 'feeder' && <Zap className="h-3 w-3" />}
                {pt === 'chronic' && <Zap className="h-3 w-3" />}
                {pt.charAt(0).toUpperCase() + pt.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Search + Sort */}
        <div className="px-4 py-3" style={{ borderBottom: `1px solid ${T.cardBorder}`, background: dark ? T.surface : '#fafafa' }}>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: T.textMuted }} />
              <input type="text" placeholder="Search feeder point, user, team..."
                value={search} onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-8 py-2 rounded-xl text-sm"
                style={{ background: T.card, border: `1px solid ${T.cardBorder}`, color: T.textPrimary, outline: 'none' }} />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textMuted }}>
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {(['date', 'feederPoint', 'userName'] as SortField[]).map(f => (
                <button key={f} onClick={() => handleSort(f)}
                  className="flex items-center gap-1 px-2.5 py-2 rounded-lg text-xs font-semibold"
                  style={{
                    background: sortField === f ? T.accentDim : T.card,
                    color: sortField === f ? T.accent : T.textSecondary,
                    border: `1px solid ${sortField === f ? T.accentBorder : T.cardBorder}`,
                    cursor: 'pointer',
                  }}>
                  {f === 'date' ? 'Date' : f === 'feederPoint' ? 'Point' : 'User'}
                  {sortField === f && <ArrowUpDown className="h-3 w-3" />}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px]" style={{ color: T.textMuted }}>
            <span>Showing {displayed.length} of {filtered.length} {TAB_LABELS[activeTab].toLowerCase()} reports</span>
            <div className="flex items-center gap-3">
              <span style={{ color: T.accent }}>F: {typeSplit.feeder}</span>
              <span style={{ color: T.gold }}>C: {typeSplit.chronic}</span>
              {search && <span style={{ color: T.accent }}>Filtered: "{search}"</span>}
            </div>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 p-4">
          {TABS.map(tab => {
            const color = tabColor(tab)
            const active = activeTab === tab
            return (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className="rounded-xl p-4 text-left transition-all"
                style={{
                  background: active ? `${color}15` : T.surface,
                  border: `1px solid ${active ? color : T.cardBorder}`,
                  cursor: 'pointer',
                  transform: active ? 'translateY(-1px)' : 'none',
                  boxShadow: active ? `0 4px 12px ${color}25` : 'none',
                }}>
                <div className="flex items-center gap-2 mb-2">
                {tab==='total'           && <FileText className="h-4 w-4" style={{ color }} />}
                  {tab==='pending'         && <Clock className="h-4 w-4" style={{ color }} />}
                  {tab==='approved'        && <CheckCircle className="h-4 w-4" style={{ color }} />}
                  {tab==='rejected'        && <X className="h-4 w-4" style={{ color }} />}
                  {tab==='requires_action' && <AlertTriangle className="h-4 w-4" style={{ color }} />}
                </div>
                <p className="text-[22px] font-bold leading-none" style={{ color, fontFamily: "'JetBrains Mono', monospace" }}>
                  {tabCounts[tab].toLocaleString()}
                </p>
                <p className="text-[10px] font-semibold uppercase tracking-wider mt-1" style={{ color: active ? color : T.textSecondary }}>
                  {TAB_LABELS[tab]}
                </p>
                {active && tab === 'pending' && tabCounts.pending > 0 && (
                  <div className="mt-1.5 h-1 rounded-full" style={{ background: `${color}30` }}>
                    <div className="h-full rounded-full animate-pulse" style={{ width: '60%', background: color }} />
                  </div>
                )}
              </button>
            )
          })}
        </div>

        <div style={{ height: 1, background: T.cardBorder, margin: '0 16px' }} />

        <div className="p-4">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-xl p-4 animate-pulse" style={{ background: T.surface, border: `1px solid ${T.cardBorder}` }}>
                  <div className="flex gap-3 mb-3">
                    <div className="h-9 w-9 rounded-lg flex-shrink-0" style={{ background: T.cardBorder }} />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 rounded" style={{ background: T.cardBorder, width: '75%' }} />
                      <div className="h-3 rounded" style={{ background: T.cardBorder, width: '50%' }} />
                    </div>
                  </div>
                  <div className="h-3 rounded mb-2" style={{ background: T.cardBorder }} />
                  <div className="h-3 rounded" style={{ background: T.cardBorder, width: '66%' }} />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl mb-4"
                style={{ background: `${activeColor}15` }}>
                <Inbox className="h-8 w-8" style={{ color: activeColor, opacity: 0.6 }} />
              </div>
              <p className="text-sm font-semibold" style={{ color: T.textPrimary }}>No {TAB_LABELS[activeTab]} Reports</p>
              <p className="text-xs mt-1" style={{ color: T.textMuted }}>
                {activeTab === 'pending' ? 'All reports reviewed for this period.' : `No ${TAB_FULL[activeTab].toLowerCase()} for the selected filters.`}
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {displayed.map(r => (
                  <Fragment key={r.id}>
                    {changing === r.id ? (
                      <div className="rounded-xl p-8 flex items-center justify-center"
                        style={{ background: T.surface, border: `1px solid ${T.cardBorder}` }}>
                        <Loader2 className="h-6 w-6 animate-spin" style={{ color: T.accent }} />
                      </div>
                    ) : (
                      <ReportCard report={r} dark={dark} T={T}
                        activeTab={activeTab} activeColor={activeColor}
                        onView={setSelected}
                        onStatusChange={isPmc ? undefined : handleQuickStatus} />
                    )}
                  </Fragment>
                ))}
              </div>

              {hasMore && (
                <div ref={loadMoreRef} className="mt-6 flex flex-col items-center gap-2">
                  <button onClick={() => setDispCount(p => p + LOAD_MORE_SIZE)}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium"
                    style={{ background: T.surface, border: `1px solid ${T.cardBorder}`, color: T.textSecondary, cursor: 'pointer' }}>
                    <ChevronDown className="h-4 w-4" />
                    Load More ({filtered.length - dispCount} remaining)
                  </button>
                </div>
              )}
              {!hasMore && filtered.length > PAGE_SIZE && (
                <p className="mt-6 text-center text-xs" style={{ color: T.textMuted }}>All {filtered.length} reports loaded</p>
              )}
            </>
          )}
        </div>
      </div>

      {selected && (
        <DetailModal
          report={selected} dark={dark} T={T}
          onClose={() => setSelected(null)}
          onStatusChange={isPmc ? undefined : handleDetailStatus}
          isPmcMember={isPmc} />
      )}
    </div>
  )
}

// ─── Report Card ──────────────────────────────────────────────────────────────
function ReportCard({ report, dark, T, activeTab, activeColor, onView, onStatusChange }: {
  report: ComplianceReport; dark: boolean; T: any
  activeTab: TabKey; activeColor: string
  onView: (r: ComplianceReport) => void
  onStatusChange?: (r: ComplianceReport, s: ComplianceReport['status']) => void
}) {
  const isPending = activeTab === 'pending'
  const rtype = getReportType(report)
  const typeColor = rtype === 'chronic' ? T.gold : T.accent
  const answers = getReportAnswers(report)
  const imgCount = answers.reduce((n: number, a: any) => n + (Array.isArray(a.photos) ? a.photos.filter((p: string) => p.startsWith('https')).length : 0), 0)

  return (
    <div className="rounded-xl overflow-hidden transition-all hover:-translate-y-0.5"
      style={{ background: T.card, border: `1px solid ${T.cardBorder}`, boxShadow: `0 0 0 0 ${activeColor}` }}>
      {/* Top accent */}
      <div className="h-0.5" style={{ background: activeColor }} />

      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-start gap-2.5 flex-1 min-w-0">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg mt-0.5"
              style={{ background: `${activeColor}15` }}>
              {activeTab === 'total' && <FileText className="h-4 w-4" style={{ color: activeColor }} />}
              {activeTab === 'pending' && <Clock className="h-4 w-4" style={{ color: activeColor }} />}
              {activeTab === 'approved' && <CheckCircle className="h-4 w-4" style={{ color: activeColor }} />}
              {activeTab === 'rejected' && <X className="h-4 w-4" style={{ color: activeColor }} />}
              {activeTab === 'requires_action' && <AlertTriangle className="h-4 w-4" style={{ color: activeColor }} />}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate" style={{ color: T.textPrimary }}>
                {report.feederPointName || 'Unknown Point'}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ background: `${typeColor}20`, color: typeColor }}>
                  {rtype.toUpperCase()}
                </span>
                {report.tripNumber && (
                  <span className="flex items-center gap-1 text-[11px]" style={{ color: T.textMuted }}>
                    <Truck className="h-3 w-3" /> Trip {report.tripNumber}
                  </span>
                )}
                {report.tripDate && <span className="text-[11px]" style={{ color: T.textMuted }}>{report.tripDate}</span>}
              </div>
            </div>
          </div>
          {isPending && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
              style={{ background: `${T.amber}15`, color: T.amber }}>
              {timeSince(report)}
            </span>
          )}
        </div>

        {/* Meta */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]" style={{ color: T.textMuted }}>
          <span className="flex items-center gap-1"><User className="h-3 w-3" />{report.userName || 'Unknown'}</span>
          {report.teamName && <span className="flex items-center gap-1"><Users className="h-3 w-3" />{report.teamName}</span>}
          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{fmtShort(report)}</span>
          {imgCount > 0 && <span className="flex items-center gap-1" style={{ color: T.accent }}><ImageIcon className="h-3 w-3" />{imgCount} photo{imgCount !== 1 ? 's' : ''}</span>}
        </div>

        <div className="flex items-center gap-2 mt-1.5 text-[11px]" style={{ color: T.textMuted }}>
          <FileText className="h-3 w-3" />
          {answers.length} answer{answers.length !== 1 ? 's' : ''}
          {typeof report.distanceFromFeederPoint === 'number' && report.distanceFromFeederPoint > 0 && (
            <><span>·</span><MapPin className="h-3 w-3" />{report.distanceFromFeederPoint.toFixed(0)}m from FP</>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 rounded-b-xl"
        style={{ borderTop: `1px solid ${T.cardBorder}`, background: dark ? T.surface : '#fafafa' }}>
        <button onClick={() => onView(report)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
          style={{ background: T.card, border: `1px solid ${T.cardBorder}`, color: T.textSecondary, cursor: 'pointer' }}>
          <Eye className="h-3.5 w-3.5" /> View
        </button>

        {onStatusChange && (
          <div className="flex items-center gap-1.5">
            {activeTab !== 'approved' && (
              <button onClick={() => onStatusChange(report, 'approved')}
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium"
                style={{ background: `${T.green}15`, border: `1px solid ${T.green}30`, color: T.green, cursor: 'pointer' }}>
                <CheckCircle className="h-3.5 w-3.5" /><span className="hidden lg:inline">Approve</span>
              </button>
            )}
            {activeTab !== 'rejected' && (
              <button onClick={() => onStatusChange(report, 'rejected')}
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium"
                style={{ background: `${T.red}15`, border: `1px solid ${T.red}30`, color: T.red, cursor: 'pointer' }}>
                <X className="h-3.5 w-3.5" /><span className="hidden lg:inline">Reject</span>
              </button>
            )}
            {activeTab !== 'requires_action' && (
              <button onClick={() => onStatusChange(report, 'requires_action')}
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium"
                style={{ background: `${T.amber}15`, border: `1px solid ${T.amber}30`, color: T.amber, cursor: 'pointer' }}>
                <AlertTriangle className="h-3.5 w-3.5" /><span className="hidden lg:inline">Action</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Detail Modal ─────────────────────────────────────────────────────────────
function DetailModal({ report, dark, T, onClose, onStatusChange, isPmcMember }: {
  report: ComplianceReport; dark: boolean; T: any
  onClose: () => void
  onStatusChange?: (r: ComplianceReport, s: ComplianceReport['status'], notes: string) => Promise<void>
  isPmcMember?: boolean
}) {
  const [notes, setNotes] = useState('')
  const [updating, setUpdating] = useState(false)
  const [bigImg, setBigImg] = useState<string | null>(null)
  const [imgErr, setImgErr] = useState<Record<string, boolean>>({})

  const rtype = getReportType(report)
  const color = rtype === 'chronic' ? T.gold : T.accent
  const answers = getReportAnswers(report)

  const doStatus = async (s: ComplianceReport['status']) => {
    if (!onStatusChange) return
    setUpdating(true)
    try { await onStatusChange(report, s, notes); onClose() }
    catch { alert('Failed to update status. Please try again.') }
    finally { setUpdating(false) }
  }

  const statusColor = { total: T.accent, pending: T.amber, approved: T.green, rejected: T.red, requires_action: T.red, action_taken: T.accent }[report.status as TabKey | 'action_taken'] ?? T.textMuted
  const allPhotos = answers.flatMap((a: any) => (Array.isArray(a.photos) ? a.photos.filter((p: string) => p.startsWith('https')) : []))

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-2 sm:p-4 overflow-y-auto"
        style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }} onClick={onClose}>
        <div className="w-full max-w-3xl my-2 sm:my-8 rounded-2xl overflow-hidden shadow-2xl"
          style={{ background: T.card, border: `1px solid ${T.cardBorder}` }} onClick={e => e.stopPropagation()}>

          {/* Modal header */}
          <div className="px-5 py-4" style={{ background: `linear-gradient(135deg, ${color}20, ${color}08)`, borderBottom: `1px solid ${T.cardBorder}` }}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{ background: `${color}25`, color, border: `1px solid ${color}40` }}>
                    {rtype.toUpperCase()}
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{ background: `${statusColor}20`, color: statusColor }}>
                    {report.status.replace(/_/g, ' ').toUpperCase()}
                  </span>
                </div>
                <h2 className="text-lg font-bold truncate" style={{ color: T.textPrimary }}>
                  {report.feederPointName || 'Unknown Feeder Point'}
                </h2>
                <p className="text-sm mt-0.5" style={{ color: T.textSecondary }}>
                  {report.tripNumber ? `Trip ${report.tripNumber}` : ''}{report.tripDate ? ` · ${report.tripDate}` : ''}
                </p>
              </div>
              <button onClick={onClose} className="flex items-center justify-center w-8 h-8 rounded-xl flex-shrink-0"
                style={{ background: T.surface, border: `1px solid ${T.cardBorder}`, color: T.textSecondary, cursor: 'pointer' }}>
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="max-h-[calc(100vh-200px)] overflow-y-auto">
            <div className="p-5 space-y-5">

              {/* Pending banner */}
              {report.status === 'pending' && !isPmcMember && (
                <div className="flex items-start gap-3 rounded-xl p-3"
                  style={{ background: `${T.amber}10`, border: `1px solid ${T.amber}30` }}>
                  <Clock className="h-4 w-4 flex-shrink-0 mt-0.5" style={{ color: T.amber }} />
                  <div>
                    <p className="text-sm font-semibold" style={{ color: T.amber }}>Awaiting review</p>
                    <p className="text-xs mt-0.5" style={{ color: T.textMuted }}>Review details and take action below.</p>
                  </div>
                </div>
              )}

              {/* Info grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { label: 'Status', value: report.status.replace(/_/g, ' '), color: statusColor },
                  { label: 'Type', value: rtype, color },
                  { label: 'Answers', value: String(answers.length), color: T.textPrimary },
                  { label: 'Photos', value: String(allPhotos.length), color: T.accent },
                ].map((item, i) => (
                  <div key={i} className="rounded-xl p-3 text-center"
                    style={{ background: T.surface, border: `1px solid ${T.cardBorder}` }}>
                    <p className="text-[9px] font-semibold uppercase tracking-wider mb-1" style={{ color: T.textMuted }}>{item.label}</p>
                    <p className="text-sm font-bold capitalize" style={{ color: item.color }}>{item.value}</p>
                  </div>
                ))}
              </div>

              {/* Details */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: T.textSecondary }}>Report Details</p>
                <div className="rounded-xl p-4 space-y-2.5" style={{ background: T.surface, border: `1px solid ${T.cardBorder}` }}>
                  {[
                    { icon: User, label: 'Submitted by', value: `${report.userName || 'Unknown'}${report.teamName ? ` (${report.teamName})` : ''}` },
                    { icon: Clock, label: 'Submitted at', value: fmtFull(report) },
                    ...(report.submittedLocation?.address ? [{ icon: MapPin, label: 'Location', value: `${report.submittedLocation.address}${typeof report.distanceFromFeederPoint === 'number' ? ` (${report.distanceFromFeederPoint.toFixed(1)}m from FP)` : ''}` }] : []),
                    ...(report.description ? [{ icon: MessageSquare, label: 'Description', value: report.description }] : []),
                  ].map((row, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <row.icon className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" style={{ color: T.textMuted }} />
                      <span className="text-xs" style={{ color: T.textSecondary }}>
                        <span style={{ color: T.textMuted }}>{row.label}: </span>
                        <span style={{ color: T.textPrimary }}>{row.value}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Answers */}
              {answers.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: T.textSecondary }}>
                    Answers ({answers.length})
                  </p>
                  <div className="space-y-2">
                    {answers.map((ans: any, i: number) => {
                      const photos = Array.isArray(ans.photos) ? ans.photos.filter((p: string) => p.startsWith('https')) : []
                      return (
                        <div key={i} className="rounded-xl p-3" style={{ background: T.surface, border: `1px solid ${T.cardBorder}` }}>
                          <p className="text-xs font-medium" style={{ color: T.textPrimary }}>
                            <span style={{ color: T.textMuted }}>Q{i + 1}: </span>
                            {ans.questionId?.replace(/_/g, ' ') || `Question ${i + 1}`}
                          </p>
                          <p className="mt-1 text-sm" style={{ color: T.textPrimary }}>
                            <span style={{ color: T.textMuted }}>A: </span>{String(ans.answer ?? '—')}
                          </p>
                          {ans.notes && <p className="mt-0.5 text-xs italic" style={{ color: T.textMuted }}>Notes: {ans.notes}</p>}
                          {photos.length > 0 && (
                            <div className="mt-2 grid grid-cols-4 gap-1.5">
                              {photos.map((url: string, pi: number) => (
                                <div key={pi} className="group relative aspect-square rounded-lg overflow-hidden cursor-pointer"
                                  style={{ border: `1px solid ${T.cardBorder}` }}
                                  onClick={() => setBigImg(url)}>
                                  {imgErr[url]
                                    ? <div className="w-full h-full flex items-center justify-center" style={{ background: T.surface }}>
                                      <ImageIcon className="h-4 w-4" style={{ color: T.textMuted }} />
                                    </div>
                                    : <><img src={url} alt="" className="w-full h-full object-cover" onError={() => setImgErr(p => ({ ...p, [url]: true }))} />
                                      <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors">
                                        <ZoomIn className="h-4 w-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                      </div>
                                    </>
                                  }
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Admin actions */}
              {!isPmcMember && onStatusChange && (
                <div className="pt-4 space-y-3" style={{ borderTop: `1px solid ${T.cardBorder}` }}>
                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-wider block mb-2" style={{ color: T.textSecondary }}>Admin Notes</label>
                    <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)}
                      placeholder="Add notes for this report..."
                      className="w-full p-3 rounded-xl text-sm resize-none"
                      style={{ background: T.surface, border: `1px solid ${T.cardBorder}`, color: T.textPrimary, outline: 'none' }} />
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    {[
                      { label: 'Approve', status: 'approved' as const, color: T.green, icon: <CheckCircle className="h-4 w-4" /> },
                      { label: 'Reject', status: 'rejected' as const, color: T.red, icon: <X className="h-4 w-4" /> },
                      { label: 'Action', status: 'requires_action' as const, color: T.amber, icon: <AlertTriangle className="h-4 w-4" /> },
                    ].map(btn => (
                      <button key={btn.status} onClick={() => doStatus(btn.status)} disabled={updating}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
                        style={{ background: btn.color, color: '#fff', border: 'none', cursor: updating ? 'wait' : 'pointer' }}>
                        {updating ? <Loader2 className="h-4 w-4 animate-spin" /> : btn.icon}
                        {btn.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {bigImg && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.95)' }} onClick={() => setBigImg(null)}>
          <button onClick={() => setBigImg(null)} className="absolute top-4 right-4 rounded-full p-2 z-10"
            style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none', cursor: 'pointer' }}>
            <X className="h-5 w-5" />
          </button>
          <a href={bigImg} target="_blank" rel="noopener noreferrer" className="absolute top-4 right-16 rounded-full p-2 z-10"
            style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }} onClick={e => e.stopPropagation()}>
            <ExternalLink className="h-5 w-5" />
          </a>
          <img src={bigImg} alt="Full view" className="max-w-full max-h-full object-contain rounded-xl"
            onClick={e => e.stopPropagation()} />
        </div>
      )}
    </>
  )
}