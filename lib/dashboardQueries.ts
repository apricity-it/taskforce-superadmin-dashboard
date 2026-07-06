import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  getCountFromServer,
  Timestamp,
  DocumentData,
  QueryConstraint,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'

export interface ComplianceReport {
  id: string
  status: 'pending' | 'approved' | 'rejected' | 'requires_action' | 'action_taken'
  feederPointId: string
  feederPointName: string
  feederPointType?: 'feeder' | 'chronic'
  userId: string
  userName: string
  teamId?: string
  teamName?: string
  tripNumber?: number
  tripDate?: string
  dailyTripId?: string
  distanceFromFeederPoint?: number
  submittedAt: Timestamp
  createdAt: Timestamp
  reviewedAt?: Timestamp
  reviewedBy?: string
  updatedAt: Timestamp
  submittedLocation?: { latitude: number; longitude: number }
  answers?: AnswerItem[]
  [key: `${number}`]: AnswerItem | undefined
}

export interface AnswerItem {
  questionId: string
  answer: string
  notes: string
  photos: string[]
}

export interface FeederPoint {
  id: string
  name: string
  type?: 'feeder' | 'chronic'
  status: string
  priority: string
  description: string
  isEliminated: boolean
  location: { latitude: number; longitude: number; address?: string }
  zoneId?: string
  zoneName?: string
  wardId?: string
  wardName?: string
  kothiId?: string
  kothiName?: string
  assignedTeamId?: string
  assignedUserId?: string
  assignedUserIds?: string[]
  assignmentDetails?: {
    type: string
    name: string
    memberCount: number
    id: string
    members: TeamMember[]
  }
  inspectionFrequency?: { type: string; value: number }
  lastInspection?: Timestamp | null
  nextInspectionDue?: Timestamp | null
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface ShiftReport {
  id: string
  userId: string
  userName: string
  feederPointId: string
  feederPointName: string
  shiftType: string
  shiftDate: string
  status: 'in_progress' | 'completed'
  slots: ShiftSlot[] | Record<string, ShiftSlot>
  startedAt: Timestamp
  completedAt?: Timestamp
  isPunchedOut?: boolean
  punchedOutAt?: Timestamp
  punchedOutLocation?: { latitude: number; longitude: number }
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface ShiftSlot {
  slotNumber?: number
  label?: string
  startHour?: number
  endHour?: number
  status: 'pending' | 'submitted' | 'late' | 'missed'
  photoUrl?: string
  location?: { latitude: number; longitude: number }
  timestamp?: Timestamp
}

export interface ApprovedUser {
  id: string
  name: string
  email: string
  phone: string
  role: string
  isActive: boolean
  zoneNumber?: string
  employeeCode?: string
  permissions: string[]
  profile?: {
    department: string
    designation: string
    contactNumber: string
    address: string
  }
  approvedAt: Timestamp | string
  createdAt: Timestamp | string
  updatedAt?: Timestamp
  lastLogin?: Timestamp | null
}

export interface Team {
  id: string
  name: string
  members: TeamMember[]
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface TeamMember {
  id: string
  name: string
  email: string
  phone: string
  role: string
  isActive: boolean
  joinedAt: Timestamp
}

export interface Zone {
  id: string
  name: string
  isActive?: boolean
  description?: string
  createdAt: Timestamp
}

export interface Ward {
  id: string
  name: string
  zoneId?: string
  zoneName?: string
  isActive?: boolean
  createdAt: Timestamp
}

export interface Kothi {
  id: string
  name: string
  wardId?: string
  wardName?: string
  zoneId?: string
  zoneName?: string
  createdAt: Timestamp
}

export interface FeederPointRequest {
  id: string
  status: 'pending' | 'approved' | 'rejected'
  userId: string
  userName: string
  feederPointName: string
  wardNumber: string
  kothiName: string
  createdAt: Timestamp
  submittedAt: Timestamp
  reviewedAt?: Timestamp
  reviewedBy?: string
}

export interface FrequencyRequest {
  id: string
  status: 'pending' | 'approved' | 'rejected'
  userId: string
  userName: string
  feederPointId: string
  feederPointName: string
  requestedFrequency: { type: string; value: number }
  approvedFrequency?: { type: string; value: number }
  cleanlinessRating: number
  createdAt: Timestamp
  reviewedAt?: Timestamp
}

export interface AccessRequest {
  id: string
  status: 'pending' | 'approved' | 'rejected'
  name: string
  email: string
  phone: string
  requestedRole: string
  organization: string
  department: string
  reason: string
  createdAt: Timestamp
  submittedAt: Timestamp
  reviewedAt?: Timestamp
}

export interface AppNotification {
  id: string
  userId: string
  title: string
  message: string
  type: string
  priority: string
  isRead: boolean
  createdAt: Timestamp
}

export interface DashboardKPIs {
  totalReports: number
  pendingReports: number
  approvedReports: number
  rejectedReports: number
  requiresAction: number
  actionTaken: number
  totalFeederPoints: number
  activeFeederPoints: number
  assignedFeederPoints: number
  unassignedFeederPoints: number
  totalChronicPoints: number
  activeChronicPoints: number
  assignedChronicPoints: number
  unassignedChronicPoints: number
  eliminatedFeederPoints: number
  eliminatedChronicPoints: number
  eliminatedPoints: number
  unassignedPoints: number
  totalShiftReports: number
  completedShifts: number
  inProgressShifts: number
 totalUsers: number
  activeUsers: number
  inactiveUsers: number
  adminUsers: number
  qcUsers: number
  taskForceUsers: number
  pmcMemberUsers: number
  actionOfficerUsers: number
  commissionerUsers: number
  pendingPointRequests: number
  pendingFreqRequests: number
  pendingAccessRequests: number
  totalNotifications: number
  unreadNotifications: number
}

export interface DailyTrendPoint {
  date: string
  label: string
  count: number
  approved: number
  rejected: number
  pending: number
  requiresAction: number 
}

export interface StatusBreakdown {
  status: string
  count: number
  percentage: number
}

export interface ChecklistFailure {
  questionId: string
  label: string
  total: number
  failed: number
  rate: number
}

export interface SlotPunctuality {
  onTime: number
  late: number
  missed: number
  pending: number
  total: number
  punchedOut: number
  notPunchedOut: number
  totalShifts: number
  punchOutRate: number
}

export interface TeamLeaderboardEntry {
  teamId: string
  teamName: string
  total: number
  approved: number
  rejected: number
  pending: number
  approvalRate: number
  avgDistance: number
}

export interface TopPerformer {
  id: string
  name: string
  metric: string
  value: number | string
  sub: string
}

export interface AlertItem {
  id: string
  level: 'critical' | 'warning' | 'info'
  title: string
  meta: string
  count: number
}

export function toISO(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function tsToDate(ts: Timestamp | string | null | undefined): Date | null {
  if (!ts) return null
  if (ts instanceof Timestamp) return ts.toDate()
  if (typeof ts === 'string') return new Date(ts)
  if (typeof ts === 'object' && '_seconds' in ts) return new Date((ts as any)._seconds * 1000)
  return null
}

function normalizeDateKey(value: any): string | null {
  if (!value) return null
  if (typeof value === 'string') return value.slice(0, 10)
  if (value instanceof Date) return toISO(value)
  if (typeof value === 'object') {
    if (typeof value.toDate === 'function') return toISO(value.toDate())
    if (typeof value.seconds === 'number') return toISO(new Date(value.seconds * 1000))
    if (typeof value._seconds === 'number') return toISO(new Date(value._seconds * 1000))
  }
  return null
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
})

function extractAnswers(report: ComplianceReport): AnswerItem[] {
  if (report.answers && Array.isArray(report.answers)) return report.answers
  const items: AnswerItem[] = []
  for (let i = 0; i <= 15; i++) {
    const item = (report as any)[String(i)]
    if (item && typeof item === 'object' && item.questionId) items.push(item as AnswerItem)
  }
  return items
}

export async function fetchComplianceReports(opts?: {
  dateFrom?: string
  dateTo?: string
  status?: ComplianceReport['status']
  pointType?: 'feeder' | 'chronic'
  teamId?: string
  userId?: string
  feederPointId?: string
  limitCount?: number
}): Promise<ComplianceReport[]> {
  const constraints: QueryConstraint[] = []
  if (opts?.status) constraints.push(where('status', '==', opts.status))
  if (opts?.dateFrom) constraints.push(where('createdAt', '>=', Timestamp.fromDate(new Date(`${opts.dateFrom}T00:00:00Z`))))
  if (opts?.dateTo) constraints.push(where('createdAt', '<=', Timestamp.fromDate(new Date(`${opts.dateTo}T23:59:59Z`))))
  if (opts?.teamId) constraints.push(where('teamId', '==', opts.teamId))
  if (opts?.userId) constraints.push(where('userId', '==', opts.userId))
  if (opts?.feederPointId) constraints.push(where('feederPointId', '==', opts.feederPointId))
  if (opts?.pointType) constraints.push(where('feederPointType', '==', opts.pointType))
  constraints.push(orderBy('createdAt', 'desc'))
  if (opts?.limitCount) constraints.push(limit(opts.limitCount))

  const snap = await getDocs(query(collection(db, 'complianceReports'), ...constraints))
  return snap.docs.map(d => ({ ...d.data(), id: d.id } as ComplianceReport))
}

export async function fetchFeederPoints(opts?: {
  type?: 'feeder' | 'chronic' | 'all'
  zoneId?: string
  wardId?: string
  status?: string
  includeEliminated?: boolean
}): Promise<FeederPoint[]> {
  const constraints: QueryConstraint[] = []
  if (opts?.type && opts.type !== 'all') constraints.push(where('type', '==', opts.type))
  if (opts?.zoneId) constraints.push(where('zoneId', '==', opts.zoneId))
  if (opts?.wardId) constraints.push(where('wardId', '==', opts.wardId))
  if (opts?.status) constraints.push(where('status', '==', opts.status))
  if (!opts?.includeEliminated) constraints.push(where('isEliminated', '==', false))

  const snap = await getDocs(query(collection(db, 'feederPoints'), ...constraints))
  let points = snap.docs.map(d => ({ ...d.data(), id: d.id } as FeederPoint))

  // Legacy docs have no type field — treat as feeder
  if (!opts?.type || opts.type === 'feeder') {
    points = points.map(p => ({ ...p, type: p.type ?? 'feeder' }))
  }

  return points
}

export async function fetchShiftReports(opts?: {
  dateFrom?: string
  dateTo?: string
  status?: ShiftReport['status']
  userId?: string
  feederPointId?: string
  limitCount?: number
}): Promise<ShiftReport[]> {
  const constraints: QueryConstraint[] = []
  if (opts?.status) constraints.push(where('status', '==', opts.status))
  if (opts?.userId) constraints.push(where('userId', '==', opts.userId))
  if (opts?.feederPointId) constraints.push(where('feederPointId', '==', opts.feederPointId))
  if (opts?.dateFrom) constraints.push(where('createdAt', '>=', Timestamp.fromDate(new Date(`${opts.dateFrom}T00:00:00Z`))))
  if (opts?.dateTo) constraints.push(where('createdAt', '<=', Timestamp.fromDate(new Date(`${opts.dateTo}T23:59:59Z`))))
  constraints.push(orderBy('createdAt', 'desc'))
  if (opts?.limitCount) constraints.push(limit(opts.limitCount))

  const snap = await getDocs(query(collection(db, 'shiftReports'), ...constraints))
  return snap.docs.map(d => ({ ...d.data(), id: d.id } as ShiftReport))
}

export async function fetchUsers(opts?: {
  role?: string
  isActive?: boolean
}): Promise<ApprovedUser[]> {
  const constraints: QueryConstraint[] = []
  if (opts?.role) constraints.push(where('role', '==', opts.role))
  if (opts?.isActive !== undefined) constraints.push(where('isActive', '==', opts.isActive))
  const snap = await getDocs(query(collection(db, 'approvedUsers'), ...constraints))
  return snap.docs.map(d => ({ ...d.data(), id: d.id } as ApprovedUser))
}

export async function fetchTeams(): Promise<Team[]> {
  const snap = await getDocs(query(collection(db, 'teams')))
  return snap.docs.map(d => ({ ...d.data(), id: d.id } as Team))
}

export async function fetchZones(): Promise<Zone[]> {
  const snap = await getDocs(query(collection(db, 'zones')))
  return snap.docs.map(d => ({ ...d.data(), id: d.id } as Zone))
}

export async function fetchWards(): Promise<Ward[]> {
  const snap = await getDocs(query(collection(db, 'wards')))
  return snap.docs.map(d => ({ ...d.data(), id: d.id } as Ward))
}

export async function fetchKothis(): Promise<Kothi[]> {
  const snap = await getDocs(query(collection(db, 'kothis')))
  return snap.docs.map(d => ({ ...d.data(), id: d.id } as Kothi))
}

export async function fetchPendingPointRequests(): Promise<FeederPointRequest[]> {
  const snap = await getDocs(query(collection(db, 'feederPointRequests'), where('status', '==', 'pending')))
  return snap.docs.map(d => ({ ...d.data(), id: d.id } as FeederPointRequest))
}

export async function fetchPendingFrequencyRequests(): Promise<FrequencyRequest[]> {
  const snap = await getDocs(query(collection(db, 'frequencyRequests'), where('status', '==', 'pending')))
  return snap.docs.map(d => ({ ...d.data(), id: d.id } as FrequencyRequest))
}

export async function fetchPendingAccessRequests(): Promise<AccessRequest[]> {
  const snap = await getDocs(query(collection(db, 'accessRequests'), where('status', '==', 'pending')))
  return snap.docs.map(d => ({ ...d.data(), id: d.id } as AccessRequest))
}

export async function fetchNotifications(opts?: {
  userId?: string
  isRead?: boolean
  limitCount?: number
}): Promise<AppNotification[]> {
  const constraints: QueryConstraint[] = []
  if (opts?.userId) constraints.push(where('userId', '==', opts.userId))
  if (opts?.isRead !== undefined) constraints.push(where('isRead', '==', opts.isRead))
  constraints.push(orderBy('createdAt', 'desc'))
  if (opts?.limitCount) constraints.push(limit(opts.limitCount))
  const snap = await getDocs(query(collection(db, 'notifications'), ...constraints))
  return snap.docs.map(d => ({ ...d.data(), id: d.id } as AppNotification))
}

export async function buildDashboardKPIs(): Promise<DashboardKPIs> {
  async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
    try { return await fn() } catch (e) { console.warn('KPI query failed:', e); return fallback }
  }
 
  const cr = collection(db, 'complianceReports')
  const sr = collection(db, 'shiftReports')
  const au = collection(db, 'approvedUsers')
 
  // Fetch all points once — 72 docs, lightweight, avoids compound index requirement
   const allPointsSnap = await safe(
    async () => {
      const snap = await getDocs(collection(db, 'feederPoints'))
      return { docs: snap.docs }
    },
    { docs: [] as any[] }
  )
 
  const allPoints = allPointsSnap.docs.map((d: any) => ({
    type: d.data().type ?? 'feeder',
    status: d.data().status,
    isEliminated: d.data().isEliminated ?? false,
    assignedTeamId: d.data().assignedTeamId,
    assignedUserId: d.data().assignedUserId,
    assignedUserIds: d.data().assignedUserIds,
  }))
 
  const feederPts  = allPoints.filter(p => p.type === 'feeder')
  const chronicPts = allPoints.filter(p => p.type === 'chronic')

 const isAssigned = (p: any) => !!(p.assignedTeamId || p.assignedUserId || p.assignedUserIds?.length)
  const isUnassigned = (p: any) => !p.assignedTeamId && !p.assignedUserId && !(p.assignedUserIds?.length)
 
  const totalFeederPoints   = feederPts.length
  const activeFeederPoints  = feederPts.filter(p => p.status === 'active' && !p.isEliminated).length
  const assignedFeederPoints = feederPts.filter(isAssigned).length
  const unassignedFeederPoints = feederPts.filter(isUnassigned).length
  const totalChronicPoints  = chronicPts.length
  const activeChronicPoints = chronicPts.filter(p => p.status === 'active' && !p.isEliminated).length
  const assignedChronicPoints = chronicPts.filter(isAssigned).length
  const unassignedChronicPoints = chronicPts.filter(isUnassigned).length
  const eliminatedFeederPoints  = feederPts.filter(p => p.isEliminated).length
  const eliminatedChronicPoints = chronicPts.filter(p => p.isEliminated).length
  const eliminatedPoints    = allPoints.filter(p => p.isEliminated).length
  const unassignedPoints    = allPoints.filter(p =>
    !p.isEliminated && !p.assignedTeamId && !p.assignedUserId && !(p.assignedUserIds?.length)
  ).length
 
// Single-field count queries — no composite index needed
  const [
    totalReports, pendingReports, approvedReports, rejectedReports,
    requiresAction, actionTaken,
    totalShiftReports, completedShifts, inProgressShifts,
    totalUsers, activeUsers, inactiveUsers,
    adminUsers, qcUsers, taskForceUsers, pmcMemberUsers, actionOfficerUsers, commissionerUsers,
    pendingPointRequests, pendingFreqRequests, pendingAccessRequests,
    unreadNotifications,
  ] = await Promise.all([
    safe(() => getCountFromServer(cr).then(s => s.data().count), 0),
    safe(() => getCountFromServer(query(cr, where('status', '==', 'pending'))).then(s => s.data().count), 0),
    safe(() => getCountFromServer(query(cr, where('status', '==', 'approved'))).then(s => s.data().count), 0),
    safe(() => getCountFromServer(query(cr, where('status', '==', 'rejected'))).then(s => s.data().count), 0),
    safe(() => getCountFromServer(query(cr, where('status', '==', 'requires_action'))).then(s => s.data().count), 0),
    safe(() => getCountFromServer(query(cr, where('status', '==', 'action_taken'))).then(s => s.data().count), 0),
    safe(() => getCountFromServer(sr).then(s => s.data().count), 0),
    safe(() => getCountFromServer(query(sr, where('status', '==', 'completed'))).then(s => s.data().count), 0),
    safe(() => getCountFromServer(query(sr, where('status', '==', 'in_progress'))).then(s => s.data().count), 0),
    safe(() => getCountFromServer(au).then(s => s.data().count), 0),
    safe(() => getCountFromServer(query(au, where('isActive', '==', true))).then(s => s.data().count), 0),
    safe(() => getCountFromServer(query(au, where('isActive', '==', false))).then(s => s.data().count), 0),
    safe(() => getCountFromServer(query(au, where('role', '==', 'admin'))).then(s => s.data().count), 0),
    safe(() => getCountFromServer(query(au, where('role', '==', 'qc'))).then(s => s.data().count), 0),
    safe(() => getCountFromServer(query(au, where('role', '==', 'task_force_team'))).then(s => s.data().count), 0),
    safe(() => getCountFromServer(query(au, where('role', '==', 'pmc_member'))).then(s => s.data().count), 0),
    safe(() => getCountFromServer(query(au, where('role', '==', 'action_officer'))).then(s => s.data().count), 0),
    safe(() => getCountFromServer(query(au, where('role', '==', 'commissioner'))).then(s => s.data().count), 0),
    safe(() => getCountFromServer(query(collection(db, 'feederPointRequests'), where('status', '==', 'pending'))).then(s => s.data().count), 0),
    safe(() => getCountFromServer(query(collection(db, 'frequencyRequests'), where('status', '==', 'pending'))).then(s => s.data().count), 0),
    safe(() => getCountFromServer(query(collection(db, 'accessRequests'), where('status', '==', 'pending'))).then(s => s.data().count), 0),
    safe(() => getCountFromServer(query(collection(db, 'notifications'), where('isRead', '==', false))).then(s => s.data().count), 0),
  ])
 
return {
    totalReports, pendingReports, approvedReports, rejectedReports,
    requiresAction, actionTaken,
    totalFeederPoints, activeFeederPoints, assignedFeederPoints, unassignedFeederPoints,
    totalChronicPoints, activeChronicPoints, assignedChronicPoints, unassignedChronicPoints,
    eliminatedFeederPoints, eliminatedChronicPoints,
    eliminatedPoints, unassignedPoints,
    totalShiftReports, completedShifts, inProgressShifts,
    totalUsers, activeUsers, inactiveUsers,
    adminUsers, qcUsers, taskForceUsers, pmcMemberUsers, actionOfficerUsers, commissionerUsers,
    pendingPointRequests, pendingFreqRequests, pendingAccessRequests,
    totalNotifications: totalReports,
    unreadNotifications,
  }
}

export function buildDailyTrend(
  reports: ComplianceReport[],
  dateFrom: string,
  dateTo: string
): DailyTrendPoint[] {
  if (!dateFrom || !dateTo || dateFrom > dateTo) return []
  const start = new Date(`${dateFrom}T00:00:00Z`)
  const end = new Date(`${dateTo}T00:00:00Z`)
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return []

  const dayKeys: string[] = []
  const cursor = new Date(start)
  while (cursor <= end) {
    dayKeys.push(toISO(cursor))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  const buckets: Record<string, { count: number; approved: number; rejected: number; pending: number; requiresAction: number }> = {}
  dayKeys.forEach(day => { buckets[day] =  { count: 0, approved: 0, rejected: 0, pending: 0, requiresAction: 0 } })

  reports.forEach(r => {
    const key = normalizeDateKey(r.submittedAt ?? r.createdAt)
    if (key && buckets[key]) {
      buckets[key].count++
      if (r.status === 'approved') buckets[key].approved++
      else if (r.status === 'rejected') buckets[key].rejected++
      else if (r.status === 'pending') buckets[key].pending++
      else if (r.status === 'requires_action') buckets[key].requiresAction++
    }
  })

  return dayKeys.map(day => ({
    date: day,
    label: dateFormatter.format(new Date(`${day}T00:00:00Z`)),
    ...buckets[day],
  }))
}

export function buildStatusBreakdown(reports: ComplianceReport[]): StatusBreakdown[] {
  const counts: Record<string, number> = {}
  reports.forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1 })
  const total = reports.length || 1
  return Object.entries(counts)
    .map(([status, count]) => ({ status, count, percentage: Math.round((count / total) * 100) }))
    .sort((a, b) => b.count - a.count)
}

export function buildChecklistFailures(reports: ComplianceReport[]): ChecklistFailure[] {
  const QUESTION_LABELS: Record<string, string> = {
    scp_area_clean: 'SCP area clean',
    waste_segregated: 'Waste segregated',
    waste_collection_status: 'Collection status',
    swatch_workers_count: 'Swatch workers',
    staff_present: 'Staff present',
    workers_wearing_uniform: 'Workers uniform',
    collection_team_mixing_waste: 'Waste not mixed',
    driver_helper_uniform: 'Driver uniform',
    vehicle_separate_compartments: 'Vehicle compartments',
    waste_present: 'Waste present',
    area_clean_remarks: 'Area clean remarks',
    swachh_workers_present: 'Swachh workers present',
    pmc_vehicle_present: 'PMC vehicle present',
    area_clean_30m: 'Area clean (30m)',
    swd_clean: 'SWD clean',
    signboard_visible: 'Signboard visible',
    third_person_dumping: 'Third-party dumping',
    leachate_visible: 'Leachate visible',
    stray_animals_present: 'Stray animals present',
    waste_scattered_outside: 'Waste scattered outside',
  }
  const SKIP_QUESTIONS = new Set(['zone_name', 'ward_number', 'smart_collection_point_name'])
  const stats: Record<string, { total: number; failed: number }> = {}

  reports.forEach(report => {
    extractAnswers(report).forEach(a => {
      if (!a.questionId || SKIP_QUESTIONS.has(a.questionId)) return
      if (!stats[a.questionId]) stats[a.questionId] = { total: 0, failed: 0 }
      stats[a.questionId].total++
      if (a.answer?.toLowerCase() === 'no') stats[a.questionId].failed++
    })
  })

  return Object.entries(stats)
    .map(([qid, s]) => ({
      questionId: qid,
      label: QUESTION_LABELS[qid] ?? qid.replace(/_/g, ' '),
      total: s.total,
      failed: s.failed,
      rate: s.total > 0 ? Math.round((s.failed / s.total) * 100) : 0,
    }))
    .sort((a, b) => b.rate - a.rate)
}

export function buildSlotPunctuality(shifts: ShiftReport[]): SlotPunctuality {
  const result: SlotPunctuality = {
    onTime: 0, late: 0, missed: 0, pending: 0, total: 0,
    punchedOut: 0, notPunchedOut: 0, totalShifts: 0, punchOutRate: 0,
  }

  shifts.forEach(shift => {
    const slots: ShiftSlot[] = Array.isArray(shift.slots)
      ? shift.slots
      : Object.values(shift.slots || {})
    slots.forEach(slot => {
      result.total++
      switch (slot.status as string) {
        case 'completed':
        case 'submitted': // legacy/alias support
          result.onTime++
          break
        case 'late':
          result.late++
          break
        case 'missed':
          result.missed++
          break
        case 'active':
        case 'pending':
        default:
          result.pending++
          break
      }
    })

    // Punch-out only meaningful for shifts that have actually finished
    if (shift.status === 'completed') {
      result.totalShifts++
      if (shift.isPunchedOut) result.punchedOut++
      else result.notPunchedOut++
    }
  })

  result.punchOutRate = result.totalShifts > 0
    ? Math.round((result.punchedOut / result.totalShifts) * 100)
    : 0

  return result
}

export function buildTeamLeaderboard(reports: ComplianceReport[]): TeamLeaderboardEntry[] {
  const teams: Record<string, {
    teamId: string; teamName: string; total: number; approved: number
    rejected: number; pending: number; distances: number[]
  }> = {}

  reports.forEach(r => {
    const tid = (r.teamId?.trim()) ? r.teamId : (r.userId || 'unknown')
    const tname = (r.teamId?.trim()) ? (r.teamName || r.teamId) : (r.userName || r.userId || 'Unknown')
    if (tid === 'unknown') return
    if (!teams[tid]) teams[tid] = { teamId: tid, teamName: tname, total: 0, approved: 0, rejected: 0, pending: 0, distances: [] }
    teams[tid].total++
    if (r.status === 'approved') teams[tid].approved++
    else if (r.status === 'rejected') teams[tid].rejected++
    else if (r.status === 'pending') teams[tid].pending++
    if (r.distanceFromFeederPoint != null) teams[tid].distances.push(r.distanceFromFeederPoint)
  })

  return Object.values(teams)
    .map(t => ({
      teamId: t.teamId, teamName: t.teamName, total: t.total,
      approved: t.approved, rejected: t.rejected, pending: t.pending,
      approvalRate: t.total > 0 ? Math.round((t.approved / t.total) * 100) : 0,
      avgDistance: t.distances.length > 0
        ? Math.round((t.distances.reduce((a, b) => a + b, 0) / t.distances.length) * 10) / 10
        : 0,
    }))
    .sort((a, b) => b.approvalRate - a.approvalRate || b.total - a.total)
}

export function getUninspectedPoints(
  points: FeederPoint[],
  reports: ComplianceReport[],
  days: number = 7
): FeederPoint[] {
  const cutoff = new Date(Date.now() - days * 86400000)
  const inspected = new Set<string>()
  reports.forEach(r => {
    const dt = tsToDate(r.submittedAt ?? r.createdAt)
    if (dt && dt >= cutoff) inspected.add(r.feederPointId)
  })
  return points.filter(p => p.status === 'active' && !p.isEliminated && !inspected.has(p.id))
}

export function getStalePendingReports(reports: ComplianceReport[], hours: number = 48): ComplianceReport[] {
  const cutoff = new Date(Date.now() - hours * 3600000)
  return reports.filter(r => {
    if (r.status !== 'pending') return false
    const dt = tsToDate(r.createdAt)
    return dt && dt < cutoff
  })
}

export function getGPSAnomalies(reports: ComplianceReport[], thresholdMeters: number = 100): ComplianceReport[] {
  return reports.filter(r => (r.distanceFromFeederPoint ?? 0) > thresholdMeters)
}

export function buildTopPerformers(
  reports: ComplianceReport[],
  points: FeederPoint[],
  teams: Team[],
  users: ApprovedUser[],
  zones: Zone[],
  wards: Ward[],
  kothis: Kothi[]
): TopPerformer[] {
  const result: TopPerformer[] = []

  const buildStat = (
    getKey: (r: ComplianceReport) => string | undefined,
    getName: (r: ComplianceReport) => string,
    metric: string,
    filterFn?: (r: ComplianceReport) => boolean
  ) => {
    const stats: Record<string, { total: number; approved: number; name: string }> = {}
    const filtered = filterFn ? reports.filter(filterFn) : reports
    filtered.forEach(r => {
      const key = getKey(r)
      if (!key || key === 'unknown') return
      if (!stats[key]) stats[key] = { total: 0, approved: 0, name: getName(r) }
      stats[key].total++
      if (r.status === 'approved') stats[key].approved++
    })
    return Object.entries(stats)
      .map(([id, s]) => ({ id, name: s.name, rate: s.total > 0 ? Math.round((s.approved / s.total) * 100) : 0, total: s.total }))
      .sort((a, b) => b.rate - a.rate || b.total - a.total)[0]
  }

  const topZone = buildStat(
    r => points.find(p => p.id === r.feederPointId)?.zoneId,
    r => points.find(p => p.id === r.feederPointId)?.zoneName || 'Unknown',
    'Top zone'
  )
  if (topZone) result.push({ id: topZone.id, name: topZone.name, metric: 'Top zone', value: `${topZone.rate}%`, sub: `${topZone.total} reports, ${topZone.rate}% approval` })

  const topWard = buildStat(
    r => points.find(p => p.id === r.feederPointId)?.wardId,
    r => points.find(p => p.id === r.feederPointId)?.wardName || 'Unknown',
    'Top ward'
  )
  if (topWard) result.push({ id: topWard.id, name: topWard.name, metric: 'Top ward', value: `${topWard.rate}%`, sub: `${topWard.total} reports, ${topWard.rate}% approval` })

  const topKothi = buildStat(
    r => points.find(p => p.id === r.feederPointId)?.kothiId,
    r => points.find(p => p.id === r.feederPointId)?.kothiName || 'Unknown',
    'Top kothi'
  )
  if (topKothi) result.push({ id: topKothi.id, name: topKothi.name, metric: 'Top kothi', value: `${topKothi.rate}%`, sub: `${topKothi.total} reports, ${topKothi.rate}% approval` })

  const topMember = buildStat(r => r.userId, r => r.userName || 'Unknown', 'Top member')
  if (topMember) result.push({ id: topMember.id, name: topMember.name, metric: 'Top member', value: topMember.rate, sub: `${topMember.total} reports, ${topMember.rate}% approval` })

  const topFP = buildStat(
    r => r.feederPointId,
    r => r.feederPointName || 'Unknown',
    'Top feeder point',
    r => (r.feederPointType ?? 'feeder') === 'feeder'
  )
  if (topFP) result.push({ id: topFP.id, name: topFP.name, metric: 'Top feeder point', value: `${topFP.rate}%`, sub: `${topFP.total} inspections, ${topFP.rate}% pass` })

  const topCP = buildStat(
    r => r.feederPointId,
    r => r.feederPointName || 'Unknown',
    'Top chronic point',
    r => r.feederPointType === 'chronic'
  )
  if (topCP) result.push({ id: topCP.id, name: topCP.name, metric: 'Top chronic point', value: `${topCP.rate}%`, sub: `${topCP.total} reports, ${topCP.rate}% completion` })

  return result
}

export function buildAlerts(
  reports: ComplianceReport[],
  points: FeederPoint[],
  shifts: ShiftReport[],
  kpis: DashboardKPIs,
  pendingPR: number,
  pendingFR: number,
  pendingAR: number
): AlertItem[] {
  const alerts: AlertItem[] = []

  const uninspected = getUninspectedPoints(points.filter(p => !p.isEliminated), reports, 7)
  if (uninspected.length > 0) {
    const names = uninspected.slice(0, 2).map(p => p.name).join(', ')
    const more = uninspected.length > 2 ? ` +${uninspected.length - 2} more` : ''
    alerts.push({ id: 'uninspected', level: 'critical', title: `${uninspected.length} points uninspected this week`, meta: `Including: ${names}${more}`, count: uninspected.length })
  }

  const stale = getStalePendingReports(reports, 48)
  if (stale.length > 0) alerts.push({ id: 'stale-pending', level: 'warning', title: `${stale.length} reports pending > 48h`, meta: 'Stale compliance reports need QC review', count: stale.length })
  if (kpis.requiresAction > 0) alerts.push({ id: 'requires-action', level: 'critical', title: `${kpis.requiresAction} reports require action`, meta: 'Compliance failures need corrective steps', count: kpis.requiresAction })
  if (kpis.unassignedPoints > 0) alerts.push({ id: 'unassigned-points', level: 'warning', title: `${kpis.unassignedPoints} points have no assigned team`, meta: 'Feeder/chronic points without team assignment', count: kpis.unassignedPoints })
  if (pendingPR > 0) alerts.push({ id: 'pending-pr', level: 'info', title: `${pendingPR} new point requests pending`, meta: 'Taskforce-submitted feeder point requests', count: pendingPR })
  if (pendingAR > 0) alerts.push({ id: 'pending-ar', level: 'info', title: `${pendingAR} access requests awaiting approval`, meta: 'New user access requests', count: pendingAR })
  if (pendingFR > 0) alerts.push({ id: 'pending-fr', level: 'info', title: `${pendingFR} frequency change requests`, meta: 'Pending inspection frequency modifications', count: pendingFR })
  if (kpis.inProgressShifts > 0) alerts.push({ id: 'in-progress-shifts', level: 'info', title: `${kpis.inProgressShifts} shifts still in progress`, meta: 'Chronic point shifts not yet completed', count: kpis.inProgressShifts })

  return alerts.sort((a, b) => ({ critical: 0, warning: 1, info: 2 }[a.level] ?? 3) - ({ critical: 0, warning: 1, info: 2 }[b.level] ?? 3))
}

export interface ExportSheet {
  name: string
  data: Record<string, any>[]
}

export function prepareExportData(
  kpis: DashboardKPIs,
  reports: ComplianceReport[],
  points: FeederPoint[],
  shifts: ShiftReport[],
  teamLB: TeamLeaderboardEntry[],
  alerts: AlertItem[],
  topPerformers: TopPerformer[]
): ExportSheet[] {
  return [
    { name: 'KPIs', data: Object.entries(kpis).map(([key, val]) => ({ Metric: key.replace(/([A-Z])/g, ' $1').trim(), Value: val })) },
    {
      name: 'Reports',
      data: reports.slice(0, 1000).map(r => ({
        ID: r.id, Status: r.status, 'Feeder Point': r.feederPointName,
        Type: r.feederPointType ?? 'feeder', Team: r.teamName || '',
        User: r.userName, 'Trip Date': r.tripDate || '',
        'Distance (m)': r.distanceFromFeederPoint ?? '',
        'Submitted At': normalizeDateKey(r.submittedAt) || '',
      })),
    },
    {
      name: 'Points',
      data: points.map(p => ({
        ID: p.id, Name: p.name, Type: p.type ?? 'feeder', Status: p.status,
        Priority: p.priority, Zone: p.zoneName || '', Ward: p.wardName || '',
        Kothi: p.kothiName || '', Latitude: p.location?.latitude ?? '',
        Longitude: p.location?.longitude ?? '',
        'Assigned Team': p.assignmentDetails?.name || '',
        Eliminated: p.isEliminated ? 'Yes' : 'No',
      })),
    },
    {
      name: 'Shifts',
      data: shifts.map(s => ({
        ID: s.id, 'Feeder Point': s.feederPointName, User: s.userName,
        'Shift Type': s.shiftType, 'Shift Date': s.shiftDate, Status: s.status,
      })),
    },
    {
      name: 'Team Leaderboard',
      data: teamLB.map((t, i) => ({
        Rank: i + 1, Team: t.teamName, 'Total Reports': t.total,
        Approved: t.approved, 'Approval Rate': `${t.approvalRate}%`,
        'Avg Distance (m)': t.avgDistance,
      })),
    },
    { name: 'Alerts', data: alerts.map(a => ({ Severity: a.level, Title: a.title, Detail: a.meta, Count: a.count })) },
    { name: 'Top Performers', data: topPerformers.map(tp => ({ Category: tp.metric, Name: tp.name, Value: tp.value, Detail: tp.sub })) },
  ]
}