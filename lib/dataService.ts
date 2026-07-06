import {
  collection, getDocs, getDoc, doc, updateDoc, deleteDoc,
  query, orderBy, limit, where, setDoc, onSnapshot,
  serverTimestamp, getCountFromServer, QueryConstraint
} from 'firebase/firestore';
import { db } from './firebase';

export interface DashboardStats {
  totalUsers: number;
  activeUsers: number;
  pendingRequests: number;
  totalComplaints: number;
  totalInspections: number;
  totalFeederPoints: number;
  totalChronicPoints: number;
  totalEliminatedPoints: number;
  totalShiftReports: number;
  totalTeams: number;
  totalIPRecords: number;
  adminUsers: number;
  taskForceUsers: number;
  commissionerUsers: number;
  inactiveUsers: number;
  activeAdmins: number;
  activeTaskForce: number;
  activeCommissioners: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  employeeCode?: string;
  zoneNumber?: string;
  organization?: string;
  department?: string;
  isActive: boolean;
  createdAt: any;
  lastLogin?: any;
  password?: string;
  permissions?: string[];
  approvedAt?: any;
  approvedBy?: string;
}

export interface ComplianceReport {
  id: string;
  feederPointId: string;
  feederPointName: string;
  userId: string;
  userName: string;
  teamId: string;
  teamName: string;
  submittedAt: any;
  submittedLocation: { latitude: number; longitude: number; address: string };
  distanceFromFeederPoint: number;
  status: 'pending' | 'approved' | 'rejected' | 'requires_action' | 'action_taken';
  answers: ComplianceAnswer[];
  adminNotes?: string;
  actionTakenNote?: string;
  actionTakenPhoto?: string;
  reviewedBy?: string;
  reviewedAt?: any;
  createdAt: any;
  updatedAt: any;
  tripNumber: 1 | 2 | 3;
  tripDate: string;
  dailyTripId: string;
  feederPointType?: 'feeder' | 'chronic';
  aiAnalysis?: string;
  ministryReport?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  description?: string;
  title?: string;
  submittedBy?: string;
  attachments?: ComplianceReportAttachment[];
}

export interface ComplianceAnswer {
  description: string;
  questionId: string;
  answer: 'yes' | 'no' | string;
  photos?: string[];
  notes?: string;
}

export interface ComplianceReportAttachment {
  id: string;
  type: 'photo' | 'video' | 'audio' | 'document';
  url: string;
  filename: string;
  uploadedDate: string;
}

export interface AccessRequest {
  id: string;
  name: string;
  email: string;
  phone: string;
  organization: string;
  department: string;
  requestedRole: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: any;
  reviewedAt?: any;
  reviewedBy?: string;
}

export interface Complaint {
  id: string;
  title: string;
  description: string;
  category: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  reportedBy: string;
  assignedTo?: string;
  createdAt: any;
  updatedAt: any;
}

export interface IPRecord {
  id: string;
  userId: string;
  userEmail: string;
  ipAddress: string;
  deviceInfo: string;
  location?: string;
  registeredAt: any;
  lastUsed: any;
  isActive: boolean;
}

export interface Team {
  id: string;
  name: string;
  members: User[];
}

export interface EmployeePerformance {
  userId: string;
  name: string;
  email: string;
  role: string;
  totalReports: number;
  approvedReports: number;
  rejectedReports: number;
  pendingReports: number;
  approvalRate: number;
  lastReportAt: Date | null;
}

export interface FeederPointSummary {
  key: string;
  feederPointId?: string;
  feederPointName: string;
  totalReports: number;
  approvedReports: number;
  rejectedReports: number;
  pendingReports: number;
  lastReportAt: Date | null;
  reports: ComplianceReport[];
}

export interface FeederPoint {
  id: string;
  name: string;
  assignedUserId?: string;
  assignedUserIds?: string[];
  assignedTeamId?: string;
  kothiId?: string;
  kothiName?: string;
  wardId?: string;
  wardName?: string;
  zoneId?: string;
  zoneName?: string;
  isEliminated?: boolean;
  status: 'active' | 'maintenance' | 'inactive';
  location: { address: string; latitude: number; longitude: number };
  priority: 'high' | 'medium' | 'low';
  lastInspection?: any;
  type?: 'feeder' | 'chronic';
  convertedToChronicAt?: any;
  convertedToChronicBy?: string;
}

