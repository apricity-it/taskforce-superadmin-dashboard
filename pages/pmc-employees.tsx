import { useEffect, useState } from 'react'
import Head from 'next/head'
import {
  UserPlus, Mail, Phone, Lock, MapPin, Hash,
  ShieldCheck, RefreshCcw, Trash2, CheckCircle,
  AlertCircle, Users, Eye, EyeOff, Pencil, X,
} from 'lucide-react'
import { DataService, User } from '@/lib/dataService'
import { useTheme } from '@/contexts/ThemeContext'
import { getTokens } from '@/lib/dashboardTheme'

const ZONES = ['1','2','3','4','5']

interface FormState {
  name: string; employeeCode: string; email: string
  phone: string; password: string; zoneNumber: string
}

const EMPTY_FORM: FormState = {
  name:'', employeeCode:'', email:'', phone:'', password:'', zoneNumber: ZONES[0]
}

function SBadge({ label, color }: { label: string; color: string }) {
  return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap"
      style={{ background:`${color}18`, border:`1px solid ${color}30`, color }}>
      {label}
    </span>
  )
}

export default function PmcEmployeesPage() {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const T = getTokens(dark)

  const [pmcUsers,    setPmcUsers]    = useState<User[]>([])
  const [loading,     setLoading]     = useState(true)
  const [saving,      setSaving]      = useState(false)
  const [deletingId,  setDeletingId]  = useState<string|null>(null)
  const [status,      setStatus]      = useState<{type:'success'|'error'; msg:string}|null>(null)
  const [form,        setForm]        = useState<FormState>(EMPTY_FORM)
  const [showPw,      setShowPw]      = useState(false)

  // Edit drawer
  const [editUser,    setEditUser]    = useState<User|null>(null)
  const [editSaving,  setEditSaving]  = useState(false)
  const [editPw,      setEditPw]      = useState('')
  const [editPwSaving,setEditPwSaving]= useState(false)
  const [editStatus,  setEditStatus]  = useState<{type:'success'|'error';msg:string}|null>(null)
  const [showEditPw,  setShowEditPw]  = useState(false)

  useEffect(() => { loadUsers() }, [])

  const loadUsers = async () => {
    setLoading(true)
    try {
      const all = await DataService.getAllUsers()
      setPmcUsers(all.filter((u: User) => u.role==='pmc_member'||u.role==='pmc_viewer'))
    } catch(e) {
      console.error(e)
      setStatus({ type:'error', msg:'Could not load PMC employees.' })
    } finally { setLoading(false) }
  }

  const handleCreate = async () => {
    setStatus(null)
    const { name, employeeCode, email, phone, password, zoneNumber } = form
    if (!name.trim()||!employeeCode.trim()||!email.trim()||!phone.trim()||!password.trim()) {
      setStatus({ type:'error', msg:'All fields are required.' }); return
    }
    if (phone.trim().length < 10) {
      setStatus({ type:'error', msg:'Phone must be at least 10 digits.' }); return
    }
    setSaving(true)
    try {
      await DataService.createPmcEmployee({ name, employeeCode, email, phone, password, zoneNumber })
      setStatus({ type:'success', msg:`PMC login created for ${name}.` })
      setForm(EMPTY_FORM)
      await loadUsers()
    } catch(e) {
      console.error(e)
      setStatus({ type:'error', msg:'Could not create PMC employee. Please try again.' })
    } finally { setSaving(false) }
  }

  const handleDelete = async (userId: string, name: string) => {
    if (!confirm(`Delete PMC login for "${name}"? This cannot be undone.`)) return
    setDeletingId(userId); setStatus(null)
    try {
      await DataService.deletePmcEmployee(userId)
      setStatus({ type:'success', msg:'PMC employee deleted.' })
      await loadUsers()
    } catch(e) {
      console.error(e)
      setStatus({ type:'error', msg:'Could not delete. Please try again.' })
    } finally { setDeletingId(null) }
  }

  const handleSaveEdit = async () => {
    if (!editUser) return
    setEditSaving(true); setEditStatus(null)
    try {
      await DataService.updateUser(editUser.id, {
        name:       editUser.name,
        email:      editUser.email,
        phone:      editUser.phone,
        zoneNumber: (editUser as any).zoneNumber,
        isActive:   editUser.isActive,
      })
      setEditStatus({ type:'success', msg:'Changes saved.' })
      await loadUsers()
    } catch(e) {
      console.error(e)
      setEditStatus({ type:'error', msg:'Save failed. Try again.' })
    } finally { setEditSaving(false) }
  }

  const handleEditPwUpdate = async () => {
    if (!editUser||!editPw.trim()) return
    setEditPwSaving(true); setEditStatus(null)
    try {
      await DataService.updateUserPassword(editUser.id, editPw.trim())
      setEditStatus({ type:'success', msg:`Password updated for ${editUser.name}.` })
      setEditPw('')
    } catch(e) {
      console.error(e)
      setEditStatus({ type:'error', msg:'Password update failed.' })
    } finally { setEditPwSaving(false) }
  }

  const inputSt = {
    background: T.surface, border: `1px solid ${T.cardBorder}`,
    color: T.textPrimary, borderRadius: 10, padding: '8px 12px',
    fontSize: 13, outline: 'none', width: '100%',
  }

  const Field = ({ label, icon: Icon, children }: { label: string; icon: any; children: React.ReactNode }) => (
    <div>
      <label className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: T.textMuted }}>
        <Icon className="h-3 w-3" style={{ color: T.accent }}/>{label}
      </label>
      {children}
    </div>
  )

  const zoneColor = (z: string) => (['',T.accent,T.green,T.amber,T.purple,T.red][parseInt(z)] ?? T.textMuted)

  return (
    <>
      <Head><title>PMC Employees | Taskforce</title></Head>

      <div className="space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl"
              style={{ background: T.accentDim, border: `1px solid ${T.accentBorder}` }}>
              <Users className="h-6 w-6" style={{ color: T.accent }}/>
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight" style={{ color: T.textPrimary }}>PMC Employees</h1>
              <p className="text-sm" style={{ color: T.textMuted }}>Create PMC employee logins and manage their assigned zones</p>
            </div>
          </div>
          <button onClick={loadUsers}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold"
            style={{ background: T.surface, border: `1px solid ${T.cardBorder}`, color: T.textSecondary, cursor: 'pointer' }}>
            <RefreshCcw className="h-3.5 w-3.5"/> Refresh
          </button>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label:'Total PMC Logins', value: pmcUsers.length,                                  color: T.accent  },
            { label:'Active',           value: pmcUsers.filter(u=>u.isActive!==false).length,    color: T.green   },
            { label:'Inactive',         value: pmcUsers.filter(u=>u.isActive===false).length,    color: T.red     },
          ].map(s=>(
            <div key={s.label} className="rounded-2xl p-4" style={{ background: T.card, border: `1px solid ${T.cardBorder}` }}>
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: T.textMuted }}>{s.label}</p>
              <p className="text-2xl font-black" style={{ color: s.color, fontFamily:"'JetBrains Mono',monospace" }}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Global status toast */}
        {status && (
          <div className="rounded-xl px-4 py-3 flex items-center gap-2"
            style={{ background: status.type==='success'?`${T.green}10`:`${T.red}10`, border: `1px solid ${status.type==='success'?T.green:T.red}30`, color: status.type==='success'?T.green:T.red }}>
            {status.type==='success' ? <CheckCircle className="h-4 w-4 flex-shrink-0"/> : <AlertCircle className="h-4 w-4 flex-shrink-0"/>}
            <p className="text-sm font-semibold">{status.msg}</p>
            <button onClick={()=>setStatus(null)} style={{ marginLeft:'auto', background:'none', border:'none', cursor:'pointer', color:'inherit' }}>
              <X className="h-3.5 w-3.5"/>
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* ── Create form ── */}
          <div className="rounded-2xl p-5 space-y-4" style={{ background: T.card, border: `1px solid ${T.cardBorder}` }}>
            <div className="flex items-center gap-2 pb-3" style={{ borderBottom: `1px solid ${T.cardBorder}` }}>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: T.accentDim }}>
                <UserPlus className="h-4 w-4" style={{ color: T.accent }}/>
              </div>
              <div>
                <p className="text-sm font-bold" style={{ color: T.textPrimary }}>Create PMC Login</p>
                <p className="text-[10px]" style={{ color: T.textMuted }}>Add a new PMC employee account</p>
              </div>
            </div>

            <Field label="Full Name" icon={ShieldCheck}>
              <input type="text" value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))}
                placeholder="Employee full name" style={inputSt} autoComplete="off"/>
            </Field>

            <Field label="Employee Code" icon={Hash}>
              <input type="text" value={form.employeeCode} onChange={e=>setForm(p=>({...p,employeeCode:e.target.value}))}
                placeholder="e.g. PMC-101" style={inputSt} autoComplete="off"/>
            </Field>

            <Field label="Email" icon={Mail}>
              <input type="email" value={form.email} onChange={e=>setForm(p=>({...p,email:e.target.value}))}
                placeholder="employee@pmc.gov" style={inputSt} autoComplete="off"/>
            </Field>

            <Field label="Phone" icon={Phone}>
              <input type="tel" value={form.phone} onChange={e=>setForm(p=>({...p,phone:e.target.value}))}
                placeholder="10-digit number" style={inputSt}/>
            </Field>

            <Field label="Password" icon={Lock}>
              <div className="relative">
                <input type={showPw?'text':'password'} value={form.password}
                  onChange={e=>setForm(p=>({...p,password:e.target.value}))}
                  placeholder="Set login password" style={{ ...inputSt, paddingRight: 36 }}/>
                <button onClick={()=>setShowPw(v=>!v)} style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:T.textMuted }}>
                  {showPw ? <EyeOff className="h-4 w-4"/> : <Eye className="h-4 w-4"/>}
                </button>
              </div>
            </Field>

            <Field label="Zone (1–5)" icon={MapPin}>
              <select value={form.zoneNumber} onChange={e=>setForm(p=>({...p,zoneNumber:e.target.value}))} style={inputSt}>
                {ZONES.map(z=><option key={z} value={z}>Zone {z}</option>)}
              </select>
            </Field>

            <button onClick={handleCreate} disabled={saving}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold disabled:opacity-50"
              style={{ background: T.accent, color: '#000', border: 'none', cursor: 'pointer' }}>
              {saving
                ? <><div className="h-4 w-4 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor:'rgba(0,0,0,0.3)', borderTopColor:'#000' }}/> Creating…</>
                : <><UserPlus className="h-4 w-4"/> Create PMC Login</>
              }
            </button>
          </div>

          {/* ── Existing users table ── */}
          <div className="lg:col-span-2 rounded-2xl overflow-hidden" style={{ background: T.card, border: `1px solid ${T.cardBorder}` }}>
            <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: `1px solid ${T.cardBorder}` }}>
              <div>
                <h2 className="text-base font-bold" style={{ color: T.textPrimary }}>PMC Employees ({pmcUsers.length})</h2>
                <p className="text-xs mt-0.5" style={{ color: T.textMuted }}>Click Edit to update details or change password</p>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16 gap-3">
                <div className="animate-spin rounded-full h-8 w-8 border-4 border-t-transparent"
                  style={{ borderColor:`${T.accent}30`, borderTopColor:T.accent }}/>
                <p className="text-sm" style={{ color: T.textSecondary }}>Loading…</p>
              </div>
            ) : pmcUsers.length === 0 ? (
              <div className="flex flex-col items-center py-16 gap-2">
                <Users className="h-10 w-10 opacity-20" style={{ color: T.accent }}/>
                <p className="text-sm" style={{ color: T.textMuted }}>No PMC employee logins yet. Create one.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full" style={{ fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: T.surface, borderBottom: `1px solid ${T.cardBorder}` }}>
                      {['Name','Code','Email','Phone','Zone','Status','Actions'].map(h=>(
                        <th key={h} className="text-left px-4 py-3 font-semibold uppercase tracking-wider whitespace-nowrap"
                          style={{ fontSize: 10, color: T.accent }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pmcUsers.map(u => {
                      const zc = zoneColor((u as any).zoneNumber||'0')
                      return (
                        <tr key={u.id} style={{ borderBottom: `1px solid ${T.gridLine}` }}
                          onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background=T.surface}
                          onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background='transparent'}>
                          <td className="px-4 py-3">
                            <p className="font-semibold" style={{ color: T.textPrimary }}>{u.name||'—'}</p>
                            <p className="text-[10px] font-mono" style={{ color: T.textMuted }}>{u.id.slice(-10)}</p>
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-mono text-xs px-2 py-0.5 rounded-lg"
                              style={{ background: T.accentDim, color: T.accent }}>
                              {(u as any).employeeCode||'—'}
                            </span>
                          </td>
                          <td className="px-4 py-3" style={{ color: T.textSecondary }}>{u.email||'—'}</td>
                          <td className="px-4 py-3" style={{ color: T.textSecondary }}>{u.phone||'—'}</td>
                          <td className="px-4 py-3">
                            {(u as any).zoneNumber
                              ? <SBadge label={`Zone ${(u as any).zoneNumber}`} color={zc}/>
                              : <span style={{ color: T.textMuted }}>—</span>
                            }
                          </td>
                          <td className="px-4 py-3">
                            <SBadge
                              label={u.isActive===false?'Inactive':'Active'}
                              color={u.isActive===false?T.red:T.green}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <button onClick={()=>{ setEditUser({...u}); setEditPw(''); setEditStatus(null) }}
                                className="p-1.5 rounded-lg"
                                style={{ background: T.accentDim, color: T.accent, border: 'none', cursor: 'pointer' }}
                                title="Edit">
                                <Pencil className="h-3.5 w-3.5"/>
                              </button>
                              <button onClick={()=>handleDelete(u.id, u.name||'?')} disabled={deletingId===u.id}
                                className="p-1.5 rounded-lg disabled:opacity-40"
                                style={{ background: `${T.red}15`, color: T.red, border: 'none', cursor: 'pointer' }}
                                title="Delete">
                                {deletingId===u.id
                                  ? <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor:`${T.red}40`, borderTopColor:T.red }}/>
                                  : <Trash2 className="h-3.5 w-3.5"/>
                                }
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
        </div>

        {/* ── Edit User Drawer ── */}
        {editUser && (
          <>
            <div className="fixed inset-0 z-40" style={{ background:'rgba(0,0,0,0.4)', backdropFilter:'blur(2px)' }}
              onClick={()=>setEditUser(null)}/>
            <div className="fixed right-0 top-0 bottom-0 z-50 flex flex-col shadow-2xl"
              style={{ width:'min(400px,100vw)', background:T.card, borderLeft:`1px solid ${T.cardBorder}`, animation:'slideInRight 0.25s ease' }}>

              {/* Drawer header */}
              <div className="flex items-center gap-3 px-5 py-4 flex-shrink-0"
                style={{ borderBottom:`1px solid ${T.cardBorder}`, background:`${T.accent}06` }}>
                <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: T.accentDim }}>
                  <ShieldCheck className="h-4 w-4" style={{ color: T.accent }}/>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate" style={{ color: T.textPrimary }}>{editUser.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <SBadge label={(editUser as any).employeeCode||'No Code'} color={T.accent}/>
                    <SBadge label={editUser.isActive===false?'Inactive':'Active'} color={editUser.isActive===false?T.red:T.green}/>
                  </div>
                </div>
                <button onClick={()=>setEditUser(null)} className="flex items-center justify-center w-8 h-8 rounded-xl flex-shrink-0"
                  style={{ background:T.surface, border:`1px solid ${T.cardBorder}`, color:T.textSecondary, cursor:'pointer' }}>
                  <X className="h-4 w-4"/>
                </button>
              </div>

              {/* Drawer body */}
              <div className="flex-1 overflow-y-auto p-5 space-y-5">

                {/* Basic info */}
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color:T.textMuted }}>Basic Info</p>
                  <div className="space-y-3">
                    {[
                      { label:'Name',  key:'name',  type:'text'  },
                      { label:'Email', key:'email', type:'email' },
                      { label:'Phone', key:'phone', type:'tel'   },
                    ].map(f=>(
                      <div key={f.key}>
                        <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color:T.textMuted }}>{f.label}</label>
                        <input type={f.type} value={(editUser as any)[f.key]||''}
                          onChange={e=>setEditUser({...editUser,[f.key]:e.target.value})}
                          style={inputSt}/>
                      </div>
                    ))}
                    <div>
                      <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color:T.textMuted }}>Zone</label>
                      <select value={(editUser as any).zoneNumber||ZONES[0]}
                        onChange={e=>setEditUser({...editUser, zoneNumber:e.target.value} as any)}
                        style={inputSt}>
                        {ZONES.map(z=><option key={z} value={z}>Zone {z}</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Active toggle */}
                <div className="rounded-xl px-4 py-3 flex items-center justify-between"
                  style={{ background:editUser.isActive===false?`${T.red}10`:`${T.green}10`, border:`1px solid ${editUser.isActive===false?T.red:T.green}25` }}>
                  <div>
                    <p className="text-sm font-semibold" style={{ color:editUser.isActive===false?T.red:T.green }}>
                      {editUser.isActive===false?'Inactive Account':'Active Account'}
                    </p>
                    <p className="text-[10px] mt-0.5" style={{ color:T.textMuted }}>
                      User {editUser.isActive===false?'cannot':'can'} log in
                    </p>
                  </div>
                  <button onClick={()=>setEditUser({...editUser, isActive:!editUser.isActive})}
                    style={{ position:'relative', width:44, height:24, borderRadius:12, background:editUser.isActive===false?T.cardBorder:T.green, border:'none', cursor:'pointer', transition:'background 0.2s' }}>
                    <div style={{ position:'absolute', top:3, left:editUser.isActive===false?3:23, width:18, height:18, borderRadius:'50%', background:'#fff', boxShadow:'0 1px 4px rgba(0,0,0,0.25)', transition:'left 0.2s' }}/>
                  </button>
                </div>

                {/* Change password */}
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest mb-3 flex items-center gap-1.5" style={{ color:T.textMuted }}>
                    <Lock className="h-3 w-3"/> Change Password
                  </p>
                  <div className="rounded-xl p-4 space-y-3" style={{ background:T.surface, border:`1px solid ${T.cardBorder}` }}>
                    <p className="text-xs" style={{ color:T.textMuted }}>Leave blank to keep the current password.</p>
                    <div className="relative">
                      <input type={showEditPw?'text':'password'} value={editPw}
                        onChange={e=>setEditPw(e.target.value)}
                        placeholder="New password…"
                        style={{ ...inputSt, paddingRight:36 }}/>
                      <button onClick={()=>setShowEditPw(v=>!v)} style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:T.textMuted }}>
                        {showEditPw ? <EyeOff className="h-4 w-4"/> : <Eye className="h-4 w-4"/>}
                      </button>
                    </div>
                    {editPw.trim() && (
                      <button onClick={handleEditPwUpdate} disabled={editPwSaving}
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
                        style={{ background:T.purple, color:'#fff', border:'none', cursor:'pointer' }}>
                        {editPwSaving
                          ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor:'rgba(255,255,255,0.3)', borderTopColor:'#fff' }}/>
                          : <Lock className="h-4 w-4"/>}
                        {editPwSaving?'Updating…':'Update Password'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Edit status */}
                {editStatus && (
                  <div className="rounded-xl px-3 py-2.5 flex items-center gap-2"
                    style={{ background:editStatus.type==='success'?`${T.green}10`:`${T.red}10`, border:`1px solid ${editStatus.type==='success'?T.green:T.red}30`, color:editStatus.type==='success'?T.green:T.red }}>
                    {editStatus.type==='success' ? <CheckCircle className="h-3.5 w-3.5 flex-shrink-0"/> : <AlertCircle className="h-3.5 w-3.5 flex-shrink-0"/>}
                    <p className="text-xs font-semibold">{editStatus.msg}</p>
                  </div>
                )}
              </div>

              {/* Drawer footer */}
              <div className="flex gap-2 px-5 py-4 flex-shrink-0" style={{ borderTop:`1px solid ${T.cardBorder}` }}>
                <button onClick={()=>setEditUser(null)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                  style={{ background:T.surface, border:`1px solid ${T.cardBorder}`, color:T.textSecondary, cursor:'pointer' }}>
                  Cancel
                </button>
                <button onClick={handleSaveEdit} disabled={editSaving}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold disabled:opacity-50"
                  style={{ background:T.accent, color:'#000', border:'none', cursor:'pointer' }}>
                  {editSaving
                    ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor:'rgba(0,0,0,0.3)', borderTopColor:'#000' }}/>
                    : null}
                  Save Changes
                </button>
              </div>
            </div>
            <style>{`@keyframes slideInRight{from{transform:translateX(100%)}to{transform:translateX(0)}}`}</style>
          </>
        )}

      </div>
    </>
  )
}