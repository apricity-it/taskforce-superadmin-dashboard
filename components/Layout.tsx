import { ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import {
  Activity,
  BarChart3,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Database,
  FileText,
  LayoutDashboard,
  LineChartIcon,
  LogOut,
  MapPin,
  Menu,
  MessageSquare,
  Moon,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  UserCheck,
  UserPlus,
  Users,
  X,
  Zap,
} from 'lucide-react'

import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'
import NotificationBell, { MissingReportBadge } from '@/components/NotificationBell'

interface LayoutProps {
  children: ReactNode
}

type Role = 'admin' | 'qc' | 'pmc_member' | 'commissioner' | 'action_officer'

type NavItem = {
  name: string
  href: string
  icon: any
  roles: Role[]
}

const allNavigation: NavItem[] = [
  { name: 'Dashboard',             href: '/',                    icon: LayoutDashboard, roles: ['admin', 'pmc_member', 'qc', 'commissioner', 'action_officer'] },
  { name: 'Master',                href: '/master',              icon: Database,        roles: ['admin'] },
  { name: 'Users',                 href: '/users',               icon: Users,           roles: ['admin', 'qc'] },
  { name: 'Access Requests',       href: '/access-requests',     icon: UserCheck,       roles: ['admin', 'qc'] },
  { name: 'Feeder Points',         href: '/feeder-points',       icon: Activity,        roles: ['admin', 'qc', 'pmc_member', 'commissioner'] },
  { name: 'Chronic Points',        href: '/chronic-points',      icon: Zap,             roles: ['admin', 'qc', 'pmc_member', 'commissioner'] },
  { name: 'Chronic Monitoring',    href: '/chronic-monitoring',  icon: LineChartIcon,   roles: ['admin', 'qc', 'action_officer'] },
  { name: 'Feeder Point Requests', href: '/feeder-point-requests', icon: MapPin,        roles: ['admin', 'qc'] },
  { name: 'Frequency Requests',    href: '/frequency-requests',  icon: RefreshCw,       roles: ['admin', 'qc'] },
  { name: 'Daily Reports',         href: '/daily-reports',       icon: FileText,        roles: ['admin', 'qc', 'pmc_member', 'commissioner'] },
  { name: 'Report Review',         href: '/report-review',       icon: ClipboardList,   roles: ['admin', 'qc', 'action_officer'] },
  { name: 'Employee Tracker',      href: '/employee-tracker',    icon: BarChart3,       roles: ['admin', 'qc'] },
  { name: 'Improvement Summary',   href: '/improvement-summary', icon: Sparkles,        roles: ['admin'] },
  { name: 'PMC Employees',         href: '/pmc-employees',       icon: UserPlus,        roles: ['admin'] },
  { name: 'PMC Employee Work',     href: '/pmc-employee-action', icon: ClipboardCheck,  roles: ['admin', 'pmc_member'] },
  { name: 'Complaints',            href: '/complaints',          icon: MessageSquare,   roles: ['admin'] },
  { name: 'Settings',              href: '/settings',            icon: Settings,        roles: ['admin'] },
]

const qcDashboardOverride: Record<string, string> = {
  '/': '/qc/dashboard',
}

const roleLabels: Record<Role, { label: string; color: string; soft: string }> = {
  admin: {
    label: 'Super Admin',
    color: 'from-violet-500 to-purple-600',
    soft: 'border-violet-400/20 bg-violet-500/10 text-violet-400',
  },
  qc: {
    label: 'QC Panel',
    color: 'from-teal-500 to-emerald-600',
    soft: 'border-emerald-400/20 bg-emerald-500/10 text-emerald-400',
  },
  pmc_member: {
    label: 'PMC Member',
    color: 'from-blue-500 to-indigo-600',
    soft: 'border-blue-400/20 bg-blue-500/10 text-blue-400',
  },
  commissioner: {
    label: 'Commissioner',
    color: 'from-amber-500 to-orange-600',
    soft: 'border-amber-400/20 bg-amber-500/10 text-amber-400',
  },
  action_officer: {
    label: 'Action Officer',
    color: 'from-rose-500 to-red-600',
    soft: 'border-rose-400/20 bg-rose-500/10 text-rose-400',
  },
}

const navGroups = [
  {
    title: 'Core',
    items: ['Dashboard', 'Master', 'Users', 'Access Requests'],
  },
  {
    title: 'Operations',
    items: [
      'Feeder Points',
      'Chronic Points',
      'Chronic Monitoring',
      'Feeder Point Requests',
      'Frequency Requests',
      'Daily Reports',
      'Report Review',
    ],
  },
  {
    title: 'People & Reports',
    items: [
      'Employee Tracker',
      'Improvement Summary',
      'PMC Employees',
      'PMC Employee Work',
      'Complaints',
      'Settings',
    ],
  },
]

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

function isActiveRoute(currentPath: string, itemHref: string) {
  if (itemHref === '/' || itemHref === '/qc/dashboard') return currentPath === itemHref
  return currentPath === itemHref || currentPath.startsWith(`${itemHref}/`)
}

export default function Layout({ children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarExpanded, setSidebarExpanded] = useState(false)

  const router = useRouter()
  const { user, logout } = useAuth()
  const { theme, toggleTheme, mounted } = useTheme()
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Use role directly from AuthUser — no remapping needed
  const role: Role = (user?.role as Role) ?? 'admin'
  const roleInfo = roleLabels[role] ?? roleLabels['admin']

  const navigationItems = useMemo(() => {
    return allNavigation
      .filter(item => item.roles.includes(role))
      .map(item => ({
        ...item,
        href: role === 'qc' && qcDashboardOverride[item.href]
          ? qcDashboardOverride[item.href]
          : item.href,
      }))
  }, [role])

  const groupedNavigation = useMemo(() => {
    return navGroups
      .map(group => ({
        ...group,
        items: group.items
          .map(name => navigationItems.find(item => item.name === name))
          .filter(Boolean) as NavItem[],
      }))
      .filter(group => group.items.length > 0)
  }, [navigationItems])

  const initials = user?.name
    ? user.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
    : 'U'

  const handleLogout = async () => {
    await logout()
    router.push('/login')
  }

  useEffect(() => {
    setSidebarOpen(false)
  }, [router.pathname])

  const handleSidebarMouseEnter = () => {
    hoverTimerRef.current = setTimeout(() => setSidebarExpanded(true), 90)
  }

  const handleSidebarMouseLeave = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    setSidebarExpanded(false)
  }

  return (
    <div className="tf-app-bg relative flex h-screen overflow-hidden font-sans text-[var(--tf-text)]">
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="tf-grid-bg absolute inset-0 opacity-40" />
        <div className="absolute -left-32 top-24 h-96 w-96 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="absolute -right-32 top-48 h-96 w-96 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-80 w-80 rounded-full bg-cyan-400/5 blur-3xl" />
      </div>

      {sidebarOpen && (
        <button
          aria-label="Close sidebar overlay"
          className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={cx(
          'tf-sidebar fixed inset-y-0 left-0 z-50 flex w-72 transform flex-col transition-transform duration-300 ease-out lg:hidden',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <MobileSidebarContent
          currentPath={router.pathname}
          groupedItems={groupedNavigation}
          user={user}
          roleInfo={roleInfo}
          initials={initials}
          onClose={() => setSidebarOpen(false)}
          onLogout={handleLogout}
        />
      </aside>

      {/* Desktop sidebar */}
      <aside
        onMouseEnter={handleSidebarMouseEnter}
        onMouseLeave={handleSidebarMouseLeave}
        className={cx(
          'tf-sidebar fixed inset-y-0 left-0 z-30 hidden flex-col transition-all duration-300 ease-in-out lg:flex',
          sidebarExpanded ? 'w-72' : 'w-[78px]'
        )}
      >
        <DesktopSidebarContent
          currentPath={router.pathname}
          groupedItems={groupedNavigation}
          user={user}
          roleInfo={roleInfo}
          initials={initials}
          expanded={sidebarExpanded}
          onLogout={handleLogout}
        />
      </aside>

      <div
        className={cx(
          'relative z-10 flex min-h-0 min-w-0 flex-1 flex-col transition-all duration-300 ease-in-out',
          sidebarExpanded ? 'lg:pl-72' : 'lg:pl-[78px]'
        )}
      >
        <header className="tf-topbar sticky top-0 z-20 flex h-[72px] items-center px-4 sm:px-6">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="tf-icon-btn mr-3 lg:hidden"
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="min-w-0 flex-1">
            <PageTitle path={router.pathname} items={navigationItems} roleInfo={roleInfo} />
          </div>

          <div className="ml-4 flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              className="hidden min-w-40 items-center gap-2 rounded-2xl border border-[var(--tf-border)] bg-[var(--tf-input-bg)] px-3 py-2 text-sm text-[var(--tf-muted)] hover:border-[var(--tf-border-strong)] hover:bg-[var(--tf-primary-soft)] sm:flex lg:min-w-56"
            >
              <Search className="h-4 w-4 flex-shrink-0 text-[var(--tf-muted-2)]" />
              <span className="truncate text-xs">Search reports, users...</span>
              <kbd className="ml-auto rounded-md border border-[var(--tf-border)] bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-[var(--tf-muted-2)]">
                Ctrl K
              </kbd>
            </button>

            <button
              type="button"
              onClick={toggleTheme}
              className="tf-icon-btn"
              aria-label="Toggle theme"
            >
              {mounted && theme === 'dark' ? (
                <Sun className="h-5 w-5" />
              ) : (
                <Moon className="h-5 w-5" />
              )}
            </button>

            <MissingReportBadge />
            <NotificationBell />

            <div className="hidden h-7 w-px bg-[var(--tf-border)] sm:block" />

            <button
              type="button"
              className="hidden items-center gap-2.5 rounded-2xl border border-[var(--tf-border)] bg-[var(--tf-input-bg)] py-1.5 pl-1.5 pr-3 hover:border-[var(--tf-border-strong)] hover:bg-[var(--tf-primary-soft)] sm:flex"
            >
              <div
                className={cx(
                  'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-xs font-black text-white shadow-lg',
                  roleInfo.color
                )}
              >
                {initials}
              </div>
              <div className="min-w-0 text-left">
                <p className="truncate text-xs font-bold leading-none text-[var(--tf-text)]">
                  {user?.name ?? 'User'}
                </p>
                <p className="mt-1 truncate text-[10px] leading-none text-[var(--tf-muted)]">
                  {roleInfo.label}
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="tf-icon-btn hover:border-red-400/30 hover:bg-red-500/10 hover:text-red-400"
              title="Logout"
              aria-label="Logout"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
            <div className="tf-page-enter">{children}</div>
          </div>
        </main>
      </div>
    </div>
  )
}

function DesktopSidebarContent({
  currentPath, groupedItems, user, roleInfo, initials, expanded, onLogout,
}: {
  currentPath: string
  groupedItems: Array<{ title: string; items: NavItem[] }>
  user: any
  roleInfo: { label: string; color: string; soft: string }
  initials: string
  expanded: boolean
  onLogout: () => void
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[72px] flex-shrink-0 items-center overflow-hidden border-b border-[var(--tf-border)] px-4">
        <Link href="/" className="flex min-w-0 items-center gap-3">
          <div className="relative flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-cyan-400/20 to-blue-600/20 shadow-lg shadow-cyan-400/10">
            <div className="absolute inset-0 rounded-2xl bg-cyan-400/10 blur-md" />
            <ShieldCheck className="relative h-6 w-6 text-cyan-400" />
          </div>
          <div className={cx('overflow-hidden transition-all duration-300', expanded ? 'w-44 opacity-100' : 'w-0 opacity-0')}>
            <p className="whitespace-nowrap text-base font-black tracking-tight text-[var(--tf-text)]">Taskforce</p>
            <p className="whitespace-nowrap text-[11px] font-medium text-[var(--tf-muted)]">{roleInfo.label}</p>
          </div>
        </Link>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto overflow-x-hidden px-3 py-4">
        {groupedItems.map(group => (
          <div key={group.title}>
            <p className={cx('mb-2 px-3 text-[10px] font-black uppercase tracking-[0.22em] text-[var(--tf-muted-2)] transition-all duration-300', expanded ? 'opacity-100' : 'opacity-0')}>
              {group.title}
            </p>
            <div className="space-y-1">
              {group.items.map(item => {
                const Icon = item.icon
                const isActive = isActiveRoute(currentPath, item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={!expanded ? item.name : undefined}
                    className={cx(
                      'group relative flex h-11 items-center overflow-hidden rounded-2xl transition-all duration-200',
                      isActive
                        ? 'bg-cyan-400/10 text-cyan-400 ring-1 ring-cyan-400/20'
                        : 'text-[var(--tf-muted)] hover:bg-[var(--tf-hover)] hover:text-[var(--tf-text)]'
                    )}
                  >
                    {isActive && (
                      <span className="absolute left-0 top-1/2 h-7 w-1 -translate-y-1/2 rounded-r-full bg-cyan-400 shadow-[0_0_18px_rgba(34,211,238,0.8)]" />
                    )}
                    <span className={cx('flex h-11 w-11 flex-shrink-0 items-center justify-center', isActive ? 'text-cyan-400' : 'text-[var(--tf-muted-2)] group-hover:text-cyan-400')}>
                      <Icon className="h-[18px] w-[18px]" />
                    </span>
                    <span className={cx('whitespace-nowrap text-sm font-semibold transition-all duration-300', expanded ? 'max-w-[180px] opacity-100' : 'max-w-0 opacity-0')}>
                      {item.name}
                    </span>
                    {isActive && expanded && (
                      <ChevronRight className="ml-auto mr-3 h-3.5 w-3.5 flex-shrink-0 text-cyan-400" />
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="flex-shrink-0 border-t border-[var(--tf-border)] p-3">
        <div className="flex items-center gap-3 rounded-2xl border border-[var(--tf-border)] bg-[var(--tf-input-bg)] p-2">
          <div className={cx('flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-xs font-black text-white', roleInfo.color)}>
            {initials}
          </div>
          <div className={cx('min-w-0 overflow-hidden transition-all duration-300', expanded ? 'w-36 opacity-100' : 'w-0 opacity-0')}>
            <p className="truncate whitespace-nowrap text-xs font-bold text-[var(--tf-text)]">{user?.name ?? 'User'}</p>
            <p className="truncate whitespace-nowrap text-[10px] text-[var(--tf-muted)]">{roleInfo.label}</p>
          </div>
          <button
            type="button"
            onClick={onLogout}
            title="Logout"
            className={cx('ml-auto flex-shrink-0 rounded-xl p-2 text-[var(--tf-muted)] hover:bg-red-500/10 hover:text-red-400', expanded ? 'opacity-100' : 'pointer-events-none opacity-0')}
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

function MobileSidebarContent({
  currentPath, groupedItems, user, roleInfo, initials, onClose, onLogout,
}: {
  currentPath: string
  groupedItems: Array<{ title: string; items: NavItem[] }>
  user: any
  roleInfo: { label: string; color: string; soft: string }
  initials: string
  onClose: () => void
  onLogout: () => void
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[72px] flex-shrink-0 items-center justify-between border-b border-[var(--tf-border)] px-4">
        <div className="flex items-center gap-3">
          <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-cyan-400/20 to-blue-600/20">
            <ShieldCheck className="h-6 w-6 text-cyan-400" />
          </div>
          <div>
            <p className="text-base font-black text-[var(--tf-text)]">Taskforce</p>
            <p className="text-[11px] text-[var(--tf-muted)]">{roleInfo.label}</p>
          </div>
        </div>
        <button type="button" onClick={onClose} className="tf-icon-btn">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="mx-3 mt-4 rounded-2xl border border-[var(--tf-border)] bg-[var(--tf-input-bg)] p-3">
        <div className="flex items-center gap-3">
          <div className={cx('flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br text-sm font-black text-white shadow-lg', roleInfo.color)}>
            {initials}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-[var(--tf-text)]">{user?.name ?? 'User'}</p>
            <span className={cx('mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold', roleInfo.soft)}>
              {roleInfo.label}
            </span>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {groupedItems.map(group => (
          <div key={group.title}>
            <p className="mb-2 px-3 text-[10px] font-black uppercase tracking-[0.22em] text-[var(--tf-muted-2)]">
              {group.title}
            </p>
            <div className="space-y-1">
              {group.items.map(item => {
                const Icon = item.icon
                const isActive = isActiveRoute(currentPath, item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    className={cx(
                      'flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold transition-all duration-200',
                      isActive
                        ? 'bg-cyan-400/10 text-cyan-400 ring-1 ring-cyan-400/20'
                        : 'text-[var(--tf-muted)] hover:bg-[var(--tf-hover)] hover:text-[var(--tf-text)]'
                    )}
                  >
                    <Icon className={cx('h-[18px] w-[18px] flex-shrink-0', isActive ? 'text-cyan-400' : 'text-[var(--tf-muted-2)]')} />
                    <span className="flex-1 truncate">{item.name}</span>
                    {isActive && <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-cyan-400" />}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="flex-shrink-0 border-t border-[var(--tf-border)] p-3">
        <button
          type="button"
          onClick={onLogout}
          className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-sm font-bold text-red-400 hover:bg-red-500/10"
        >
          <LogOut className="h-[18px] w-[18px]" />
          Logout
        </button>
      </div>
    </div>
  )
}

function PageTitle({
  path, items, roleInfo,
}: {
  path: string
  items: NavItem[]
  roleInfo: { label: string; color: string; soft: string }
}) {
  const current = items.find(item => isActiveRoute(path, item.href))
  const CurrentIcon = current?.icon || ShieldCheck

  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="hidden h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-400 sm:flex">
        <CurrentIcon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="truncate text-base font-black tracking-tight text-[var(--tf-text)] sm:text-lg">
            {current?.name ?? 'Taskforce Command Center'}
          </h1>
          <span className={cx('hidden rounded-full border px-2 py-0.5 text-[10px] font-bold sm:inline-flex', roleInfo.soft)}>
            {roleInfo.label}
          </span>
        </div>
        <p className="mt-0.5 hidden truncate text-[11px] font-medium text-[var(--tf-muted)] sm:block">
          Feeder & Chronic Points Inspection System — Pune
        </p>
      </div>
    </div>
  )
}