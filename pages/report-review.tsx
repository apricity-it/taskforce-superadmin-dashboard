'use client'

import { useEffect, useMemo, useState, useCallback, useRef, Fragment } from 'react'
import {
  CheckCircle, X, AlertTriangle, Clock, Calendar,
  ChevronDown, Eye, Download, FileText, MapPin,
  User, Users, Filter, Loader2, Image as ImageIcon,
  ZoomIn, ExternalLink, Search, RefreshCw,
  ArrowUpDown, Inbox, TrendingUp, Truck,
  MessageSquare, Send, Hourglass,
} from 'lucide-react'
import { DataService, ComplianceReport } from '@/lib/dataService'
import { useAuth } from '@/contexts/AuthContext'
import { useSearchParams } from 'next/navigation'

// ─── Types ────────────────────────────────────────────────────────────────────
type TabKey       = 'pending' | 'approved' | 'rejected' | 'requires_action'
type DatePreset   = 'today' | 'yesterday' | 'week' | 'month' | 'custom'
type SortField    = 'date' | 'feederPoint' | 'trip' | 'userName'
type SortDir      = 'asc' | 'desc'

interface TabCfg {
  key: TabKey; label: string; shortLabel: string
  icon: React.ReactNode
  textColor: string; bgColor: string; borderColor: string
  badgeActive: string; badgeIdle: string
  gradient: string; cardStrip: string
  statGradient: string; statShadow: string
}

// ─── Tab config — gradient stat cards per status ──────────────────────────────
const TABS: TabCfg[] = [
  {
    key: 'pending', label: 'Pending Reports', shortLabel: 'Pending',
    icon: <Clock className="h-4 w-4" />,
    textColor: 'text-amber-700', bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
    badgeActive: 'bg-amber-100 text-amber-800',
    badgeIdle: 'bg-gray-100 text-gray-600',
    gradient: 'from-amber-500 to-orange-500',
    cardStrip: 'from-amber-400 to-orange-500',
    statGradient: 'from-amber-400 to-orange-500',
    statShadow: 'shadow-orange-500/25',
  },
  {
    key: 'approved', label: 'Approved Reports', shortLabel: 'Approved',
    icon: <CheckCircle className="h-4 w-4" />,
    textColor: 'text-emerald-700', bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
    badgeActive: 'bg-emerald-100 text-emerald-800',
    badgeIdle: 'bg-gray-100 text-gray-600',
    gradient: 'from-emerald-500 to-green-600',
    cardStrip: 'from-emerald-400 to-green-500',
    statGradient: 'from-emerald-400 to-green-600',
    statShadow: 'shadow-green-500/25',
  },
  {
    key: 'rejected', label: 'Rejected Reports', shortLabel: 'Rejected',
    icon: <X className="h-4 w-4" />,
    textColor: 'text-red-700', bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    badgeActive: 'bg-red-100 text-red-800',
    badgeIdle: 'bg-gray-100 text-gray-600',
    gradient: 'from-red-500 to-rose-600',
    cardStrip: 'from-red-400 to-rose-500',
    statGradient: 'from-rose-400 to-red-600',
    statShadow: 'shadow-red-500/25',
  },
  {
    key: 'requires_action', label: 'Action Required', shortLabel: 'Action',
    icon: <AlertTriangle className="h-4 w-4" />,
    textColor: 'text-orange-700', bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200',
    badgeActive: 'bg-orange-100 text-orange-800',
    badgeIdle: 'bg-gray-100 text-gray-600',
    gradient: 'from-orange-500 to-amber-600',
    cardStrip: 'from-orange-400 to-amber-500',
    statGradient: 'from-yellow-400 to-amber-500',
    statShadow: 'shadow-yellow-500/25',
  },
]

const DATE_PRESETS: {key:DatePreset;label:string}[] = [
  { key:'today',     label:'Today'      },
  { key:'yesterday', label:'Yesterday'  },
  { key:'week',      label:'This Week'  },
  { key:'month',     label:'This Month' },
  { key:'custom',    label:'Custom'     },
]

const PAGE_SIZE      = 20
const LOAD_MORE_SIZE = 20

// ─── Utilities ────────────────────────────────────────────────────────────────
const todayStr = () => new Date().toISOString().split('T')[0]

const getDateRange = (preset: DatePreset, custom: {start:string;end:string}) => {
  const today = todayStr()
  switch (preset) {
    case 'today':     return { start: today, end: today }
    case 'yesterday': {
      const d = new Date(); d.setDate(d.getDate()-1)
      const y = d.toISOString().split('T')[0]
      return { start: y, end: y }
    }
    case 'week': {
      const d = new Date(); d.setDate(d.getDate()-7)
      return { start: d.toISOString().split('T')[0], end: today }
    }
    case 'month': {
      const d = new Date()
      return { start: new Date(d.getFullYear(),d.getMonth(),1).toISOString().split('T')[0], end: today }
    }
    case 'custom': return custom
    default: return { start: today, end: today }
  }
}

const fmtShort = (r: ComplianceReport) => {
  try {
    const d = r.submittedAt?.toDate ? r.submittedAt.toDate() : new Date(r.submittedAt)
    if (!isNaN(d.getTime())) return d.toLocaleDateString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})
  } catch {}
  return '—'
}
const fmtFull = (r: ComplianceReport) => {
  try {
    const d = r.submittedAt?.toDate ? r.submittedAt.toDate() : new Date(r.submittedAt)
    if (!isNaN(d.getTime())) return d.toLocaleString()
  } catch {}
  return '—'
}
const getTS = (r: ComplianceReport) => {
  try {
    const d = r.submittedAt?.toDate ? r.submittedAt.toDate() : new Date(r.submittedAt)
    if (!isNaN(d.getTime())) return d.getTime()
  } catch {}
  return 0
}
const timeSince = (r: ComplianceReport) => {
  const diff = Date.now() - getTS(r)
  const m = Math.floor(diff/60000), h = Math.floor(m/60), dy = Math.floor(h/24)
  if (m<1) return 'Just now'
  if (m<60) return `${m}m ago`
  if (h<24) return `${h}h ago`
  if (dy<7) return `${dy}d ago`
  return `${Math.floor(dy/7)}w ago`
}
const priorityCfg = (p?: string) => {
  switch(p) {
    case 'high':   return { label:'High',   cls:'bg-red-100    text-red-700    border-red-200'    }
    case 'medium': return { label:'Medium', cls:'bg-yellow-100 text-yellow-700 border-yellow-200' }
    case 'low':    return { label:'Low',    cls:'bg-blue-100   text-blue-700   border-blue-200'   }
    default:       return { label:'Normal', cls:'bg-gray-100   text-gray-600   border-gray-200'   }
  }
}

// ─── Empty State ──────────────────────────────────────────────────────────────
function EmptyState({ tab }: { tab: TabCfg }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className={`rounded-2xl ${tab.bgColor} p-5 mb-4`}>
        <Inbox className={`h-10 w-10 ${tab.textColor}`} />
      </div>
      <h3 className="text-base font-semibold text-gray-900 mb-1">No {tab.shortLabel} Reports</h3>
      <p className="text-sm text-gray-400 text-center max-w-sm">
        {tab.key==='pending'
          ? 'All reports reviewed for this period. Great work!'
          : `No ${tab.label.toLowerCase()} for the selected date range.`}
      </p>
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function CardSkeleton() {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 animate-pulse">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="h-9 w-9 rounded-full bg-gray-200 shrink-0" />
          <div className="space-y-2 flex-1">
            <div className="h-4 bg-gray-200 rounded w-3/4" />
            <div className="h-3 bg-gray-100 rounded w-1/2" />
          </div>
        </div>
        <div className="h-6 w-16 bg-gray-200 rounded-full shrink-0" />
      </div>
      <div className="mt-4 space-y-2">
        <div className="h-3 bg-gray-100 rounded w-full" />
        <div className="h-3 bg-gray-100 rounded w-2/3" />
      </div>
    </div>
  )
}

// ─── Stat Card — gradient style matching dashboard ────────────────────────────
function StatCard({
  tab, value, onClick, isActive
}: {
  tab: TabCfg; value: number; onClick: () => void; isActive: boolean
}) {
  return (
    <button onClick={onClick}
      className={`group relative overflow-hidden rounded-xl text-white text-left
        bg-gradient-to-br ${tab.statGradient} shadow-md ${tab.statShadow}
        p-4 w-full transition-all duration-200
        hover:scale-[1.03] hover:shadow-lg active:scale-[0.97]
        ${isActive ? 'ring-2 ring-offset-2 ring-white scale-[1.02]' : ''}`}
    >
      <span className="absolute -right-2 -top-2 h-12 w-12 rounded-full bg-white/10" />
      <span className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-white/5" />
      <div className="relative z-10">
        <div className="mb-2.5">{tab.icon}</div>
        <p className="text-2xl font-bold leading-none tracking-tight">{value.toLocaleString()}</p>
        <p className="mt-1.5 text-[11px] font-medium opacity-80 truncate">{tab.label}</p>
      </div>
      {isActive && (
        <span className="absolute bottom-2 right-2 h-2 w-2 rounded-full bg-white/70 animate-pulse" />
      )}
    </button>
  )
}