export interface FeederPointRequest {
  id: string;
  userId?: string;
  userName?: string;
  userEmail?: string;
  userPhone?: string;
  coordinates?: { latitude: number; longitude: number };
  areaName?: string;
  areaDescription?: string;
  zoneNumber?: string;
  wardNumber?: string;
  populationDensity?: 'low' | 'medium' | 'high';
  accessibility?: 'easy' | 'moderate' | 'difficult';
  additionalDetails?: string;
  imageURL?: string;
  kothiName?: string;
  feederPointName?: string;
  nearestLandmark?: string;
  approximateHouseholds?: string;
  vehicleType?: string;
  status: 'pending' | 'approved' | 'rejected';
  priority?: 'low' | 'medium' | 'high';
  adminNotes?: string;
  rejectionReason?: string;
  reviewedBy?: string;
  reviewedAt?: any;
  submittedAt?: any;
  createdAt?: any;
  updatedAt?: any;
}

export interface ShiftSlot {
  slotNumber: number;
  label: string;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  status: 'pending' | 'active' | 'completed' | 'missed' | 'late';
  photoUrl?: string;
  timestamp?: any;
  location?: { latitude: number; longitude: number };
}

export interface ShiftReport {
  id: string;
  userId: string;
  userName: string;
  feederPointId: string;
  feederPointName: string;
  shiftType: '7PM-3AM' | '3AM-11AM' | '12:30PM-8:30PM' | '11PM-7AM' | '3PM-11PM';
  shiftDate: string;
  slots: ShiftSlot[] | Record<string, ShiftSlot>;
  startedAt: any;
  completedAt?: any;
  status: 'in_progress' | 'completed';
  createdAt: any;
  updatedAt: any;
}

export interface Zone {
  id: string;
  name: string;
  createdAt?: any;
}

export interface Ward {
  id: string;
  name: string;
  zoneId: string;
  zoneName?: string;
  createdAt?: any;
}

export interface Kothi {
  id: string;
  name: string;
  wardId: string;
  wardName?: string;
  createdAt?: any;
}

export interface Assignment {
  id: string;
  zoneId?: string;
  zoneName?: string;
  wardId?: string;
  wardName?: string;
  kothiId?: string;
  kothiName?: string;
  feederPointId: string;
  feederPointName?: string;
  userId: string;
  userName?: string;
  createdAt?: any;
}

export class DataService {
  private static coerceDate(value: any): Date | null {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value.toDate === 'function') return value.toDate();
    if (typeof value === 'string') {
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    return null;
  }

  static async getDashboardStats(): Promise<DashboardStats> {
    try {
      const au = collection(db, 'approvedUsers');
      const cr = collection(db, 'complianceReports');
      const fp = collection(db, 'feederPoints');

      const [
        totalUsers,
        activeUsers,
        pendingRequests,
        totalComplaints,
        totalInspections,
        totalFeederPoints,
        totalChronicPoints,
        totalEliminatedPoints,
        totalShiftReports,
        totalTeams,
        totalIPRecords,
        adminUsers,
        taskForceUsers,
        commissionerUsers,
        inactiveUsers,
        activeAdmins,
        activeTaskForce,
        activeCommissioners,
      ] = await Promise.all([
        getCountFromServer(au),
        getCountFromServer(query(au, where('isActive', '==', true))),
        getCountFromServer(query(collection(db, 'accessRequests'), where('status', '==', 'pending'))),
        getCountFromServer(collection(db, 'complaints')),
        getCountFromServer(collection(db, 'inspections')),
        getCountFromServer(query(fp, where('type', '==', 'feeder'))),
        getCountFromServer(query(fp, where('type', '==', 'chronic'))),
        getCountFromServer(query(fp, where('isEliminated', '==', true))),
        getCountFromServer(collection(db, 'shiftReports')),
        getCountFromServer(collection(db, 'teams')),
        getCountFromServer(collection(db, 'ipRecords')),
        getCountFromServer(query(au, where('role', '==', 'admin'))),
        getCountFromServer(query(au, where('role', '==', 'task_force_team'))),
        getCountFromServer(query(au, where('role', '==', 'commissioner'))),
        getCountFromServer(query(au, where('isActive', '==', false))),
        getCountFromServer(query(au, where('role', '==', 'admin'), where('isActive', '==', true))),
        getCountFromServer(query(au, where('role', '==', 'task_force_team'), where('isActive', '==', true))),
        getCountFromServer(query(au, where('role', '==', 'commissioner'), where('isActive', '==', true))),
      ]);

      return {
        totalUsers: totalUsers.data().count,
        activeUsers: activeUsers.data().count,
        pendingRequests: pendingRequests.data().count,
        totalComplaints: totalComplaints.data().count,
        totalInspections: totalInspections.data().count,
        totalFeederPoints: totalFeederPoints.data().count,
        totalChronicPoints: totalChronicPoints.data().count,
        totalEliminatedPoints: totalEliminatedPoints.data().count,
        totalShiftReports: totalShiftReports.data().count,
        totalTeams: totalTeams.data().count,
        totalIPRecords: totalIPRecords.data().count,
        adminUsers: adminUsers.data().count,
        taskForceUsers: taskForceUsers.data().count,
        commissionerUsers: commissionerUsers.data().count,
        inactiveUsers: inactiveUsers.data().count,
        activeAdmins: activeAdmins.data().count,
        activeTaskForce: activeTaskForce.data().count,
        activeCommissioners: activeCommissioners.data().count,
      };
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      return {
        totalUsers: 0, activeUsers: 0, pendingRequests: 0, totalComplaints: 0,
        totalInspections: 0, totalFeederPoints: 0, totalChronicPoints: 0,
        totalEliminatedPoints: 0, totalShiftReports: 0, totalTeams: 0,
        totalIPRecords: 0, adminUsers: 0, taskForceUsers: 0, commissionerUsers: 0,
        inactiveUsers: 0, activeAdmins: 0, activeTaskForce: 0, activeCommissioners: 0,
      };
    }
  }

