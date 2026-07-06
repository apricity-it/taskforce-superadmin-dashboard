import React, { createContext, useContext, useState, useEffect } from 'react'
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore'
import { db } from '../lib/firebase'

export type UserRole = 'admin' | 'qc' | 'pmc_member' | 'commissioner' | 'action_officer' | 'task_force_team' | 'pmc_viewer'

export interface AuthUser {
  id: string
  name: string
  email: string
  role: UserRole
  permissions: string[]
  zoneNumber?: string
  employeeCode?: string
  isActive: boolean
}

interface AuthContextType {
  user: AuthUser | null
  loginWithEmail: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  isLoading: boolean
}

const SESSION_KEY = 'tf_session_user'

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}

// ─── Role → default permissions (mirrors mobile AccessRequestService) ───────
function getRolePermissions(role: UserRole): string[] {
  switch (role) {
    case 'task_force_team':
      return ['view_reports', 'create_reports', 'edit_own_reports', 'view_feeder_points', 'view_assigned_feeder_points', 'update_feeder_point_status']
    case 'commissioner':
      return ['view_reports', 'create_reports', 'edit_reports', 'approve_reports', 'view_feeder_points', 'assign_feeder_points', 'manage_feeder_points', 'view_analytics', 'view_teams', 'manage_teams']
    case 'qc':
      return ['manage_users', 'manage_access_requests', 'view_feeder_points', 'manage_feeder_points', 'view_reports', 'create_reports', 'edit_reports', 'approve_reports', 'view_analytics', 'export_data', 'view_teams', 'manage_teams']
    case 'pmc_member':
      return ['view_pmc_dashboard', 'manage_pmc_actions', 'update_pmc_actions', 'view_reports', 'create_reports', 'edit_reports', 'approve_reports', 'view_feeder_points', 'assign_feeder_points', 'manage_feeder_points', 'view_teams', 'manage_teams', 'view_analytics', 'export_data']
    case 'admin':
      return ['view_reports', 'create_reports', 'edit_reports', 'delete_reports', 'approve_reports', 'view_teams', 'manage_teams', 'assign_team_members', 'view_feeder_points', 'assign_feeder_points', 'manage_feeder_points', 'view_analytics', 'export_data', 'manage_users', 'system_settings', 'audit_logs', 'manage_access_requests', 'view_pmc_dashboard', 'manage_pmc_actions', 'update_pmc_actions']
    case 'pmc_viewer':
      return ['view_reports', 'view_pmc_dashboard']
    default:
      return []
  }
}

function canUserLogin(user: any): boolean {
  if (!user.isActive) return false
  if (user.isDeleted) return false
  if (user.accountStatus === 'deleted') return false
  if (user.accountStatus === 'inactive') return false
  return true
}

