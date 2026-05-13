import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import {
  LayoutDashboard, Users, UserCheck, MessageSquare, Shield,
  Activity, MapPin, Settings, LogOut, Menu, X, Bell,
  FileText, BarChart3, Sparkles, ClipboardCheck, UserPlus,
  Database, RefreshCw, ClipboardList, ChevronRight,
  Search, Sun, Moon, Zap,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import NotificationBell, { MissingReportBadge } from '@/components/NotificationBell'


interface LayoutProps {
  children: React.ReactNode
}

const allNavigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard, roles: ['superadmin', 'pmc_member', 'qc'] },
  { name: 'Master', href: '/master', icon: Database, roles: ['superadmin'] },
  { name: 'Users', href: '/users', icon: Users, roles: ['superadmin', 'qc'] },
  { name: 'Access Requests', href: '/access-requests', icon: UserCheck, roles: ['superadmin', 'qc', 'pmc_member'] },
  { name: 'Feeder Points', href: '/feeder-points', icon: Activity, roles: ['superadmin', 'qc', 'pmc_member'] },
  { name: 'Chronic Points', href: '/chronic-points', icon: Zap, roles: ['superadmin', 'qc', 'pmc_member'] },
  { name: 'Feeder Point Requests', href: '/feeder-point-requests', icon: MapPin, roles: ['superadmin', 'qc', 'pmc_member'] },
  { name: 'Frequency Requests', href: '/frequency-requests', icon: RefreshCw, roles: ['superadmin', 'qc'] },
  { name: 'Daily Reports', href: '/daily-reports', icon: FileText, roles: ['superadmin', 'qc', 'pmc_member'] },
  { name: 'Report Review', href: '/report-review', icon: ClipboardList, roles: ['superadmin', 'qc'] },
  { name: 'Employee Tracker', href: '/employee-tracker', icon: BarChart3, roles: ['superadmin', 'qc'] },
  { name: 'Improvement Summary', href: '/improvement-summary', icon: Sparkles, roles: ['superadmin'] },
  { name: 'PMC Employees', href: '/pmc-employees', icon: UserPlus, roles: ['superadmin'] },
  { name: 'PMC Employee Work', href: '/pmc-employee-action', icon: ClipboardCheck, roles: ['superadmin', 'pmc_member'] },
  { name: 'Complaints', href: '/complaints', icon: MessageSquare, roles: ['superadmin'] },
  { name: 'Settings', href: '/settings', icon: Settings, roles: ['superadmin'] },
]

// QC gets its own dashboard route
const qcDashboardOverride: Record<string, string> = {
  '/': '/qc/dashboard',
}

const roleLabels: Record<string, { label: string; color: string }> = {
  superadmin: { label: 'Super Admin', color: 'from-violet-500 to-purple-600' },
  qc: { label: 'QC Panel', color: 'from-teal-500 to-emerald-600' },
  pmc_member: { label: 'PMC Member', color: 'from-blue-500 to-indigo-600' },
}

