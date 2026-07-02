import { useMemo, useState } from 'react'
import {
  Clock, CheckCircle, XCircle, Eye, UserPlus,
  Search, RefreshCw, X, User, Mail, Phone,
  Building, Shield, Calendar, MessageSquare,
} from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { DataService, AccessRequest } from '@/lib/dataService'
import { useTheme } from '@/contexts/ThemeContext'
import { getTokens } from '@/lib/dashboardTheme'

function coerceDate(v: any): Date | null {
  if (!v) return null
  if (typeof v.toDate === 'function') return v.toDate()
  if (typeof v._seconds === 'number') return new Date(v._seconds * 1000)
  const d = new Date(v); return isNaN(d.getTime()) ? null : d
}
function fmtDate(v: any): string {
  const d = coerceDate(v); return d ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
}
function fmtDateTime(v: any): string {
  const d = coerceDate(v); return d ? d.toLocaleString() : '—'
}

const ROLE_LABELS: Record<string, string> = {
  task_force_team: 'Task Force',
  admin: 'Admin',
  qc: 'QC Officer',
  commissioner: 'Commissioner',
  pmc_member: 'PMC Member',
  action_officer: 'Action Officer',
}

export default function AccessRequestsPage() {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const T = getTokens(dark)
  const qc = useQueryClient()

const { data: requests = [] as AccessRequest[], isLoading } = useQuery<AccessRequest[]>({
  queryKey: ['accessRequests'],
  queryFn: () => new Promise<AccessRequest[]>(resolve => {
    const unsub = DataService.onAccessRequestsChange(data => { resolve(data); unsub() })
  }),
  staleTime: 2 * 60_000,
})

  const [statusF, setStatusF] = useState('all')
  const [search, setSearch] = useState('')
  const [viewing, setViewing] = useState<AccessRequest | null>(null)
  const [acting, setActing] = useState<string | null>(null)

  const stats = useMemo(() => ({
    total: requests.length,
    pending: requests.filter(r => r.status === 'pending').length,
    approved: requests.filter(r => r.status === 'approved').length,
    rejected: requests.filter(r => r.status === 'rejected').length,
  }), [requests])

  const filtered = useMemo(() => {
    let r = requests
    if (statusF !== 'all') r = r.filter(x => x.status === statusF)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      r = r.filter(x =>
        (x.name || '').toLowerCase().includes(q) ||
        (x.email || '').toLowerCase().includes(q) ||
        (x.organization || '').toLowerCase().includes(q) ||
        (x.requestedRole || '').toLowerCase().includes(q)
      )
    }
    return [...r].sort((a, b) => {
      const da = coerceDate(a.createdAt)?.getTime() ?? 0
      const db = coerceDate(b.createdAt)?.getTime() ?? 0
      return db - da
    })
  }, [requests, statusF, search])

  const handleApprove = async (req: AccessRequest) => {
    if (!confirm(`Approve access for "${req.name}"?`)) return
    setActing(req.id)
    try {
      await DataService.approveAccessRequest(req)
      qc.invalidateQueries({ queryKey: ['accessRequests'] })
    } catch { alert('Error approving. Try again.') }
    finally { setActing(null) }
  }

  const handleReject = async (id: string) => {
    if (!confirm('Reject this request?')) return
    setActing(id)
    try {
      await DataService.rejectAccessRequest(id)
      qc.invalidateQueries({ queryKey: ['accessRequests'] })
    } catch { alert('Error rejecting. Try again.') }
    finally { setActing(null) }
  }

  const statusColor = (s: string) =>
    s === 'approved' ? T.green : s === 'rejected' ? T.red : T.amber

  const roleColor = (r: string) =>
    r === 'admin' ? T.red : r === 'qc' ? T.accent : r === 'commissioner' ? T.purple : T.textSecondary

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
            <UserPlus className="h-6 w-6" style={{ color: T.accent }} />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight" style={{ color: T.textPrimary }}>Access Requests</h1>
            <p className="text-sm" style={{ color: T.textMuted }}>{requests.length} total · {stats.pending} pending review</p>
          </div>
        </div>
        <button onClick={() => qc.invalidateQueries({ queryKey: ['accessRequests'] })}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold"
          style={{ background: T.surface, border: `1px solid ${T.cardBorder}`, color: T.textSecondary, cursor: 'pointer' }}>
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total', value: stats.total, color: T.accent, icon: <UserPlus className="h-4 w-4" /> },
          { label: 'Pending', value: stats.pending, color: T.amber, icon: <Clock className="h-4 w-4" /> },
          { label: 'Approved', value: stats.approved, color: T.green, icon: <CheckCircle className="h-4 w-4" /> },
          { label: 'Rejected', value: stats.rejected, color: T.red, icon: <XCircle className="h-4 w-4" /> },
        ].map((s, i) => (
          <div key={s.label} className="rounded-xl p-4"
            style={{ background: T.card, border: `1px solid ${T.cardBorder}`, animation: `slideUp 0.4s ease ${i * 60}ms both` }}>
            <div className="flex items-center gap-2 mb-2" style={{ color: s.color }}>{s.icon}</div>
            <p className="text-[22px] font-bold leading-none" style={{ color: s.color, fontFamily: "'JetBrains Mono', monospace" }}>{s.value}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wider mt-1" style={{ color: T.textSecondary }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center rounded-2xl p-4"
        style={{ background: T.card, border: `1px solid ${T.cardBorder}` }}>
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: T.textMuted }} />
          <input type="text" placeholder="Search by name, email, org, role..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-8 py-2 rounded-xl text-sm"
            style={{ background: T.surface, border: `1px solid ${T.cardBorder}`, color: T.textPrimary, outline: 'none' }} />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textMuted }}>
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex gap-1.5">
          {['all', 'pending', 'approved', 'rejected'].map(s => (
            <button key={s} onClick={() => setStatusF(s)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold"
              style={{
                background: statusF === s ? (s === 'all' ? T.accent : statusColor(s)) : T.surface,
                color: statusF === s ? (dark ? '#000' : '#fff') : T.textSecondary,
                border: `1px solid ${statusF === s ? (s === 'all' ? T.accent : statusColor(s)) : T.cardBorder}`,
                cursor: 'pointer',
              }}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
              {s !== 'all' && <span className="ml-1.5 text-[10px]">({stats[s as keyof typeof stats]})</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl overflow-hidden" style={{ background: T.card, border: `1px solid ${T.cardBorder}` }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${T.cardBorder}` }}>
          <h2 className="text-sm font-semibold" style={{ color: T.textPrimary }}>
            Requests ({filtered.length})
          </h2>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <UserPlus className="h-10 w-10 opacity-20" style={{ color: T.accent }} />
            <p className="text-sm" style={{ color: T.textMuted }}>No access requests found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" style={{ fontSize: 12 }}>
              <thead>
                <tr style={{ background: T.surface, borderBottom: `1px solid ${T.cardBorder}` }}>
                  {['Applicant', 'Contact', 'Organization', 'Role', 'Status', 'Submitted', 'Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-3 font-semibold uppercase tracking-wider whitespace-nowrap"
                      style={{ fontSize: 10, color: T.accent }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(req => {
                  const sc = statusColor(req.status)
                  const rc = roleColor(req.requestedRole)
                  const isActing = acting === req.id
                  return (
                    <tr key={req.id}
                      style={{ borderBottom: `1px solid ${T.gridLine}`, opacity: isActing ? 0.5 : 1 }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = T.surface}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>

                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold"
                            style={{ background: T.accentDim, color: T.accent }}>
                            {(req.name || '?')[0].toUpperCase()}
                          </div>
                          <div>
                            <p className="font-semibold" style={{ color: T.textPrimary }}>{req.name || '—'}</p>
                            <p className="text-[10px]" style={{ color: T.textMuted }}>{req.id.slice(-8)}</p>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <p style={{ color: T.textSecondary }}>{req.email || '—'}</p>
                        <p className="text-[10px]" style={{ color: T.textMuted }}>{req.phone || '—'}</p>
                      </td>

                      <td className="px-4 py-3">
                        <p style={{ color: T.textPrimary }}>{req.organization || '—'}</p>
                        <p className="text-[10px]" style={{ color: T.textMuted }}>{req.department || '—'}</p>
                      </td>

                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                          style={{ background: `${rc}15`, border: `1px solid ${rc}30`, color: rc }}>
                          {ROLE_LABELS[req.requestedRole] || req.requestedRole.replace(/_/g, ' ')}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {req.status === 'pending' && <Clock className="h-3.5 w-3.5" style={{ color: sc }} />}
                          {req.status === 'approved' && <CheckCircle className="h-3.5 w-3.5" style={{ color: sc }} />}
                          {req.status === 'rejected' && <XCircle className="h-3.5 w-3.5" style={{ color: sc }} />}
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase"
                            style={{ background: `${sc}15`, color: sc }}>
                            {req.status}
                          </span>
                        </div>
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        <p style={{ color: T.textSecondary }}>{fmtDate(req.createdAt || (req as any).submittedAt)}</p>
                        {req.reviewedAt && (
                          <p className="text-[10px]" style={{ color: T.textMuted }}>
                            Reviewed: {fmtDate(req.reviewedAt)}
                          </p>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => setViewing(req)} title="View"
                            className="p-1.5 rounded-lg"
                            style={{ background: T.accentDim, color: T.accent, border: 'none', cursor: 'pointer' }}>
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          {req.status === 'pending' && (
                            <>
                              <button onClick={() => handleApprove(req)} disabled={isActing} title="Approve"
                                className="p-1.5 rounded-lg disabled:opacity-40"
                                style={{ background: `${T.green}15`, color: T.green, border: 'none', cursor: 'pointer' }}>
                                <CheckCircle className="h-3.5 w-3.5" />
                              </button>
                              <button onClick={() => handleReject(req.id)} disabled={isActing} title="Reject"
                                className="p-1.5 rounded-lg disabled:opacity-40"
                                style={{ background: `${T.red}15`, color: T.red, border: 'none', cursor: 'pointer' }}>
                                <XCircle className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* View Modal */}
      {viewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }}
          onClick={() => setViewing(null)}>
          <div className="w-full max-w-lg rounded-2xl shadow-2xl"
            style={{ background: T.card, border: `1px solid ${T.cardBorder}` }}
            onClick={e => e.stopPropagation()}>

            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4"
              style={{ borderBottom: `1px solid ${T.cardBorder}` }}>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold"
                  style={{ background: T.accentDim, color: T.accent }}>
                  {(viewing.name || '?')[0].toUpperCase()}
                </div>
                <div>
                  <p className="font-bold" style={{ color: T.textPrimary }}>{viewing.name}</p>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{ background: `${statusColor(viewing.status)}15`, color: statusColor(viewing.status) }}>
                    {viewing.status.toUpperCase()}
                  </span>
                </div>
              </div>
              <button onClick={() => setViewing(null)}
                style={{ background: T.surface, border: `1px solid ${T.cardBorder}`, borderRadius: 10, width: 32, height: 32, cursor: 'pointer', color: T.textSecondary, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { icon: Mail, label: 'Email', value: viewing.email },
                  { icon: Phone, label: 'Phone', value: viewing.phone },
                  { icon: Building, label: 'Organization', value: viewing.organization },
                  { icon: Building, label: 'Department', value: viewing.department },
                  { icon: Shield, label: 'Requested Role', value: ROLE_LABELS[viewing.requestedRole] || viewing.requestedRole },
                  { icon: Calendar, label: 'Submitted', value: fmtDateTime(viewing.createdAt || (viewing as any).submittedAt) },
                ].map(row => (
                  <div key={row.label} className="rounded-xl px-3 py-2.5"
                    style={{ background: T.surface, border: `1px solid ${T.cardBorder}` }}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <row.icon className="h-3 w-3" style={{ color: T.textMuted }} />
                      <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: T.textMuted }}>{row.label}</p>
                    </div>
                    <p className="text-sm font-medium" style={{ color: T.textPrimary }}>{row.value || '—'}</p>
                  </div>
                ))}
              </div>

              {(viewing as any).reason && (
                <div className="rounded-xl px-3 py-2.5" style={{ background: T.surface, border: `1px solid ${T.cardBorder}` }}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <MessageSquare className="h-3 w-3" style={{ color: T.textMuted }} />
                    <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: T.textMuted }}>Reason</p>
                  </div>
                  <p className="text-sm" style={{ color: T.textPrimary }}>{(viewing as any).reason}</p>
                </div>
              )}

              {viewing.reviewedBy && (
                <div className="rounded-xl px-3 py-2.5" style={{ background: T.surface, border: `1px solid ${T.cardBorder}` }}>
                  <p className="text-[9px] font-semibold uppercase tracking-wider mb-1" style={{ color: T.textMuted }}>Review Info</p>
                  <p className="text-sm" style={{ color: T.textPrimary }}>
                    By <span style={{ color: T.accent }}>{viewing.reviewedBy}</span> on {fmtDateTime(viewing.reviewedAt)}
                  </p>
                  {(viewing as any).reviewComments && <p className="text-xs mt-1" style={{ color: T.textSecondary }}>{(viewing as any).reviewComments}</p>}

                </div>
              )}

              {viewing.status === 'pending' && (
                <div className="flex gap-2 pt-2">
                  <button onClick={() => { handleApprove(viewing); setViewing(null) }}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold"
                    style={{ background: T.green, color: '#fff', border: 'none', cursor: 'pointer' }}>
                    <CheckCircle className="h-4 w-4" /> Approve
                  </button>
                  <button onClick={() => { handleReject(viewing.id); setViewing(null) }}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold"
                    style={{ background: T.red, color: '#fff', border: 'none', cursor: 'pointer' }}>
                    <XCircle className="h-4 w-4" /> Reject
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes slideUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }`}</style>
    </div>
  )
}