// ─── validateUserCredentials — same behavior as mobile ───────────────────────
async function validateUserCredentials(email: string, password: string): Promise<any | null> {
  const snap = await getDocs(query(collection(db, 'approvedUsers'), where('email', '==', email)))
  if (snap.empty) return null

  let userDoc = snap.docs[0]
  if (snap.docs.length > 1) {
    const priority = snap.docs.find(d => {
      const r = d.data().role
      return r === 'admin' || r === 'pmc_member' || r === 'qc'
    })
    if (priority) userDoc = priority
  }

  // Fresh read to avoid stale cache
  const freshSnap = await getDoc(doc(db, 'approvedUsers', userDoc.id))
  const freshUser = freshSnap.data()
  if (!freshUser) return null

  if (!freshUser.password) return null
  if (password !== freshUser.password) return null
  if (!canUserLogin(freshUser)) return null

  return { ...freshUser, id: userDoc.id }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(SESSION_KEY)
      if (stored) setUser(JSON.parse(stored))
    } catch {
      sessionStorage.removeItem(SESSION_KEY)
    }
    setIsLoading(false)
  }, [])

  const loginWithEmail = async (email: string, password: string) => {
    const normalizedEmail = email.trim().toLowerCase()
    if (!password) throw new Error('Password required')

    const approvedUser = await validateUserCredentials(normalizedEmail, password)
    if (!approvedUser) throw new Error('Invalid email or password. Please try again.')

    if (approvedUser.role !== 'admin' && approvedUser.role !== 'qc') {
      throw new Error('This portal is restricted to Admin and QC accounts.')
    }

    const loggedInUser: AuthUser = {
      id: approvedUser.id,
      name: approvedUser.name ?? '',
      email: approvedUser.email ?? normalizedEmail,
      role: approvedUser.role,
      permissions: approvedUser.permissions?.length
        ? approvedUser.permissions
        : getRolePermissions(approvedUser.role),
      zoneNumber: approvedUser.zoneNumber,
      employeeCode: approvedUser.employeeCode,
      isActive: approvedUser.isActive,
    }

    setUser(loggedInUser)
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(loggedInUser))
  }

  const logout = async () => {
    setUser(null)
    sessionStorage.removeItem(SESSION_KEY)
  }

  return (
    <AuthContext.Provider value={{ user, loginWithEmail, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  )
}


// import React, { createContext, useContext, useState, useEffect } from 'react'

// export type UserRole = 'admin' | 'qc' | 'pmc_member' | 'commissioner' | 'action_officer'

// export interface AuthUser {
//   id: string
//   name: string
//   email: string
//   role: UserRole
//   permissions: string[]
//   zoneNumber?: string
//   employeeCode?: string
// }

// interface AuthContextType {
//   user: AuthUser | null
//   loginWithEmail: (email: string, password?: string) => Promise<void>
//   logout: () => Promise<void>
//   isLoading: boolean
// }

// const SESSION_KEY = 'tf_session_user'

// const HARDCODED_USERS: Record<string, { password: string; user: AuthUser }> = {
//   'admin@system.local': {
//     password: 'admin123',
//     user: {
//       id: '44XcqJInlkZiuLwxEztuZEgJQzZ2',
//       name: 'System Administrator',
//       email: 'admin@system.local',
//       role: 'admin',
//       permissions: [
//         'view_reports', 'create_reports', 'edit_reports', 'delete_reports',
//         'approve_reports', 'view_teams', 'manage_teams', 'assign_team_members',
//         'view_feeder_points', 'assign_feeder_points', 'manage_feeder_points',
//         'view_analytics', 'export_data', 'manage_users', 'system_settings',
//         'audit_logs', 'manage_access_requests',
//       ],
//     },
//   },
//   'admin': {
//     password: 'admin123',
//     user: {
//       id: '44XcqJInlkZiuLwxEztuZEgJQzZ2',
//       name: 'System Administrator',
//       email: 'admin@system.local',
//       role: 'admin',
//       permissions: [
//         'view_reports', 'create_reports', 'edit_reports', 'delete_reports',
//         'approve_reports', 'view_teams', 'manage_teams', 'assign_team_members',
//         'view_feeder_points', 'assign_feeder_points', 'manage_feeder_points',
//         'view_analytics', 'export_data', 'manage_users', 'system_settings',
//         'audit_logs', 'manage_access_requests',
//       ],
//     },
//   },
//   'qc@system.local': {
//     password: 'qc@123',
//     user: {
//       id: 'qc-1',
//       name: 'QC Officer',
//       email: 'qc@system.local',
//       role: 'qc',
//       permissions: [
//         'view_reports', 'create_reports', 'edit_reports', 'approve_reports',
//         'view_teams', 'manage_teams', 'view_feeder_points', 'assign_feeder_points',
//         'manage_feeder_points', 'view_analytics', 'manage_users', 'manage_access_requests',
//       ],
//     },
//   },
//   'qc': {
//     password: 'qc@123',
//     user: {
//       id: 'qc-1',
//       name: 'QC Officer',
//       email: 'qc@system.local',
//       role: 'qc',
//       permissions: [
//         'view_reports', 'create_reports', 'edit_reports', 'approve_reports',
//         'view_teams', 'manage_teams', 'view_feeder_points', 'assign_feeder_points',
//         'manage_feeder_points', 'view_analytics', 'manage_users', 'manage_access_requests',
//       ],
//     },
//   },
//   'iswm.pmc@gmail.com': {
//     password: 'pmc789@#',
//     user: {
//       id: 'pmc-1',
//       name: 'PMC Member',
//       email: 'iswm.pmc@gmail.com',
//       role: 'pmc_member',
//       permissions: ['view_pmc_reports'],
//     },
//   },
// }

// const AuthContext = createContext<AuthContextType | undefined>(undefined)

// export const useAuth = () => {
//   const ctx = useContext(AuthContext)
//   if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
//   return ctx
// }

// export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
//   const [user, setUser] = useState<AuthUser | null>(null)
//   const [isLoading, setIsLoading] = useState(true)

//   useEffect(() => {
//     try {
//       const stored = sessionStorage.getItem(SESSION_KEY)
//       if (stored) setUser(JSON.parse(stored))
//     } catch {
//       sessionStorage.removeItem(SESSION_KEY)
//     }
//     setIsLoading(false)
//   }, [])

//   const loginWithEmail = async (email: string, password?: string) => {
//     const key = email.trim().toLowerCase()
//     const entry = HARDCODED_USERS[key]

//     if (!entry) throw new Error('Invalid credentials')
//     if (password && password !== entry.password) throw new Error('Invalid credentials')

//     setUser(entry.user)
//     sessionStorage.setItem(SESSION_KEY, JSON.stringify(entry.user))
//   }

//   const logout = async () => {
//     setUser(null)
//     sessionStorage.removeItem(SESSION_KEY)
//   }

//   return (
//     <AuthContext.Provider value={{ user, loginWithEmail, logout, isLoading }}>
//       {children}
//     </AuthContext.Provider>
//   )
// }