// ─── Report Card ──────────────────────────────────────────────────────────────
function ReportCard({
  report, tab, onView, onStatusChange, isPmcMember
}: {
  report: ComplianceReport; tab: TabCfg
  onView: (r: ComplianceReport) => void
  onStatusChange?: (r: ComplianceReport, s: ComplianceReport['status']) => void
  isPmcMember?: boolean
}) {
  const pri  = priorityCfg(report.priority)
  const imgs = (report.answers?.reduce((n,a)=>n+(a.photos?.length||0),0)??0) + (report.attachments?.length??0)
  const isPending = tab.key==='pending'
  const since = isPending ? timeSince(report) : ''

  return (
    <div className={`group bg-white rounded-xl border transition-all duration-200
      hover:shadow-lg hover:-translate-y-0.5
      ${tab.borderColor} border-opacity-40 hover:border-opacity-80`}>
      {/* status strip */}
      {isPending && <div className={`h-0.5 rounded-t-xl bg-gradient-to-r ${tab.cardStrip}`} />}

      <div className="p-4">
        {/* header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0 flex-1">
            <div className={`mt-0.5 rounded-lg ${tab.bgColor} p-2 shrink-0`}>
              {tab.icon}
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-gray-900 truncate leading-tight">
                {report.feederPointName || 'Unknown Feeder Point'}
              </h3>
              <p className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
                <Truck className="h-3 w-3 shrink-0" />
                Trip {report.tripNumber}
                <span className="text-gray-200 mx-0.5">•</span>
                {report.tripDate || '—'}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${pri.cls}`}>
              {pri.label}
            </span>
            {since && (
              <span className="text-[10px] font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                {since}
              </span>
            )}
          </div>
        </div>

        {report.description && (
          <p className="mt-3 text-xs text-gray-500 line-clamp-2 leading-relaxed">{report.description}</p>
        )}

        {/* meta */}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-gray-400">
          <span className="flex items-center gap-1"><User className="h-3 w-3" />{report.userName||'Unknown'}</span>
          {report.teamName && <span className="flex items-center gap-1"><Users className="h-3 w-3" />{report.teamName}</span>}
          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{fmtShort(report)}</span>
          {imgs>0 && <span className="flex items-center gap-1"><ImageIcon className="h-3 w-3" />{imgs} img{imgs!==1?'s':''}</span>}
        </div>

        <div className="mt-2 flex items-center gap-2 text-[11px] text-gray-300">
          <FileText className="h-3 w-3" />
          {report.answers?.length??0} answer{(report.answers?.length??0)!==1?'s':''}
          {report.submittedLocation?.address && (
            <><span>•</span><MapPin className="h-3 w-3" /><span className="truncate max-w-[140px]">{report.submittedLocation.address}</span></>
          )}
        </div>
      </div>

      {/* footer */}
      <div className={`flex items-center justify-between gap-2 px-4 py-2.5
        border-t ${tab.borderColor} border-opacity-30 bg-gray-50/60 rounded-b-xl`}>
        <button onClick={()=>onView(report)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
            text-gray-700 bg-white border border-gray-200 shadow-sm
            hover:bg-gray-50 hover:shadow transition-all">
          <Eye className="h-3.5 w-3.5" />View
        </button>

        {!isPmcMember && onStatusChange && (
          <div className="flex items-center gap-1.5">
            {tab.key!=='approved' && (
              <button onClick={()=>onStatusChange(report,'approved')}
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium
                  text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 transition-colors">
                <CheckCircle className="h-3.5 w-3.5" /><span className="hidden lg:inline">Approve</span>
              </button>
            )}
            {tab.key!=='rejected' && (
              <button onClick={()=>onStatusChange(report,'rejected')}
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium
                  text-red-700 bg-red-50 border border-red-200 hover:bg-red-100 transition-colors">
                <X className="h-3.5 w-3.5" /><span className="hidden lg:inline">Reject</span>
              </button>
            )}
            {tab.key!=='requires_action' && (
              <button onClick={()=>onStatusChange(report,'requires_action')}
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium
                  text-orange-700 bg-orange-50 border border-orange-200 hover:bg-orange-100 transition-colors">
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
function DetailModal({
  report, onClose, onStatusChange, isPmcMember
}: {
  report: ComplianceReport
  onClose: () => void
  onStatusChange?: (r: ComplianceReport, s: ComplianceReport['status'], notes: string) => Promise<void>
  isPmcMember?: boolean
}) {
  const [notes,       setNotes]       = useState('')
  const [updating,    setUpdating]    = useState(false)
  const [bigImg,      setBigImg]      = useState<string|null>(null)
  const [imgErrors,   setImgErrors]   = useState<Record<string,boolean>>({})
  const tab = TABS.find(t=>t.key===report.status)

  const doStatus = async (s: ComplianceReport['status']) => {
    if (!onStatusChange) return
    setUpdating(true)
    try { await onStatusChange(report, s, notes); onClose() }
    catch { alert('Failed to update status. Please try again.') }
    finally { setUpdating(false) }
  }

  const photos = report.answers?.reduce((n,a)=>n+(a.photos?.length||0),0)??0

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center
        bg-black/60 backdrop-blur-sm p-2 sm:p-4 overflow-y-auto"
        onClick={onClose}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl my-2 sm:my-8 overflow-hidden"
          onClick={e=>e.stopPropagation()}>

          {/* Modal header */}
          <div className={`bg-gradient-to-r ${tab?.gradient||'from-gray-500 to-gray-600'} px-5 py-4`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full
                  text-xs font-semibold bg-white/20 text-white mb-2">
                  {tab?.icon}
                  {report.status==='pending' ? 'PENDING REVIEW' : report.status.replace('_',' ').toUpperCase()}
                </span>
                <h2 className="text-lg font-bold text-white truncate">
                  {report.feederPointName||'Unknown Feeder Point'}
                </h2>
                <p className="text-white/75 text-sm mt-0.5">
                  Trip {report.tripNumber} • {report.tripDate||'—'}
                </p>
              </div>
              <button onClick={onClose}
                className="rounded-full p-1.5 text-white/70 hover:text-white hover:bg-white/20 transition-colors shrink-0">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="max-h-[calc(100vh-200px)] overflow-y-auto">
            <div className="p-5 space-y-5">

              {/* Pending banner */}
              {report.status==='pending' && !isPmcMember && (
                <div className="flex items-start gap-3 rounded-xl bg-amber-50 border border-amber-200 p-4">
                  <Clock className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-amber-800">Awaiting review</p>
                    <p className="text-xs text-amber-600 mt-0.5">Review details and take action below.</p>
                  </div>
                </div>
              )}

              {/* Info grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label:'Status', value: <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${tab?.badgeActive||'bg-gray-100 text-gray-700'}`}>{report.status.replace('_',' ').toUpperCase()}</span> },
                  { label:'Priority', value: <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${priorityCfg(report.priority).cls}`}>{priorityCfg(report.priority).label}</span> },
                  { label:'Answers',  value: <span className="text-sm font-bold text-gray-900">{report.answers?.length||0}</span> },
                  { label:'Photos',   value: <span className="text-sm font-bold text-gray-900">{photos+(report.attachments?.length||0)}</span> },
                ].map((item,i) => (
                  <div key={i} className="rounded-xl bg-gray-50 p-3 text-center border border-gray-100">
                    <p className="text-[10px] text-gray-400 mb-1.5 uppercase tracking-wider font-semibold">{item.label}</p>
                    {item.value}
                  </div>
                ))}
              </div>

              {/* Details */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2.5">Report Details</p>
                <div className="rounded-xl bg-gray-50 border border-gray-100 p-4 space-y-2.5 text-sm">
                  <DetailRow icon={User}>
                    <span className="text-gray-500">Submitted by: </span>
                    <span className="font-medium text-gray-900">{report.userName||'Unknown'}</span>
                    {report.teamName && <span className="text-gray-400"> ({report.teamName})</span>}
                  </DetailRow>
                  <DetailRow icon={Clock}>
                    <span className="text-gray-500">Submitted at: </span>
                    <span className="font-medium text-gray-900">{fmtFull(report)}</span>
                  </DetailRow>
                  {report.submittedLocation?.address && (
                    <DetailRow icon={MapPin}>
                      <span className="text-gray-500">Location: </span>
                      <span className="text-gray-900">{report.submittedLocation.address}</span>
                      {typeof report.distanceFromFeederPoint==='number' && (
                        <span className="text-gray-400 text-xs ml-1">({report.distanceFromFeederPoint.toFixed(1)}m from FP)</span>
                      )}
                    </DetailRow>
                  )}
                  {report.description && (
                    <DetailRow icon={MessageSquare}>
                      <span className="text-gray-500">Description: </span>
                      <span className="text-gray-900">{report.description}</span>
                    </DetailRow>
                  )}
                </div>
              </div>

              {/* Answers */}
              {report.answers && report.answers.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2.5">
                    Answers ({report.answers.length})
                  </p>
                  <div className="space-y-3">
                    {report.answers.map((ans, i) => (
                      <div key={i} className="rounded-xl bg-gray-50 border border-gray-100 p-4">
                        <p className="text-sm font-medium text-gray-900">
                          <span className="text-gray-400">Q{i+1}: </span>{ans.questionId}
                        </p>
                        <p className="mt-1.5 text-sm text-gray-700">
                          <span className="font-medium text-gray-400">A: </span>{ans.answer}
                        </p>
                        {ans.notes && <p className="mt-1 text-xs text-gray-400 italic">Notes: {ans.notes}</p>}
                        {ans.photos && ans.photos.length > 0 && (
                          <div className="mt-3 grid grid-cols-4 gap-2">
                            {ans.photos.map((url, pi) => (
                              <div key={pi}
                                className="group relative aspect-square rounded-lg overflow-hidden cursor-pointer border border-gray-200"
                                onClick={()=>setBigImg(url)}>
                                {imgErrors[url]
                                  ? <div className="w-full h-full bg-gray-200 flex items-center justify-center"><ImageIcon className="h-4 w-4 text-gray-400" /></div>
                                  : <><img src={url} alt="" className="w-full h-full object-cover" onError={()=>setImgErrors(p=>({...p,[url]:true}))} />
                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                                      <ZoomIn className="h-4 w-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </div></>
                                }
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Attachments */}
              {report.attachments && report.attachments.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2.5">
                    Attachments ({report.attachments.length})
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {report.attachments.map(att => (
                      <div key={att.id} className="relative group">
                        {att.type==='photo'
                          ? <div className="aspect-square rounded-xl overflow-hidden cursor-pointer border border-gray-200" onClick={()=>setBigImg(att.url)}>
                              {imgErrors[att.url]
                                ? <div className="w-full h-full bg-gray-200 flex items-center justify-center"><ImageIcon className="h-6 w-6 text-gray-400" /></div>
                                : <><img src={att.url} alt={att.filename} className="w-full h-full object-cover" onError={()=>setImgErrors(p=>({...p,[att.url]:true}))} />
                                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                                    <ZoomIn className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                  </div></>
                              }
                            </div>
                          : <a href={att.url} target="_blank" rel="noopener noreferrer"
                              className="aspect-square rounded-xl border border-gray-200 bg-gray-50 flex flex-col items-center justify-center p-3 hover:bg-gray-100 transition-colors">
                              <FileText className="h-6 w-6 text-gray-400 mb-2" />
                              <p className="text-xs text-gray-700 font-medium truncate w-full text-center">{att.filename}</p>
                              <span className="flex items-center gap-1 mt-1 text-xs text-blue-600"><ExternalLink className="h-3 w-3" />Open</span>
                            </a>
                        }
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Admin actions */}
              {!isPmcMember && onStatusChange && (
                <div className="border-t border-gray-100 pt-5 space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">Admin Notes</label>
                    <textarea
                      className="w-full p-3 border border-gray-200 rounded-xl text-sm resize-none
                        focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 transition"
                      rows={3} value={notes} onChange={e=>setNotes(e.target.value)}
                      placeholder="Add notes for this report..." />
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <button onClick={()=>doStatus('approved')} disabled={updating}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold
                        text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                      {updating?<Loader2 className="h-4 w-4 animate-spin" />:<CheckCircle className="h-4 w-4" />}Approve
                    </button>
                    <button onClick={()=>doStatus('rejected')} disabled={updating}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold
                        text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 transition-colors">
                      {updating?<Loader2 className="h-4 w-4 animate-spin" />:<X className="h-4 w-4" />}Reject
                    </button>
                    <button onClick={()=>doStatus('requires_action')} disabled={updating}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold
                        text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-50 transition-colors">
                      {updating?<Loader2 className="h-4 w-4 animate-spin" />:<AlertTriangle className="h-4 w-4" />}Action Req.
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {bigImg && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 p-4" onClick={()=>setBigImg(null)}>
          <button onClick={()=>setBigImg(null)} className="absolute top-4 right-4 text-white/70 hover:text-white bg-black/50 rounded-full p-2 z-10"><X className="h-5 w-5" /></button>
          <a href={bigImg} target="_blank" rel="noopener noreferrer" className="absolute top-4 right-16 text-white/70 hover:text-white bg-black/50 rounded-full p-2 z-10" onClick={e=>e.stopPropagation()}><ExternalLink className="h-5 w-5" /></a>
          <img src={bigImg} alt="Full view" className="max-w-full max-h-full object-contain rounded-lg" onClick={e=>e.stopPropagation()} />
        </div>
      )}
    </>
  )
}

function DetailRow({ icon:Icon, children }:{ icon:any; children:React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="h-4 w-4 text-gray-300 mt-0.5 shrink-0" />
      <div className="text-sm leading-relaxed">{children}</div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ReportReviewPage() {
  const { user }   = useAuth()
  const searchParams = useSearchParams()
  const isPmc      = user?.role === 'pmc_member'

  const getInitialTab = (): TabKey => {
    const t = searchParams.get('tab')
    return (t==='pending'||t==='approved'||t==='rejected'||t==='requires_action') ? t : 'pending'
  }

  const [activeTab,    setActiveTab]    = useState<TabKey>(getInitialTab())
  const [datePreset,   setDatePreset]   = useState<DatePreset>('today')
  const [customRange,  setCustomRange]  = useState({ start: todayStr(), end: todayStr() })
  const [showCustom,   setShowCustom]   = useState(false)
  const [allReports,   setAllReports]   = useState<ComplianceReport[]>([])
  const [loading,      setLoading]      = useState(true)
  const [initialLoad,  setInitialLoad]  = useState(true)
  const [search,       setSearch]       = useState('')
  const [sortField,    setSortField]    = useState<SortField>('date')
  const [sortDir,      setSortDir]      = useState<SortDir>('desc')
  const [dispCount,    setDispCount]    = useState(PAGE_SIZE)
  const [selected,     setSelected]     = useState<ComplianceReport|null>(null)
  const [changing,     setChanging]     = useState<string|null>(null)

  const loadMoreRef = useRef<HTMLDivElement>(null)

  useEffect(()=>{
    const t = searchParams.get('tab')
    if(t==='pending'||t==='approved'||t==='rejected'||t==='requires_action') setActiveTab(t)
  },[searchParams])

  const dateRange = useMemo(()=>getDateRange(datePreset,customRange),[datePreset,customRange])

  const tabCounts = useMemo(()=>{
    const c:Record<TabKey,number>={pending:0,approved:0,rejected:0,requires_action:0}
    allReports.forEach(r=>{ if(r.status in c) c[r.status as TabKey]++ })
    return c
  },[allReports])

  const filtered = useMemo(()=>{
    let list = allReports.filter(r=>r.status===activeTab)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(r =>
        [r.feederPointName,r.userName,r.teamName,r.description].some(v=>(v||'').toLowerCase().includes(q))
      )
    }
    list.sort((a,b)=>{
      let cmp=0
      if(sortField==='date')        cmp=getTS(a)-getTS(b)
      if(sortField==='feederPoint') cmp=(a.feederPointName||'').localeCompare(b.feederPointName||'')
      if(sortField==='trip')        cmp=(a.tripNumber||0)-(b.tripNumber||0)
      if(sortField==='userName')    cmp=(a.userName||'').localeCompare(b.userName||'')
      return sortDir==='desc' ? -cmp : cmp
    })
    return list
  },[allReports,activeTab,search,sortField,sortDir])

  const displayed = useMemo(()=>filtered.slice(0,dispCount),[filtered,dispCount])
  const hasMore   = dispCount < filtered.length

  useEffect(()=>{ setDispCount(PAGE_SIZE) },[activeTab,search,sortField,sortDir,datePreset,customRange])

  useEffect(()=>{
    if(!hasMore||!loadMoreRef.current) return
    const obs = new IntersectionObserver(entries=>{
      if(entries[0]?.isIntersecting) setDispCount(p=>p+LOAD_MORE_SIZE)
    },{ threshold:0.1, rootMargin:'200px' })
    obs.observe(loadMoreRef.current)
    return ()=>obs.disconnect()
  },[hasMore,displayed.length])

  useEffect(()=>{
    setLoading(true)
    const unsub = DataService.onComplianceReportsChange(reports=>{
      const { start, end } = dateRange
      const [s,e] = start<=end ? [start,end] : [end,start]
      const relevant = reports.filter(r=>{
        try {
          const d = r.submittedAt?.toDate ? r.submittedAt.toDate().toISOString().split('T')[0]
            : new Date(r.submittedAt).toISOString().split('T')[0]
          return d>=s && d<=e &&
            (r.status==='pending'||r.status==='approved'||r.status==='rejected'||r.status==='requires_action')
        } catch { return false }
      })
      setAllReports(relevant)
      setLoading(false)
      setInitialLoad(false)
    })
    return ()=>unsub()
  },[dateRange])

  const handleSort = (f:SortField) => {
    if(sortField===f) setSortDir(p=>p==='asc'?'desc':'asc')
    else { setSortField(f); setSortDir('desc') }
  }

  const handleQuickStatus = async (r:ComplianceReport, s:ComplianceReport['status']) => {
    if(!user) return
    setChanging(r.id)
    try { await DataService.updateComplianceReportStatus(r.id,s,'',user.name) }
    catch { alert('Failed to update status.') }
    finally { setChanging(null) }
  }

  const handleDetailStatus = async (r:ComplianceReport, s:ComplianceReport['status'], notes:string) => {
    if(!user) return
    await DataService.updateComplianceReportStatus(r.id,s,notes,user.name)
  }

  const activeCfg = TABS.find(t=>t.key===activeTab)!
  const total = Object.values(tabCounts).reduce((a,b)=>a+b,0)

  const dateLabel = useMemo(()=>{
    const {start,end}=dateRange
    const fmt = (s:string)=>new Date(s+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})
    return start===end ? new Date(start+'T00:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric'})
      : `${fmt(start)} – ${fmt(end)}, ${new Date(end+'T00:00:00').getFullYear()}`
  },[dateRange])

  return (
    <div className="flex flex-col gap-5">

      {/* PAGE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl
              bg-gradient-to-br from-blue-600 to-indigo-600 shadow-sm shadow-blue-500/30">
              <FileText className="h-4 w-4 text-white" />
            </div>
            Report Review
          </h1>
          <p className="mt-0.5 text-[13px] text-gray-400">
            Review and manage field compliance reports
            <span className="mx-1.5 text-gray-200">•</span>
            <span className="font-semibold text-gray-600">{total} total</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {tabCounts.pending>0 && (
            <button onClick={()=>setActiveTab('pending')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold
                text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100
                animate-pulse transition-colors">
              <Clock className="h-3.5 w-3.5" />{tabCounts.pending} Pending
            </button>
          )}
          <button onClick={()=>setLoading(true)} disabled={loading}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold
              text-gray-600 bg-white border border-gray-200 shadow-sm
              hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50 active:scale-95 transition-all">
            <RefreshCw className={`h-3.5 w-3.5 ${loading?'animate-spin':''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* MAIN CONTAINER */}
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">

        {/* DATE FILTER */}
        <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-5 py-3.5">
          <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            <Calendar className="h-3.5 w-3.5" />Period
          </span>
          <div className="flex flex-wrap gap-1.5">
            {DATE_PRESETS.map(p=>(
              <button key={p.key} onClick={()=>{ setDatePreset(p.key); setShowCustom(p.key==='custom') }}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150
                  ${datePreset===p.key
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm shadow-blue-500/20'
                    : 'bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                  }`}>
                {p.label}
              </button>
            ))}
          </div>
          <span className="ml-auto hidden md:block text-xs text-gray-400 font-medium">{dateLabel}</span>
          {showCustom && datePreset==='custom' && (
            <div className="w-full flex flex-wrap items-center gap-2 pt-2 border-t border-gray-100">
              <input type="date" value={customRange.start}
                onChange={e=>setCustomRange(p=>({...p,start:e.target.value}))}
                className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs
                  focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
              <span className="text-xs text-gray-300">→</span>
              <input type="date" value={customRange.end}
                onChange={e=>setCustomRange(p=>({...p,end:e.target.value}))}
                className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs
                  focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
            </div>
          )}
        </div>

        {/* STAT CARDS — gradient style */}
        <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-4">
          {TABS.map(t=>(
            <StatCard key={t.key} tab={t} value={tabCounts[t.key]}
              onClick={()=>setActiveTab(t.key)} isActive={activeTab===t.key} />
          ))}
        </div>

        <div className="mx-5 h-px bg-gray-100" />

        {/* TABS */}
        <div className="flex border-b border-gray-100">
          {TABS.map(t=>{
            const active = activeTab===t.key
            return (
              <button key={t.key} onClick={()=>setActiveTab(t.key)}
                className={`group relative flex-1 flex items-center justify-center gap-1.5 px-2 sm:px-4 py-3.5
                  text-xs sm:text-sm font-medium transition-all
                  ${active ? `${t.textColor} bg-white` : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'}`}>
                <span className={active ? t.textColor : 'text-gray-300 group-hover:text-gray-400'}>{t.icon}</span>
                <span className="hidden sm:inline">{t.shortLabel}</span>
                <span className={`min-w-[20px] h-5 px-1.5 rounded-full text-xs font-semibold
                  flex items-center justify-center transition-colors
                  ${active ? t.badgeActive : t.badgeIdle}
                  ${t.key==='pending'&&tabCounts.pending>0&&!active ? 'animate-pulse !bg-amber-100 !text-amber-700' : ''}`}>
                  {tabCounts[t.key]}
                </span>
                {active && <div className={`absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r ${t.gradient}`} />}
              </button>
            )
          })}
        </div>

        {/* SEARCH + SORT */}
        <div className="border-b border-gray-50 bg-gray-50/50 px-4 py-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input type="text" placeholder="Search feeder point, user, team..."
                value={search} onChange={e=>setSearch(e.target.value)}
                className="w-full pl-8 pr-8 py-2 bg-white border border-gray-200 rounded-lg text-sm
                  placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
              {search && (
                <button onClick={()=>setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {(['date','feederPoint','userName'] as const).map(f=>(
                <button key={f} onClick={()=>handleSort(f)}
                  className={`flex items-center gap-1 px-2.5 py-2 rounded-lg text-xs font-semibold transition-colors
                    ${sortField===f ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'}`}>
                  {f==='date'?'Date':f==='feederPoint'?'Feeder Pt':'User'}
                  {sortField===f && <ArrowUpDown className="h-3 w-3" />}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-gray-400">
            <span>Showing {displayed.length} of {filtered.length} {activeCfg.shortLabel.toLowerCase()} reports</span>
            {search && <span className="text-blue-500 font-medium">Filtered: "{search}"</span>}
          </div>
        </div>

        {/* CONTENT */}
        <div className="p-4 sm:p-5">
          {loading && initialLoad
            ? <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {Array.from({length:6}).map((_,i)=><CardSkeleton key={i} />)}
              </div>
            : filtered.length===0
            ? <EmptyState tab={activeCfg} />
            : <>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
                  {displayed.map(r=>(
                    <Fragment key={r.id}>
                      {changing===r.id
                        ? <div className="rounded-xl border border-gray-100 bg-white p-8 flex items-center justify-center">
                            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                          </div>
                        : <ReportCard report={r} tab={activeCfg} onView={setSelected}
                            onStatusChange={isPmc?undefined:(r,s)=>handleQuickStatus(r,s)}
                            isPmcMember={isPmc} />
                      }
                    </Fragment>
                  ))}
                </div>

                {hasMore && (
                  <div ref={loadMoreRef} className="mt-6 flex flex-col items-center gap-3">
                    <button onClick={()=>setDispCount(p=>p+LOAD_MORE_SIZE)}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium
                        text-gray-600 bg-white border border-gray-200 shadow-sm
                        hover:bg-gray-50 hover:shadow transition-all">
                      <ChevronDown className="h-4 w-4" />
                      Load More ({filtered.length-dispCount} remaining)
                    </button>
                    <p className="text-xs text-gray-400">Or scroll to auto-load</p>
                  </div>
                )}

                {!hasMore && filtered.length>PAGE_SIZE && (
                  <p className="mt-6 text-center text-xs text-gray-400">
                    All {filtered.length} reports loaded
                  </p>
                )}
              </>
          }
        </div>

      </div>{/* /main card */}

      {selected && (
        <DetailModal report={selected} onClose={()=>setSelected(null)}
          onStatusChange={isPmc?undefined:handleDetailStatus} isPmcMember={isPmc} />
      )}
    </div>
  )
}




// 'use client'

// import { useEffect, useMemo, useState, useCallback, useRef, Fragment } from 'react'
// import {
//   CheckCircle,
//   X,
//   AlertTriangle,
//   Clock,
//   Calendar,
//   ChevronDown,
//   ChevronLeft,
//   ChevronRight,
//   Eye,
//   Download,
//   FileText,
//   MapPin,
//   User,
//   Users,
//   Filter,
//   Loader2,
//   Image as ImageIcon,
//   ZoomIn,
//   ExternalLink,
//   Search,
//   RefreshCw,
//   MoreHorizontal,
//   ArrowUpDown,
//   Inbox,
//   TrendingUp,
//   Building,
//   Truck,
//   MessageSquare,
//   Send,
//   Hourglass,
// } from 'lucide-react'
// import { DataService, ComplianceReport } from '@/lib/dataService'
// import { useAuth } from '@/contexts/AuthContext'
// import jsPDF from 'jspdf'
// import { useSearchParams } from 'next/navigation'

// // ─── Types ──────────────────────────────────────────────────────────────────────

// type TabKey = 'pending' | 'approved' | 'rejected' | 'requires_action'
// type DatePreset = 'today' | 'yesterday' | 'week' | 'month' | 'custom'
// type SortField = 'date' | 'feederPoint' | 'trip' | 'userName'
// type SortDirection = 'asc' | 'desc'

// interface TabConfig {
//   key: TabKey
//   label: string
//   shortLabel: string
//   icon: React.ReactNode
//   color: string
//   bgColor: string
//   borderColor: string
//   ringColor: string
//   badgeColor: string
//   hoverColor: string
//   activeGradient: string
// }

// interface DateRange {
//   start: string
//   end: string
// }

// // ─── Constants ──────────────────────────────────────────────────────────────────

// const PAGE_SIZE = 20
// const LOAD_MORE_SIZE = 20

// const TABS: TabConfig[] = [
//   {
//     key: 'pending',
//     label: 'Pending Reports',
//     shortLabel: 'Pending',
//     icon: <Clock className="h-4 w-4" />,
//     color: 'text-amber-700',
//     bgColor: 'bg-amber-50',
//     borderColor: 'border-amber-200',
//     ringColor: 'ring-amber-500',
//     badgeColor: 'bg-amber-100 text-amber-800',
//     hoverColor: 'hover:bg-amber-50',
//     activeGradient: 'from-amber-500 to-amber-600',
//   },
//   {
//     key: 'approved',
//     label: 'Approved Reports',
//     shortLabel: 'Approved',
//     icon: <CheckCircle className="h-4 w-4" />,
//     color: 'text-emerald-700',
//     bgColor: 'bg-emerald-50',
//     borderColor: 'border-emerald-200',
//     ringColor: 'ring-emerald-500',
//     badgeColor: 'bg-emerald-100 text-emerald-800',
//     hoverColor: 'hover:bg-emerald-50',
//     activeGradient: 'from-emerald-500 to-emerald-600',
//   },
//   {
//     key: 'rejected',
//     label: 'Rejected Reports',
//     shortLabel: 'Rejected',
//     icon: <X className="h-4 w-4" />,
//     color: 'text-red-700',
//     bgColor: 'bg-red-50',
//     borderColor: 'border-red-200',
//     ringColor: 'ring-red-500',
//     badgeColor: 'bg-red-100 text-red-800',
//     hoverColor: 'hover:bg-red-50',
//     activeGradient: 'from-red-500 to-red-600',
//   },
//   {
//     key: 'requires_action',
//     label: 'Action Required',
//     shortLabel: 'Action',
//     icon: <AlertTriangle className="h-4 w-4" />,
//     color: 'text-orange-700',
//     bgColor: 'bg-orange-50',
//     borderColor: 'border-orange-200',
//     ringColor: 'ring-orange-500',
//     badgeColor: 'bg-orange-100 text-orange-800',
//     hoverColor: 'hover:bg-orange-50',
//     activeGradient: 'from-orange-500 to-orange-600',
//   },
// ]

// const DATE_PRESETS: Array<{ key: DatePreset; label: string; shortLabel: string }> = [
//   { key: 'today', label: 'Today', shortLabel: 'Today' },
//   { key: 'yesterday', label: 'Yesterday', shortLabel: 'Yest.' },
//   { key: 'week', label: 'This Week', shortLabel: 'Week' },
//   { key: 'month', label: 'This Month', shortLabel: 'Month' },
//   { key: 'custom', label: 'Custom Range', shortLabel: 'Custom' },
// ]

// // ─── Utility Helpers ────────────────────────────────────────────────────────────

// const getToday = () => new Date().toISOString().split('T')[0]

// const getYesterday = () => {
//   const d = new Date()
//   d.setDate(d.getDate() - 1)
//   return d.toISOString().split('T')[0]
// }

// const getWeekStart = () => {
//   const d = new Date()
//   const day = d.getDay()
//   const diff = d.getDate() - day + (day === 0 ? -6 : 1)
//   d.setDate(diff)
//   return d.toISOString().split('T')[0]
// }

// const getMonthStart = () => {
//   const d = new Date()
//   return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0]
// }

// const getDateRange = (preset: DatePreset, customRange: DateRange): DateRange => {
//   const today = getToday()
//   switch (preset) {
//     case 'today':
//       return { start: today, end: today }
//     case 'yesterday': {
//       const yesterday = getYesterday()
//       return { start: yesterday, end: yesterday }
//     }
//     case 'week':
//       return { start: getWeekStart(), end: today }
//     case 'month':
//       return { start: getMonthStart(), end: today }
//     case 'custom':
//       return customRange
//     default:
//       return { start: today, end: today }
//   }
// }

// const formatReportDate = (report: ComplianceReport): string => {
//   try {
//     if (report.submittedAt?.toDate) {
//       return report.submittedAt.toDate().toLocaleString()
//     }
//     const parsed = new Date(report.submittedAt)
//     if (!Number.isNaN(parsed.getTime())) {
//       return parsed.toLocaleString()
//     }
//   } catch {
//     // ignore
//   }
//   return '—'
// }

// const formatShortDate = (report: ComplianceReport): string => {
//   try {
//     if (report.submittedAt?.toDate) {
//       return report.submittedAt.toDate().toLocaleDateString('en-US', {
//         month: 'short',
//         day: 'numeric',
//         hour: '2-digit',
//         minute: '2-digit',
//       })
//     }
//     const parsed = new Date(report.submittedAt)
//     if (!Number.isNaN(parsed.getTime())) {
//       return parsed.toLocaleDateString('en-US', {
//         month: 'short',
//         day: 'numeric',
//         hour: '2-digit',
//         minute: '2-digit',
//       })
//     }
//   } catch {
//     // ignore
//   }
//   return '—'
// }

// const getReportTimestamp = (report: ComplianceReport): number => {
//   try {
//     if (report.submittedAt?.toDate) {
//       return report.submittedAt.toDate().getTime()
//     }
//     const parsed = new Date(report.submittedAt)
//     if (!Number.isNaN(parsed.getTime())) {
//       return parsed.getTime()
//     }
//   } catch {
//     // ignore
//   }
//   return 0
// }

// const sanitizeFilenameSegment = (value: string, fallback = 'value') => {
//   if (!value) return fallback
//   return value.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '') || fallback
// }

// const getPriorityConfig = (priority: string | undefined) => {
//   switch (priority) {
//     case 'high':
//       return { label: 'High', color: 'bg-red-100 text-red-700 border-red-200' }
//     case 'medium':
//       return { label: 'Medium', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' }
//     case 'low':
//       return { label: 'Low', color: 'bg-blue-100 text-blue-700 border-blue-200' }
//     default:
//       return { label: 'Normal', color: 'bg-gray-100 text-gray-600 border-gray-200' }
//   }
// }

// const getTimeSinceSubmission = (report: ComplianceReport): string => {
//   const timestamp = getReportTimestamp(report)
//   if (!timestamp) return ''
//   const now = Date.now()
//   const diffMs = now - timestamp
//   const diffMins = Math.floor(diffMs / 60000)
//   const diffHours = Math.floor(diffMins / 60)
//   const diffDays = Math.floor(diffHours / 24)

//   if (diffMins < 1) return 'Just now'
//   if (diffMins < 60) return `${diffMins}m ago`
//   if (diffHours < 24) return `${diffHours}h ago`
//   if (diffDays < 7) return `${diffDays}d ago`
//   return `${Math.floor(diffDays / 7)}w ago`
// }

// // ─── Subcomponents ──────────────────────────────────────────────────────────────

// function EmptyState({ tab }: { tab: TabConfig }) {
//   return (
//     <div className="flex flex-col items-center justify-center py-16 px-4">
//       <div className={`rounded-full ${tab.bgColor} p-6 mb-4`}>
//         <Inbox className={`h-12 w-12 ${tab.color}`} />
//       </div>
//       <h3 className="text-lg font-semibold text-gray-900 mb-2">No {tab.shortLabel} Reports</h3>
//       <p className="text-sm text-gray-500 text-center max-w-md">
//         {tab.key === 'pending'
//           ? 'All reports have been reviewed for the selected date range. Great job!'
//           : `There are no ${tab.label.toLowerCase()} for the selected date range. Try adjusting your filters or date selection.`}
//       </p>
//     </div>
//   )
// }

// function SkeletonCard() {
//   return (
//     <div className="bg-white rounded-xl border border-gray-100 p-4 sm:p-5 animate-pulse">
//       <div className="flex items-start justify-between gap-3">
//         <div className="flex items-start gap-3 min-w-0 flex-1">
//           <div className="h-10 w-10 rounded-full bg-gray-200 flex-shrink-0" />
//           <div className="space-y-2 flex-1 min-w-0">
//             <div className="h-4 bg-gray-200 rounded w-3/4" />
//             <div className="h-3 bg-gray-200 rounded w-1/2" />
//           </div>
//         </div>
//         <div className="h-6 w-16 bg-gray-200 rounded-full flex-shrink-0" />
//       </div>
//       <div className="mt-4 space-y-2">
//         <div className="h-3 bg-gray-200 rounded w-full" />
//         <div className="h-3 bg-gray-200 rounded w-2/3" />
//       </div>
//       <div className="mt-4 flex items-center gap-2">
//         <div className="h-3 bg-gray-200 rounded w-20" />
//         <div className="h-3 bg-gray-200 rounded w-20" />
//       </div>
//     </div>
//   )
// }

// function LoadingSkeleton({ count = 6 }: { count?: number }) {
//   return (
//     <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
//       {Array.from({ length: count }).map((_, i) => (
//         <SkeletonCard key={i} />
//       ))}
//     </div>
//   )
// }

// function StatCard({
//   label,
//   value,
//   icon,
//   color,
//   bgColor,
//   onClick,
//   isActive,
// }: {
//   label: string
//   value: number
//   icon: React.ReactNode
//   color: string
//   bgColor: string
//   onClick?: () => void
//   isActive?: boolean
// }) {
//   return (
//     <button
//       onClick={onClick}
//       className={`w-full bg-white rounded-xl border shadow-sm p-4 flex items-center gap-4 transition-all hover:shadow-md text-left ${isActive ? 'border-blue-300 ring-2 ring-blue-100' : 'border-gray-100'
//         }`}
//     >
//       <div className={`rounded-xl ${bgColor} p-3 flex-shrink-0`}>{icon}</div>
//       <div className="min-w-0">
//         <p className="text-2xl font-bold text-gray-900">{value.toLocaleString()}</p>
//         <p className={`text-xs font-medium ${color} truncate`}>{label}</p>
//       </div>
//     </button>
//   )
// }

// interface ReportCardProps {
//   report: ComplianceReport
//   tab: TabConfig
//   onView: (report: ComplianceReport) => void
//   onStatusChange?: (report: ComplianceReport, status: ComplianceReport['status']) => void
//   isPmcMember?: boolean
// }

// function ReportCard({ report, tab, onView, onStatusChange, isPmcMember }: ReportCardProps) {
//   const priority = getPriorityConfig(report.priority)
//   const photoCount =
//     report.answers?.reduce((count, answer) => count + (answer.photos ? answer.photos.length : 0), 0) ?? 0
//   const attachmentCount = report.attachments?.length ?? 0
//   const totalImages = photoCount + attachmentCount
//   const isPending = tab.key === 'pending'
//   const timeSince = isPending ? getTimeSinceSubmission(report) : ''

//   return (
//     <div
//       className={`group bg-white rounded-xl border transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 ${tab.borderColor} border-opacity-40 hover:border-opacity-100`}
//     >
//       {/* Pending urgency strip */}
//       {isPending && (
//         <div className={`h-1 rounded-t-xl bg-gradient-to-r ${tab.activeGradient}`} />
//       )}

//       {/* Card Header */}
//       <div className="p-4 sm:p-5">
//         <div className="flex items-start justify-between gap-3">
//           <div className="flex items-start gap-3 min-w-0 flex-1">
//             <div className={`rounded-full ${tab.bgColor} p-2.5 flex-shrink-0 mt-0.5`}>
//               {tab.icon}
//             </div>
//             <div className="min-w-0 flex-1">
//               <h3 className="text-sm sm:text-base font-semibold text-gray-900 truncate">
//                 {report.feederPointName || 'Unknown Feeder Point'}
//               </h3>
//               <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5">
//                 <Truck className="h-3 w-3 flex-shrink-0" />
//                 <span>Trip {report.tripNumber}</span>
//                 <span className="text-gray-300">•</span>
//                 <span>{report.tripDate || '—'}</span>
//               </p>
//             </div>
//           </div>
//           <div className="flex flex-col items-end gap-1 flex-shrink-0">
//             <span
//               className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${priority.color}`}
//             >
//               {priority.label}
//             </span>
//             {isPending && timeSince && (
//               <span className="text-[10px] font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
//                 {timeSince}
//               </span>
//             )}
//           </div>
//         </div>

//         {/* Description */}
//         {report.description && (
//           <p className="mt-3 text-sm text-gray-600 line-clamp-2">{report.description}</p>
//         )}

//         {/* Metadata Row */}
//         <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-gray-500">
//           <span className="flex items-center gap-1">
//             <User className="h-3 w-3" />
//             <span className="truncate max-w-[120px]">{report.userName || 'Unknown'}</span>
//           </span>
//           {report.teamName && (
//             <span className="flex items-center gap-1">
//               <Users className="h-3 w-3" />
//               <span className="truncate max-w-[100px]">{report.teamName}</span>
//             </span>
//           )}
//           <span className="flex items-center gap-1">
//             <Clock className="h-3 w-3" />
//             <span>{formatShortDate(report)}</span>
//           </span>
//           {totalImages > 0 && (
//             <span className="flex items-center gap-1">
//               <ImageIcon className="h-3 w-3" />
//               <span>
//                 {totalImages} image{totalImages !== 1 ? 's' : ''}
//               </span>
//             </span>
//           )}
//         </div>

//         {/* Answers summary */}
//         <div className="mt-3 flex items-center gap-2 text-xs text-gray-400">
//           <FileText className="h-3 w-3" />
//           <span>
//             {report.answers?.length ?? 0} answer{(report.answers?.length ?? 0) !== 1 ? 's' : ''}
//           </span>
//           {report.submittedLocation?.address && (
//             <>
//               <span className="text-gray-300">•</span>
//               <MapPin className="h-3 w-3" />
//               <span className="truncate max-w-[160px]">{report.submittedLocation.address}</span>
//             </>
//           )}
//         </div>
//       </div>

//       {/* Card Footer */}
//       <div
//         className={`px-4 sm:px-5 py-3 border-t ${tab.borderColor} border-opacity-30 bg-gray-50/50 rounded-b-xl flex items-center justify-between gap-2`}
//       >
//         <button
//           onClick={() => onView(report)}
//           className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-700 bg-white border border-gray-200 shadow-sm hover:bg-gray-50 hover:shadow transition-all"
//         >
//           <Eye className="h-3.5 w-3.5" />
//           <span className="hidden sm:inline">View Details</span>
//           <span className="sm:hidden">View</span>
//         </button>

//         {!isPmcMember && onStatusChange && (
//           <div className="flex items-center gap-1.5">
//             {tab.key !== 'approved' && (
//               <button
//                 onClick={() => onStatusChange(report, 'approved')}
//                 className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 transition-colors"
//                 title="Approve"
//               >
//                 <CheckCircle className="h-3.5 w-3.5" />
//                 <span className="hidden lg:inline">Approve</span>
//               </button>
//             )}
//             {tab.key !== 'rejected' && (
//               <button
//                 onClick={() => onStatusChange(report, 'rejected')}
//                 className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-700 bg-red-50 border border-red-200 hover:bg-red-100 transition-colors"
//                 title="Reject"
//               >
//                 <X className="h-3.5 w-3.5" />
//                 <span className="hidden lg:inline">Reject</span>
//               </button>
//             )}
//             {tab.key !== 'requires_action' && (
//               <button
//                 onClick={() => onStatusChange(report, 'requires_action')}
//                 className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-orange-700 bg-orange-50 border border-orange-200 hover:bg-orange-100 transition-colors"
//                 title="Action Required"
//               >
//                 <AlertTriangle className="h-3.5 w-3.5" />
//                 <span className="hidden lg:inline">Action</span>
//               </button>
//             )}
//           </div>
//         )}
//       </div>
//     </div>
//   )
// }

// // ─── Report Detail Modal ────────────────────────────────────────────────────────

// interface ReportDetailModalProps {
//   report: ComplianceReport
//   onClose: () => void
//   onStatusChange?: (
//     report: ComplianceReport,
//     status: ComplianceReport['status'],
//     notes: string
//   ) => Promise<void>
//   isPmcMember?: boolean
// }

// function ReportDetailModal({ report, onClose, onStatusChange, isPmcMember }: ReportDetailModalProps) {
//   const [adminNotes, setAdminNotes] = useState('')
//   const [updating, setUpdating] = useState(false)
//   const [selectedImage, setSelectedImage] = useState<string | null>(null)
//   const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({})

//   const handleStatusChange = async (status: ComplianceReport['status']) => {
//     if (!onStatusChange) return
//     setUpdating(true)
//     try {
//       await onStatusChange(report, status, adminNotes)
//       onClose()
//     } catch (error) {
//       console.error('Failed to update status:', error)
//       alert('Failed to update report status. Please try again.')
//     } finally {
//       setUpdating(false)
//     }
//   }

//   const handleImageError = (url: string) => {
//     setImageErrors((prev) => ({ ...prev, [url]: true }))
//   }

//   const statusConfig = TABS.find((t) => t.key === report.status)

//   const photoCount =
//     report.answers?.reduce((count, answer) => count + (answer.photos ? answer.photos.length : 0), 0) ?? 0

//   return (
//     <>
//       <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start sm:items-center justify-center z-50 p-2 sm:p-4 overflow-y-auto">
//         <div
//           className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl my-2 sm:my-8 overflow-hidden"
//           onClick={(e) => e.stopPropagation()}
//         >
//           {/* Modal Header */}
//           <div
//             className={`bg-gradient-to-r ${statusConfig?.activeGradient || 'from-gray-500 to-gray-600'} px-4 sm:px-6 py-4`}
//           >
//             <div className="flex items-start justify-between gap-3">
//               <div className="min-w-0">
//                 <div className="flex items-center gap-2 mb-1">
//                   <span
//                     className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-white/20 text-white`}
//                   >
//                     {statusConfig?.icon}
//                     {report.status === 'pending'
//                       ? 'PENDING REVIEW'
//                       : report.status.replace('_', ' ').toUpperCase()}
//                   </span>
//                 </div>
//                 <h2 className="text-lg sm:text-xl font-bold text-white truncate">
//                   {report.feederPointName || 'Unknown Feeder Point'}
//                 </h2>
//                 <p className="text-white/80 text-sm mt-0.5">
//                   Trip {report.tripNumber} • {report.tripDate || '—'}
//                 </p>
//               </div>
//               <button
//                 onClick={onClose}
//                 className="rounded-full p-2 text-white/80 hover:text-white hover:bg-white/20 transition-colors flex-shrink-0"
//               >
//                 <X className="h-5 w-5" />
//               </button>
//             </div>
//           </div>

//           {/* Modal Body */}
//           <div className="max-h-[calc(100vh-200px)] overflow-y-auto">
//             <div className="p-4 sm:p-6 space-y-6">
//               {/* Pending Banner */}
//               {report.status === 'pending' && !isPmcMember && (
//                 <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
//                   <Clock className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
//                   <div>
//                     <p className="text-sm font-semibold text-amber-800">This report is awaiting review</p>
//                     <p className="text-xs text-amber-600 mt-0.5">
//                       Please review the details below and take action using the buttons at the bottom.
//                     </p>
//                   </div>
//                 </div>
//               )}

//               {/* Quick Info Grid */}
//               <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
//                 <div className="bg-gray-50 rounded-lg p-3 text-center">
//                   <p className="text-xs text-gray-500 mb-1">Status</p>
//                   <span
//                     className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${statusConfig?.badgeColor || 'bg-gray-100 text-gray-700'}`}
//                   >
//                     {report.status === 'pending' ? 'PENDING' : report.status.replace('_', ' ').toUpperCase()}
//                   </span>
//                 </div>
//                 <div className="bg-gray-50 rounded-lg p-3 text-center">
//                   <p className="text-xs text-gray-500 mb-1">Priority</p>
//                   <span
//                     className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${getPriorityConfig(report.priority).color}`}
//                   >
//                     {getPriorityConfig(report.priority).label}
//                   </span>
//                 </div>
//                 <div className="bg-gray-50 rounded-lg p-3 text-center">
//                   <p className="text-xs text-gray-500 mb-1">Answers</p>
//                   <p className="text-sm font-semibold text-gray-900">{report.answers?.length || 0}</p>
//                 </div>
//                 <div className="bg-gray-50 rounded-lg p-3 text-center">
//                   <p className="text-xs text-gray-500 mb-1">Photos</p>
//                   <p className="text-sm font-semibold text-gray-900">
//                     {photoCount + (report.attachments?.length || 0)}
//                   </p>
//                 </div>
//               </div>

//               {/* Details Section */}
//               <div>
//                 <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-3">
//                   Report Details
//                 </h3>
//                 <div className="bg-gray-50 rounded-xl p-4 space-y-2.5 text-sm">
//                   <div className="flex items-start gap-2">
//                     <User className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
//                     <div>
//                       <span className="text-gray-500">Submitted by: </span>
//                       <span className="text-gray-900 font-medium">{report.userName || 'Unknown'}</span>
//                       {report.teamName && <span className="text-gray-500"> ({report.teamName})</span>}
//                     </div>
//                   </div>
//                   <div className="flex items-start gap-2">
//                     <Clock className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
//                     <div>
//                       <span className="text-gray-500">Submitted at: </span>
//                       <span className="text-gray-900 font-medium">{formatReportDate(report)}</span>
//                     </div>
//                   </div>
//                   {report.submittedLocation?.address && (
//                     <div className="flex items-start gap-2">
//                       <MapPin className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
//                       <div>
//                         <span className="text-gray-500">Location: </span>
//                         <span className="text-gray-900">{report.submittedLocation.address}</span>
//                         {typeof report.distanceFromFeederPoint === 'number' && (
//                           <span className="text-gray-500 text-xs ml-1">
//                             ({report.distanceFromFeederPoint.toFixed(1)}m from FP)
//                           </span>
//                         )}
//                       </div>
//                     </div>
//                   )}
//                   {report.description && (
//                     <div className="flex items-start gap-2">
//                       <MessageSquare className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
//                       <div>
//                         <span className="text-gray-500">Description: </span>
//                         <span className="text-gray-900">{report.description}</span>
//                       </div>
//                     </div>
//                   )}
//                 </div>
//               </div>

//               {/* Answers Section */}
//               {report.answers && report.answers.length > 0 && (
//                 <div>
//                   <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-3">
//                     Answers ({report.answers.length})
//                   </h3>
//                   <div className="space-y-3">
//                     {report.answers.map((answer, index) => (
//                       <div key={index} className="bg-gray-50 rounded-xl p-4 border border-gray-100">
//                         <div className="flex items-start justify-between gap-2">
//                           <p className="text-sm font-medium text-gray-900">
//                             <span className="text-gray-500">Q{index + 1}:</span> {answer.questionId}
//                           </p>
//                         </div>
//                         <p className="mt-1.5 text-sm text-gray-700">
//                           <span className="font-medium text-gray-500">A:</span> {answer.answer}
//                         </p>
//                         {answer.notes && (
//                           <p className="mt-1 text-xs text-gray-500 italic">Notes: {answer.notes}</p>
//                         )}
//                         {/* Answer Photos */}
//                         {answer.photos && answer.photos.length > 0 && (
//                           <div className="mt-3 grid grid-cols-3 sm:grid-cols-4 gap-2">
//                             {answer.photos.map((photoUrl, pIdx) => (
//                               <div
//                                 key={pIdx}
//                                 className="relative group aspect-square rounded-lg overflow-hidden cursor-pointer border border-gray-200"
//                                 onClick={() => setSelectedImage(photoUrl)}
//                               >
//                                 {imageErrors[photoUrl] ? (
//                                   <div className="w-full h-full bg-gray-200 flex items-center justify-center">
//                                     <ImageIcon className="h-5 w-5 text-gray-400" />
//                                   </div>
//                                 ) : (
//                                   <>
//                                     <img
//                                       src={photoUrl}
//                                       alt={`Q${index + 1} Photo ${pIdx + 1}`}
//                                       className="w-full h-full object-cover"
//                                       onError={() => handleImageError(photoUrl)}
//                                     />
//                                     <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
//                                       <ZoomIn className="h-4 w-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
//                                     </div>
//                                   </>
//                                 )}
//                               </div>
//                             ))}
//                           </div>
//                         )}
//                       </div>
//                     ))}
//                   </div>
//                 </div>
//               )}

//               {/* Attachments Section */}
//               {report.attachments && report.attachments.length > 0 && (
//                 <div>
//                   <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-3">
//                     Attachments ({report.attachments.length})
//                   </h3>
//                   <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
//                     {report.attachments.map((att) => (
//                       <div key={att.id} className="relative group">
//                         {att.type === 'photo' ? (
//                           <div
//                             className="aspect-square rounded-xl overflow-hidden cursor-pointer border border-gray-200"
//                             onClick={() => setSelectedImage(att.url)}
//                           >
//                             {imageErrors[att.url] ? (
//                               <div className="w-full h-full bg-gray-200 flex items-center justify-center">
//                                 <ImageIcon className="h-6 w-6 text-gray-400" />
//                               </div>
//                             ) : (
//                               <>
//                                 <img
//                                   src={att.url}
//                                   alt={att.filename}
//                                   className="w-full h-full object-cover"
//                                   onError={() => handleImageError(att.url)}
//                                 />
//                                 <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
//                                   <ZoomIn className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
//                                 </div>
//                                 <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
//                                   <p className="text-white text-xs truncate">{att.filename}</p>
//                                 </div>
//                               </>
//                             )}
//                           </div>
//                         ) : (
//                           <a
//                             href={att.url}
//                             target="_blank"
//                             rel="noopener noreferrer"
//                             className="aspect-square rounded-xl border border-gray-200 bg-gray-50 flex flex-col items-center justify-center p-3 hover:bg-gray-100 transition-colors"
//                           >
//                             <FileText className="h-6 w-6 text-gray-500 mb-2" />
//                             <p className="text-xs text-gray-700 font-medium truncate w-full text-center">
//                               {att.filename}
//                             </p>
//                             <span className="flex items-center gap-1 mt-1 text-xs text-blue-600">
//                               <ExternalLink className="h-3 w-3" /> Open
//                             </span>
//                           </a>
//                         )}
//                       </div>
//                     ))}
//                   </div>
//                 </div>
//               )}

//               {/* Admin Notes & Actions */}
//               {!isPmcMember && onStatusChange && (
//                 <div className="border-t border-gray-100 pt-6 space-y-4">
//                   <div>
//                     <label className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-2 block">
//                       Admin Notes
//                     </label>
//                     <textarea
//                       className="w-full p-3 border border-gray-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
//                       rows={3}
//                       value={adminNotes}
//                       onChange={(e) => setAdminNotes(e.target.value)}
//                       placeholder="Add notes for this report..."
//                     />
//                   </div>
//                   <div className="flex flex-col sm:flex-row gap-2">
//                     <button
//                       onClick={() => handleStatusChange('approved')}
//                       disabled={updating}
//                       className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
//                     >
//                       {updating ? (
//                         <Loader2 className="h-4 w-4 animate-spin" />
//                       ) : (
//                         <CheckCircle className="h-4 w-4" />
//                       )}
//                       Approve
//                     </button>
//                     <button
//                       onClick={() => handleStatusChange('rejected')}
//                       disabled={updating}
//                       className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
//                     >
//                       {updating ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
//                       Reject
//                     </button>
//                     <button
//                       onClick={() => handleStatusChange('requires_action')}
//                       disabled={updating}
//                       className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
//                     >
//                       {updating ? (
//                         <Loader2 className="h-4 w-4 animate-spin" />
//                       ) : (
//                         <AlertTriangle className="h-4 w-4" />
//                       )}
//                       Action Required
//                     </button>
//                   </div>
//                 </div>
//               )}
//             </div>
//           </div>
//         </div>
//       </div>

//       {/* Full Image Modal */}
//       {selectedImage && (
//         <div
//           className="fixed inset-0 bg-black/95 flex items-center justify-center z-[60] p-4"
//           onClick={() => setSelectedImage(null)}
//         >
//           <button
//             onClick={() => setSelectedImage(null)}
//             className="absolute top-4 right-4 text-white/80 hover:text-white bg-black/50 rounded-full p-2 z-10"
//           >
//             <X className="h-5 w-5" />
//           </button>
//           <a
//             href={selectedImage}
//             target="_blank"
//             rel="noopener noreferrer"
//             className="absolute top-4 right-16 text-white/80 hover:text-white bg-black/50 rounded-full p-2 z-10"
//             onClick={(e) => e.stopPropagation()}
//           >
//             <ExternalLink className="h-5 w-5" />
//           </a>
//           <img
//             src={selectedImage}
//             alt="Full view"
//             className="max-w-full max-h-full object-contain rounded-lg"
//             onClick={(e) => e.stopPropagation()}
//           />
//         </div>
//       )}
//     </>
//   )
// }

// // ─── Main Page Component ────────────────────────────────────────────────────────

// export default function ReportReviewPage() {
//   const { user } = useAuth()
//   const isPmcMember = user?.role === 'pmc_member'

//   // ── State ───────────────────────────────────────────────────────────────────
//   const searchParams = useSearchParams()

//   const getInitialTab = (): TabKey => {
//     const tab = searchParams.get('tab')

//     if (
//       tab === 'pending' ||
//       tab === 'approved' ||
//       tab === 'rejected' ||
//       tab === 'requires_action'
//     ) {
//       return tab
//     }

//     return 'pending'
//   }

//   const [activeTab, setActiveTab] = useState<TabKey>('pending')
 
//   const [datePreset, setDatePreset] = useState<DatePreset>('today')
//   const [customRange, setCustomRange] = useState<DateRange>({
//     start: getToday(),
//     end: getToday(),
//   })
//   const [allReports, setAllReports] = useState<ComplianceReport[]>([])
//   const [loading, setLoading] = useState(true)
//   const [initialLoad, setInitialLoad] = useState(true)
//   const [searchQuery, setSearchQuery] = useState('')
//   const [sortField, setSortField] = useState<SortField>('date')
//   const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
//   const [displayCount, setDisplayCount] = useState(PAGE_SIZE)
//   const [selectedReport, setSelectedReport] = useState<ComplianceReport | null>(null)
//   const [showCustomRange, setShowCustomRange] = useState(false)
//   const [statusChanging, setStatusChanging] = useState<string | null>(null)

//   const loadMoreRef = useRef<HTMLDivElement>(null)
//   const containerRef = useRef<HTMLDivElement>(null)

//   // ── Computed date range ─────────────────────────────────────────────────────
//   const dateRange = useMemo(() => getDateRange(datePreset, customRange), [datePreset, customRange])

//   // ── Tab counts ──────────────────────────────────────────────────────────────
//   const tabCounts = useMemo(() => {
//     const counts: Record<TabKey, number> = { pending: 0, approved: 0, rejected: 0, requires_action: 0 }
//     allReports.forEach((report) => {
//       if (report.status in counts) {
//         counts[report.status as TabKey] += 1
//       }
//     })
//     return counts
//   }, [allReports])

//   // ── Filtered & sorted reports ─────────────────────────────────────────────
//   const filteredReports = useMemo(() => {
//     let list = allReports.filter((r) => r.status === activeTab)

//     // Apply search
//     if (searchQuery.trim()) {
//       const query = searchQuery.trim().toLowerCase()
//       list = list.filter((report) => {
//         const feeder = (report.feederPointName || '').toLowerCase()
//         const userName = (report.userName || '').toLowerCase()
//         const team = (report.teamName || '').toLowerCase()
//         const description = (report.description || '').toLowerCase()
//         return (
//           feeder.includes(query) ||
//           userName.includes(query) ||
//           team.includes(query) ||
//           description.includes(query)
//         )
//       })
//     }

//     // Sort
//     list.sort((a, b) => {
//       let compare = 0
//       switch (sortField) {
//         case 'date':
//           compare = getReportTimestamp(a) - getReportTimestamp(b)
//           break
//         case 'feederPoint':
//           compare = (a.feederPointName || '').localeCompare(b.feederPointName || '')
//           break
//         case 'trip':
//           compare = (a.tripNumber || 0) - (b.tripNumber || 0)
//           break
//         case 'userName':
//           compare = (a.userName || '').localeCompare(b.userName || '')
//           break
//       }
//       return sortDirection === 'desc' ? -compare : compare
//     })

//     return list
//   }, [allReports, activeTab, searchQuery, sortField, sortDirection])

//   // ── Paginated / chunked reports ────────────────────────────────────────────
//   const displayedReports = useMemo(() => {
//     return filteredReports.slice(0, displayCount)
//   }, [filteredReports, displayCount])

//   const hasMore = displayCount < filteredReports.length

//   // ── Reset display count when switching tabs / filters ─────────────────────
//   useEffect(() => {
//     setDisplayCount(PAGE_SIZE)
//   }, [activeTab, searchQuery, sortField, sortDirection, datePreset, customRange])

//   // ── Infinite scroll / intersection observer ───────────────────────────────
//   useEffect(() => {
//     if (!hasMore || !loadMoreRef.current) return

//     const observer = new IntersectionObserver(
//       (entries) => {
//         if (entries[0]?.isIntersecting && hasMore) {
//           setDisplayCount((prev) => prev + LOAD_MORE_SIZE)
//         }
//       },
//       { threshold: 0.1, rootMargin: '200px' }
//     )

//     observer.observe(loadMoreRef.current)
//     return () => observer.disconnect()
//   }, [hasMore, displayedReports.length])
//   useEffect(() => {
//     const tab = searchParams.get('tab')

//     if (
//       tab === 'pending' ||
//       tab === 'approved' ||
//       tab === 'rejected' ||
//       tab === 'requires_action'
//     ) {
//       setActiveTab(tab)
//     }
//   }, [searchParams])
//   // ── Fetch reports ─────────────────────────────────────────────────────────
//   useEffect(() => {
//     setLoading(true)

//     const unsubscribe = DataService.onComplianceReportsChange((reports) => {
//       // Filter by date range
//       const filtered = reports.filter((report) => {
//         try {
//           const reportDate = report.submittedAt?.toDate
//             ? report.submittedAt.toDate().toISOString().split('T')[0]
//             : new Date(report.submittedAt).toISOString().split('T')[0]

//           const { start, end } = dateRange
//           const [rangeStart, rangeEnd] = start <= end ? [start, end] : [end, start]
//           return reportDate >= rangeStart && reportDate <= rangeEnd
//         } catch {
//           return false
//         }
//       })

//       // Keep all 4 relevant statuses
//       const relevant = filtered.filter(
//         (r) =>
//           r.status === 'pending' ||
//           r.status === 'approved' ||
//           r.status === 'rejected' ||
//           r.status === 'requires_action'
//       )

//       setAllReports(relevant)
//       setLoading(false)
//       setInitialLoad(false)
//     })

//     return () => unsubscribe()
//   }, [dateRange])

//   // ── Handlers ──────────────────────────────────────────────────────────────
//   const handleDatePresetChange = (preset: DatePreset) => {
//     if (preset === 'custom') {
//       setShowCustomRange(true)
//     } else {
//       setShowCustomRange(false)
//     }
//     setDatePreset(preset)
//   }

//   const handleSort = (field: SortField) => {
//     if (sortField === field) {
//       setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
//     } else {
//       setSortField(field)
//       setSortDirection('desc')
//     }
//   }

//   const handleQuickStatusChange = async (
//     report: ComplianceReport,
//     status: ComplianceReport['status']
//   ) => {
//     if (!user) return
//     setStatusChanging(report.id)
//     try {
//       await DataService.updateComplianceReportStatus(report.id, status, '', user.name)
//     } catch (error) {
//       console.error('Failed to update status:', error)
//       alert('Failed to update report status.')
//     } finally {
//       setStatusChanging(null)
//     }
//   }

//   const handleDetailStatusChange = async (
//     report: ComplianceReport,
//     status: ComplianceReport['status'],
//     notes: string
//   ) => {
//     if (!user) return
//     await DataService.updateComplianceReportStatus(report.id, status, notes, user.name)
//   }

//   const handleLoadMore = () => {
//     setDisplayCount((prev) => prev + LOAD_MORE_SIZE)
//   }

//   const handleRefresh = () => {
//     setLoading(true)
//     setAllReports([])
//   }

//   const activeTabConfig = TABS.find((t) => t.key === activeTab)!

//   // ── Date label for display ─────────────────────────────────────────────────
//   const dateLabel = useMemo(() => {
//     const { start, end } = dateRange
//     if (start === end) {
//       const d = new Date(start + 'T00:00:00')
//       return d.toLocaleDateString('en-US', {
//         weekday: 'short',
//         month: 'short',
//         day: 'numeric',
//         year: 'numeric',
//       })
//     }
//     const s = new Date(start + 'T00:00:00')
//     const e = new Date(end + 'T00:00:00')
//     return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
//   }, [dateRange])

//   // ── Total report count across all tabs ────────────────────────────────────
//   const totalReportCount = useMemo(
//     () => tabCounts.pending + tabCounts.approved + tabCounts.rejected + tabCounts.requires_action,
//     [tabCounts]
//   )

//   // ── Render ────────────────────────────────────────────────────────────────
//   return (
//     <div ref={containerRef} className="min-h-screen bg-gray-50/50">
//       <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6">
//         {/* ─── Page Header ───────────────────────────────────────────────────── */}
//         <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
//           <div>
//             <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 flex items-center gap-2.5">
//               <div className="bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl p-2 text-white">
//                 <FileText className="h-5 w-5 sm:h-6 sm:w-6" />
//               </div>
//               Report Review
//             </h1>
//             <p className="mt-1 text-sm text-gray-500">
//               Review and manage field compliance reports •{' '}
//               <span className="font-medium text-gray-700">{totalReportCount} total</span>
//             </p>
//           </div>
//           <div className="flex items-center gap-2">
//             {/* Pending count badge in header */}
//             {tabCounts.pending > 0 && (
//               <button
//                 onClick={() => setActiveTab('pending')}
//                 className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 transition-all animate-pulse"
//               >
//                 <Clock className="h-4 w-4" />
//                 <span>{tabCounts.pending} Pending</span>
//               </button>
//             )}
//             <button
//               onClick={handleRefresh}
//               disabled={loading}
//               className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 bg-white border border-gray-200 shadow-sm hover:bg-gray-50 disabled:opacity-50 transition-all"
//             >
//               <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
//               <span className="hidden sm:inline">Refresh</span>
//             </button>
//           </div>
//         </div>

//         {/* ─── Date Filter Bar ───────────────────────────────────────────────── */}
//         <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 sm:p-4">
//           <div className="flex flex-col gap-3">
//             {/* Preset Buttons */}
//             <div className="flex items-center gap-2 flex-wrap">
//               <Calendar className="h-4 w-4 text-gray-400 flex-shrink-0" />
//               <div className="flex flex-wrap gap-1.5">
//                 {DATE_PRESETS.map((preset) => (
//                   <button
//                     key={preset.key}
//                     onClick={() => handleDatePresetChange(preset.key)}
//                     className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${datePreset === preset.key
//                       ? 'bg-blue-600 text-white shadow-sm'
//                       : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
//                       }`}
//                   >
//                     <span className="sm:hidden">{preset.shortLabel}</span>
//                     <span className="hidden sm:inline">{preset.label}</span>
//                   </button>
//                 ))}
//               </div>
//               <span className="text-xs text-gray-400 ml-auto hidden md:block">{dateLabel}</span>
//             </div>

//             {/* Custom Range Inputs */}
//             {showCustomRange && datePreset === 'custom' && (
//               <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 pl-6">
//                 <input
//                   type="date"
//                   value={customRange.start}
//                   onChange={(e) => setCustomRange((prev) => ({ ...prev, start: e.target.value }))}
//                   className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-full sm:w-auto"
//                 />
//                 <span className="text-xs text-gray-400 hidden sm:block">to</span>
//                 <input
//                   type="date"
//                   value={customRange.end}
//                   onChange={(e) => setCustomRange((prev) => ({ ...prev, end: e.target.value }))}
//                   className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-full sm:w-auto"
//                 />
//               </div>
//             )}
//           </div>
//         </div>

//         {/* ─── Stats Row ─────────────────────────────────────────────────────── */}
//         <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
//           <StatCard
//             label="Pending Review"
//             value={tabCounts.pending}
//             icon={<Clock className="h-5 w-5 text-amber-600" />}
//             color="text-amber-600"
//             bgColor="bg-amber-50"
//             onClick={() => setActiveTab('pending')}
//             isActive={activeTab === 'pending'}
//           />
//           <StatCard
//             label="Approved"
//             value={tabCounts.approved}
//             icon={<CheckCircle className="h-5 w-5 text-emerald-600" />}
//             color="text-emerald-600"
//             bgColor="bg-emerald-50"
//             onClick={() => setActiveTab('approved')}
//             isActive={activeTab === 'approved'}
//           />
//           <StatCard
//             label="Rejected"
//             value={tabCounts.rejected}
//             icon={<X className="h-5 w-5 text-red-600" />}
//             color="text-red-600"
//             bgColor="bg-red-50"
//             onClick={() => setActiveTab('rejected')}
//             isActive={activeTab === 'rejected'}
//           />
//           <StatCard
//             label="Action Required"
//             value={tabCounts.requires_action}
//             icon={<AlertTriangle className="h-5 w-5 text-orange-600" />}
//             color="text-orange-600"
//             bgColor="bg-orange-50"
//             onClick={() => setActiveTab('requires_action')}
//             isActive={activeTab === 'requires_action'}
//           />
//         </div>

//         {/* ─── Tab Bar ───────────────────────────────────────────────────────── */}
//         <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
//           {/* Tab Header */}
//           <div className="border-b border-gray-100">
//             <div className="flex">
//               {TABS.map((tab) => {
//                 const isActive = activeTab === tab.key
//                 const count = tabCounts[tab.key]
//                 return (
//                   <button
//                     key={tab.key}
//                     onClick={() => setActiveTab(tab.key)}
//                     className={`group relative flex-1 flex items-center justify-center gap-1 sm:gap-2 px-1.5 sm:px-4 py-3 sm:py-4 text-xs sm:text-sm font-medium transition-all ${isActive
//                       ? `${tab.color} bg-white`
//                       : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
//                       }`}
//                   >
//                     <span
//                       className={`flex-shrink-0 ${isActive ? tab.color : 'text-gray-400 group-hover:text-gray-500'}`}
//                     >
//                       {tab.icon}
//                     </span>
//                     <span className="hidden sm:inline">{tab.shortLabel}</span>
//                     <span
//                       className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-semibold transition-colors ${isActive ? tab.badgeColor : 'bg-gray-100 text-gray-600'
//                         } ${tab.key === 'pending' && count > 0 && !isActive ? 'animate-pulse bg-amber-100 text-amber-800' : ''}`}
//                     >
//                       {count}
//                     </span>
//                     {/* Active indicator */}
//                     {isActive && (
//                       <div
//                         className={`absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r ${tab.activeGradient}`}
//                       />
//                     )}
//                   </button>
//                 )
//               })}
//             </div>
//           </div>

//           {/* Search & Sort Bar */}
//           <div className="px-3 sm:px-4 py-3 border-b border-gray-50 bg-gray-50/50">
//             <div className="flex flex-col sm:flex-row gap-2">
//               {/* Search */}
//               <div className="relative flex-1">
//                 <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
//                 <input
//                   type="text"
//                   placeholder="Search by feeder point, user, team, or description..."
//                   value={searchQuery}
//                   onChange={(e) => setSearchQuery(e.target.value)}
//                   className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
//                 />
//                 {searchQuery && (
//                   <button
//                     onClick={() => setSearchQuery('')}
//                     className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
//                   >
//                     <X className="h-3.5 w-3.5" />
//                   </button>
//                 )}
//               </div>

//               {/* Sort Controls */}
//               <div className="flex items-center gap-1.5 flex-shrink-0">
//                 <span className="text-xs text-gray-400 hidden lg:block">Sort:</span>
//                 {(
//                   [
//                     { field: 'date' as SortField, label: 'Date' },
//                     { field: 'feederPoint' as SortField, label: 'Feeder Pt' },
//                     { field: 'userName' as SortField, label: 'User' },
//                   ] as const
//                 ).map(({ field, label }) => (
//                   <button
//                     key={field}
//                     onClick={() => handleSort(field)}
//                     className={`inline-flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${sortField === field
//                       ? 'bg-blue-100 text-blue-700'
//                       : 'bg-white text-gray-500 hover:bg-gray-100 border border-gray-200'
//                       }`}
//                   >
//                     {label}
//                     {sortField === field && <ArrowUpDown className="h-3 w-3" />}
//                   </button>
//                 ))}
//               </div>
//             </div>

//             {/* Results summary */}
//             <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
//               <span>
//                 Showing {displayedReports.length} of {filteredReports.length}{' '}
//                 {activeTabConfig.shortLabel.toLowerCase()} reports
//               </span>
//               {searchQuery && (
//                 <span className="text-blue-600">
//                   Filtered by &ldquo;{searchQuery}&rdquo;
//                 </span>
//               )}
//             </div>
//           </div>

//           {/* Tab Content */}
//           <div className="p-3 sm:p-4">
//             {loading && initialLoad ? (
//               <LoadingSkeleton count={6} />
//             ) : filteredReports.length === 0 ? (
//               <EmptyState tab={activeTabConfig} />
//             ) : (
//               <>
//                 {/* Report Cards Grid */}
//                 <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
//                   {displayedReports.map((report) => (
//                     <Fragment key={report.id}>
//                       {statusChanging === report.id ? (
//                         <div className="bg-white rounded-xl border border-gray-100 p-8 flex items-center justify-center">
//                           <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
//                         </div>
//                       ) : (
//                         <ReportCard
//                           report={report}
//                           tab={activeTabConfig}
//                           onView={setSelectedReport}
//                           onStatusChange={
//                             isPmcMember
//                               ? undefined
//                               : (report, status) => handleQuickStatusChange(report, status)
//                           }
//                           isPmcMember={isPmcMember}
//                         />
//                       )}
//                     </Fragment>
//                   ))}
//                 </div>

//                 {/* Load More */}
//                 {hasMore && (
//                   <div ref={loadMoreRef} className="mt-6 flex flex-col items-center gap-3">
//                     <button
//                       onClick={handleLoadMore}
//                       className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium text-gray-600 bg-white border border-gray-200 shadow-sm hover:bg-gray-50 hover:shadow transition-all"
//                     >
//                       <ChevronDown className="h-4 w-4" />
//                       Load More ({filteredReports.length - displayCount} remaining)
//                     </button>
//                     <p className="text-xs text-gray-400">Or scroll down to automatically load more</p>
//                   </div>
//                 )}

//                 {/* End of list indicator */}
//                 {!hasMore && filteredReports.length > PAGE_SIZE && (
//                   <div className="mt-6 text-center">
//                     <p className="text-xs text-gray-400">
//                       All {filteredReports.length} reports loaded
//                     </p>
//                   </div>
//                 )}
//               </>
//             )}
//           </div>
//         </div>
//       </div>

//       {/* ─── Report Detail Modal ─────────────────────────────────────────────── */}
//       {selectedReport && (
//         <ReportDetailModal
//           report={selectedReport}
//           onClose={() => setSelectedReport(null)}
//           onStatusChange={isPmcMember ? undefined : handleDetailStatusChange}
//           isPmcMember={isPmcMember}
//         />
//       )}
//     </div>
//   )
// }