/**
 * components/NotificationBell.tsx
 *
 * TWO exports:
 *  1. default  <NotificationBell />    — bell icon for Layout topbar
 *  2. named    <MissingReportBadge />  — triangle icon showing feeder/chronic
 *                                        points with no report submitted today
 *
 * ── Integration in Layout.tsx ─────────────────────────────────────────────────
 *
 *  import NotificationBell, { MissingReportBadge } from '@/components/NotificationBell'
 *
 *  Inside the "Right actions" div, replace the existing bell <button> block with:
 *
 *    <MissingReportBadge />        ← new: points with no report today
 *    <NotificationBell />          ← replaces old bell button
 *
 *  Also remove `Bell` from the lucide-react import in Layout.tsx.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * DATA SOURCES (all real-time via onSnapshot):
 *   • complianceReports  — status changes (reviewedAt + reviewedBy fields)
 *   • approvedUsers      — new users added in last 48h (createdAt)
 *   • feederPoints       — recent status / conversion events
 *
 * MISSING REPORT BADGE DATA:
 *   • feederPoints       — all active, non-eliminated points
 *   • complianceReports  — filtered by tripDate === today, to find who DID report
 *   • Diff = feederPoints that have no matching report today
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Bell, X, Users, Activity, Zap, FileText,
  CheckCircle2, AlertCircle, Clock, RefreshCw,
  ChevronRight, AlertTriangle, WifiOff,
} from 'lucide-react'
import {
  collection, query, orderBy, limit, onSnapshot, where,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { FeederPoint } from '@/lib/dataService'

// ─── Types ────────────────────────────────────────────────────────────────────

type NotifCategory = 'user' | 'feeder_point' | 'chronic_point' | 'report'

interface Notification {
  id: string
  category: NotifCategory
  title: string
  description: string
  changedBy: string
  changedByRole: string
  status: string
  timestamp: Date
  read: boolean
}

interface MissingPoint {
  id: string
  name: string
  type: 'feeder' | 'chronic'
  status: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function coerceDate(value: any): Date | null {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value.toDate === 'function') return value.toDate()
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value)
    return isNaN(d.getTime()) ? null : d
  }
  return null
}

function timeAgo(date: Date): string {
  const sec = Math.floor((Date.now() - date.getTime()) / 1000)
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  return `${Math.floor(hr / 24)}d ago`
}

function todayString(): string {
  return new Date().toISOString().split('T')[0]
}

// ─── Category metadata ────────────────────────────────────────────────────────

const CATEGORY_META: Record<NotifCategory, {
  label: string
  Icon: React.ElementType
  color: string
  bgColor: string
  dotColor: string
  ringColor: string
}> = {
  user: {
    label: 'User', Icon: Users,
    color: 'text-violet-600', bgColor: 'bg-violet-100 text-violet-700',
    dotColor: 'bg-violet-500', ringColor: 'ring-violet-200',
  },
  feeder_point: {
    label: 'Feeder Point', Icon: Activity,
    color: 'text-teal-600', bgColor: 'bg-teal-100 text-teal-700',
    dotColor: 'bg-teal-500', ringColor: 'ring-teal-200',
  },
  chronic_point: {
    label: 'Chronic Point', Icon: Zap,
    color: 'text-amber-600', bgColor: 'bg-amber-100 text-amber-700',
    dotColor: 'bg-amber-500', ringColor: 'ring-amber-200',
  },
  report: {
    label: 'Report', Icon: FileText,
    color: 'text-blue-600', bgColor: 'bg-blue-100 text-blue-700',
    dotColor: 'bg-blue-500', ringColor: 'ring-blue-200',
  },
}

interface StatusMeta { Icon: React.ElementType; badge: string }

const STATUS_META: Record<string, StatusMeta> = {
  // ── green ──────────────────────────────────────────────────────────────────
  approved:   { Icon: CheckCircle2, badge: 'bg-green-100 text-green-700' },
  active:     { Icon: CheckCircle2, badge: 'bg-green-100 text-green-700' },
  resolved:   { Icon: CheckCircle2, badge: 'bg-green-100 text-green-700' },
  // ── red ────────────────────────────────────────────────────────────────────
  rejected:   { Icon: AlertCircle,  badge: 'bg-red-100 text-red-700' },
  open:       { Icon: AlertCircle,  badge: 'bg-red-100 text-red-700' },
  inactive:   { Icon: AlertCircle,  badge: 'bg-red-100 text-red-700' },
  // ── yellow ─────────────────────────────────────────────────────────────────
  requires_action:         { Icon: AlertTriangle, badge: 'bg-yellow-100 text-yellow-700' },
  'requires action':       { Icon: AlertTriangle, badge: 'bg-yellow-100 text-yellow-700' },
  pending:                 { Icon: Clock,         badge: 'bg-yellow-100 text-yellow-700' },
  // ── neutral ────────────────────────────────────────────────────────────────
  maintenance:             { Icon: RefreshCw, badge: 'bg-gray-100 text-gray-600' },
  'under maintenance':     { Icon: RefreshCw, badge: 'bg-gray-100 text-gray-600' },
}

const DEFAULT_STATUS_META: StatusMeta = { Icon: Clock, badge: 'bg-gray-100 text-gray-600' }

function getStatusMeta(status: string): StatusMeta {
  return STATUS_META[status.toLowerCase().replace(/_/g, ' ')] ??
         STATUS_META[status.toLowerCase()] ??
         DEFAULT_STATUS_META
}

const FILTERS: Array<{ key: NotifCategory | 'all'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'user', label: 'Users' },
  { key: 'feeder_point', label: 'Feeder' },
  { key: 'chronic_point', label: 'Chronic' },
  { key: 'report', label: 'Reports' },
]

// ─── Firestore → Notification mappers ────────────────────────────────────────

const CUTOFF_48H = () => Date.now() - 48 * 60 * 60 * 1000

function reportsToNotifs(docs: any[]): Notification[] {
  const cutoff = CUTOFF_48H()
  return docs
    .filter(d => {
      const ts = coerceDate(d.reviewedAt)
      return ts && ts.getTime() > cutoff && d.reviewedBy
    })
    .map(d => ({
      id: `report_${d.id}`,
      category: 'report' as NotifCategory,
      title: `Report — ${d.feederPointName ?? 'Unknown Point'}`,
      description: `Status changed to ${String(d.status ?? 'unknown').replace(/_/g, ' ')}`,
      changedBy: d.reviewedBy ?? 'Unknown',
      changedByRole: 'QC / Admin',
      status: d.status ?? 'unknown',
      timestamp: coerceDate(d.reviewedAt)!,
      read: false,
    }))
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, 30)
}

function usersToNotifs(docs: any[]): Notification[] {
  const cutoff = CUTOFF_48H()
  return docs
    .filter(d => {
      const ts = coerceDate(d.createdAt) ?? coerceDate(d.approvedAt)
      return ts && ts.getTime() > cutoff
    })
    .map(d => {
      const ts = coerceDate(d.createdAt) ?? coerceDate(d.approvedAt) ?? new Date()
      return {
        id: `user_${d.id}`,
        category: 'user' as NotifCategory,
        title: `New User — ${d.name ?? d.email ?? 'Unknown'}`,
        description: `Added as ${String(d.role ?? 'user').replace(/_/g, ' ')}`,
        changedBy: d.approvedBy ?? 'System',
        changedByRole: 'Super Admin',
        status: d.isActive ? 'active' : 'inactive',
        timestamp: ts,
        read: false,
      }
    })
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, 20)
}

function feederPointsToNotifs(docs: any[]): Notification[] {
  const cutoff = CUTOFF_48H()
  return docs
    .filter(d => {
      const ts = coerceDate(d.convertedToChronicAt) ?? coerceDate(d.lastInspection)
      return ts && ts.getTime() > cutoff
    })
    .map(d => {
      const isChronic = d.type === 'chronic'
      const ts = coerceDate(d.convertedToChronicAt) ?? coerceDate(d.lastInspection) ?? new Date()
      return {
        id: `fp_${d.id}`,
        category: (isChronic ? 'chronic_point' : 'feeder_point') as NotifCategory,
        title: `${isChronic ? 'Chronic' : 'Feeder'} Point — ${d.name ?? d.id}`,
        description: isChronic
          ? 'Converted to chronic point'
          : `Status: ${String(d.status ?? 'unknown').replace(/_/g, ' ')}`,
        changedBy: d.convertedToChronicBy ?? 'Super Admin',
        changedByRole: 'Super Admin',
        status: d.status ?? 'active',
        timestamp: ts,
        read: false,
      }
    })
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, 20)
}

// ─── NotificationBell ─────────────────────────────────────────────────────────

export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [filter, setFilter] = useState<NotifCategory | 'all'>('all')
  const [readIds, setReadIds] = useState<Set<string>>(new Set())
  const [connError, setConnError] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  // Merge incoming notifications, preserve order, cap at 80
  const merge = useCallback((incoming: Notification[]) => {
    setNotifications(prev => {
      const map = new Map(prev.map(n => [n.id, n]))
      incoming.forEach(n => { if (!map.has(n.id)) map.set(n.id, n) })
      return Array.from(map.values())
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
        .slice(0, 80)
    })
  }, [])

  // Firestore subscriptions
  useEffect(() => {
    const unsubs: (() => void)[] = []

    // 1. Reviewed compliance reports (last 40, ordered by reviewedAt)
    try {
      unsubs.push(
        onSnapshot(
          query(collection(db, 'complianceReports'), orderBy('reviewedAt', 'desc'), limit(40)),
          snap => merge(reportsToNotifs(snap.docs.map(d => ({ id: d.id, ...d.data() })))),
          () => setConnError(true)
        )
      )
    } catch { setConnError(true) }

    // 2. Recently approved users
    try {
      unsubs.push(
        onSnapshot(
          query(collection(db, 'approvedUsers'), orderBy('createdAt', 'desc'), limit(20)),
          snap => merge(usersToNotifs(snap.docs.map(d => ({ id: d.id, ...d.data() })))),
          () => {}
        )
      )
    } catch { /* non-critical */ }

    // 3. Feeder / chronic points
    try {
      unsubs.push(
        onSnapshot(
          query(collection(db, 'feederPoints'), limit(60)),
          snap => merge(feederPointsToNotifs(snap.docs.map(d => ({ id: d.id, ...d.data() })))),
          () => {}
        )
      )
    } catch { /* non-critical */ }

    return () => unsubs.forEach(u => u())
  }, [merge])

  // Close on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const withRead = notifications.map(n => ({ ...n, read: readIds.has(n.id) }))
  const unread = withRead.filter(n => !n.read).length
  const filtered = filter === 'all' ? withRead : withRead.filter(n => n.category === filter)
  const filterCount = (k: NotifCategory | 'all') =>
    k === 'all' ? unread : withRead.filter(n => n.category === k && !n.read).length

  const markRead = (id: string) => setReadIds(p => new Set([...p, id]))
  const markAllRead = () => setReadIds(new Set(notifications.map(n => n.id)))
  const dismiss = (id: string) => {
    setReadIds(p => new Set([...p, id]))
    setNotifications(p => p.filter(n => n.id !== id))
  }

  return (
    <div className="relative">
      {/* Bell */}
      <button
        ref={buttonRef}
        onClick={() => setOpen(o => !o)}
        className="relative p-2.5 rounded-xl text-gray-500 hover:bg-gray-100
          hover:text-gray-700 transition-all active:scale-95"
      >
        <Bell className="w-4 h-4" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 px-0.5
            bg-red-500 rounded-full ring-2 ring-white flex items-center justify-center
            text-[9px] font-bold text-white leading-none animate-pulse">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          ref={panelRef}
          className="absolute right-0 top-full mt-2 w-[390px] max-w-[calc(100vw-1rem)]
            bg-white rounded-2xl border border-gray-100 flex flex-col overflow-hidden z-50"
          style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.13), 0 4px 16px rgba(0,0,0,0.07)' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-100 flex-shrink-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-gray-900">Notifications</h2>
              {unread > 0 && (
                <span className="px-1.5 py-0.5 bg-red-100 text-red-600 text-[10px] font-bold rounded-full">
                  {unread} new
                </span>
              )}
              {connError && (
                <span title="Some live updates unavailable">
                  <WifiOff className="w-3 h-3 text-amber-400" />
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unread > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-[10px] font-medium text-blue-600 hover:text-blue-700
                    px-2 py-1 rounded-lg hover:bg-blue-50 transition-all"
                >
                  Mark all read
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Filter tabs */}
          <div className="flex items-center gap-1 px-3 py-2.5 border-b border-gray-100 overflow-x-auto flex-shrink-0">
            {FILTERS.map(f => {
              const cnt = filterCount(f.key)
              return (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px]
                    font-medium whitespace-nowrap transition-all flex-shrink-0
                    ${filter === f.key
                      ? 'bg-gray-900 text-white'
                      : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'}`}
                >
                  {f.label}
                  {cnt > 0 && (
                    <span className={`ml-0.5 w-3.5 h-3.5 rounded-full text-[9px] font-bold
                      flex items-center justify-center
                      ${filter === f.key ? 'bg-white/25 text-white' : 'bg-red-100 text-red-600'}`}>
                      {cnt}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto max-h-[430px]">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14">
                <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mb-3">
                  <Bell className="w-5 h-5 text-gray-300" />
                </div>
                <p className="text-sm font-medium text-gray-500">All caught up</p>
                <p className="text-xs text-gray-400 mt-0.5">No notifications here</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-50">
                {filtered.map(notif => {
                  const meta = CATEGORY_META[notif.category]
                  const sm = getStatusMeta(notif.status)
                  return (
                    <li
                      key={notif.id}
                      onClick={() => markRead(notif.id)}
                      className={`relative flex gap-3 px-4 py-3.5 cursor-pointer
                        transition-colors duration-100 group
                        ${notif.read ? 'bg-white hover:bg-gray-50/80' : 'bg-blue-50/40 hover:bg-blue-50/70'}`}
                    >
                      {/* Unread dot */}
                      {!notif.read && (
                        <span className={`absolute left-1.5 top-1/2 -translate-y-1/2
                          w-1.5 h-1.5 rounded-full ${meta.dotColor}`} />
                      )}

                      {/* Icon */}
                      <div className={`flex-shrink-0 w-8 h-8 rounded-xl flex items-center
                        justify-center mt-0.5
                        ${notif.read ? 'bg-gray-100' : `bg-white shadow-sm ring-1 ${meta.ringColor}`}`}>
                        <meta.Icon className={`w-3.5 h-3.5 ${meta.color}`} />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className={`text-xs font-semibold truncate leading-tight
                              ${notif.read ? 'text-gray-700' : 'text-gray-900'}`}>
                              {notif.title}
                            </p>
                            <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">
                              {notif.description}
                            </p>
                          </div>
                          <button
                            onClick={e => { e.stopPropagation(); dismiss(notif.id) }}
                            className="flex-shrink-0 p-0.5 rounded text-gray-300
                              hover:text-gray-500 hover:bg-gray-100 transition-all
                              opacity-0 group-hover:opacity-100"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>

                        {/* Meta row */}
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5
                            rounded-md text-[10px] font-medium capitalize ${sm.badge}`}>
                            <sm.Icon className="w-2.5 h-2.5 flex-shrink-0" />
                            {notif.status.replace(/_/g, ' ')}
                          </span>
                          <span className="text-[10px] text-gray-400 flex items-center gap-0.5 min-w-0">
                            <span className="text-gray-300">by</span>
                            <span className="font-medium text-gray-500 truncate">{notif.changedBy}</span>
                            <span className="text-gray-300 flex-shrink-0">·</span>
                            <span className="flex-shrink-0">{notif.changedByRole}</span>
                          </span>
                          <span className="text-[10px] text-gray-400 ml-auto flex-shrink-0 whitespace-nowrap">
                            {timeAgo(notif.timestamp)}
                          </span>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {/* Footer */}
          <div className="flex-shrink-0 border-t border-gray-100 px-4 py-3">
            <button className="w-full flex items-center justify-center gap-1.5
              text-xs font-medium text-gray-500 hover:text-gray-800
              py-1.5 rounded-xl hover:bg-gray-50 transition-all">
              View all activity
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── MissingReportBadge ───────────────────────────────────────────────────────

export function MissingReportBadge() {
  const [open, setOpen] = useState(false)
  const [missing, setMissing] = useState<MissingPoint[]>([])
  const [loading, setLoading] = useState(true)
  const panelRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const today = todayString()
    let allPoints: any[] = []
    let reportedIds = new Set<string>()
    let reportedNames = new Set<string>()

    const rebuild = () => {
      const result: MissingPoint[] = allPoints
        .filter(fp =>
          !fp.isEliminated &&
          fp.status !== 'inactive' &&
          !reportedIds.has(fp.id) &&
          !reportedNames.has((fp.name ?? '').toLowerCase().trim())
        )
        .map(fp => ({
          id: fp.id,
          name: fp.name ?? fp.id,
          type: (fp.type ?? 'feeder') as 'feeder' | 'chronic',
          status: fp.status ?? 'active',
        }))
        .sort((a, b) => {
          // chronic first, then alpha
          if (a.type !== b.type) return a.type === 'chronic' ? -1 : 1
          return a.name.localeCompare(b.name)
        })
      setMissing(result)
      setLoading(false)
    }

    // All feeder points
    const fpUnsub = onSnapshot(
      query(collection(db, 'feederPoints')),
      snap => {
        allPoints = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        rebuild()
      }
    )

    // Today's reports (by tripDate field used throughout your app)
    const rUnsub = onSnapshot(
      query(collection(db, 'complianceReports'), where('tripDate', '==', today)),
      snap => {
        reportedIds = new Set<string>()
        reportedNames = new Set<string>()
        snap.docs.forEach(d => {
          const data = d.data()
          if (data.feederPointId) reportedIds.add(String(data.feederPointId))
          if (data.feederPointName)
            reportedNames.add(String(data.feederPointName).toLowerCase().trim())
        })
        rebuild()
      }
    )

    return () => { fpUnsub(); rUnsub() }
  }, [])

  // Close on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const feederMissing = missing.filter(m => m.type === 'feeder')
  const chronicMissing = missing.filter(m => m.type === 'chronic')
  const total = missing.length

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setOpen(o => !o)}
        title={`${total} point${total !== 1 ? 's' : ''} with no report today`}
        className={`relative p-2.5 rounded-xl transition-all active:scale-95
          ${total > 0
            ? 'text-amber-500 hover:bg-amber-50 hover:text-amber-600'
            : 'text-gray-400 hover:bg-gray-100 hover:text-gray-500'}`}
      >
        <AlertTriangle className="w-4 h-4" />
        {!loading && total > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 px-0.5
            bg-amber-500 rounded-full ring-2 ring-white flex items-center justify-center
            text-[9px] font-bold text-white leading-none">
            {total > 9 ? '9+' : total}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute right-0 top-full mt-2 w-[340px] max-w-[calc(100vw-1rem)]
            bg-white rounded-2xl border border-gray-100 flex flex-col overflow-hidden z-50"
          style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.13), 0 4px 16px rgba(0,0,0,0.07)' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-100">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">No Report Today</h2>
              <p className="text-[10px] text-gray-400 mt-0.5">
                Points with zero submissions for {new Date().toLocaleDateString()}
              </p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-all"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Summary pills */}
          {!loading && (
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 bg-gray-50/60">
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-teal-100 text-teal-700
                rounded-lg text-[10px] font-semibold">
                <Activity className="w-3 h-3" />
                {feederMissing.length} Feeder
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-100 text-amber-700
                rounded-lg text-[10px] font-semibold">
                <Zap className="w-3 h-3" />
                {chronicMissing.length} Chronic
              </span>
              <span className="ml-auto text-[10px] text-gray-400 font-medium">
                {total} missing
              </span>
            </div>
          )}

          {/* List */}
          <div className="overflow-y-auto max-h-[360px]">
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <div className="w-5 h-5 rounded-full border-2 border-gray-200 border-t-amber-500 animate-spin" />
              </div>
            ) : total === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <CheckCircle2 className="w-9 h-9 text-green-400 mb-3" />
                <p className="text-sm font-medium text-gray-600">All points reported!</p>
                <p className="text-xs text-gray-400 mt-0.5">Every active point has submitted today</p>
              </div>
            ) : (
              <>
                {chronicMissing.length > 0 && (
                  <div>
                    <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-amber-600">
                      Chronic Points
                    </p>
                    <ul className="divide-y divide-gray-50">
                      {chronicMissing.map(p => <MissingRow key={p.id} point={p} />)}
                    </ul>
                  </div>
                )}
                {feederMissing.length > 0 && (
                  <div>
                    <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-teal-600">
                      Feeder Points
                    </p>
                    <ul className="divide-y divide-gray-50">
                      {feederMissing.map(p => <MissingRow key={p.id} point={p} />)}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          {total > 0 && (
            <div className="border-t border-gray-100 px-4 py-3">
              <p className="text-[10px] text-center text-gray-400">
                Updates in real-time · based on <code className="font-mono">tripDate</code> field
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function MissingRow({ point }: { point: MissingPoint }) {
  const isChronic = point.type === 'chronic'
  return (
    <li className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors">
      <div className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center
        ${isChronic ? 'bg-amber-100' : 'bg-teal-100'}`}>
        {isChronic
          ? <Zap className="w-3.5 h-3.5 text-amber-600" />
          : <Activity className="w-3.5 h-3.5 text-teal-600" />
        }
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-gray-800 truncate">{point.name}</p>
        <p className="text-[10px] text-gray-400 capitalize">{point.status}</p>
      </div>
      <span className={`flex-shrink-0 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md
        ${isChronic ? 'bg-amber-100 text-amber-600' : 'bg-teal-100 text-teal-600'}`}>
        {isChronic ? 'Chronic' : 'Feeder'}
      </span>
    </li>
  )
}