  static async getEmployeePerformance(options?: {
    role?: string;
    startDate?: Date;
    endDate?: Date;
    includeInactive?: boolean;
  }): Promise<EmployeePerformance[]> {
    const roleFilter = options?.role;
    const startDate = options?.startDate ? new Date(options.startDate) : null;
    const endDate = options?.endDate ? new Date(options.endDate) : null;
    const includeInactive = options?.includeInactive ?? false;

    if (startDate && endDate && startDate > endDate) return [];

    try {
      const userConstraints: QueryConstraint[] = [];
      if (roleFilter) userConstraints.push(where('role', '==', roleFilter));
      if (!includeInactive) userConstraints.push(where('isActive', '==', true));

      const [usersSnapshot, reportsSnapshot] = await Promise.all([
        getDocs(query(collection(db, 'approvedUsers'), ...userConstraints)),
        getDocs(collection(db, 'complianceReports')),
      ]);

      const users = usersSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as User));
      const performanceByUser = new Map<string, EmployeePerformance>();
      const userEmailIndex = new Map<string, string>();
      const userNameIndex = new Map<string, string>();

      users.forEach(user => {
        performanceByUser.set(user.id, {
          userId: user.id,
          name: user.name || 'Unknown User',
          email: user.email || 'N/A',
          role: user.role || 'user',
          totalReports: 0,
          approvedReports: 0,
          rejectedReports: 0,
          pendingReports: 0,
          approvalRate: 0,
          lastReportAt: null,
        });
        if (user.email) userEmailIndex.set(user.email.toLowerCase(), user.id);
        if (user.name) userNameIndex.set(user.name.toLowerCase(), user.id);
      });

      reportsSnapshot.docs.forEach(reportDoc => {
        const report = reportDoc.data() as ComplianceReport;
        const uid = typeof report.userId === 'string' ? report.userId.trim() : undefined;
        let stats = uid ? performanceByUser.get(uid) : undefined;

        if (!stats && report.submittedBy) {
          const match = userEmailIndex.get(String(report.submittedBy).trim().toLowerCase());
          if (match) stats = performanceByUser.get(match);
        }
        if (!stats && report.userName) {
          const match = userNameIndex.get(String(report.userName).trim().toLowerCase());
          if (match) stats = performanceByUser.get(match);
        }
        if (!stats) return;

        const reportDate =
          DataService.coerceDate(report.submittedAt) ||
          DataService.coerceDate(report.updatedAt) ||
          DataService.coerceDate(report.createdAt) ||
          DataService.coerceDate(report.tripDate);

        if (startDate && reportDate && reportDate < startDate) return;
        if (endDate && reportDate && reportDate > endDate) return;
        if (!reportDate && (startDate || endDate)) return;

        stats.totalReports += 1;
        if (report.status === 'approved') stats.approvedReports += 1;
        else if (report.status === 'rejected') stats.rejectedReports += 1;
        else stats.pendingReports += 1;

        if (reportDate && (!stats.lastReportAt || reportDate > stats.lastReportAt)) {
          stats.lastReportAt = reportDate;
        }
      });