export default function Layout({ children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)   // mobile drawer
  const [sidebarExpanded, setSidebarExpanded] = useState(false) // desktop hover expand
  const [dark, setDark] = useState(false)
  const router = useRouter()
  const { user, logout } = useAuth()
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const roleMap: Record<string, string> = {
    admin: 'superadmin',
    superadmin: 'superadmin',
    qc: 'qc',
    pmc_member: 'pmc_member',
  }

  const normalizedUserRole =
    typeof user?.role === 'string' ? user.role.toLowerCase() : ''

  const role = roleMap[normalizedUserRole] || 'superadmin'

  const navigationItems = allNavigation
    .filter(item => item.roles.includes(role))
    .map(item => ({
      ...item,
      href: role === 'qc' && qcDashboardOverride[item.href]
        ? qcDashboardOverride[item.href]
        : item.href,
    }))

  const handleLogout = async () => {
    await logout()
    router.push('/login')
  }

  // Close mobile sidebar on route change
  useEffect(() => {
    setSidebarOpen(false)
  }, [router.pathname])

  const handleSidebarMouseEnter = () => {
    hoverTimerRef.current = setTimeout(() => setSidebarExpanded(true), 80)
  }
  const handleSidebarMouseLeave = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    setSidebarExpanded(false)
  }

  const roleInfo = roleLabels[role] ?? roleLabels['superadmin']
  const initials = user?.name
    ? user.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
    : 'U'

  const theme: Record<string, {
    activeBg: string
    activeText: string
    icon: string
    indicator: string
  }> = {
    superadmin: {
      activeBg: 'from-violet-500/10 to-purple-500/5',
      activeText: 'text-violet-700',
      icon: 'text-violet-600',
      indicator: 'from-violet-500 to-purple-500'
    },
    qc: {
      activeBg: 'from-teal-500/10 to-emerald-500/5',
      activeText: 'text-teal-700',
      icon: 'text-teal-600',
      indicator: 'from-teal-500 to-emerald-500'
    },
    pmc_member: {
      activeBg: 'from-blue-500/10 to-indigo-500/5',
      activeText: 'text-blue-700',
      icon: 'text-blue-600',
      indicator: 'from-blue-500 to-indigo-500'
    }
  }

  const currentTheme = theme[role] || theme['superadmin']

  return (
    <div className={`h-screen flex overflow-hidden bg-[#f4f6fb] font-sans ${dark ? 'dark' : ''}`}>

      {/* ── MOBILE OVERLAY ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-gray-900/60 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── MOBILE DRAWER ── */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-72 flex flex-col
          bg-white border-r border-gray-100 shadow-2xl
          transform transition-transform duration-300 ease-out
          lg:hidden
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <MobileSidebarContent
          currentPath={router.pathname}
          items={navigationItems}
          user={user}
          roleInfo={roleInfo}
          initials={initials}
          onClose={() => setSidebarOpen(false)}
          onLogout={handleLogout}
          currentTheme={currentTheme}
        />
      </aside>

      {/* ── DESKTOP SIDEBAR (icon-only → hover expand) ── */}
      <aside
        onMouseEnter={handleSidebarMouseEnter}
        onMouseLeave={handleSidebarMouseLeave}
        className={`
          hidden lg:flex flex-col fixed inset-y-0 left-0 z-30
          bg-white border-r border-gray-100
          shadow-[4px_0_24px_rgba(0,0,0,0.06)]
          transition-all duration-300 ease-in-out
          ${sidebarExpanded ? 'w-64' : 'w-[70px]'}
        `}
      >
        <DesktopSidebarContent
          currentPath={router.pathname}
          items={navigationItems}
          user={user}
          roleInfo={roleInfo}
          initials={initials}
          expanded={sidebarExpanded}
          onLogout={handleLogout}
          currentTheme={currentTheme}
        />
      </aside>

      {/* ── MAIN AREA ── */}
      <div
        className={`
    flex flex-col flex-1 min-w-0 min-h-0
    transition-all duration-300 ease-in-out
    ${sidebarExpanded ? 'lg:pl-64' : 'lg:pl-[70px]'}
  `}
      >
        {/* ── TOP BAR ── */}
        <header className="sticky top-0 z-20 flex items-center h-16 px-4 sm:px-6
          bg-white/80 backdrop-blur-md border-b border-gray-100
          shadow-[0_1px_12px_rgba(0,0,0,0.06)]">

          {/* Hamburger (mobile) */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden mr-3 p-2 rounded-xl text-gray-500 hover:bg-gray-100 
              active:scale-95 transition-all"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Page title / breadcrumb */}
          <div className="flex-1 min-w-0">
            <PageTitle path={router.pathname} items={navigationItems} currentTheme={currentTheme} />
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-1 sm:gap-2 ml-4">

            {/* Search */}
            <button className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-xl
              bg-gray-50 border border-gray-200 text-gray-400 hover:border-gray-300
              hover:bg-gray-100 transition-all text-sm w-40 lg:w-52">
              <Search className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="text-xs truncate">Search…</span>
              <kbd className="ml-auto text-[10px] bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded-md font-mono">⌘K</kbd>
            </button>

            {/* Dark mode */}
            <button
              onClick={() => setDark(!dark)}
              className="p-2.5 rounded-xl text-gray-500 hover:bg-gray-100 hover:text-gray-700 
                transition-all active:scale-95"
            >
              {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <MissingReportBadge />
            {/* Notifications */}
            <NotificationBell />

            {/* Divider */}
            <div className="w-px h-6 bg-gray-200 mx-1" />

            {/* User pill */}
            <div className="flex items-center gap-2.5 pl-1 pr-3 py-1.5 rounded-xl
              bg-gray-50 border border-gray-200 cursor-pointer
              hover:border-gray-300 hover:bg-gray-100 transition-all group">
              <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${roleInfo.color}
                flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                {initials}
              </div>
              <div className="hidden sm:block min-w-0">
                <p className="text-xs font-semibold text-gray-800 truncate leading-none">
                  {user?.name ?? 'User'}
                </p>
                <p className="text-[10px] text-gray-400 truncate leading-none mt-0.5">
                  {roleInfo.label}
                </p>
              </div>
            </div>

            {/* Logout */}
            <button
              onClick={handleLogout}
              className="p-2.5 rounded-xl text-gray-500 hover:bg-red-50 hover:text-red-500
                transition-all active:scale-95"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* ── PAGE CONTENT ── */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}

// ─── Desktop Sidebar ────────────────────────────────────────────────────────

function DesktopSidebarContent({
  currentPath, items, user, roleInfo, initials, expanded, onLogout, currentTheme
}: {
  currentPath: string
  items: typeof allNavigation
  user: any
  roleInfo: { label: string; color: string }
  initials: string
  expanded: boolean
  onLogout: () => void
  currentTheme: {
    activeBg: string
    activeText: string
    icon: string
    indicator: string
  }
}) {
  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className={`flex items-center h-16 px-4 flex-shrink-0 border-b border-gray-100
        overflow-hidden transition-all duration-300`}>
        <div className={`flex-shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br ${roleInfo.color}
          flex items-center justify-center shadow-lg`}>
          <Zap className="w-4.5 h-4.5 text-white w-[18px] h-[18px]" />
        </div>
        <div className={`ml-3 overflow-hidden transition-all duration-300
          ${expanded ? 'w-40 opacity-100' : 'w-0 opacity-0'}`}>
          <p className="text-sm font-bold text-gray-900 whitespace-nowrap">Taskforce</p>
          <p className="text-[10px] text-gray-400 whitespace-nowrap">{roleInfo.label}</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-4 px-2 space-y-0.5">
        {items.map((item) => {
          const isActive = currentPath === item.href ||
            (item.href !== '/' && item.href !== '/qc/dashboard' && currentPath.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              title={!expanded ? item.name : undefined}
              className={`
                relative flex items-center h-10 rounded-xl overflow-hidden
                transition-all duration-150 group
                ${isActive
                  ? `bg-gradient-to-r ${currentTheme.activeBg} ${currentTheme.activeText}`
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
                }
              `}
            >
              {/* Active indicator */}
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 
                  bg-gradient-to-b ${currentTheme.indicator} rounded-r-full" />
              )}

              {/* Icon */}
              <span className={`flex-shrink-0 flex items-center justify-center w-10 h-10
                ${isActive ? currentTheme.icon : 'text-gray-400 group-hover:text-gray-700'}`}>
                <item.icon className="w-[18px] h-[18px]" />
              </span>

              {/* Label */}
              <span className={`text-sm font-medium whitespace-nowrap overflow-hidden
                transition-all duration-300
                ${expanded ? 'max-w-[160px] opacity-100 ml-0' : 'max-w-0 opacity-0'}`}>
                {item.name}
              </span>

              {/* Active chevron */}
              {isActive && expanded && (
                <ChevronRight className="ml-auto mr-3 w-3 h-3 ${currentTheme.icon} flex-shrink-0" />
              )}
            </Link>
          )
        })}
      </nav>

      {/* User footer */}
      <div className={`flex-shrink-0 border-t border-gray-100 p-3 overflow-hidden`}>
        <div className="flex items-center gap-3">
          <div className={`flex-shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br ${roleInfo.color}
            flex items-center justify-center text-white text-xs font-bold`}>
            {initials}
          </div>
          <div className={`min-w-0 overflow-hidden transition-all duration-300
            ${expanded ? 'w-28 opacity-100' : 'w-0 opacity-0'}`}>
            <p className="text-xs font-semibold text-gray-800 truncate whitespace-nowrap">
              {user?.name ?? 'User'}
            </p>
            <p className="text-[10px] text-gray-400 truncate whitespace-nowrap">{roleInfo.label}</p>
          </div>
          <button
            onClick={onLogout}
            title="Logout"
            className={`flex-shrink-0 p-1.5 rounded-lg text-gray-400 hover:bg-red-50 
              hover:text-red-500 transition-all ml-auto
              ${expanded ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Mobile Sidebar ───────────────────────────────────────────────────────────

function MobileSidebarContent({
  currentPath, items, user, roleInfo, initials, onClose, onLogout, currentTheme
}: {
  currentPath: string
  items: typeof allNavigation
  user: any
  roleInfo: { label: string; color: string }
  initials: string
  onClose: () => void
  onLogout: () => void
  currentTheme: {
    activeBg: string
    activeText: string
    icon: string
    indicator: string
  }
}) {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${roleInfo.color}
            flex items-center justify-center shadow-lg`}>
            <Zap className="w-[18px] h-[18px] text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900">Taskforce</p>
            <p className="text-[10px] text-gray-400">{roleInfo.label}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* User card */}
      <div className="mx-3 mt-4 p-3 rounded-2xl bg-gradient-to-r from-gray-50 to-gray-100 border border-gray-200">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${roleInfo.color}
            flex items-center justify-center text-white text-sm font-bold shadow-md`}>
            {initials}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-800 truncate">{user?.name ?? 'User'}</p>
            <span className={`inline-block text-[10px] font-medium text-white px-2 py-0.5 
              rounded-full bg-gradient-to-r ${roleInfo.color} mt-0.5`}>
              {roleInfo.label}
            </span>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {items.map((item) => {
          const isActive = currentPath === item.href ||
            (item.href !== '/' && item.href !== '/qc/dashboard' && currentPath.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={`
                flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
                transition-all duration-150
                ${isActive
                  ? `bg-gradient-to-r ${currentTheme.activeBg} ${currentTheme.activeText} shadow-sm`
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }
              `}
            >
              <span className={`flex-shrink-0 ${isActive ? currentTheme.icon : 'text-gray-400'}`}>
                <item.icon className="w-4.5 h-4.5 w-[18px] h-[18px]" />
              </span>
              <span className="flex-1 truncate">{item.name}</span>
              {isActive && <ChevronRight className="w-3.5 h-3.5 ${currentTheme.icon} flex-shrink-0" />}
            </Link>
          )
        })}
      </nav>

      {/* Logout */}
      <div className="flex-shrink-0 p-3 border-t border-gray-100">
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
            text-red-500 hover:bg-red-50 transition-all"
        >
          <LogOut className="w-[18px] h-[18px]" />
          Logout
        </button>
      </div>
    </div>
  )
}

// ─── Page Title ───────────────────────────────────────────────────────────────

function PageTitle({
  path,
  items,
  currentTheme
}: {
  path: string
  items: typeof allNavigation
  currentTheme: {
    activeBg: string
    activeText: string
    icon: string
    indicator: string
  }
}) {
  const current = items.find(item =>
    item.href !== '/' && item.href !== '/qc/dashboard'
      ? path.startsWith(item.href)
      : path === item.href
  )

  return (
    <div className="flex items-center gap-2 min-w-0">
      {current && (
        <div className={`hidden sm:flex w-7 h-7 rounded-lg bg-gradient-to-br ${currentTheme.activeBg}
  items-center justify-center flex-shrink-0`}>
          <current.icon className={`w-3.5 h-3.5 ${currentTheme.icon}`} />
        </div>
      )}
      <div className="min-w-0">
        <h1 className="text-sm sm:text-base font-semibold text-gray-900 truncate leading-none">
          {current?.name ?? 'Taskforce Command Center'}
        </h1>
        <p className="text-[10px] text-gray-400 truncate leading-none mt-0.5 hidden sm:block">
          Taskforce Command Center
        </p>
      </div>
    </div>
  )
}
