import { useEffect, useState, useMemo } from 'react'
import {
  Search, Filter, Download, Eye, Edit2, Trash2, X, MapPin, Calendar,
  FileText, TrendingUp, AlertTriangle, CheckCircle, Users, Shield,
  Activity, RefreshCw, Key, User as UserIcon, Phone, Mail,
  Building, ChevronDown, ChevronUp, Image as ImageIcon,
} from 'lucide-react'
import { DataService, User } from '@/lib/dataService'
import { useAuth } from '@/contexts/AuthContext'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTheme } from '@/contexts/ThemeContext'
import { getTokens } from '@/lib/dashboardTheme'
import * as XLSX from 'xlsx'

// ─── Helpers ──────────────────────────────────────────────────────────────────
function coerceDate(v: any): Date | null {
  if (!v) return null
  if (typeof v.toDate === 'function') return v.toDate()
  if (typeof v._seconds === 'number') return new Date(v._seconds * 1000)
  if (v instanceof Date) return v
  const d = new Date(v); return isNaN(d.getTime()) ? null : d
}
function fmtDate(v: any) { const d = coerceDate(v); return d ? d.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—' }

const ROLE_LABELS: Record<string,string> = {
  admin: 'Admin', task_force_team: 'Task Force', commissioner: 'Commissioner',
  pmc_member: 'PMC Member', qc: 'QC Officer', action_officer: 'Action Officer',
}
const ROLE_COLOR = (role: string, T: any): string => ({
  admin: T.red, task_force_team: T.accent, commissioner: T.purple,
  pmc_member: T.amber, qc: T.green, action_officer: T.gold,
}[role] ?? T.textMuted)

function Avatar({ user, size = 36, T }: { user: User; size?: number; T: any }) {
  const [imgErr, setImgErr] = useState(false)
  const photoUrl = (user as any).profileImageUrl || (user as any).profile?.photoUrl || (user as any).photoUrl
  if (photoUrl && !imgErr) {
    return <img src={photoUrl} alt={user.name} onError={() => setImgErr(true)}
      className="rounded-full object-cover flex-shrink-0"
      style={{ width: size, height: size, border: `2px solid ${T.cardBorder}` }} />
  }
  const initials = (user.name || '?').split(' ').map((n: string) => n[0]).slice(0,2).join('').toUpperCase()
  return (
    <div className="rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
      style={{ width: size, height: size, background: `${ROLE_COLOR(user.role, T)}20`, color: ROLE_COLOR(user.role, T), border: `2px solid ${T.cardBorder}` }}>
      {initials}
    </div>
  )
}

function SBadge({ label, color, T }: { label: string; color: string; T: any }) {
  return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap"
      style={{ background: `${color}18`, border: `1px solid ${color}30`, color }}>
      {label}
    </span>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function UsersPage() {
  const { user: currentUser } = useAuth()
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const T = getTokens(dark)
  const qc = useQueryClient()
  const isPmcMember = currentUser?.role === 'pmc_member'

  // ── Data ──
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (isPmcMember) { setLoading(false); return }
    const unsub = DataService.onUsersChange((d: User[]) => { setUsers(d); setLoading(false) })
    return () => unsub()
  }, [isPmcMember])

  // ── Filters ──
  const [search,       setSearch]       = useState('')
  const [roleF,        setRoleF]        = useState('all')
  const [statusF,      setStatusF]      = useState('all')
  const [orgF,         setOrgF]         = useState('all')
  const [deptF,        setDeptF]        = useState('all')
  const [sortBy,       setSortBy]       = useState('createdAt')
  const [sortDir,      setSortDir]      = useState<'asc'|'desc'>('desc')
  const [showFilters,  setShowFilters]  = useState(false)

  // ── Modals ──
  const [viewUser,     setViewUser]     = useState<User | null>(null)
  const [editUser,     setEditUser]     = useState<User | null>(null)
  const [showPwModal,  setShowPwModal]  = useState(false)

  // ── View modal data ──
  const [viewReports,  setViewReports]  = useState<any[]>([])
  const [viewFPs,      setViewFPs]      = useState<any[]>([])
  const [viewTab,      setViewTab]      = useState<'reports'|'fps'>('reports')
  const [viewLoading,  setViewLoading]  = useState(false)

  // ── Edit ──
  const [editSaving,   setEditSaving]   = useState(false)
  const [editPw,       setEditPw]       = useState('')
  const [editPwStatus, setEditPwStatus] = useState<{type:'success'|'error';msg:string}|null>(null)
  const [editPwUpdating,setEditPwUpdating] = useState(false)

  // ── Password reset ──
  const [pwSearch,     setPwSearch]     = useState('')
  const [pwResult,     setPwResult]     = useState<User | null>(null)
  const [pwNew,        setPwNew]        = useState('')
  const [pwStatus,     setPwStatus]     = useState<{type:'success'|'error';msg:string}|null>(null)
  const [pwSearching,  setPwSearching]  = useState(false)
  const [pwUpdating,   setPwUpdating]   = useState(false)

  // ── Derived ──
  const uniqueOrgs = useMemo(() => {
    const s = new Set<string>(); let hasEmpty = false
    users.forEach(u => { const v = u.organization?.trim(); if (v) s.add(v); else hasEmpty = true })
    const arr = Array.from(s).sort(); if (hasEmpty) arr.push('Unassigned'); return arr
  }, [users])

  const uniqueDepts = useMemo(() => {
    const s = new Set<string>(); let hasEmpty = false
    users.forEach(u => { const v = u.department?.trim(); if (v) s.add(v); else hasEmpty = true })
    const arr = Array.from(s).sort(); if (hasEmpty) arr.push('Unassigned'); return arr
  }, [users])

  const filtered = useMemo(() => {
    let list = [...users]
    const q = search.trim().toLowerCase()
    if (q) list = list.filter(u =>
      [u.name, u.email, u.phone, u.organization, u.department].some(v => (v||'').toLowerCase().includes(q))
    )
    if (roleF   !== 'all') list = list.filter(u => (u.role||'').toLowerCase().replace(/\s+/g,'_') === roleF)
    if (statusF !== 'all') list = list.filter(u => statusF === 'active' ? u.isActive : !u.isActive)
    if (orgF    !== 'all') list = list.filter(u => orgF === 'Unassigned' ? !u.organization?.trim() : u.organization?.trim() === orgF)
    if (deptF   !== 'all') list = list.filter(u => deptF === 'Unassigned' ? !u.department?.trim() : u.department?.trim() === deptF)
    list.sort((a, b) => {
      const str = (v?: string|null) => (v||'').toLowerCase()
      const dt  = (v: any) => { const d = coerceDate(v); return d ? d.getTime() : 0 }
      let av: string|number, bv: string|number
      switch (sortBy) {
        case 'name':         av = str(a.name);         bv = str(b.name);         break
        case 'email':        av = str(a.email);        bv = str(b.email);        break
        case 'role':         av = str(a.role);         bv = str(b.role);         break
        case 'organization': av = str(a.organization); bv = str(b.organization); break
        default:             av = dt(a.createdAt);     bv = dt(b.createdAt);     break
      }
      return av < bv ? (sortDir==='asc'?-1:1) : av > bv ? (sortDir==='asc'?1:-1) : 0
    })
    return list
  }, [users, search, roleF, statusF, orgF, deptF, sortBy, sortDir])

  const stats = useMemo(() => ({
    total:       users.length,
    active:      users.filter(u => u.isActive).length,
    inactive:    users.filter(u => !u.isActive).length,
    admin:       users.filter(u => u.role === 'admin').length,
    taskForce:   users.filter(u => u.role === 'task_force_team').length,
    commissioner:users.filter(u => u.role === 'commissioner').length,
    qc:          users.filter(u => u.role === 'qc').length,
  }), [users])

  const activeFilters = [search, roleF!=='all', statusF!=='all', orgF!=='all', deptF!=='all'].filter(Boolean).length

  // ── Handlers ──
  const handleViewUser = async (u: User) => {
    setViewUser(u); setViewTab('reports'); setViewReports([]); setViewFPs([])
    setViewLoading(true)
    try {
      const [reps, fps] = await Promise.all([DataService.getUserReports(u.id), DataService.getUserFeederPoints(u.id)])
      setViewReports(reps); setViewFPs(fps)
    } catch { setViewReports([]); setViewFPs([]) }
    finally { setViewLoading(false) }
  }

  // Reset pw state when opening edit drawer
  const openEditUser = (u: User) => { setEditUser({...u}); setEditPw(''); setEditPwStatus(null) }

  const handleEditPwUpdate = async () => {
    if (!editUser || !editPw.trim()) return
    setEditPwUpdating(true); setEditPwStatus(null)
    try {
      await DataService.updateUserPassword(editUser.id, editPw.trim())
      setEditPwStatus({ type:'success', msg:`Password updated for ${editUser.name}.` }); setEditPw('')
    } catch { setEditPwStatus({ type:'error', msg:'Update failed. Try again.' }) }
    finally { setEditPwUpdating(false) }
  }

  const handleSaveUser = async () => {
    if (!editUser) return; setEditSaving(true)
    try {
      await DataService.updateUser(editUser.id, editUser)
      const unsub = DataService.onUsersChange((d: User[]) => { setUsers(d); unsub() })
      setEditUser(null)
    } catch { alert('Error updating user.') }
    finally { setEditSaving(false) }
  }

  const handleDeleteUser = async (u: User) => {
    if (!confirm(`Delete "${u.name}"? This cannot be undone.`)) return
    try {
      await DataService.deleteUser(u.id)
      const unsub = DataService.onUsersChange((d: User[]) => { setUsers(d); unsub() })
    } catch { alert('Error deleting user.') }
  }

  const handlePwLookup = async () => {
    const name = pwSearch.trim(); setPwStatus(null); setPwResult(null); setPwNew('')
    if (!name) { setPwStatus({ type:'error', msg:'Enter a name to search.' }); return }
    setPwSearching(true)
    try {
      const local = users.filter(u => (u.name||'').trim().toLowerCase() === name.toLowerCase())
      if (local.length === 1) { setPwResult(local[0]); setPwStatus({ type:'success', msg:`Found: ${local[0].name}` }); return }
      if (local.length > 1) { setPwStatus({ type:'error', msg:'Multiple matches. Use exact full name.' }); return }
      const found = await DataService.findUserByName(name)
      if (!found) setPwStatus({ type:'error', msg:`No user found: "${name}"` })
      else { setPwResult(found); setPwStatus({ type:'success', msg:`Found: ${found.name}` }) }
    } catch { setPwStatus({ type:'error', msg:'Lookup failed. Try again.' }) }
    finally { setPwSearching(false) }
  }

  const handlePwUpdate = async () => {
    if (!pwResult || !pwNew.trim()) { setPwStatus({ type:'error', msg:'Enter a new password.' }); return }
    setPwUpdating(true); setPwStatus(null)
    try {
      await DataService.updateUserPassword(pwResult.id, pwNew.trim())
      setPwStatus({ type:'success', msg:`Password updated for ${pwResult.name}.` }); setPwNew('')
    } catch { setPwStatus({ type:'error', msg:'Update failed. Try again.' }) }
    finally { setPwUpdating(false) }
  }

  const handleExport = () => {
    const rows = filtered.map((u, i) => ({
      '#': i + 1,
      Name: u.name || '',
      Email: u.email || '',
      Phone: u.phone || '',
      Role: ROLE_LABELS[u.role] || u.role || '',
      Organization: u.organization || '',
      Department: u.department || '',
      Status: u.isActive ? 'Active' : 'Inactive',
      'Zone': (u as any).zoneNumber || '',
      'Employee Code': (u as any).employeeCode || '',
      Joined: fmtDate(u.createdAt),
      'Approved By': (u as any).approvedBy || '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Users')
    const url = URL.createObjectURL(new Blob([XLSX.write(wb,{bookType:'xlsx',type:'array'})],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}))
    const a = document.createElement('a'); a.href = url; a.download = `Users_${new Date().toISOString().split('T')[0]}.xlsx`; a.click(); URL.revokeObjectURL(url)
  }

  const inputSt = { background:T.surface, border:`1px solid ${T.cardBorder}`, color:T.textPrimary, borderRadius:10, padding:'8px 12px', fontSize:13, outline:'none', width:'100%' }
  const selectSt = { ...inputSt }

  if (isPmcMember) return (
    <div className="flex items-center justify-center h-64">
      <div className="rounded-2xl p-8 text-center" style={{ background:T.card, border:`1px solid ${T.cardBorder}` }}>
        <Shield className="h-10 w-10 mx-auto mb-3 opacity-30" style={{ color:T.red }} />
        <h2 className="text-base font-bold" style={{ color:T.textPrimary }}>Access Restricted</h2>
        <p className="text-sm mt-1" style={{ color:T.textMuted }}>User management is for administrators only.</p>
      </div>
    </div>
  )

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-12 w-12 border-4 border-t-transparent" style={{ borderColor:`${T.accent}30`, borderTopColor:T.accent }} />
    </div>
  )

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background:T.accentDim, border:`1px solid ${T.accentBorder}` }}>
            <Users className="h-6 w-6" style={{ color:T.accent }} />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight" style={{ color:T.textPrimary }}>Users</h1>
            <p className="text-sm" style={{ color:T.textMuted }}>
              {filtered.length} of {users.length} users
              {activeFilters > 0 && <span style={{ color:T.accent }}> (filtered)</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowPwModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold"
            style={{ background:`${T.purple}15`, color:T.purple, border:`1px solid ${T.purple}30`, cursor:'pointer' }}>
            <Key className="h-4 w-4" /> Password Reset
          </button>
          <button onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold"
            style={{ background:T.green, color:'#fff', border:'none', cursor:'pointer' }}>
            <Download className="h-4 w-4" /> Export
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {[
          { label:'Total',       value:stats.total,       color:T.accent  },
          { label:'Active',      value:stats.active,      color:T.green   },
          { label:'Inactive',    value:stats.inactive,    color:T.red     },
          { label:'Admin',       value:stats.admin,       color:T.red     },
          { label:'Task Force',  value:stats.taskForce,   color:T.accent  },
          { label:'Commissioner',value:stats.commissioner,color:T.purple  },
          { label:'QC',          value:stats.qc,          color:T.green   },
        ].map((s,i) => (
          <div key={s.label} className="rounded-xl p-3"
            style={{ background:T.card, border:`1px solid ${T.cardBorder}`, animation:`slideUp 0.4s ease ${i*40}ms both` }}>
            <p className="text-[9px] font-semibold uppercase tracking-wider mb-1" style={{ color:T.textSecondary }}>{s.label}</p>
            <p className="text-[20px] font-bold leading-none" style={{ color:s.color, fontFamily:"'JetBrains Mono',monospace" }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filter Bar */}
      <div className="rounded-2xl overflow-hidden" style={{ background:T.card, border:`1px solid ${T.cardBorder}` }}>
        <div className="flex flex-wrap gap-2 items-center px-4 py-3">
          {/* Search */}
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color:T.textMuted }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, email, phone, org…"
              className="w-full pl-8 pr-8 py-2 rounded-xl text-sm"
              style={{ background:T.surface, border:`1px solid ${T.cardBorder}`, color:T.textPrimary, outline:'none' }} />
            {search && <button onClick={() => setSearch('')} style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:T.textMuted }}><X className="h-3.5 w-3.5" /></button>}
          </div>
          {/* Role */}
          <select value={roleF} onChange={e => setRoleF(e.target.value)} style={{ ...selectSt, width:'auto', padding:'7px 10px' }}>
            <option value="all">All Roles</option>
            {Object.entries(ROLE_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          {/* Status */}
          <select value={statusF} onChange={e => setStatusF(e.target.value)} style={{ ...selectSt, width:'auto', padding:'7px 10px' }}>
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          {/* Sort */}
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ ...selectSt, width:'auto', padding:'7px 10px' }}>
            <option value="createdAt">Join Date</option>
            <option value="name">Name</option>
            <option value="email">Email</option>
            <option value="role">Role</option>
            <option value="organization">Org</option>
          </select>
          <button onClick={() => setSortDir(d => d==='asc'?'desc':'asc')}
            className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold"
            style={{ background:T.surface, border:`1px solid ${T.cardBorder}`, color:T.textSecondary, cursor:'pointer' }}>
            {sortDir==='asc' ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {sortDir==='asc'?'Asc':'Desc'}
          </button>
          <button onClick={() => setShowFilters(v => !v)}
            className="relative flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold"
            style={{ background:showFilters?T.accentDim:T.surface, border:`1px solid ${showFilters?T.accentBorder:T.cardBorder}`, color:showFilters?T.accent:T.textSecondary, cursor:'pointer' }}>
            <Filter className="h-3.5 w-3.5" /> More
            {activeFilters > 0 && <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black" style={{ background:T.accent, color:'#000' }}>{activeFilters}</span>}
          </button>
          {activeFilters > 0 && (
            <button onClick={() => { setSearch(''); setRoleF('all'); setStatusF('all'); setOrgF('all'); setDeptF('all'); setSortBy('createdAt'); setSortDir('desc') }}
              style={{ background:'none', border:'none', cursor:'pointer', color:T.red, fontSize:12, fontWeight:700 }}>Clear all</button>
          )}
        </div>
        {showFilters && (
          <div className="flex flex-wrap gap-3 px-4 pb-3 pt-0" style={{ borderTop:`1px solid ${T.gridLine}` }}>
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold uppercase tracking-wider" style={{ color:T.textMuted }}>Org</label>
              <select value={orgF} onChange={e => setOrgF(e.target.value)} style={{ ...selectSt, width:'auto', padding:'6px 10px' }}>
                <option value="all">All</option>
                {uniqueOrgs.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold uppercase tracking-wider" style={{ color:T.textMuted }}>Dept</label>
              <select value={deptF} onChange={e => setDeptF(e.target.value)} style={{ ...selectSt, width:'auto', padding:'6px 10px' }}>
                <option value="all">All</option>
                {uniqueDepts.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            {/* Active filter chips */}
            <div className="flex flex-wrap gap-1.5 items-center">
              {search && <Chip label={`"${search}"`} onRemove={() => setSearch('')} T={T} />}
              {roleF!=='all' && <Chip label={ROLE_LABELS[roleF]||roleF} onRemove={() => setRoleF('all')} T={T} />}
              {statusF!=='all' && <Chip label={statusF} onRemove={() => setStatusF('all')} T={T} />}
              {orgF!=='all' && <Chip label={`Org: ${orgF}`} onRemove={() => setOrgF('all')} T={T} />}
              {deptF!=='all' && <Chip label={`Dept: ${deptF}`} onRemove={() => setDeptF('all')} T={T} />}
            </div>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="rounded-2xl overflow-hidden" style={{ background:T.card, border:`1px solid ${T.cardBorder}` }}>
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom:`1px solid ${T.cardBorder}` }}>
          <p className="text-sm font-semibold" style={{ color:T.textPrimary }}>Users ({filtered.length})</p>
        </div>
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-2">
            <Users className="h-10 w-10 opacity-20" style={{ color:T.accent }} />
            <p className="text-sm" style={{ color:T.textMuted }}>No users found matching your criteria.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" style={{ fontSize:12 }}>
              <thead>
                <tr style={{ background:T.surface, borderBottom:`1px solid ${T.cardBorder}` }}>
                  {['#','User','Contact','Role','Org / Dept','Status','Joined','Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-3 font-semibold uppercase tracking-wider whitespace-nowrap" style={{ fontSize:10, color:T.accent }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((u, i) => {
                  const rc = ROLE_COLOR(u.role, T)
                  return (
                    <tr key={u.id} style={{ borderBottom:`1px solid ${T.gridLine}` }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = T.surface}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                      <td className="px-4 py-3" style={{ color:T.textMuted }}>{i+1}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <Avatar user={u} size={32} T={T} />
                          <div>
                            <p className="font-semibold" style={{ color:T.textPrimary }}>{u.name || '—'}</p>
                            <p className="text-[10px] font-mono" style={{ color:T.textMuted }}>{u.id.slice(-8)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p style={{ color:T.textSecondary }}>{u.email || '—'}</p>
                        <p className="text-[11px]" style={{ color:T.textMuted }}>{u.phone || '—'}</p>
                      </td>
                      <td className="px-4 py-3"><SBadge label={ROLE_LABELS[u.role]||u.role} color={rc} T={T} /></td>
                      <td className="px-4 py-3">
                        <p style={{ color:T.textPrimary }}>{u.organization || '—'}</p>
                        <p className="text-[10px]" style={{ color:T.textMuted }}>{u.department || '—'}</p>
                      </td>
                      <td className="px-4 py-3">
                        <SBadge label={u.isActive ? 'Active' : 'Inactive'} color={u.isActive ? T.green : T.red} T={T} />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap" style={{ color:T.textSecondary }}>{fmtDate(u.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => handleViewUser(u)} className="p-1.5 rounded-lg"
                            style={{ background:T.accentDim, color:T.accent, border:'none', cursor:'pointer' }} title="View">
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => openEditUser(u)} className="p-1.5 rounded-lg"
                            style={{ background:`${T.amber}15`, color:T.amber, border:'none', cursor:'pointer' }} title="Edit">
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => handleDeleteUser(u)} className="p-1.5 rounded-lg"
                            style={{ background:`${T.red}15`, color:T.red, border:'none', cursor:'pointer' }} title="Delete">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
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

      {/* ── View User Modal ── */}
      {viewUser && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto"
          style={{ background:'rgba(0,0,0,0.65)', backdropFilter:'blur(6px)' }}
          onClick={() => setViewUser(null)}>
          <div className="w-full max-w-4xl my-8 rounded-2xl shadow-2xl overflow-hidden"
            style={{ background:T.card, border:`1px solid ${T.cardBorder}` }}
            onClick={e => e.stopPropagation()}>
            {/* Modal header */}
            <div className="flex items-center gap-4 px-6 py-4" style={{ borderBottom:`1px solid ${T.cardBorder}`, background:`${ROLE_COLOR(viewUser.role,T)}08` }}>
              <Avatar user={viewUser} size={52} T={T} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold truncate" style={{ color:T.textPrimary }}>{viewUser.name}</h2>
                  <SBadge label={ROLE_LABELS[viewUser.role]||viewUser.role} color={ROLE_COLOR(viewUser.role,T)} T={T} />
                  <SBadge label={viewUser.isActive?'Active':'Inactive'} color={viewUser.isActive?T.green:T.red} T={T} />
                </div>
                <p className="text-xs mt-0.5" style={{ color:T.textMuted }}>{viewUser.email}{viewUser.phone?` · ${viewUser.phone}`:''}</p>
              </div>
              <button onClick={() => setViewUser(null)} className="flex items-center justify-center w-8 h-8 rounded-xl"
                style={{ background:T.surface, border:`1px solid ${T.cardBorder}`, color:T.textSecondary, cursor:'pointer' }}>
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* Left: User info */}
              <div className="space-y-4">
                {/* Profile photo */}
                {((viewUser as any).profileImageUrl || (viewUser as any).profile?.photoUrl || (viewUser as any).photoUrl) && (
                  <div className="rounded-xl overflow-hidden" style={{ border:`1px solid ${T.cardBorder}` }}>
                    <img src={(viewUser as any).profileImageUrl || (viewUser as any).profile?.photoUrl || (viewUser as any).photoUrl}
                      alt={viewUser.name} className="w-full h-40 object-cover"
                      onError={e => (e.currentTarget.parentElement!.style.display = 'none')} />
                  </div>
                )}
                <div className="rounded-xl p-4 space-y-3" style={{ background:T.surface, border:`1px solid ${T.cardBorder}` }}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color:T.textMuted }}>User Information</p>
                  {[
                    { icon:UserIcon, label:'Name',       value:viewUser.name },
                    { icon:Mail,     label:'Email',      value:viewUser.email },
                    { icon:Phone,    label:'Phone',      value:viewUser.phone||'Not provided' },
                    { icon:Building, label:'Org',        value:viewUser.organization||'—' },
                    { icon:Building, label:'Department', value:viewUser.department||'—' },
                    { icon:MapPin,   label:'Zone',       value:(viewUser as any).zoneNumber||'—' },
                    { icon:Calendar, label:'Joined',     value:fmtDate(viewUser.createdAt) },
                    { icon:CheckCircle, label:'Approved By', value:(viewUser as any).approvedBy||'—' },
                  ].map(row => (
                    <div key={row.label} className="flex items-start gap-2">
                      <row.icon className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" style={{ color:T.textMuted }} />
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color:T.textMuted }}>{row.label}</p>
                        <p className="text-sm" style={{ color:T.textPrimary }}>{row.value}</p>
                      </div>
                    </div>
                  ))}
                  {(viewUser as any).profile?.designation && (
                    <div className="flex items-start gap-2">
                      <Shield className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" style={{ color:T.textMuted }} />
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color:T.textMuted }}>Designation</p>
                        <p className="text-sm" style={{ color:T.textPrimary }}>{(viewUser as any).profile.designation}</p>
                      </div>
                    </div>
                  )}
                </div>
                {/* FP Summary */}
                <div className="rounded-xl p-4" style={{ background:T.accentDim, border:`1px solid ${T.accentBorder}` }}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-3" style={{ color:T.accent }}>Feeder Points Summary</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label:'Total',       value:viewFPs.length,                                        color:T.accent },
                      { label:'Active',      value:viewFPs.filter(f=>f.status==='active').length,         color:T.green  },
                      { label:'Maintenance', value:viewFPs.filter(f=>f.status==='maintenance').length,    color:T.amber  },
                      { label:'Inactive',    value:viewFPs.filter(f=>f.status==='inactive').length,       color:T.red    },
                    ].map(s => (
                      <div key={s.label} className="text-center rounded-lg p-2" style={{ background:T.card }}>
                        <p className="text-lg font-bold" style={{ color:s.color, fontFamily:"'JetBrains Mono',monospace" }}>{viewLoading?'…':s.value}</p>
                        <p className="text-[9px] font-semibold uppercase" style={{ color:T.textMuted }}>{s.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right: Tabs */}
              <div className="lg:col-span-2">
                <div className="flex gap-1 p-1 rounded-xl mb-4" style={{ background:T.surface }}>
                  {[{id:'reports',label:`Reports (${viewReports.length})`},{id:'fps',label:`Feeder Points (${viewFPs.length})`}].map(t => (
                    <button key={t.id} onClick={() => setViewTab(t.id as any)}
                      className="flex-1 py-2 rounded-lg text-xs font-semibold"
                      style={{ background:viewTab===t.id?T.card:'transparent', color:viewTab===t.id?T.textPrimary:T.textSecondary, border:`1px solid ${viewTab===t.id?T.cardBorder:'transparent'}`, cursor:'pointer' }}>
                      {t.label}
                    </button>
                  ))}
                </div>

                <div className="overflow-y-auto" style={{ maxHeight: 480 }}>
                  {viewLoading ? (
                    <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-4 border-t-transparent" style={{ borderColor:`${T.accent}30`, borderTopColor:T.accent }}/></div>
                  ) : viewTab === 'reports' ? (
                    viewReports.length === 0 ? (
                      <div className="flex flex-col items-center py-12 gap-2">
                        <FileText className="h-10 w-10 opacity-20" style={{ color:T.textMuted }} />
                        <p className="text-sm" style={{ color:T.textMuted }}>No reports submitted yet.</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {viewReports.map((r, idx) => (
                          <div key={r.id||idx} className="rounded-xl p-3" style={{ background:T.surface, border:`1px solid ${T.cardBorder}` }}>
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-sm truncate" style={{ color:T.textPrimary }}>{r.title||r.feederPointName||'Report'}</p>
                                <p className="text-xs mt-0.5 line-clamp-1" style={{ color:T.textMuted }}>{r.description||'—'}</p>
                                <div className="flex gap-3 mt-1.5 text-[10px]" style={{ color:T.textMuted }}>
                                  <span className="flex items-center gap-1"><Calendar className="h-3 w-3"/>{fmtDate(r.createdAt)}</span>
                                  {r.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3"/>{r.location}</span>}
                                </div>
                              </div>
                              <SBadge label={r.status||'pending'} color={r.status==='resolved'?T.green:r.status==='in_progress'?T.amber:T.red} T={T} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  ) : (
                    viewFPs.length === 0 ? (
                      <div className="flex flex-col items-center py-12 gap-2">
                        <TrendingUp className="h-10 w-10 opacity-20" style={{ color:T.textMuted }} />
                        <p className="text-sm" style={{ color:T.textMuted }}>No feeder points assigned.</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {viewFPs.map((fp, idx) => (
                          <div key={fp.id||idx} className="rounded-xl p-3" style={{ background:T.surface, border:`1px solid ${T.cardBorder}` }}>
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="font-semibold text-sm" style={{ color:T.textPrimary }}>{fp.name||`FP ${idx+1}`}</p>
                                  <SBadge label={fp.priority||'normal'} color={fp.priority==='high'?T.red:fp.priority==='medium'?T.amber:T.textMuted} T={T} />
                                </div>
                                {(fp.location?.address||fp.location) && (
                                  <p className="text-xs flex items-center gap-1 mt-1" style={{ color:T.textMuted }}>
                                    <MapPin className="h-3 w-3" />{fp.location?.address||fp.location}
                                  </p>
                                )}
                                <div className="flex gap-3 mt-1.5 text-[10px]" style={{ color:T.textMuted }}>
                                  <span className="flex items-center gap-1"><Calendar className="h-3 w-3"/>Assigned: {fmtDate(fp.assignedAt)}</span>
                                  {fp.lastInspection && <span className="flex items-center gap-1"><CheckCircle className="h-3 w-3"/>Last: {fmtDate(fp.lastInspection)}</span>}
                                </div>
                              </div>
                              <SBadge label={fp.status||'unknown'} color={fp.status==='active'?T.green:fp.status==='maintenance'?T.amber:T.textMuted} T={T} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit User Drawer (right side) ── */}
      {editUser && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" style={{ background:'rgba(0,0,0,0.4)', backdropFilter:'blur(2px)' }}
            onClick={() => setEditUser(null)} />
          {/* Drawer */}
          <div className="fixed right-0 top-0 bottom-0 z-50 flex flex-col shadow-2xl"
            style={{ width:'min(420px, 100vw)', background:T.card, borderLeft:`1px solid ${T.cardBorder}`, animation:'slideInRight 0.25s ease' }}>
            {/* Drawer Header */}
            <div className="flex items-center gap-3 px-5 py-4 flex-shrink-0" style={{ borderBottom:`1px solid ${T.cardBorder}`, background:`${ROLE_COLOR(editUser.role,T)}08` }}>
              <Avatar user={editUser} size={44} T={T} />
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold truncate" style={{ color:T.textPrimary }}>{editUser.name}</h3>
                <div className="flex items-center gap-2 mt-0.5">
                  <SBadge label={ROLE_LABELS[editUser.role]||editUser.role} color={ROLE_COLOR(editUser.role,T)} T={T} />
                  <SBadge label={editUser.isActive?'Active':'Inactive'} color={editUser.isActive?T.green:T.red} T={T} />
                </div>
              </div>
              <button onClick={() => setEditUser(null)} className="flex items-center justify-center w-8 h-8 rounded-xl flex-shrink-0"
                style={{ background:T.surface, border:`1px solid ${T.cardBorder}`, color:T.textSecondary, cursor:'pointer' }}>
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">

              {/* Profile image */}
              {(editUser as any).profileImageUrl && (
                <div className="rounded-2xl overflow-hidden" style={{ border:`1px solid ${T.cardBorder}` }}>
                  <img src={(editUser as any).profileImageUrl} alt={editUser.name}
                    className="w-full object-cover" style={{ maxHeight:180 }}
                    onError={e => (e.currentTarget.parentElement!.style.display='none')} />
                </div>
              )}

              {/* ── Section: Basic Info ── */}
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color:T.textMuted }}>Basic Info</p>
                <div className="space-y-3">
                  {[
                    { label:'Name',         key:'name',         type:'text'  },
                    { label:'Email',        key:'email',        type:'email' },
                    { label:'Phone',        key:'phone',        type:'tel'   },
                    { label:'Organization', key:'organization', type:'text'  },
                    { label:'Department',   key:'department',   type:'text'  },
                  ].map(f => (
                    <div key={f.key}>
                      <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color:T.textMuted }}>{f.label}</label>
                      <input type={f.type} value={(editUser as any)[f.key]||''} onChange={e => setEditUser({ ...editUser, [f.key]:e.target.value })} style={inputSt} />
                    </div>
                  ))}
                  <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color:T.textMuted }}>Role</label>
                    <select value={editUser.role} onChange={e => setEditUser({ ...editUser, role:e.target.value })} style={selectSt}>
                      {Object.entries(ROLE_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* ── Section: Status ── */}
              <div className="rounded-xl px-4 py-3 flex items-center justify-between"
                style={{ background:editUser.isActive?`${T.green}10`:`${T.red}10`, border:`1px solid ${editUser.isActive?T.green:T.red}25` }}>
                <div>
                  <p className="text-sm font-semibold" style={{ color:editUser.isActive?T.green:T.red }}>
                    {editUser.isActive ? 'Active Account' : 'Inactive Account'}
                  </p>
                  <p className="text-[10px] mt-0.5" style={{ color:T.textMuted }}>User {editUser.isActive?'can':'cannot'} log in and use the app</p>
                </div>
                <button onClick={() => setEditUser({...editUser, isActive:!editUser.isActive})}
                  className="relative flex-shrink-0" style={{ width:44, height:24, borderRadius:12, background:editUser.isActive?T.green:T.cardBorder, border:'none', cursor:'pointer', transition:'background 0.2s' }}>
                  <div style={{ position:'absolute', top:3, left:editUser.isActive?23:3, width:18, height:18, borderRadius:'50%', background:'#fff', boxShadow:'0 1px 4px rgba(0,0,0,0.25)', transition:'left 0.2s' }} />
                </button>
              </div>

              {/* ── Section: Change Password ── */}
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest mb-3 flex items-center gap-1.5" style={{ color:T.textMuted }}>
                  <Key className="h-3 w-3" /> Change Password
                </p>
                <div className="rounded-xl p-4 space-y-3" style={{ background:T.surface, border:`1px solid ${T.cardBorder}` }}>
                  <p className="text-xs" style={{ color:T.textMuted }}>Set a new password for this user. Leave blank to keep the current password.</p>
                  <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color:T.textMuted }}>New Password</label>
                    <input type="password" value={editPw} onChange={e => setEditPw(e.target.value)}
                      placeholder="Enter new password…" style={inputSt} />
                  </div>
                  {editPw.trim() && (
                    <button onClick={handleEditPwUpdate} disabled={editPwUpdating}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
                      style={{ background:T.purple, color:'#fff', border:'none', cursor:'pointer' }}>
                      {editPwUpdating
                        ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor:'rgba(255,255,255,0.3)', borderTopColor:'#fff' }} />
                        : <Key className="h-4 w-4" />}
                      {editPwUpdating ? 'Updating…' : 'Update Password'}
                    </button>
                  )}
                  {editPwStatus && (
                    <div className="rounded-xl px-3 py-2 text-xs font-semibold"
                      style={{ background:editPwStatus.type==='success'?`${T.green}10`:`${T.red}10`, border:`1px solid ${editPwStatus.type==='success'?T.green:T.red}30`, color:editPwStatus.type==='success'?T.green:T.red }}>
                      {editPwStatus.msg}
                    </div>
                  )}
                </div>
              </div>

            </div>

            {/* Footer */}
            <div className="flex gap-2 px-5 py-4 flex-shrink-0" style={{ borderTop:`1px solid ${T.cardBorder}` }}>
              <button onClick={() => setEditUser(null)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                style={{ background:T.surface, border:`1px solid ${T.cardBorder}`, color:T.textSecondary, cursor:'pointer' }}>Cancel</button>
              <button onClick={handleSaveUser} disabled={editSaving} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
                style={{ background:T.accent, color:'#000', border:'none', cursor:'pointer', fontWeight:700 }}>
                {editSaving && <div className="h-4 w-4 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor:'rgba(0,0,0,0.3)', borderTopColor:'#000' }} />}
                Save Changes
              </button>
            </div>
          </div>
          <style>{'@keyframes slideInRight{from{transform:translateX(100%)}to{transform:translateX(0)}}'}</style>
        </>
      )}

      {/* ── Password Reset Modal ── */}
      {showPwModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background:'rgba(0,0,0,0.65)', backdropFilter:'blur(6px)' }}
          onClick={() => setShowPwModal(false)}>
          <div className="w-full max-w-md rounded-2xl shadow-2xl"
            style={{ background:T.card, border:`1px solid ${T.cardBorder}` }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom:`1px solid ${T.cardBorder}` }}>
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl" style={{ background:`${T.purple}15` }}>
                  <Key className="h-4 w-4" style={{ color:T.purple }} />
                </div>
                <h3 className="text-base font-bold" style={{ color:T.textPrimary }}>Reset User Password</h3>
              </div>
              <button onClick={() => setShowPwModal(false)} className="flex items-center justify-center w-7 h-7 rounded-lg"
                style={{ background:T.surface, border:`1px solid ${T.cardBorder}`, color:T.textSecondary, cursor:'pointer' }}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs" style={{ color:T.textMuted }}>Search for a user by name to load their account, then set a new password.</p>
              <div className="flex gap-2">
                <input value={pwSearch} onChange={e => setPwSearch(e.target.value)} placeholder="Enter full name…"
                  onKeyDown={e => e.key==='Enter' && handlePwLookup()}
                  style={{ ...inputSt, flex:1 }} />
                <button onClick={handlePwLookup} disabled={pwSearching}
                  className="px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50 whitespace-nowrap"
                  style={{ background:T.accent, color:'#000', border:'none', cursor:'pointer' }}>
                  {pwSearching ? '…' : 'Fetch'}
                </button>
              </div>
              {pwResult && (
                <div className="rounded-xl p-3 flex items-center gap-3" style={{ background:T.accentDim, border:`1px solid ${T.accentBorder}` }}>
                  <Avatar user={pwResult} size={36} T={T} />
                  <div>
                    <p className="font-bold text-sm" style={{ color:T.textPrimary }}>{pwResult.name}</p>
                    <p className="text-xs" style={{ color:T.textMuted }}>{pwResult.email || 'No email'}</p>
                  </div>
                </div>
              )}
              {pwResult && (
                <div className="flex gap-2">
                  <input type="password" value={pwNew} onChange={e => setPwNew(e.target.value)}
                    placeholder="New password…" style={{ ...inputSt, flex:1 }} />
                  <button onClick={handlePwUpdate} disabled={pwUpdating}
                    className="px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50 whitespace-nowrap"
                    style={{ background:T.green, color:'#fff', border:'none', cursor:'pointer' }}>
                    {pwUpdating ? '…' : 'Update'}
                  </button>
                </div>
              )}
              {pwStatus && (
                <div className="rounded-xl px-3 py-2.5 text-sm" style={{ background: pwStatus.type==='success'?`${T.green}10`:`${T.red}10`, border:`1px solid ${pwStatus.type==='success'?T.green:T.red}30`, color: pwStatus.type==='success'?T.green:T.red }}>
                  {pwStatus.msg}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes slideUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  )
}

// ─── Filter chip ──────────────────────────────────────────────────────────────
function Chip({ label, onRemove, T }: { label: string; onRemove: () => void; T: any }) {
  return (
    <span className="flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold"
      style={{ background:T.accentDim, border:`1px solid ${T.accentBorder}`, color:T.accent }}>
      {label}
      <button onClick={onRemove} style={{ background:'none', border:'none', cursor:'pointer', color:T.accent, lineHeight:1, padding:0 }}>×</button>
    </span>
  )
}