      return Array.from(performanceByUser.values()).map(p => ({
        ...p,
        approvalRate: p.totalReports ? p.approvedReports / p.totalReports : 0,
      }));
    } catch (error) {
      console.error('Error fetching employee performance:', error);
      return [];
    }
  }

  static async getEmployeeReports(
    userId: string,
    options?: { startDate?: Date; endDate?: Date; userEmail?: string; userName?: string }
  ): Promise<ComplianceReport[]> {
    const startDate = options?.startDate ? new Date(options.startDate) : null;
    const endDate = options?.endDate ? new Date(options.endDate) : null;
    const reportsMap = new Map<string, ComplianceReport>();

    const applyDateFilter = (report: ComplianceReport): boolean => {
      const reportDate =
        DataService.coerceDate(report.submittedAt) ||
        DataService.coerceDate(report.updatedAt) ||
        DataService.coerceDate(report.createdAt) ||
        DataService.coerceDate(report.tripDate);
      if (!reportDate && (startDate || endDate)) return false;
      if (startDate && reportDate && reportDate < startDate) return false;
      if (endDate && reportDate && reportDate > endDate) return false;
      return true;
    };

    const collectReports = (snapshot: any) => {
      snapshot.docs.forEach((d: any) => {
        const report = { id: d.id, ...d.data() } as ComplianceReport;
        if (applyDateFilter(report)) reportsMap.set(report.id, report);
      });
    };

    if (userId) {
      collectReports(await getDocs(query(collection(db, 'complianceReports'), where('userId', '==', userId))));
    }
    if (reportsMap.size === 0 && options?.userEmail) {
      collectReports(await getDocs(query(collection(db, 'complianceReports'), where('submittedBy', '==', options.userEmail))));
    }
    if (reportsMap.size === 0 && options?.userName) {
      collectReports(await getDocs(query(collection(db, 'complianceReports'), where('userName', '==', options.userName))));
    }
    if (reportsMap.size === 0) {
      const snapshot = await getDocs(collection(db, 'complianceReports'));
      snapshot.docs.forEach(d => {
        const data = d.data() as ComplianceReport;
        const matches =
          data.userId === userId ||
          (options?.userEmail && data.submittedBy === options.userEmail) ||
          (options?.userName && data.userName === options.userName);
        if (!matches) return;
        const report = { ...data, id: d.id } as ComplianceReport;
        if (applyDateFilter(report)) reportsMap.set(report.id, report);
      });
    }

    return Array.from(reportsMap.values()).sort((a, b) => {
      const aT = (DataService.coerceDate(a.submittedAt) || DataService.coerceDate(a.updatedAt) || DataService.coerceDate(a.createdAt))?.getTime() ?? 0;
      const bT = (DataService.coerceDate(b.submittedAt) || DataService.coerceDate(b.updatedAt) || DataService.coerceDate(b.createdAt))?.getTime() ?? 0;
      return bT - aT;
    });
  }

  static async getFeederPointSummaries(options?: {
    startDate?: Date;
    endDate?: Date;
  }): Promise<FeederPointSummary[]> {
    const startDate = options?.startDate ? new Date(options.startDate) : null;
    const endDate = options?.endDate ? new Date(options.endDate) : null;
    const snapshot = await getDocs(collection(db, 'complianceReports'));
    const summaries = new Map<string, FeederPointSummary>();

    snapshot.docs.forEach(d => {
      const report = { id: d.id, ...d.data() } as ComplianceReport;
      const reportDate =
        DataService.coerceDate(report.submittedAt) ||
        DataService.coerceDate(report.updatedAt) ||
        DataService.coerceDate(report.createdAt) ||
        DataService.coerceDate(report.tripDate);
      if (startDate && reportDate && reportDate < startDate) return;
      if (endDate && reportDate && reportDate > endDate) return;
      if (!reportDate && (startDate || endDate)) return;

      const key = report.feederPointId || report.feederPointName || 'unspecified';
      if (!summaries.has(key)) {
        summaries.set(key, {
          key,
          feederPointId: report.feederPointId,
          feederPointName: report.feederPointName || 'Unspecified Feeder Point',
          totalReports: 0,
          approvedReports: 0,
          rejectedReports: 0,
          pendingReports: 0,
          lastReportAt: null,
          reports: [],
        });
      }
      const s = summaries.get(key)!;
      s.totalReports += 1;
      s.reports.push(report);
      if (report.status === 'approved') s.approvedReports += 1;
      else if (report.status === 'rejected') s.rejectedReports += 1;
      else s.pendingReports += 1;
      if (reportDate && (!s.lastReportAt || reportDate > s.lastReportAt)) s.lastReportAt = reportDate;
    });

    return Array.from(summaries.values())
      .map(s => {
        s.reports.sort((a, b) => {
          const aT = (DataService.coerceDate(a.submittedAt) || DataService.coerceDate(a.updatedAt) || DataService.coerceDate(a.createdAt))?.getTime() ?? 0;
          const bT = (DataService.coerceDate(b.submittedAt) || DataService.coerceDate(b.updatedAt) || DataService.coerceDate(b.createdAt))?.getTime() ?? 0;
          return bT - aT;
        });
        return s;
      })
      .sort((a, b) => b.totalReports - a.totalReports);
  }

  static async getFeederPointReports(feederPointId?: string, feederPointName?: string): Promise<ComplianceReport[]> {
    if (!feederPointId && !feederPointName) return [];
    const queries = [];
    if (feederPointId) queries.push(query(collection(db, 'complianceReports'), where('feederPointId', '==', feederPointId)));
    if (feederPointName) queries.push(query(collection(db, 'complianceReports'), where('feederPointName', '==', feederPointName)));

    const reportsMap = new Map<string, ComplianceReport>();
    for (const q of queries) {
      const snapshot = await getDocs(q);
      snapshot.docs.forEach(d => {
        if (!reportsMap.has(d.id)) reportsMap.set(d.id, { id: d.id, ...d.data() } as ComplianceReport);
      });
    }
    return Array.from(reportsMap.values()).sort((a, b) => {
      const aT = (DataService.coerceDate(a.submittedAt) || DataService.coerceDate(a.updatedAt) || DataService.coerceDate(a.createdAt))?.getTime() ?? 0;
      const bT = (DataService.coerceDate(b.submittedAt) || DataService.coerceDate(b.updatedAt) || DataService.coerceDate(b.createdAt))?.getTime() ?? 0;
      return bT - aT;
    });
  }

  static onUsersChange(callback: (users: User[]) => void) {
    return onSnapshot(
      collection(db, 'approvedUsers'),
      snapshot => {
        const users = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as User));
        users.sort((a, b) => {
          const aT = DataService.coerceDate(a.createdAt)?.getTime() ?? 0;
          const bT = DataService.coerceDate(b.createdAt)?.getTime() ?? 0;
          return bT - aT;
        });
        callback(users);
      }
    );
  }
  static async getAllUsers(): Promise<User[]> {
    const snapshot = await getDocs(collection(db, 'approvedUsers'));
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as User));
  }

  static async findUserByName(name: string): Promise<User | null> {
    const trimmedName = name.trim();
    if (!trimmedName) return null;

    const exactSnapshot = await getDocs(query(collection(db, 'approvedUsers'), where('name', '==', trimmedName), limit(1)));
    if (!exactSnapshot.empty) return { id: exactSnapshot.docs[0].id, ...exactSnapshot.docs[0].data() } as User;

    const normalizedTarget = trimmedName.toLowerCase();
    const snapshot = await getDocs(collection(db, 'approvedUsers'));
    const users = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as User));
    return (
      users.find(u => (u.name || '').trim().toLowerCase() === normalizedTarget) ||
      users.find(u => (u.name || '').toLowerCase().includes(normalizedTarget)) ||
      null
    );
  }

  static async deletePmcEmployee(userId: string): Promise<void> {
    await deleteDoc(doc(db, 'approvedUsers', userId));
  }

  static async createPmcEmployee(input: {
    name: string;
    employeeCode: string;
    email: string;
    phone: string;
    password: string;
    zoneNumber: string | number;
    createdBy?: string;
  }): Promise<void> {
    const userId = `pmc_${input.employeeCode || Date.now()}`;
    await setDoc(doc(db, 'approvedUsers', userId), {
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      phone: input.phone.trim(),
      role: 'pmc_member',
      employeeCode: input.employeeCode.trim(),
      zoneNumber: String(input.zoneNumber).trim(),
      permissions: ['view_pmc_reports'],
      isActive: true,
      password: input.password,
      approvedAt: serverTimestamp(),
      approvedBy: input.createdBy || 'superadmin',
      createdAt: serverTimestamp(),
      lastLogin: null,
    } as Omit<User, 'id'>);
  }

  static onFeederPointRequestsChange(callback: (requests: FeederPointRequest[]) => void) {
    return onSnapshot(
      query(collection(db, 'feederPointRequests'), orderBy('submittedAt', 'desc')),
      snapshot => callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as FeederPointRequest)))
    );
  }

  static async getFeederPointRequests(status?: 'pending' | 'approved' | 'rejected' | 'all'): Promise<FeederPointRequest[]> {
    const constraints: QueryConstraint[] = [orderBy('submittedAt', 'desc')];
    if (status && status !== 'all') constraints.push(where('status', '==', status));
    const snapshot = await getDocs(query(collection(db, 'feederPointRequests'), ...constraints));
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as FeederPointRequest));
  }

  static async updateFeederPointRequest(id: string, data: Partial<FeederPointRequest>): Promise<void> {
    await updateDoc(doc(db, 'feederPointRequests', id), { ...data, updatedAt: serverTimestamp() });
  }

  static onAccessRequestsChange(callback: (requests: AccessRequest[]) => void) {
    return onSnapshot(
      query(collection(db, 'accessRequests'), orderBy('createdAt', 'desc')),
      snapshot => callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as AccessRequest)))
    );
  }

  static onComplaintsChange(callback: (complaints: Complaint[]) => void) {
    return onSnapshot(
      query(collection(db, 'complaints'), orderBy('createdAt', 'desc')),
      snapshot => callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Complaint)))
    );
  }

  static async getAllComplaints(): Promise<Complaint[]> {
    const snapshot = await getDocs(collection(db, 'complaints'));
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Complaint));
  }

  static async getAllComplianceReports(): Promise<ComplianceReport[]> {
    const snapshot = await getDocs(query(collection(db, 'complianceReports'), orderBy('submittedAt', 'desc')));
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ComplianceReport));
  }

  static onComplianceReportsChange(callback: (reports: ComplianceReport[]) => void) {
    return onSnapshot(
      query(collection(db, 'complianceReports'), orderBy('submittedAt', 'desc')),
      snapshot => callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ComplianceReport)))
    );
  }

  static async updateComplianceReportStatus(
    reportId: string,
    status: ComplianceReport['status'],
    adminNotes?: string,
    reviewedBy?: string,
    extra?: Partial<Pick<ComplianceReport, 'actionTakenNote' | 'actionTakenPhoto'>>
  ): Promise<void> {
    const updateData: any = { status, reviewedAt: serverTimestamp(), updatedAt: serverTimestamp() };
    if (adminNotes) updateData.adminNotes = adminNotes;
    if (reviewedBy) updateData.reviewedBy = reviewedBy;
    if (extra?.actionTakenNote) updateData.actionTakenNote = extra.actionTakenNote;
    if (extra?.actionTakenPhoto) updateData.actionTakenPhoto = extra.actionTakenPhoto;
    await updateDoc(doc(db, 'complianceReports', reportId), updateData);
  }

  static onIPRecordsChange(callback: (records: IPRecord[]) => void) {
    return onSnapshot(
      query(collection(db, 'ipRecords'), orderBy('registeredAt', 'desc')),
      snapshot => callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as IPRecord)))
    );
  }

  static onFeederPointsChange(callback: (points: FeederPoint[]) => void) {
    return onSnapshot(
      query(collection(db, 'feederPoints')),
      snapshot => callback(snapshot.docs.map(d => ({
        id: d.id,
        ...d.data(),
        type: (d.data().type ?? 'feeder') as 'feeder' | 'chronic',
      } as FeederPoint)))
    );
  }

  static async getAllFeederPoints(): Promise<FeederPoint[]> {
    const snapshot = await getDocs(collection(db, 'feederPoints'));
    return snapshot.docs.map(d => ({
      id: d.id,
      ...d.data(),
      type: (d.data().type ?? 'feeder') as 'feeder' | 'chronic',
    } as FeederPoint));
  }

  static async getFeederPointsOnly(): Promise<FeederPoint[]> {
    const snapshot = await getDocs(query(collection(db, 'feederPoints'), where('type', '==', 'feeder')));
    const legacySnapshot = await getDocs(
      query(collection(db, 'feederPoints'), where('type', '==', null))
    ).catch(() => ({ docs: [] as any[] }));

    const map = new Map<string, FeederPoint>();
    [...snapshot.docs, ...legacySnapshot.docs].forEach(d => {
      map.set(d.id, { id: d.id, ...d.data(), type: 'feeder' } as FeederPoint);
    });
    return Array.from(map.values());
  }

  static async getChronicPoints(): Promise<FeederPoint[]> {
    const snapshot = await getDocs(query(collection(db, 'feederPoints'), where('type', '==', 'chronic')));
    return snapshot.docs.map(d => ({ id: d.id, ...d.data(), type: 'chronic' } as FeederPoint));
  }

  static async getShiftReports(): Promise<ShiftReport[]> {
    const snapshot = await getDocs(query(collection(db, 'shiftReports'), orderBy('createdAt', 'desc')));
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ShiftReport));
  }

  static async getShiftReportsByPoint(feederPointId: string): Promise<ShiftReport[]> {
    const snapshot = await getDocs(
      query(collection(db, 'shiftReports'), where('feederPointId', '==', feederPointId), orderBy('createdAt', 'desc'))
    );
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ShiftReport));
  }

  static async getChronicComplianceReportsByPoint(feederPointId: string): Promise<ComplianceReport[]> {
    const snapshot = await getDocs(
      query(collection(db, 'complianceReports'), where('feederPointId', '==', feederPointId), where('feederPointType', '==', 'chronic'))
    );
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ComplianceReport));
  }

  static onTeamsChange(callback: (teams: Team[]) => void) {
    return onSnapshot(
      query(collection(db, 'teams')),
      snapshot => callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Team)))
    );
  }

  static async updateFeederPoint(id: string, data: Partial<FeederPoint>): Promise<void> {
    await updateDoc(doc(db, 'feederPoints', id), data);
  }

  static async createFeederPoint(data: Partial<FeederPoint>): Promise<void> {
    await setDoc(doc(collection(db, 'feederPoints')), data, { merge: true });
  }

  static async deleteFeederPoint(id: string): Promise<void> {
    await deleteDoc(doc(db, 'feederPoints', id));
  }

  static async deleteFeederPointAndReports(feederPointId?: string, feederPointName?: string): Promise<void> {
    const deletions: Promise<any>[] = [];
    if (feederPointId) deletions.push(deleteDoc(doc(db, 'feederPoints', feederPointId)));

    const reportQueries = [];
    if (feederPointId) reportQueries.push(query(collection(db, 'complianceReports'), where('feederPointId', '==', feederPointId)));
    if (feederPointName) reportQueries.push(query(collection(db, 'complianceReports'), where('feederPointName', '==', feederPointName)));

    for (const q of reportQueries) {
      const snap = await getDocs(q);
      snap.forEach(d => deletions.push(deleteDoc(doc(db, 'complianceReports', d.id))));
    }
    await Promise.all(deletions);
  }

  static async createSampleFeederPoints(): Promise<void> {
    const samplePoints = [
      { name: 'FP-001', status: 'active', priority: 'high', type: 'feeder', location: { address: '123 Main St', latitude: 34.0522, longitude: -118.2437 } },
      { name: 'FP-002', status: 'maintenance', priority: 'medium', type: 'feeder', location: { address: '456 Oak Ave', latitude: 34.0522, longitude: -118.2437 } },
      { name: 'FP-003', status: 'inactive', priority: 'low', type: 'feeder', location: { address: '789 Pine Ln', latitude: 34.0522, longitude: -118.2437 } },
    ];
    for (const point of samplePoints) {
      await setDoc(doc(collection(db, 'feederPoints')), point);
    }
  }

  static async getRecentActivity(): Promise<any[]> {
    try {
      const snapshot = await getDocs(query(collection(db, 'recentActivity'), orderBy('timestamp', 'desc'), limit(10)));
      return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (error) {
      console.error('Error fetching recent activity:', error);
      return [];
    }
  }

  static getRolePermissions(role: string): string[] {
    switch (role) {
      case 'task_force_team': return ['view_reports', 'create_reports'];
      case 'commissioner': return ['view_reports', 'approve_reports'];
      case 'admin': return ['manage_users', 'system_settings'];
      default: return [];
    }
  }

  static async approveAccessRequest(request: AccessRequest): Promise<void> {
    const userId = request.email.toLowerCase();
    const userRef = doc(db, 'approvedUsers', userId);
    const existingUser = await getDoc(userRef);
    if (existingUser.exists()) return;

    const permissions = DataService.getRolePermissions(request.requestedRole);
    await setDoc(userRef, {
      id: userId,
      name: request.name,
      email: request.email.toLowerCase(),
      phone: request.phone,
      role: request.requestedRole,
      organization: request.organization || null,
      department: request.department || null,
      permissions,
      isActive: true,
      isDeleted: false,
      accountStatus: 'active',
      approvedAt: serverTimestamp(),
      approvedBy: 'AdminUserPlaceholder',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await updateDoc(doc(db, 'accessRequests', request.id), {
      status: 'approved',
      reviewedAt: serverTimestamp(),
      reviewedBy: 'AdminUserPlaceholder',
      updatedAt: serverTimestamp(),
    });
  }

  static async rejectAccessRequest(requestId: string): Promise<void> {
    await updateDoc(doc(db, 'accessRequests', requestId), {
      status: 'rejected',
      reviewedAt: serverTimestamp(),
      reviewedBy: 'AdminUserPlaceholder',
      updatedAt: serverTimestamp(),
    });
  }

  static async updateComplaint(complaintId: string, complaint: Complaint): Promise<void> {
    await updateDoc(doc(db, 'complaints', complaintId), { ...complaint, updatedAt: serverTimestamp() });
  }

  static async deleteComplaint(complaintId: string): Promise<void> {
    await deleteDoc(doc(db, 'complaints', complaintId));
  }

  static async testDatabaseConnection(): Promise<boolean> {
    try {
      await Promise.all([
        getCountFromServer(collection(db, 'approvedUsers')),
        getCountFromServer(collection(db, 'accessRequests')),
        getCountFromServer(collection(db, 'complianceReports')),
        getCountFromServer(collection(db, 'feederPoints')),
        getCountFromServer(collection(db, 'teams')),
      ]);
      return true;
    } catch (error) {
      console.error('Error testing database connection:', error);
      return false;
    }
  }

  static async getUserReports(userId: string): Promise<ComplianceReport[]> {
    const snapshot = await getDocs(query(collection(db, 'complianceReports'), where('userId', '==', userId)));
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ComplianceReport));
  }

  static async getUserFeederPoints(userId: string): Promise<FeederPoint[]> {
    const [byUser, byUserIds] = await Promise.all([
      getDocs(query(collection(db, 'feederPoints'), where('assignedUserId', '==', userId))),
      getDocs(query(collection(db, 'feederPoints'), where('assignedUserIds', 'array-contains', userId))),
    ]);
    const map = new Map<string, FeederPoint>();
    [...byUser.docs, ...byUserIds.docs].forEach(d => {
      map.set(d.id, { id: d.id, ...d.data(), type: (d.data().type ?? 'feeder') as 'feeder' | 'chronic' } as FeederPoint);
    });
    return Array.from(map.values());
  }

  static async updateUser(id: string, data: Partial<User>): Promise<void> {
    await updateDoc(doc(db, 'approvedUsers', id), data);
  }

  static async updateUserPassword(id: string, password: string): Promise<void> {
    await updateDoc(doc(db, 'approvedUsers', id), { password });
  }

  static async deleteUser(id: string): Promise<void> {
    await deleteDoc(doc(db, 'approvedUsers', id));
  }

  static onZonesChange(callback: (zones: Zone[]) => void) {
    return onSnapshot(
      query(collection(db, 'zones'), orderBy('createdAt', 'desc')),
      snapshot => callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Zone)))
    );
  }

  static async createZone(data: Omit<Zone, 'id'>): Promise<void> {
    await setDoc(doc(collection(db, 'zones')), { ...data, createdAt: serverTimestamp() });
  }

  static async updateZone(id: string, data: Partial<Zone>): Promise<void> {
    await updateDoc(doc(db, 'zones', id), data);
  }

  static async deleteZone(id: string): Promise<void> {
    await deleteDoc(doc(db, 'zones', id));
  }

  static onWardsChange(callback: (wards: Ward[]) => void) {
    return onSnapshot(
      query(collection(db, 'wards'), orderBy('createdAt', 'desc')),
      snapshot => callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Ward)))
    );
  }

  static async createWard(data: Omit<Ward, 'id'>): Promise<void> {
    await setDoc(doc(collection(db, 'wards')), { ...data, createdAt: serverTimestamp() });
  }

  static async updateWard(id: string, data: Partial<Ward>): Promise<void> {
    await updateDoc(doc(db, 'wards', id), data);
  }

  static async deleteWard(id: string): Promise<void> {
    await deleteDoc(doc(db, 'wards', id));
  }

  static onKothisChange(callback: (kothis: Kothi[]) => void) {
    return onSnapshot(
      query(collection(db, 'kothis'), orderBy('createdAt', 'desc')),
      snapshot => callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Kothi)))
    );
  }

  static async createKothi(data: Omit<Kothi, 'id'>): Promise<void> {
    await setDoc(doc(collection(db, 'kothis')), { ...data, createdAt: serverTimestamp() });
  }

  static async updateKothi(id: string, data: Partial<Kothi>): Promise<void> {
    await updateDoc(doc(db, 'kothis', id), data);
  }

  static async deleteKothi(id: string): Promise<void> {
    await deleteDoc(doc(db, 'kothis', id));
  }

  static onAssignmentsChange(callback: (assignments: Assignment[]) => void) {
    return onSnapshot(
      query(collection(db, 'assignments'), orderBy('createdAt', 'desc')),
      snapshot => callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Assignment)))
    );
  }

  static async createAssignment(data: Omit<Assignment, 'id'>): Promise<void> {
    await setDoc(doc(collection(db, 'assignments')), { ...data, createdAt: serverTimestamp() });
  }

  static async updateAssignment(id: string, data: Partial<Assignment>): Promise<void> {
    await updateDoc(doc(db, 'assignments', id), data);
  }

  static async deleteAssignment(id: string): Promise<void> {
    await deleteDoc(doc(db, 'assignments', id));
  }
}