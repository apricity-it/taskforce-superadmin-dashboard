import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle, CheckCircle, Clock, Download, Eye,
  RefreshCw, X, XCircle, Star, Search, ZoomIn, ExternalLink,
} from 'lucide-react'
import {
  collection, onSnapshot, query, orderBy,
  updateDoc, doc, serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useTheme } from '@/contexts/ThemeContext'
import { getTokens } from '@/lib/dashboardTheme'

// ─── Types ────────────────────────────────────────────────────────────────────
type FrequencyType = 'daily' | 'weekly' | 'monthly'
interface InspectionFrequency { type: FrequencyType; value: number }
interface FrequencyRequest {
  id: string
  feederPointId: string
  feederPointName: string
  userId: string
  userName: string
  images: string[]
  requestedFrequency: InspectionFrequency
  approvedFrequency?: InspectionFrequency
  comment: string
  cleanlinessRating?: number
  status: 'pending' | 'approved' | 'rejected'
  reviewedBy?: string
  reviewedAt?: any
  adminNotes?: string | null
  createdAt?: any
  updatedAt?: any
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(v: any): string {
  if (!v) return 'N/A'
  try {
    const d = typeof v.toDate === 'function' ? v.toDate()
      : typeof v._seconds === 'number' ? new Date(v._seconds * 1000)
      : v instanceof Date ? v : new Date(v)
    return isNaN(d.getTime()) ? 'N/A' : d.toLocaleString()
  } catch { return 'N/A' }
}
function formatFreq(f: InspectionFrequency): string {
  const p = f.type === 'daily' ? 'day' : f.type === 'weekly' ? 'week' : 'month'
  return `${f.value}× per ${p}`
}

// ─── Firestore ops (kept exactly as original) ─────────────────────────────────
function onFrequencyRequestsChange(cb: (r: FrequencyRequest[]) => void) {
  const q = query(collection(db, 'frequencyRequests'), orderBy('createdAt', 'desc'))
  return onSnapshot(q, snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() } as FrequencyRequest))))
}
async function approveFrequencyRequest(
  requestId: string, feederPointId: string,
  approvedFrequency: InspectionFrequency, reviewedBy: string, adminNotes?: string
) {
  await updateDoc(doc(db, 'frequencyRequests', requestId), {
    status: 'approved', approvedFrequency, reviewedBy,
    adminNotes: adminNotes || null, reviewedAt: serverTimestamp(), updatedAt: serverTimestamp(),
  })
  await updateDoc(doc(db, 'feederPoints', feederPointId), {
    inspectionFrequency: approvedFrequency, updatedAt: serverTimestamp(),
  })
}
async function rejectFrequencyRequest(requestId: string, reviewedBy: string, adminNotes?: string) {
  await updateDoc(doc(db, 'frequencyRequests', requestId), {
    status: 'rejected', reviewedBy,
    adminNotes: adminNotes || null, reviewedAt: serverTimestamp(), updatedAt: serverTimestamp(),
  })
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function FrequencyRequestsPage() {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const T = getTokens(dark)

  const [requests,   setRequests]   = useState<FrequencyRequest[]>([])
  const [loading,    setLoading]    = useState(true)
  const [statusF,    setStatusF]    = useState<'all'|'pending'|'approved'|'rejected'>('all')
  const [search,     setSearch]     = useState('')
  const [selected,   setSelected]   = useState<FrequencyRequest | null>(null)
  const [zoomedImg,  setZoomedImg]  = useState<string | null>(null)
  const [updating,   setUpdating]   = useState(false)

  // Review form
  const [appType,    setAppType]    = useState<FrequencyType>('daily')
  const [appValue,   setAppValue]   = useState('1')
  const [adminNotes, setAdminNotes] = useState('')

  useEffect(() => {
    const unsub = onFrequencyRequestsChange(data => { setRequests(data); setLoading(false) })
    return () => unsub?.()
  }, [])

  // Pre-fill form when selecting
  useEffect(() => {
    if (selected) {
      setAppType(selected.requestedFrequency.type)
      setAppValue(String(selected.requestedFrequency.value))
      setAdminNotes('')
    }
  }, [selected])

  const stats = useMemo(() => ({
    total:    requests.length,
    pending:  requests.filter(r => r.status === 'pending').length,
    approved: requests.filter(r => r.status === 'approved').length,
    rejected: requests.filter(r => r.status === 'rejected').length,
  }), [requests])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return requests
      .filter(r => statusF === 'all' || r.status === statusF)
      .filter(r => !q || [r.feederPointName, r.userName, r.comment].some(v => (v||'').toLowerCase().includes(q)))
  }, [requests, statusF, search])

  const handleApprove = async () => {
    if (!selected) return
    const val = parseInt(appValue, 10)
    if (!val || val < 1) { alert('Please enter a valid frequency value.'); return }
    if (!confirm(`Approve ${val}× per ${appType} for "${selected.feederPointName}"?`)) return
    setUpdating(true)
    try {
      await approveFrequencyRequest(selected.id, selected.feederPointId, { type: appType, value: val }, 'SuperAdmin', adminNotes.trim() || undefined)
      setSelected(null)
    } catch (e) { console.error(e); alert('Error approving request.') }
    setUpdating(false)
  }

  const handleReject = async () => {
    if (!selected) return
    if (!confirm('Reject this frequency request?')) return
    setUpdating(true)
    try {
      await rejectFrequencyRequest(selected.id, 'SuperAdmin', adminNotes.trim() || undefined)
      setSelected(null)
    } catch (e) { console.error(e); alert('Error rejecting request.') }
    setUpdating(false)
  }

  const handleDownload = async () => {
    if (!filtered.length) return
    const XLSX = await import('xlsx')
    const rows = filtered.map(r => ({
      'Request ID': r.id, 'Feeder Point': r.feederPointName, User: r.userName,
      'Requested Frequency': formatFreq(r.requestedFrequency),
      'Approved Frequency': r.approvedFrequency ? formatFreq(r.approvedFrequency) : 'N/A',
      Comment: r.comment, 'Cleanliness Rating': r.cleanlinessRating || 'N/A',
      Status: r.status.toUpperCase(), 'Admin Notes': r.adminNotes || '',
      'Reviewed By': r.reviewedBy || '', 'Submitted At': formatDate(r.createdAt),
      'Reviewed At': formatDate(r.reviewedAt),
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Frequency Requests')
    XLSX.writeFile(wb, `frequency-requests-${statusF}.xlsx`)
  }

  const statusColor = (s: string) => s==='approved' ? T.green : s==='rejected' ? T.red : T.amber

  if (loading) return (
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
            <RefreshCw className="h-6 w-6" style={{ color: T.accent }} />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight" style={{ color: T.textPrimary }}>Frequency Requests</h1>
            <p className="text-sm" style={{ color: T.textMuted }}>Review inspection frequency change requests · {stats.pending} pending</p>
          </div>
        </div>
        <button onClick={handleDownload} disabled={!filtered.length}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold disabled:opacity-40"
          style={{ background: T.green, color: '#fff', border: 'none', cursor: 'pointer' }}>
          <Download className="h-4 w-4" /> Export
        </button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: 'Pending',  value: stats.pending,  color: T.amber  },
          { label: 'Approved', value: stats.approved, color: T.green  },
          { label: 'Rejected', value: stats.rejected, color: T.red    },
          { label: 'Total',    value: stats.total,    color: T.accent },
        ].map((s, i) => (
          <div key={s.label} className="rounded-xl p-3"
            style={{ background: T.card, border: `1px solid ${T.cardBorder}`, animation: `slideUp 0.4s ease ${i*60}ms both` }}>
            <p className="text-[9px] font-semibold uppercase tracking-wider mb-1" style={{ color: T.textSecondary }}>{s.label}</p>
            <p className="text-[20px] font-bold leading-none" style={{ color: s.color, fontFamily: "'JetBrains Mono', monospace" }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center rounded-2xl p-4"
        style={{ background: T.card, border: `1px solid ${T.cardBorder}` }}>
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: T.textMuted }} />
          <input type="text" placeholder="Search feeder point, user, comment..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-8 py-2 rounded-xl text-sm"
            style={{ background: T.surface, border: `1px solid ${T.cardBorder}`, color: T.textPrimary, outline: 'none' }} />
          {search && (
            <button onClick={() => setSearch('')} style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:T.textMuted }}>
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex gap-1.5">
          {(['all','pending','approved','rejected'] as const).map(s => (
            <button key={s} onClick={() => setStatusF(s)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold"
              style={{
                background: statusF===s ? (s==='all' ? T.accent : statusColor(s)) : T.surface,
                color: statusF===s ? (dark?'#000':'#fff') : T.textSecondary,
                border: `1px solid ${statusF===s ? (s==='all' ? T.accent : statusColor(s)) : T.cardBorder}`,
                cursor: 'pointer',
              }}>
              {s.charAt(0).toUpperCase()+s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl overflow-hidden" style={{ background: T.card, border: `1px solid ${T.cardBorder}` }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${T.cardBorder}` }}>
          <h2 className="text-sm font-semibold" style={{ color: T.textPrimary }}>Requests ({filtered.length})</h2>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <AlertCircle className="h-10 w-10 opacity-20" style={{ color: T.accent }} />
            <p className="text-sm" style={{ color: T.textMuted }}>No frequency requests found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" style={{ fontSize: 12 }}>
              <thead>
                <tr style={{ background: T.surface, borderBottom: `1px solid ${T.cardBorder}` }}>
                  {['Feeder Point','Requested By','Requested Freq.','Approved Freq.','Cleanliness','Status','Submitted','View'].map(h => (
                    <th key={h} className="text-left px-4 py-3 font-semibold uppercase tracking-wider whitespace-nowrap"
                      style={{ fontSize: 10, color: T.accent }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => {
                  const sc = statusColor(r.status)
                  return (
                    <tr key={r.id} style={{ borderBottom: `1px solid ${T.gridLine}` }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = T.surface}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>

                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg"
                            style={{ background: T.accentDim }}>
                            <RefreshCw className="h-4 w-4" style={{ color: T.accent }} />
                          </div>
                          <div>
                            <p className="font-semibold truncate max-w-[160px]" style={{ color: T.textPrimary }}>{r.feederPointName}</p>
                            <p className="text-[10px] truncate max-w-[160px]" style={{ color: T.textMuted }}>{r.comment}</p>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <p style={{ color: T.textPrimary }}>{r.userName}</p>
                      </td>

                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                          style={{ background: T.accentDim, color: T.accent, border: `1px solid ${T.accentBorder}` }}>
                          {formatFreq(r.requestedFrequency)}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        {r.approvedFrequency ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                            style={{ background: `${T.green}15`, color: T.green, border: `1px solid ${T.green}30` }}>
                            {formatFreq(r.approvedFrequency)}
                          </span>
                        ) : <span style={{ color: T.textMuted }}>—</span>}
                      </td>

                      <td className="px-4 py-3">
                        {r.cleanlinessRating ? (
                          <div className="flex items-center gap-1">
                            <Star className="h-3.5 w-3.5" style={{ color: T.gold, fill: T.gold }} />
                            <span className="font-bold" style={{ color: T.gold, fontFamily: "'JetBrains Mono', monospace" }}>
                              {r.cleanlinessRating}/5
                            </span>
                          </div>
                        ) : <span style={{ color: T.textMuted }}>—</span>}
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {r.status==='approved' && <CheckCircle className="h-3.5 w-3.5" style={{ color: sc }} />}
                          {r.status==='rejected' && <XCircle className="h-3.5 w-3.5" style={{ color: sc }} />}
                          {r.status==='pending'  && <Clock className="h-3.5 w-3.5" style={{ color: sc }} />}
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase"
                            style={{ background: `${sc}15`, color: sc }}>{r.status}</span>
                        </div>
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap" style={{ color: T.textSecondary, fontSize: 11 }}>
                        {formatDate(r.createdAt)}
                        {r.reviewedAt && <p className="text-[10px]" style={{ color: T.textMuted }}>Reviewed: {formatDate(r.reviewedAt)}</p>}
                      </td>

                      <td className="px-4 py-3">
                        <button
                          onClick={() => { setSelected(r); setTimeout(() => document.getElementById('freq-details')?.scrollIntoView({ behavior:'smooth', block:'start' }), 100) }}
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
      </div>

      {/* ── Detail Card ── */}
      {selected && (
        <div id="freq-details" className="rounded-2xl p-6 space-y-5"
          style={{ background: T.card, border: `2px solid ${T.accent}` }}>

          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: T.textMuted }}>Frequency Change Request</p>
              <h2 className="text-xl font-bold" style={{ color: T.textPrimary }}>{selected.feederPointName}</h2>
              <p className="text-sm mt-0.5" style={{ color: T.textSecondary }}>{selected.comment}</p>
            </div>
            <button onClick={() => setSelected(null)} className="flex items-center justify-center w-8 h-8 rounded-xl flex-shrink-0"
              style={{ background: T.surface, border: `1px solid ${T.cardBorder}`, color: T.textSecondary, cursor: 'pointer' }}>
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Info grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: 'Requested By',        value: selected.userName                                              },
              { label: 'Status',              value: selected.status.toUpperCase()                                  },
              { label: 'Requested Frequency', value: formatFreq(selected.requestedFrequency)                       },
              { label: 'Approved Frequency',  value: selected.approvedFrequency ? formatFreq(selected.approvedFrequency) : '—' },
              { label: 'Cleanliness Rating',  value: selected.cleanlinessRating ? `${selected.cleanlinessRating}/5` : '—' },
              { label: 'Submitted At',        value: formatDate(selected.createdAt)                                 },
              { label: 'Reviewed By',         value: selected.reviewedBy || '—'                                     },
              { label: 'Reviewed At',         value: selected.reviewedAt ? formatDate(selected.reviewedAt) : '—'   },
            ].map(row => (
              <div key={row.label} className="rounded-xl px-3 py-2.5"
                style={{ background: T.surface, border: `1px solid ${T.cardBorder}` }}>
                <p className="text-[9px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: T.textMuted }}>{row.label}</p>
                <p className="text-sm font-medium" style={{ color: T.textPrimary }}>{row.value}</p>
              </div>
            ))}
          </div>

          {/* Supporting photos */}
          {selected.images?.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: T.textSecondary }}>Supporting Photos</p>
              <div className="flex flex-wrap gap-2">
                {selected.images.map((url, i) => (
                  <div key={i} className="group relative h-24 w-24 rounded-xl overflow-hidden cursor-pointer"
                    style={{ border: `1px solid ${T.cardBorder}` }}
                    onClick={() => setZoomedImg(url)}>
                    <img src={url} alt={`Evidence ${i+1}`} className="h-full w-full object-cover" />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors">
                      <ZoomIn className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Admin notes display */}
          {selected.adminNotes && (
            <div className="rounded-xl px-4 py-3" style={{ background: T.accentDim, border: `1px solid ${T.accentBorder}` }}>
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: T.accent }}>Admin Notes</p>
              <p className="text-sm" style={{ color: T.textPrimary }}>{selected.adminNotes}</p>
            </div>
          )}

          {/* Review form — pending only */}
          {selected.status === 'pending' && (
            <div className="rounded-xl p-4 space-y-4" style={{ background: T.surface, border: `1px solid ${T.cardBorder}` }}>
              <p className="text-sm font-semibold" style={{ color: T.textPrimary }}>Set Approved Frequency</p>

              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: T.textSecondary }}>Type</label>
                  <select value={appType} onChange={e => setAppType(e.target.value as FrequencyType)}
                    style={{ background: T.card, border: `1px solid ${T.cardBorder}`, color: T.textPrimary, borderRadius: 8, padding: '6px 10px', fontSize: 12, outline: 'none' }}>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: T.textSecondary }}>Times</label>
                  <input type="number" min="1" max="99" value={appValue} onChange={e => setAppValue(e.target.value)}
                    style={{ background: T.card, border: `1px solid ${T.cardBorder}`, color: T.textPrimary, borderRadius: 8, padding: '6px 10px', fontSize: 12, outline: 'none', width: 72 }} />
                  <span className="text-xs" style={{ color: T.textMuted }}>
                    per {appType === 'daily' ? 'day' : appType === 'weekly' ? 'week' : 'month'}
                  </span>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wider block mb-1.5" style={{ color: T.textSecondary }}>Admin Notes (optional)</label>
                <textarea rows={2} value={adminNotes} onChange={e => setAdminNotes(e.target.value)}
                  placeholder="Add a note for the user…"
                  className="w-full p-3 rounded-xl text-sm resize-none"
                  style={{ background: T.card, border: `1px solid ${T.cardBorder}`, color: T.textPrimary, outline: 'none' }} />
              </div>

              <div className="flex gap-3">
                <button onClick={handleApprove} disabled={updating}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40"
                  style={{ background: T.green, color: '#fff', border: 'none', cursor: 'pointer' }}>
                  <CheckCircle className="h-4 w-4" /> {updating ? 'Saving…' : 'Approve'}
                </button>
                <button onClick={handleReject} disabled={updating}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40"
                  style={{ background: T.red, color: '#fff', border: 'none', cursor: 'pointer' }}>
                  <XCircle className="h-4 w-4" /> {updating ? 'Saving…' : 'Reject'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Image zoom */}
      {zoomedImg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.95)' }} onClick={() => setZoomedImg(null)}>
          <button onClick={() => setZoomedImg(null)} className="absolute top-4 right-4 rounded-full p-2"
            style={{ background: 'rgba(255,255,255,0.15)', color:'#fff', border:'none', cursor:'pointer' }}>
            <X className="h-5 w-5" />
          </button>
          <a href={zoomedImg} target="_blank" rel="noopener noreferrer" className="absolute top-4 right-16 rounded-full p-2"
            style={{ background: 'rgba(255,255,255,0.15)', color:'#fff' }} onClick={e => e.stopPropagation()}>
            <ExternalLink className="h-5 w-5" />
          </a>
          <img src={zoomedImg} alt="Zoomed" className="max-w-full max-h-full object-contain rounded-xl"
            onClick={e => e.stopPropagation()} />
        </div>
      )}

      <style>{`@keyframes slideUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }`}</style>
    </div>
  )
}