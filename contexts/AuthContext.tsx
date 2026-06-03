import React, { createContext, useContext, useState, useEffect } from 'react'

export type UserRole = 'admin' | 'qc' | 'pmc_member' | 'commissioner' | 'action_officer'

export interface AuthUser {
  id: string
  name: string
  email: string
  role: UserRole
  permissions: string[]
  zoneNumber?: string
  employeeCode?: string
}

interface AuthContextType {
  user: AuthUser | null
  loginWithEmail: (email: string, password?: string) => Promise<void>
  logout: () => Promise<void>
  isLoading: boolean
}

const SESSION_KEY = 'tf_session_user'

const HARDCODED_USERS: Record<string, { password: string; user: AuthUser }> = {
  'admin@system.local': {
    password: 'admin123',
    user: {
      id: '44XcqJInlkZiuLwxEztuZEgJQzZ2',
      name: 'System Administrator',
      email: 'admin@system.local',
      role: 'admin',
      permissions: [
        'view_reports', 'create_reports', 'edit_reports', 'delete_reports',
        'approve_reports', 'view_teams', 'manage_teams', 'assign_team_members',
        'view_feeder_points', 'assign_feeder_points', 'manage_feeder_points',
        'view_analytics', 'export_data', 'manage_users', 'system_settings',
        'audit_logs', 'manage_access_requests',
      ],
    },
  },
  'admin': {
    password: 'admin123',
    user: {
      id: '44XcqJInlkZiuLwxEztuZEgJQzZ2',
      name: 'System Administrator',
      email: 'admin@system.local',
      role: 'admin',
      permissions: [
        'view_reports', 'create_reports', 'edit_reports', 'delete_reports',
        'approve_reports', 'view_teams', 'manage_teams', 'assign_team_members',
        'view_feeder_points', 'assign_feeder_points', 'manage_feeder_points',
        'view_analytics', 'export_data', 'manage_users', 'system_settings',
        'audit_logs', 'manage_access_requests',
      ],
    },
  },
  'qc@system.local': {
    password: 'qc@123',
    user: {
      id: 'qc-1',
      name: 'QC Officer',
      email: 'qc@system.local',
      role: 'qc',
      permissions: [
        'view_reports', 'create_reports', 'edit_reports', 'approve_reports',
        'view_teams', 'manage_teams', 'view_feeder_points', 'assign_feeder_points',
        'manage_feeder_points', 'view_analytics', 'manage_users', 'manage_access_requests',
      ],
    },
  },
  'qc': {
    password: 'qc@123',
    user: {
      id: 'qc-1',
      name: 'QC Officer',
      email: 'qc@system.local',
      role: 'qc',
      permissions: [
        'view_reports', 'create_reports', 'edit_reports', 'approve_reports',
        'view_teams', 'manage_teams', 'view_feeder_points', 'assign_feeder_points',
        'manage_feeder_points', 'view_analytics', 'manage_users', 'manage_access_requests',
      ],
    },
  },
  'iswm.pmc@gmail.com': {
    password: 'pmc789@#',
    user: {
      id: 'pmc-1',
      name: 'PMC Member',
      email: 'iswm.pmc@gmail.com',
      role: 'pmc_member',
      permissions: ['view_pmc_reports'],
    },
  },
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
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

  const loginWithEmail = async (email: string, password?: string) => {
    const key = email.trim().toLowerCase()
    const entry = HARDCODED_USERS[key]

    if (!entry) throw new Error('Invalid credentials')
    if (password && password !== entry.password) throw new Error('Invalid credentials')

    setUser(entry.user)
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(entry.user))
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