import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Map, Building2, Home, ClipboardList, Plus, Pencil, Trash2, X,
  Loader2, AlertCircle, ChevronDown, ChevronRight, GitBranch,
  Zap, Search, Clock, ToggleLeft, ToggleRight, RefreshCw,
} from 'lucide-react'
import { DataService, Zone, Ward, Kothi, Assignment } from '@/lib/dataService'
import { collection, onSnapshot, updateDoc, deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useTheme } from '@/contexts/ThemeContext'
import { getTokens } from '@/lib/dashboardTheme'

// ─── Types ────────────────────────────────────────────────────────────────────
type TabName = 'Zones' | 'Wards' | 'Kothis' | 'Mapping' | 'Assignment' | 'Shifts'

interface ShiftDefinition {
  id: string; name: string; startHour: number; startMinute?: number
  endHour: number; overnight: boolean; active?: boolean
}

const TABS: { name: TabName; icon: React.FC<any> }[] = [
  { name: 'Zones', icon: Map },
  { name: 'Wards', icon: Building2 },
  { name: 'Kothis', icon: Home },
  { name: 'Mapping', icon: GitBranch },
  { name: 'Assignment', icon: ClipboardList },
  { name: 'Shifts', icon: Clock },
]

const BUILT_IN_SHIFTS = ['7PM-3AM', '3AM-11AM', '3PM-11PM', '11PM-7AM']

// ─── Shared: Modal ────────────────────────────────────────────────────────────
function Modal({ title, onClose, children, T }: { title: string; onClose: () => void; children: React.ReactNode; T: any }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}>
      <div className="w-full max-w-md mx-4 rounded-t-2xl sm:rounded-2xl shadow-2xl"
        style={{ background: T.card, border: `1px solid ${T.cardBorder}` }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${T.cardBorder}` }}>
          <h3 className="text-base font-bold" style={{ color: T.textPrimary }}>{title}</h3>
          <button onClick={onClose} className="flex items-center justify-center w-7 h-7 rounded-lg"
            style={{ background: T.surface, border: `1px solid ${T.cardBorder}`, color: T.textSecondary, cursor: 'pointer' }}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">{children}</div>
      </div>
    </div>
  )
}

// ─── Shared: Confirm Delete ───────────────────────────────────────────────────
function ConfirmDelete({ name, onConfirm, onCancel, loading, T }: any) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onCancel}>
      <div className="w-full max-w-sm rounded-2xl shadow-2xl p-5"
        style={{ background: T.card, border: `1px solid ${T.cardBorder}` }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-3 mb-5">
          <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" style={{ color: T.red }} />
          <p className="text-sm" style={{ color: T.textSecondary }}>
            Delete <span className="font-bold" style={{ color: T.textPrimary }}>"{name}"</span>? This cannot be undone.
          </p>
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="px-4 py-2 rounded-xl text-sm font-semibold"
            style={{ background: T.surface, border: `1px solid ${T.cardBorder}`, color: T.textSecondary, cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={onConfirm} disabled={loading}
            className="px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center gap-2"
            style={{ background: T.red, color: '#fff', border: 'none', cursor: 'pointer' }}>
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Delete
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Shared: Field ────────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5"
        style={{ color: '#6b7a8d' }}>{label}</label>
      {children}
    </div>
  )
}

// ─── Shared: Table ────────────────────────────────────────────────────────────
function DataTable({ headers, children, empty, T }: { headers: string[]; children: React.ReactNode; empty: React.ReactNode; T: any }) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${T.cardBorder}` }}>
      <div className="overflow-x-auto">
        <table className="w-full" style={{ fontSize: 12 }}>
          <thead>
            <tr style={{ background: T.surface, borderBottom: `1px solid ${T.cardBorder}` }}>
              {headers.map(h => (
                <th key={h} className="text-left px-4 py-3 font-semibold uppercase tracking-wider whitespace-nowrap"
                  style={{ fontSize: 10, color: '#00e5ff' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
      {empty}
    </div>
  )
}

// ─── ZONES TAB ────────────────────────────────────────────────────────────────
function ZonesTab({ T }: { T: any }) {
  const [zones, setZones] = useState<Zone[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Zone | null>(null)
  const [formName, setFormName] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Zone | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => { const u = DataService.onZonesChange(d => { setZones(d); setLoading(false) }); return u }, [])

  const inputSt = { background: T.surface, border: `1px solid ${T.cardBorder}`, color: T.textPrimary, borderRadius: 10, padding: '8px 12px', fontSize: 13, outline: 'none', width: '100%' }

  const handleSave = async () => {
    if (!formName.trim()) return; setSaving(true)
    try {
      if (editing) await DataService.updateZone(editing.id, { name: formName.trim() })
      else await DataService.createZone({ name: formName.trim() })
      setShowModal(false)
    } catch (e) { console.error(e) } finally { setSaving(false) }
  }
  const handleDelete = async () => {
    if (!deleteTarget) return; setDeleting(true)
    try { await DataService.deleteZone(deleteTarget.id) } catch (e) { console.error(e) }
    finally { setDeleting(false); setDeleteTarget(null) }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium" style={{ color: T.textMuted }}>{zones.length} zone{zones.length !== 1 ? 's' : ''}</span>
        <button onClick={() => { setEditing(null); setFormName(''); setShowModal(true) }}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold"
          style={{ background: T.accent, color: '#000', border: 'none', cursor: 'pointer' }}>
          <Plus className="h-4 w-4" /> Add Zone
        </button>
      </div>

      {loading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" style={{ color: T.accent }} /></div>
        : zones.length === 0 ? (
          <div className="flex flex-col items-center py-12 gap-2">
            <Map className="h-10 w-10 opacity-20" style={{ color: T.accent }} />
            <p className="text-sm" style={{ color: T.textMuted }}>No zones yet. Add your first zone.</p>
          </div>
        ) : (
          <DataTable headers={['#', 'Zone Name', 'Actions']} T={T}
            empty={null}>
            {zones.map((z, i) => (
              <tr key={z.id} style={{ borderBottom: `1px solid ${T.gridLine}` }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = T.surface}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                <td className="px-4 py-3" style={{ color: T.textMuted }}>{i + 1}</td>
                <td className="px-4 py-3 font-semibold" style={{ color: T.textPrimary }}>{z.name}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1.5">
                    <button onClick={() => { setEditing(z); setFormName(z.name); setShowModal(true) }}
                      className="p-1.5 rounded-lg" style={{ background: T.accentDim, color: T.accent, border: 'none', cursor: 'pointer' }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => setDeleteTarget(z)}
                      className="p-1.5 rounded-lg" style={{ background: `${T.red}15`, color: T.red, border: 'none', cursor: 'pointer' }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </DataTable>
        )}

      {showModal && (
        <Modal title={editing ? 'Edit Zone' : 'Add Zone'} onClose={() => setShowModal(false)} T={T}>
          <Field label="Zone Name">
            <input autoFocus value={formName} onChange={e => setFormName(e.target.value)}
              placeholder="Enter zone name" style={inputSt}
              onKeyDown={e => e.key === 'Enter' && handleSave()} />
          </Field>
          <div className="flex gap-2 justify-end pt-1">
            <button onClick={() => setShowModal(false)} style={{ background: T.surface, border: `1px solid ${T.cardBorder}`, color: T.textSecondary, borderRadius: 10, padding: '8px 16px', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
            <button onClick={handleSave} disabled={saving || !formName.trim()}
              className="flex items-center gap-2 disabled:opacity-50"
              style={{ background: T.accent, color: '#000', border: 'none', borderRadius: 10, padding: '8px 18px', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{editing ? 'Update' : 'Add'}
            </button>
          </div>
        </Modal>
      )}
      {deleteTarget && <ConfirmDelete name={deleteTarget.name} onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} loading={deleting} T={T} />}
    </div>
  )
}

// ─── WARDS TAB ────────────────────────────────────────────────────────────────
function WardsTab({ T }: { T: any }) {
  const [wards, setWards] = useState<Ward[]>([])
  const [zones, setZones] = useState<Zone[]>([])
  const [loading, setLoading] = useState(true)
  const [zoneFilter, setZoneFilter] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Ward | null>(null)
  const [formName, setFormName] = useState('')
  const [formZoneId, setFormZoneId] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Ward | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const u1 = DataService.onWardsChange(d => { setWards(d); setLoading(false) })
    const u2 = DataService.onZonesChange(setZones)
    return () => { u1(); u2() }
  }, [])

  const getZoneName = (id: string) => zones.find(z => z.id === id)?.name ?? '—'
  const filtered = zoneFilter ? wards.filter(w => w.zoneId === zoneFilter) : wards
  const inputSt = { background: T.surface, border: `1px solid ${T.cardBorder}`, color: T.textPrimary, borderRadius: 10, padding: '8px 12px', fontSize: 13, outline: 'none', width: '100%' }
  const selectSt = { ...inputSt }

  const handleSave = async () => {
    if (!formName.trim() || !formZoneId) return; setSaving(true)
    try {
      const zoneName = getZoneName(formZoneId)
      if (editing) await DataService.updateWard(editing.id, { name: formName.trim(), zoneId: formZoneId, zoneName })
      else await DataService.createWard({ name: formName.trim(), zoneId: formZoneId, zoneName })
      setShowModal(false)
    } catch (e) { console.error(e) } finally { setSaving(false) }
  }
  const handleDelete = async () => {
    if (!deleteTarget) return; setDeleting(true)
    try { await DataService.deleteWard(deleteTarget.id) } catch (e) { console.error(e) }
    finally { setDeleting(false); setDeleteTarget(null) }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium" style={{ color: T.textMuted }}>{filtered.length} ward{filtered.length !== 1 ? 's' : ''}</span>
          <select value={zoneFilter} onChange={e => setZoneFilter(e.target.value)} style={{ ...selectSt, width: 'auto', padding: '6px 10px' }}>
            <option value="">All Zones</option>
            {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
          </select>
        </div>
        <button onClick={() => { setEditing(null); setFormName(''); setFormZoneId(''); setShowModal(true) }}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold"
          style={{ background: T.accent, color: '#000', border: 'none', cursor: 'pointer' }}>
          <Plus className="h-4 w-4" /> Add Ward
        </button>
      </div>

      {loading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" style={{ color: T.accent }} /></div>
        : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-12 gap-2">
            <Building2 className="h-10 w-10 opacity-20" style={{ color: T.accent }} />
            <p className="text-sm" style={{ color: T.textMuted }}>No wards found.</p>
          </div>
        ) : (
          <DataTable headers={['#', 'Ward Name', 'Zone', 'Actions']} T={T} empty={null}>
            {filtered.map((w, i) => (
              <tr key={w.id} style={{ borderBottom: `1px solid ${T.gridLine}` }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = T.surface}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                <td className="px-4 py-3" style={{ color: T.textMuted }}>{i + 1}</td>
                <td className="px-4 py-3 font-semibold" style={{ color: T.textPrimary }}>{w.name}</td>
                <td className="px-4 py-3" style={{ color: T.textSecondary }}>{w.zoneName || getZoneName(w.zoneId)}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1.5">
                    <button onClick={() => { setEditing(w); setFormName(w.name); setFormZoneId(w.zoneId); setShowModal(true) }}
                      className="p-1.5 rounded-lg" style={{ background: T.accentDim, color: T.accent, border: 'none', cursor: 'pointer' }}><Pencil className="h-3.5 w-3.5" /></button>
                    <button onClick={() => setDeleteTarget(w)}
                      className="p-1.5 rounded-lg" style={{ background: `${T.red}15`, color: T.red, border: 'none', cursor: 'pointer' }}><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </DataTable>
        )}

      {showModal && (
        <Modal title={editing ? 'Edit Ward' : 'Add Ward'} onClose={() => setShowModal(false)} T={T}>
          <Field label="Ward Name"><input autoFocus value={formName} onChange={e => setFormName(e.target.value)} placeholder="Enter ward name" style={inputSt} /></Field>
          <Field label="Zone">
            <select value={formZoneId} onChange={e => setFormZoneId(e.target.value)} style={selectSt}>
              <option value="">Select a zone</option>
              {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
            </select>
          </Field>
          <div className="flex gap-2 justify-end pt-1">
            <button onClick={() => setShowModal(false)} style={{ background: T.surface, border: `1px solid ${T.cardBorder}`, color: T.textSecondary, borderRadius: 10, padding: '8px 16px', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
            <button onClick={handleSave} disabled={saving || !formName.trim() || !formZoneId} className="flex items-center gap-2 disabled:opacity-50"
              style={{ background: T.accent, color: '#000', border: 'none', borderRadius: 10, padding: '8px 18px', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{editing ? 'Update' : 'Add'}
            </button>
          </div>
        </Modal>
      )}
      {deleteTarget && <ConfirmDelete name={deleteTarget.name} onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} loading={deleting} T={T} />}
    </div>
  )
}

// ─── KOTHIS TAB ───────────────────────────────────────────────────────────────
function KothisTab({ T }: { T: any }) {
  const [kothis, setKothis] = useState<Kothi[]>([])
  const [wards, setWards] = useState<Ward[]>([])
  const [zones, setZones] = useState<Zone[]>([])
  const [loading, setLoading] = useState(true)
  const [zoneFilter, setZoneFilter] = useState('')
  const [wardFilter, setWardFilter] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Kothi | null>(null)
  const [formName, setFormName] = useState('')
  const [formWardId, setFormWardId] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Kothi | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const u1 = DataService.onKothisChange(d => { setKothis(d); setLoading(false) })
    const u2 = DataService.onWardsChange(setWards)
    const u3 = DataService.onZonesChange(setZones)
    return () => { u1(); u2(); u3() }
  }, [])

  const getWardName = (id: string) => wards.find(w => w.id === id)?.name ?? '—'
  const wardsInZone = zoneFilter ? wards.filter(w => w.zoneId === zoneFilter) : wards
  const filtered = kothis.filter(k => {
    if (wardFilter) return k.wardId === wardFilter
    if (zoneFilter) return wardsInZone.some(w => w.id === k.wardId)
    return true
  })
  const inputSt = { background: T.surface, border: `1px solid ${T.cardBorder}`, color: T.textPrimary, borderRadius: 10, padding: '8px 12px', fontSize: 13, outline: 'none', width: '100%' }
  const selectSt = { ...inputSt }

  const handleSave = async () => {
    if (!formName.trim() || !formWardId) return; setSaving(true)
    try {
      const wardName = getWardName(formWardId)
      if (editing) await DataService.updateKothi(editing.id, { name: formName.trim(), wardId: formWardId, wardName })
      else await DataService.createKothi({ name: formName.trim(), wardId: formWardId, wardName })
      setShowModal(false)
    } catch (e) { console.error(e) } finally { setSaving(false) }
  }
  const handleDelete = async () => {
    if (!deleteTarget) return; setDeleting(true)
    try { await DataService.deleteKothi(deleteTarget.id) } catch (e) { console.error(e) }
    finally { setDeleting(false); setDeleteTarget(null) }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium" style={{ color: T.textMuted }}>{filtered.length} kothi{filtered.length !== 1 ? 's' : ''}</span>
          <select value={zoneFilter} onChange={e => { setZoneFilter(e.target.value); setWardFilter('') }} style={{ ...selectSt, width: 'auto', padding: '6px 10px' }}>
            <option value="">All Zones</option>
            {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
          </select>
          <select value={wardFilter} onChange={e => setWardFilter(e.target.value)} disabled={!zoneFilter}
            style={{ ...selectSt, width: 'auto', padding: '6px 10px', opacity: !zoneFilter ? 0.5 : 1 }}>
            <option value="">All Wards</option>
            {wardsInZone.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
        <button onClick={() => { setEditing(null); setFormName(''); setFormWardId(''); setShowModal(true) }}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold"
          style={{ background: T.accent, color: '#000', border: 'none', cursor: 'pointer' }}>
          <Plus className="h-4 w-4" /> Add Kothi
        </button>
      </div>

      {loading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" style={{ color: T.accent }} /></div>
        : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-12 gap-2">
            <Home className="h-10 w-10 opacity-20" style={{ color: T.accent }} />
            <p className="text-sm" style={{ color: T.textMuted }}>No kothis found.</p>
          </div>
        ) : (
          <DataTable headers={['#', 'Kothi Name', 'Ward', 'Actions']} T={T} empty={null}>
            {filtered.map((k, i) => (
              <tr key={k.id} style={{ borderBottom: `1px solid ${T.gridLine}` }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = T.surface}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                <td className="px-4 py-3" style={{ color: T.textMuted }}>{i + 1}</td>
                <td className="px-4 py-3 font-semibold" style={{ color: T.textPrimary }}>{k.name}</td>
                <td className="px-4 py-3" style={{ color: T.textSecondary }}>{k.wardName || getWardName(k.wardId)}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1.5">
                    <button onClick={() => { setEditing(k); setFormName(k.name); setFormWardId(k.wardId); setShowModal(true) }}
                      className="p-1.5 rounded-lg" style={{ background: T.accentDim, color: T.accent, border: 'none', cursor: 'pointer' }}><Pencil className="h-3.5 w-3.5" /></button>
                    <button onClick={() => setDeleteTarget(k)}
                      className="p-1.5 rounded-lg" style={{ background: `${T.red}15`, color: T.red, border: 'none', cursor: 'pointer' }}><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </DataTable>
        )}

      {showModal && (
        <Modal title={editing ? 'Edit Kothi' : 'Add Kothi'} onClose={() => setShowModal(false)} T={T}>
          <Field label="Kothi Name"><input autoFocus value={formName} onChange={e => setFormName(e.target.value)} placeholder="Enter kothi name" style={inputSt} /></Field>
          <Field label="Ward">
            <select value={formWardId} onChange={e => setFormWardId(e.target.value)} style={selectSt}>
              <option value="">Select a ward</option>
              {wards.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </Field>
          <div className="flex gap-2 justify-end pt-1">
            <button onClick={() => setShowModal(false)} style={{ background: T.surface, border: `1px solid ${T.cardBorder}`, color: T.textSecondary, borderRadius: 10, padding: '8px 16px', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
            <button onClick={handleSave} disabled={saving || !formName.trim() || !formWardId} className="flex items-center gap-2 disabled:opacity-50"
              style={{ background: T.accent, color: '#000', border: 'none', borderRadius: 10, padding: '8px 18px', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{editing ? 'Update' : 'Add'}
            </button>
          </div>
        </Modal>
      )}
      {deleteTarget && <ConfirmDelete name={deleteTarget.name} onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} loading={deleting} T={T} />}
    </div>
  )
}

// ─── MAPPING TAB ──────────────────────────────────────────────────────────────
function MappingTab({ T }: { T: any }) {
  const [zones, setZones] = useState<Zone[]>([])
  const [wards, setWards] = useState<Ward[]>([])
  const [kothis, setKothis] = useState<Kothi[]>([])
  const [feederPoints, setFeederPoints] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<{ zones: Record<string, boolean>; wards: Record<string, boolean>; kothis: Record<string, boolean> }>({ zones: {}, wards: {}, kothis: {} })
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [formZoneId, setFormZoneId] = useState('')
  const [formWardId, setFormWardId] = useState('')
  const [formKothiId, setFormKothiId] = useState('')
  const [formFPId, setFormFPId] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<any>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const u1 = DataService.onZonesChange(setZones)
    const u2 = DataService.onWardsChange(setWards)
    const u3 = DataService.onKothisChange(setKothis)
    const u4 = DataService.onFeederPointsChange((d: any[]) => { setFeederPoints(d); setLoading(false) })
    return () => { u1(); u2(); u3(); u4() }
  }, [])

  const toggle = (type: 'zones' | 'wards' | 'kothis', id: string) =>
    setExpanded(p => ({ ...p, [type]: { ...p[type], [id]: !p[type][id] } }))

  const resetForm = () => { setFormZoneId(''); setFormWardId(''); setFormKothiId(''); setFormFPId('') }

  const mapped = feederPoints.filter(f => f.kothiId).length
  const unmapped = feederPoints.length - mapped

  const formWards = wards.filter(w => w.zoneId === formZoneId)
  const formKothis = kothis.filter(k => k.wardId === formWardId)
  const formFPs = feederPoints.filter(f => !f.kothiId) // only unmapped

  const q = search.toLowerCase().trim()
  const filteredZones = q ? zones.filter(z => {
    const zw = wards.filter(w => w.zoneId === z.id)
    const zk = kothis.filter(k => zw.some(w => w.id === k.wardId))
    const zf = feederPoints.filter(f => zk.some(k => k.id === f.kothiId))
    return z.name.toLowerCase().includes(q) || zw.some(w => w.name.toLowerCase().includes(q)) ||
      zk.some(k => k.name.toLowerCase().includes(q)) || zf.some(f => f.name.toLowerCase().includes(q))
  }) : zones

  const handleSave = async () => {
    if (!formZoneId || !formWardId || !formKothiId || !formFPId) return
    setSaving(true)
    try {
      const kothiName = kothis.find(k => k.id === formKothiId)?.name ?? ''
      await DataService.updateFeederPoint(formFPId, { kothiId: formKothiId, kothiName })
      setShowModal(false); resetForm()
    } catch { alert('Failed to save mapping') } finally { setSaving(false) }
  }
  const handleUnmap = async () => {
    if (!deleteTarget) return; setDeleting(true)
    try { await DataService.updateFeederPoint(deleteTarget.id, { kothiId: undefined, kothiName: undefined }) }
    catch { alert('Failed to remove mapping') } finally { setDeleting(false); setDeleteTarget(null) }
  }

  const selectSt = { background: T.surface, border: `1px solid ${T.cardBorder}`, color: T.textPrimary, borderRadius: 10, padding: '8px 12px', fontSize: 13, outline: 'none', width: '100%' }

  const Badge = ({ bg, text }: { bg: string; text: string }) => (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: bg.replace(')', ',0.15)').replace('rgb', 'rgba'), color: bg }}>{text}</span>
  )

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total FPs', value: feederPoints.length, color: T.textPrimary, bg: T.surface },
          { label: 'Mapped', value: mapped, color: T.green, bg: `${T.green}10` },
          { label: 'Unmapped', value: unmapped, color: T.amber, bg: `${T.amber}10` },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-3 text-center" style={{ background: s.bg, border: `1px solid ${T.cardBorder}` }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: T.textMuted }}>{s.label}</p>
            <p className="text-2xl font-bold" style={{ color: s.color, fontFamily: "'JetBrains Mono',monospace" }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: T.textMuted }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search zones, wards, kothis…"
            className="w-full pl-8 pr-4 py-2 rounded-xl text-sm"
            style={{ background: T.surface, border: `1px solid ${T.cardBorder}`, color: T.textPrimary, outline: 'none' }} />
        </div>
        <button onClick={() => { resetForm(); setShowModal(true) }} disabled={unmapped === 0}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-40"
          style={{ background: T.accent, color: '#000', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <Plus className="h-4 w-4" /> Map FP
        </button>
      </div>

      {unmapped === 0 && feederPoints.length > 0 && (
        <div className="rounded-xl px-3 py-2.5 text-sm font-semibold" style={{ background: `${T.green}10`, border: `1px solid ${T.green}30`, color: T.green }}>
          ✓ All feeder points are mapped.
        </div>
      )}

      {/* Tree */}
      {loading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" style={{ color: T.accent }} /></div>
        : filteredZones.length === 0 ? (
          <div className="flex flex-col items-center py-12 gap-2">
            <GitBranch className="h-10 w-10 opacity-20" style={{ color: T.accent }} />
            <p className="text-sm" style={{ color: T.textMuted }}>{search ? 'No results found.' : 'No zones yet.'}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredZones.map(zone => {
              const zOpen = !!expanded.zones[zone.id]
              const zWards = wards.filter(w => w.zoneId === zone.id)
              const zKothis = kothis.filter(k => zWards.some(w => w.id === k.wardId))
              const zFPs = feederPoints.filter(f => zKothis.some(k => k.id === f.kothiId))
              return (
                <div key={zone.id} className="rounded-xl overflow-hidden" style={{ border: `1px solid ${T.accentBorder}` }}>
                  <button onClick={() => toggle('zones', zone.id)}
                    className="w-full flex items-center gap-2 px-4 py-3 text-left"
                    style={{ background: T.accentDim, border: 'none', cursor: 'pointer' }}>
                    {zOpen ? <ChevronDown className="h-4 w-4 flex-shrink-0" style={{ color: T.accent }} /> : <ChevronRight className="h-4 w-4 flex-shrink-0" style={{ color: T.accent }} />}
                    <Map className="h-4 w-4 flex-shrink-0" style={{ color: T.accent }} />
                    <span className="flex-1 text-sm font-semibold text-left" style={{ color: T.textPrimary }}>{zone.name}</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${T.accent}20`, color: T.accent }}>{zWards.length} ward{zWards.length !== 1 ? 's' : ''}</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full ml-1" style={{ background: `${T.green}15`, color: T.green }}>{zFPs.length} FP</span>
                  </button>
                  {zOpen && (
                    <div className="p-2 space-y-1.5">
                      {zWards.length === 0 ? <p className="text-xs px-3 py-2" style={{ color: T.textMuted }}>No wards in this zone.</p>
                        : zWards.map(ward => {
                          const wOpen = !!expanded.wards[ward.id]
                          const wKothis = kothis.filter(k => k.wardId === ward.id)
                          const wFPs = feederPoints.filter(f => wKothis.some(k => k.id === f.kothiId))
                          return (
                            <div key={ward.id} className="rounded-lg overflow-hidden" style={{ border: `1px solid ${T.green}30` }}>
                              <button onClick={() => toggle('wards', ward.id)}
                                className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
                                style={{ background: `${T.green}08`, border: 'none', cursor: 'pointer' }}>
                                {wOpen ? <ChevronDown className="h-3.5 w-3.5 flex-shrink-0" style={{ color: T.green }} /> : <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" style={{ color: T.green }} />}
                                <Building2 className="h-3.5 w-3.5 flex-shrink-0" style={{ color: T.green }} />
                                <span className="flex-1 text-sm text-left" style={{ color: T.textPrimary }}>{ward.name}</span>
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${T.purple}15`, color: T.purple }}>{wKothis.length} kothi{wKothis.length !== 1 ? 's' : ''}</span>
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full ml-1" style={{ background: `${T.green}15`, color: T.green }}>{wFPs.length}</span>
                              </button>
                              {wOpen && (
                                <div className="divide-y" style={{ borderTop: `1px solid ${T.gridLine}` }}>
                                  {wKothis.length === 0 ? <p className="text-xs px-4 py-2" style={{ color: T.textMuted }}>No kothis.</p>
                                    : wKothis.map(kothi => {
                                      const kOpen = !!expanded.kothis[kothi.id]
                                      const kFPs = feederPoints.filter(f => f.kothiId === kothi.id)
                                      return (
                                        <div key={kothi.id}>
                                          <button onClick={() => toggle('kothis', kothi.id)}
                                            className="w-full flex items-center gap-2 px-4 py-2.5 text-left"
                                            style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
                                            {kOpen ? <ChevronDown className="h-3 w-3 flex-shrink-0" style={{ color: T.purple }} /> : <ChevronRight className="h-3 w-3 flex-shrink-0" style={{ color: T.purple }} />}
                                            <Home className="h-3.5 w-3.5 flex-shrink-0" style={{ color: T.purple }} />
                                            <span className="flex-1 text-sm text-left" style={{ color: T.textPrimary }}>{kothi.name}</span>
                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${T.amber}15`, color: T.amber }}>{kFPs.length} FP{kFPs.length !== 1 ? 's' : ''}</span>
                                          </button>
                                          {kOpen && (
                                            <div className="px-4 pb-2 pt-1 space-y-1.5" style={{ background: T.surface, borderTop: `1px solid ${T.gridLine}` }}>
                                              {kFPs.length === 0 ? <p className="text-xs py-1" style={{ color: T.textMuted }}>No feeder points mapped.</p>
                                                : kFPs.map(fp => (
                                                  <div key={fp.id} className="flex items-center gap-2 rounded-lg px-3 py-2"
                                                    style={{ background: T.card, border: `1px solid ${T.amber}30` }}>
                                                    <Zap className="h-3.5 w-3.5 flex-shrink-0" style={{ color: T.amber }} />
                                                    <span className="flex-1 text-xs font-medium" style={{ color: T.textPrimary }}>{fp.name}</span>
                                                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${T.green}15`, color: T.green }}>Mapped</span>
                                                    <button onClick={() => setDeleteTarget(fp)} className="p-1 rounded-lg"
                                                      style={{ background: `${T.red}15`, color: T.red, border: 'none', cursor: 'pointer' }}>
                                                      <Trash2 className="h-3 w-3" />
                                                    </button>
                                                  </div>
                                                ))
                                              }
                                            </div>
                                          )}
                                        </div>
                                      )
                                    })
                                  }
                                </div>
                              )}
                            </div>
                          )
                        })
                      }
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

      {showModal && (
        <Modal title="Add Mapping" onClose={() => { setShowModal(false); resetForm() }} T={T}>
          <div className="rounded-xl px-3 py-2 text-xs font-semibold mb-2" style={{ background: T.accentDim, color: T.accent }}>
            {unmapped} unmapped feeder point{unmapped !== 1 ? 's' : ''} available
          </div>
          <Field label="Zone">
            <select value={formZoneId} onChange={e => { setFormZoneId(e.target.value); setFormWardId(''); setFormKothiId(''); setFormFPId('') }} style={selectSt}>
              <option value="">Select a zone</option>
              {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
            </select>
          </Field>
          <Field label="Ward">
            <select value={formWardId} onChange={e => { setFormWardId(e.target.value); setFormKothiId(''); setFormFPId('') }} disabled={!formZoneId} style={{ ...selectSt, opacity: !formZoneId ? 0.5 : 1 }}>
              <option value="">Select a ward</option>
              {formWards.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </Field>
          <Field label="Kothi">
            <select value={formKothiId} onChange={e => { setFormKothiId(e.target.value); setFormFPId('') }} disabled={!formWardId} style={{ ...selectSt, opacity: !formWardId ? 0.5 : 1 }}>
              <option value="">Select a kothi</option>
              {formKothis.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
            </select>
          </Field>
          <Field label={`Feeder Point (${formFPs.length} unmapped)`}>
            <select value={formFPId} onChange={e => setFormFPId(e.target.value)} disabled={!formKothiId || formFPs.length === 0} style={{ ...selectSt, opacity: (!formKothiId || formFPs.length === 0) ? 0.5 : 1 }}>
              <option value="">{formFPs.length === 0 ? 'No unmapped feeder points' : 'Select a feeder point'}</option>
              {formFPs.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </Field>
          {formKothiId && formFPs.length === 0 && (
            <p className="text-xs rounded-lg px-3 py-2" style={{ background: `${T.amber}10`, color: T.amber }}>All feeder points are already mapped.</p>
          )}
          <div className="flex gap-2 justify-end pt-1">
            <button onClick={() => { setShowModal(false); resetForm() }} style={{ background: T.surface, border: `1px solid ${T.cardBorder}`, color: T.textSecondary, borderRadius: 10, padding: '8px 16px', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
            <button onClick={handleSave} disabled={saving || !formFPId} className="flex items-center gap-2 disabled:opacity-50"
              style={{ background: T.accent, color: '#000', border: 'none', borderRadius: 10, padding: '8px 18px', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Map
            </button>
          </div>
        </Modal>
      )}
      {deleteTarget && <ConfirmDelete name={`mapping for "${deleteTarget.name}"`} onConfirm={handleUnmap} onCancel={() => setDeleteTarget(null)} loading={deleting} T={T} />}
    </div>
  )
}

// ─── ASSIGNMENT TAB ───────────────────────────────────────────────────────────
function AssignmentTab({ T }: { T: any }) {
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [allFPs, setAllFPs] = useState<any[]>([])
  const [allWards, setAllWards] = useState<Ward[]>([])
  const [allKothis, setAllKothis] = useState<Kothi[]>([])
  const [allZones, setAllZones] = useState<Zone[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [shiftOptions, setShiftOptions] = useState<{ label: string; value: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Assignment | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Assignment | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [formZoneId, setFormZoneId] = useState('')
  const [formWardId, setFormWardId] = useState('')
  const [formKothiId, setFormKothiId] = useState('')
  const [formFPId, setFormFPId] = useState('')
  const [formUserId, setFormUserId] = useState('')
  const [formShiftId, setFormShiftId] = useState('')

  useEffect(() => {
    const u1 = DataService.onAssignmentsChange(setAssignments)
    const u2 = DataService.onFeederPointsChange(setAllFPs)
    const u3 = DataService.onZonesChange(setAllZones)
    const u4 = DataService.onWardsChange(setAllWards)
    const u5 = DataService.onKothisChange(setAllKothis)
    DataService.getAllUsers().then((us: any[]) => {
      setUsers(us.filter(u => u.role === 'task_force_team'))
      setLoading(false)
    })
    // Load shift definitions from Firestore + built-in fallback
    const unsubShifts = onSnapshot(collection(db, 'shiftDefinitions'), snap => {
      const firestoreShifts = snap.docs.map(d => ({ label: (d.data() as any).name || d.id, value: d.id }))
      const firestoreIds = new Set(firestoreShifts.map(s => s.value))
      const builtIn = BUILT_IN_SHIFTS.filter(s => !firestoreIds.has(s)).map(s => ({ label: s, value: s }))
      setShiftOptions([...firestoreShifts, ...builtIn])
    })
    return () => { u1(); u2(); u3(); u4(); u5(); unsubShifts() }
  }, [])

  const getName = {
    zone: (id: string) => allZones.find(z => z.id === id)?.name ?? '—',
    ward: (id: string) => allWards.find(w => w.id === id)?.name ?? '—',
    kothi: (id: string) => allKothis.find(k => k.id === id)?.name ?? '—',
    fp: (id: string) => allFPs.find(f => f.id === id)?.name ?? '—',
    user: (id: string) => users.find(u => u.id === id)?.name ?? '—',
    shift: (id: string) => shiftOptions.find(s => s.value === id)?.label ?? id,
  }

  const fWards = allWards.filter(w => w.zoneId === formZoneId)
  const fKothis = allKothis.filter(k => k.wardId === formWardId)
  const fFPs = formKothiId ? allFPs.filter(f => f.kothiId === formKothiId) : []
  const selectedFP = allFPs.find(f => f.id === formFPId)
  const isChronic = (selectedFP as any)?.type === 'chronic'

  const takenShifts = (fpId: string, userId: string, excludeId?: string) =>
    new Set(assignments.filter(a => a.feederPointId === fpId && a.userId === userId && (a as any).shiftId && a.id !== excludeId).map(a => (a as any).shiftId as string))

  const availableShifts = useMemo(() => {
    if (!isChronic || !formFPId || !formUserId) return shiftOptions
    const taken = takenShifts(formFPId, formUserId, editing?.id)
    return shiftOptions.filter(s => !taken.has(s.value))
  }, [isChronic, formFPId, formUserId, shiftOptions, assignments, editing?.id])

  const resetForm = () => { setFormZoneId(''); setFormWardId(''); setFormKothiId(''); setFormFPId(''); setFormUserId(''); setFormShiftId('') }

  const openAdd = () => { setEditing(null); resetForm(); setShowModal(true) }
  const openEdit = (a: Assignment) => {
    setEditing(a); setFormZoneId(a.zoneId || ''); setFormWardId(a.wardId || ''); setFormKothiId(a.kothiId || '')
    setFormFPId(a.feederPointId); setFormUserId(a.userId || ''); setFormShiftId((a as any).shiftId || ''); setShowModal(true)
  }

  const handleSave = async () => {
    if (!formFPId || !formUserId) return
    if (isChronic && !formShiftId) { alert('Please select a shift for this chronic point assignment.'); return }
    if (isChronic && formShiftId) {
      const taken = takenShifts(formFPId, formUserId, editing?.id)
      if (taken.has(formShiftId)) { alert(`This member already has the "${getName.shift(formShiftId)}" shift for this chronic point.`); return }
    }
    setSaving(true)
    try {
      const payload: any = {
        zoneId: formZoneId, zoneName: getName.zone(formZoneId),
        wardId: formWardId, wardName: getName.ward(formWardId),
        kothiId: formKothiId, kothiName: getName.kothi(formKothiId),
        feederPointId: formFPId, feederPointName: getName.fp(formFPId),
        userId: formUserId, userName: getName.user(formUserId),
        ...(isChronic && formShiftId ? { shiftId: formShiftId, shiftName: getName.shift(formShiftId) } : {}),
      }
      if (editing) await DataService.updateAssignment(editing.id, payload)
      else await DataService.createAssignment(payload)
      if (formFPId && formKothiId) await DataService.updateFeederPoint(formFPId, { kothiId: formKothiId, kothiName: getName.kothi(formKothiId) })
      setShowModal(false); resetForm()
    } catch (e) { console.error(e); alert('Failed to save assignment') } finally { setSaving(false) }
  }
  const handleDelete = async () => {
    if (!deleteTarget) return; setDeleting(true)
    try { await DataService.deleteAssignment(deleteTarget.id) } catch (e) { console.error(e) }
    finally { setDeleting(false); setDeleteTarget(null) }
  }

  const selectSt = { background: T.surface, border: `1px solid ${T.cardBorder}`, color: T.textPrimary, borderRadius: 10, padding: '8px 12px', fontSize: 13, outline: 'none', width: '100%' }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium" style={{ color: T.textMuted }}>{assignments.length} assignment{assignments.length !== 1 ? 's' : ''}</span>
        <button onClick={openAdd} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold"
          style={{ background: T.accent, color: '#000', border: 'none', cursor: 'pointer' }}>
          <Plus className="h-4 w-4" /> Assign
        </button>
      </div>

      {loading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" style={{ color: T.accent }} /></div>
        : assignments.length === 0 ? (
          <div className="flex flex-col items-center py-12 gap-2">
            <ClipboardList className="h-10 w-10 opacity-20" style={{ color: T.accent }} />
            <p className="text-sm" style={{ color: T.textMuted }}>No assignments yet.</p>
          </div>
        ) : (
          <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${T.cardBorder}` }}>
            <div className="overflow-x-auto">
              <table className="w-full" style={{ fontSize: 12 }}>
                <thead>
                  <tr style={{ background: T.surface, borderBottom: `1px solid ${T.cardBorder}` }}>
                    {['#', 'Feeder Point', 'Zone › Ward › Kothi', 'Assigned To', 'Shift', 'Actions'].map(h => (
                      <th key={h} className="text-left px-4 py-3 font-semibold uppercase tracking-wider whitespace-nowrap"
                        style={{ fontSize: 10, color: T.accent }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {assignments.map((a, i) => (
                    <tr key={a.id} style={{ borderBottom: `1px solid ${T.gridLine}` }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = T.surface}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                      <td className="px-4 py-3" style={{ color: T.textMuted }}>{i + 1}</td>
                      <td className="px-4 py-3 font-semibold" style={{ color: T.textPrimary }}>{a.feederPointName || getName.fp(a.feederPointId)}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: T.textSecondary }}>
                        {[a.zoneName || getName.zone(a.zoneId || ''), a.wardName || getName.ward(a.wardId || ''), a.kothiName || getName.kothi(a.kothiId || '')].filter(v => v !== '—').join(' › ')}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ background: T.accent }} />
                          <span style={{ color: T.accent }}>{a.userName || getName.user(a.userId || '')}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {(a as any).shiftId ? (
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold w-fit"
                            style={{ background: `${T.purple}15`, color: T.purple }}>
                            <Clock className="h-3 w-3" />{(a as any).shiftName || (a as any).shiftId}
                          </span>
                        ) : <span style={{ color: T.textMuted }}>—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1.5">
                          <button onClick={() => openEdit(a)} className="p-1.5 rounded-lg"
                            style={{ background: T.accentDim, color: T.accent, border: 'none', cursor: 'pointer' }}><Pencil className="h-3.5 w-3.5" /></button>
                          <button onClick={() => setDeleteTarget(a)} className="p-1.5 rounded-lg"
                            style={{ background: `${T.red}15`, color: T.red, border: 'none', cursor: 'pointer' }}><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      {showModal && (
        <Modal title={editing ? 'Edit Assignment' : 'Add Assignment'} onClose={() => { setShowModal(false); resetForm() }} T={T}>
          <Field label="Zone">
            <select value={formZoneId} onChange={e => { setFormZoneId(e.target.value); setFormWardId(''); setFormKothiId(''); setFormFPId(''); setFormShiftId('') }} style={selectSt}>
              <option value="">Select a zone</option>
              {allZones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
            </select>
          </Field>
          <Field label="Ward">
            <select value={formWardId} onChange={e => { setFormWardId(e.target.value); setFormKothiId(''); setFormFPId(''); setFormShiftId('') }} disabled={!formZoneId} style={{ ...selectSt, opacity: !formZoneId ? 0.5 : 1 }}>
              <option value="">Select a ward</option>
              {fWards.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </Field>
          <Field label="Kothi">
            <select value={formKothiId} onChange={e => { setFormKothiId(e.target.value); setFormFPId(''); setFormShiftId('') }} disabled={!formWardId} style={{ ...selectSt, opacity: !formWardId ? 0.5 : 1 }}>
              <option value="">Select a kothi</option>
              {fKothis.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
            </select>
          </Field>
          <Field label="Feeder Point">
            <select value={formFPId} onChange={e => { setFormFPId(e.target.value); setFormShiftId('') }} disabled={!formKothiId} style={{ ...selectSt, opacity: !formKothiId ? 0.5 : 1 }}>
              <option value="">Select a feeder point</option>
              {fFPs.map(f => <option key={f.id} value={f.id}>{f.name}{(f as any).type === 'chronic' ? ' 🔴' : ''}</option>)}
            </select>
          </Field>
          <Field label="Task Force User">
            <select value={formUserId} onChange={e => { setFormUserId(e.target.value); setFormShiftId('') }} style={selectSt}>
              <option value="">Select a user</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </Field>
          {isChronic && (
            <>
              <div className="rounded-xl px-3 py-2.5 flex items-start gap-2" style={{ background: `${T.purple}10`, border: `1px solid ${T.purple}30` }}>
                <Clock className="h-4 w-4 flex-shrink-0 mt-0.5" style={{ color: T.purple }} />
                <p className="text-xs" style={{ color: T.purple }}>Chronic point — select the shift. Each member can only be assigned one shift per chronic point.</p>
              </div>
              <Field label="Shift">
                <select value={formShiftId} onChange={e => setFormShiftId(e.target.value)}
                  disabled={!formUserId || availableShifts.length === 0}
                  style={{ ...selectSt, opacity: (!formUserId || availableShifts.length === 0) ? 0.5 : 1 }}>
                  <option value="">{!formUserId ? 'Select a user first' : availableShifts.length === 0 ? 'All shifts taken' : 'Select a shift'}</option>
                  {availableShifts.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </Field>
              {formUserId && availableShifts.length === 0 && (
                <div className="rounded-xl px-3 py-2 flex items-start gap-2" style={{ background: `${T.red}10`, border: `1px solid ${T.red}30` }}>
                  <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" style={{ color: T.red }} />
                  <p className="text-xs" style={{ color: T.red }}>This member already has all available shifts for this chronic point.</p>
                </div>
              )}
            </>
          )}
          <div className="flex gap-2 justify-end pt-1">
            <button onClick={() => { setShowModal(false); resetForm() }} style={{ background: T.surface, border: `1px solid ${T.cardBorder}`, color: T.textSecondary, borderRadius: 10, padding: '8px 16px', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
            <button onClick={handleSave} disabled={saving || !formFPId || !formUserId || (isChronic && !formShiftId)} className="flex items-center gap-2 disabled:opacity-50"
              style={{ background: T.accent, color: '#000', border: 'none', borderRadius: 10, padding: '8px 18px', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{editing ? 'Update' : 'Assign'}
            </button>
          </div>
        </Modal>
      )}
      {deleteTarget && <ConfirmDelete name={`${deleteTarget.feederPointName} → ${deleteTarget.userName}`} onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} loading={deleting} T={T} />}
    </div>
  )
}

// ─── SHIFTS TAB ───────────────────────────────────────────────────────────────
function ShiftsTab({ T }: { T: any }) {
  const [shifts, setShifts] = useState<ShiftDefinition[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<ShiftDefinition | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ShiftDefinition | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [formName, setFormName] = useState('')
  const [formStartHour, setFormStartHour] = useState('')
  const [formStartMin, setFormStartMin] = useState('0')
  const [formEndHour, setFormEndHour] = useState('')
  const [formOvernight, setFormOvernight] = useState(false)
  const [formActive, setFormActive] = useState(true)

  useEffect(() => {
    const u = onSnapshot(collection(db, 'shiftDefinitions'), snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as ShiftDefinition)).sort((a, b) => a.name.localeCompare(b.name))
      setShifts(data); setLoading(false)
    })
    return u
  }, [])

  const resetForm = () => { setFormName(''); setFormStartHour(''); setFormStartMin('0'); setFormEndHour(''); setFormOvernight(false); setFormActive(true); setEditing(null) }

  const buildId = (sh: number, sm: number, eh: number) => {
    const fmtH = (h: number, m: number) => { const p = h >= 12 ? 'PM' : 'AM'; const h12 = h % 12 === 0 ? 12 : h % 12; return m === 0 ? `${h12}${p}` : `${h12}:${String(m).padStart(2, '0')}${p}` }
    return `${fmtH(sh, sm)}-${fmtH(eh, 0)}`
  }

  const handleSave = async () => {
    const sh = parseInt(formStartHour, 10), sm = parseInt(formStartMin, 10), eh = parseInt(formEndHour, 10)
    if (!formName.trim() || isNaN(sh) || isNaN(eh)) return
    if (sh < 0 || sh > 23 || eh < 0 || eh > 23) { alert('Hours must be 0–23'); return }
    setSaving(true)
    try {
      const payload = { name: formName.trim(), startHour: sh, startMinute: sm, endHour: eh, overnight: formOvernight, active: formActive }
      if (editing) {
        await updateDoc(doc(db, 'shiftDefinitions', editing.id), payload)
      } else {
        const id = buildId(sh, sm, eh)
        const { setDoc: sd, doc: fd } = await import('firebase/firestore')
        await sd(fd(db, 'shiftDefinitions', id), { ...payload, createdAt: serverTimestamp() })
      }
      setShowModal(false); resetForm()
    } catch { alert('Failed to save shift') } finally { setSaving(false) }
  }
  const handleDelete = async () => {
    if (!deleteTarget) return; setDeleting(true)
    try { await deleteDoc(doc(db, 'shiftDefinitions', deleteTarget.id)) } catch { alert('Failed to delete') }
    finally { setDeleting(false); setDeleteTarget(null) }
  }
  const toggleActive = async (s: ShiftDefinition) => {
    try { await updateDoc(doc(db, 'shiftDefinitions', s.id), { active: !s.active }) } catch { alert('Failed to update') }
  }

  const fmt12 = (h: number, m: number = 0) => { const p = h >= 12 ? 'PM' : 'AM'; const h12 = h % 12 === 0 ? 12 : h % 12; return m === 0 ? `${h12}:00 ${p} (${h}:00)` : `${h12}:${String(m).padStart(2, '0')} ${p}` }
  const hourOptions = Array.from({ length: 24 }, (_, i) => ({ value: String(i), label: fmt12(i) }))
  const minuteOptions = [{ value: '0', label: ':00 (on the hour)' }, { value: '30', label: ':30 (half past)' }]
  const endHourOptions = formStartHour === '' ? hourOptions : Array.from({ length: 23 }, (_, i) => ({ value: String((parseInt(formStartHour) + i + 1) % 24), label: fmt12((parseInt(formStartHour) + i + 1) % 24) }))
  const previewId = formStartHour !== '' && formEndHour !== '' ? buildId(parseInt(formStartHour), parseInt(formStartMin), parseInt(formEndHour)) : ''
  const inputSt = { background: T.surface, border: `1px solid ${T.cardBorder}`, color: T.textPrimary, borderRadius: 10, padding: '8px 12px', fontSize: 13, outline: 'none', width: '100%' }
  const selectSt = { ...inputSt }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm font-medium" style={{ color: T.textMuted }}>{shifts.length} custom shift{shifts.length !== 1 ? 's' : ''}</span>
          <div className="flex items-center gap-1.5 mt-1 text-xs" style={{ color: T.textMuted }}>
            <Clock className="h-3 w-3" /> Built-in: {BUILT_IN_SHIFTS.join(' · ')}
          </div>
        </div>
        <button onClick={() => { resetForm(); setShowModal(true) }}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold"
          style={{ background: T.accent, color: '#000', border: 'none', cursor: 'pointer' }}>
          <Plus className="h-4 w-4" /> Add Shift
        </button>
      </div>

      <div className="rounded-xl px-3 py-2.5 flex items-center gap-2" style={{ background: T.accentDim, border: `1px solid ${T.accentBorder}` }}>
        <Clock className="h-4 w-4 flex-shrink-0" style={{ color: T.accent }} />
        <p className="text-xs" style={{ color: T.accent }}>Each shift creates hourly slots for chronic point monitoring.</p>
      </div>

      {loading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" style={{ color: T.accent }} /></div>
        : shifts.length === 0 ? (
          <div className="flex flex-col items-center py-8 gap-2">
            <Clock className="h-10 w-10 opacity-20" style={{ color: T.accent }} />
            <p className="text-sm" style={{ color: T.textMuted }}>No custom shifts yet. Built-in shifts are always available.</p>
          </div>
        ) : (
          <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${T.cardBorder}` }}>
            {shifts.map((s, i) => (
              <div key={s.id} className="flex items-center gap-3 px-4 py-3"
                style={{ borderBottom: i < shifts.length - 1 ? `1px solid ${T.gridLine}` : 'none' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = T.surface}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                <span className="text-xs w-5" style={{ color: T.textMuted }}>{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm" style={{ color: T.textPrimary }}>{s.name}</p>
                  <p className="text-[10px] font-mono mt-0.5" style={{ color: T.textMuted }}>ID: {s.id}{s.overnight ? ' · overnight' : ''}</p>
                </div>
                <button onClick={() => toggleActive(s)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold"
                  style={{ background: s.active !== false ? `${T.green}15` : T.surface, color: s.active !== false ? T.green : T.textMuted, border: `1px solid ${s.active !== false ? T.green : T.cardBorder}30`, cursor: 'pointer' }}>
                  {s.active !== false ? <ToggleRight className="h-3.5 w-3.5" /> : <ToggleLeft className="h-3.5 w-3.5" />}
                  {s.active !== false ? 'Active' : 'Off'}
                </button>
                <div className="flex gap-1.5">
                  <button onClick={() => { setEditing(s); setFormName(s.name); setFormStartHour(String(s.startHour)); setFormStartMin(String(s.startMinute ?? 0)); setFormEndHour(String(s.endHour)); setFormOvernight(s.overnight); setFormActive(s.active !== false); setShowModal(true) }}
                    className="p-1.5 rounded-lg" style={{ background: T.accentDim, color: T.accent, border: 'none', cursor: 'pointer' }}><Pencil className="h-3.5 w-3.5" /></button>
                  <button onClick={() => setDeleteTarget(s)} className="p-1.5 rounded-lg"
                    style={{ background: `${T.red}15`, color: T.red, border: 'none', cursor: 'pointer' }}><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        )}

      {showModal && (
        <Modal title={editing ? 'Edit Shift' : 'Add Shift'} onClose={() => { setShowModal(false); resetForm() }} T={T}>
          <Field label="Shift Name">
            <input autoFocus value={formName} onChange={e => setFormName(e.target.value)} placeholder="e.g. Late Night, Morning" style={inputSt} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start Hour">
              <select value={formStartHour} onChange={e => { setFormStartHour(e.target.value); setFormEndHour('') }} style={selectSt}>
                <option value="">Select hour</option>
                {hourOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
            <Field label="Start Minute">
              <select value={formStartMin} onChange={e => { setFormStartMin(e.target.value); setFormEndHour('') }} style={selectSt}>
                {minuteOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
          </div>
          <Field label="End Hour">
            <select value={formEndHour} onChange={e => setFormEndHour(e.target.value)} disabled={formStartHour === ''} style={{ ...selectSt, opacity: formStartHour === '' ? 0.5 : 1 }}>
              <option value="">{formStartHour === '' ? 'Select start hour first' : 'Select end hour'}</option>
              {endHourOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          <div className="flex items-center justify-between rounded-xl px-3 py-2.5" style={{ background: T.surface, border: `1px solid ${T.cardBorder}` }}>
            <div>
              <p className="text-xs font-semibold" style={{ color: T.textPrimary }}>Overnight Shift</p>
              <p className="text-[10px] mt-0.5" style={{ color: T.textMuted }}>Crosses midnight (e.g. 11 PM → 7 AM)</p>
            </div>
            <button onClick={() => setFormOvernight(v => !v)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold"
              style={{ background: formOvernight ? T.accentDim : T.card, color: formOvernight ? T.accent : T.textSecondary, border: `1px solid ${formOvernight ? T.accentBorder : T.cardBorder}`, cursor: 'pointer' }}>
              {formOvernight ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />} {formOvernight ? 'On' : 'Off'}
            </button>
          </div>
          <div className="flex items-center justify-between rounded-xl px-3 py-2.5" style={{ background: T.surface, border: `1px solid ${T.cardBorder}` }}>
            <div>
              <p className="text-xs font-semibold" style={{ color: T.textPrimary }}>Active</p>
              <p className="text-[10px] mt-0.5" style={{ color: T.textMuted }}>Inactive shifts are hidden from taskforce users</p>
            </div>
            <button onClick={() => setFormActive(v => !v)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold"
              style={{ background: formActive ? `${T.green}15` : T.card, color: formActive ? T.green : T.textSecondary, border: `1px solid ${formActive ? T.green : T.cardBorder}30`, cursor: 'pointer' }}>
              {formActive ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />} {formActive ? 'Active' : 'Off'}
            </button>
          </div>
          {previewId && (
            <div className="rounded-xl px-3 py-2.5" style={{ background: T.surface, border: `1px solid ${T.cardBorder}` }}>
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: T.textMuted }}>Shift ID (auto-generated)</p>
              <p className="text-sm font-bold font-mono" style={{ color: T.textPrimary }}>{previewId}</p>
            </div>
          )}
          <div className="flex gap-2 justify-end pt-1">
            <button onClick={() => { setShowModal(false); resetForm() }} style={{ background: T.surface, border: `1px solid ${T.cardBorder}`, color: T.textSecondary, borderRadius: 10, padding: '8px 16px', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
            <button onClick={handleSave} disabled={saving || !formName.trim() || formStartHour === '' || formEndHour === ''} className="flex items-center gap-2 disabled:opacity-50"
              style={{ background: T.accent, color: '#000', border: 'none', borderRadius: 10, padding: '8px 18px', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{editing ? 'Update' : 'Add'}
            </button>
          </div>
        </Modal>
      )}
      {deleteTarget && <ConfirmDelete name={deleteTarget.name} onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} loading={deleting} T={T} />}
    </div>
  )
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function MasterPage() {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const T = getTokens(dark)
  const [activeTab, setActiveTab] = useState<TabName>('Zones')

  const tabColor: Record<TabName, string> = {
    Zones: T.accent, Wards: T.green, Kothis: T.purple,
    Mapping: T.amber, Assignment: T.accent, Shifts: T.purple,
  }

  const renderTab = () => {
    switch (activeTab) {
      case 'Zones': return <ZonesTab T={T} />
      case 'Wards': return <WardsTab T={T} />
      case 'Kothis': return <KothisTab T={T} />
      case 'Mapping': return <MappingTab T={T} />
      case 'Assignment': return <AssignmentTab T={T} />
      case 'Shifts': return <ShiftsTab T={T} />
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl"
          style={{ background: T.accentDim, border: `1px solid ${T.accentBorder}` }}>
          <GitBranch className="h-6 w-6" style={{ color: T.accent }} />
        </div>
        <div>
          <h1 className="text-2xl font-black tracking-tight" style={{ color: T.textPrimary }}>Master</h1>
          <p className="text-sm" style={{ color: T.textMuted }}>Manage zones, wards, kothis, mappings & assignments</p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex flex-wrap gap-2">
        {TABS.map(tab => {
          const active = activeTab === tab.name
          const color = tabColor[tab.name]
          return (
            <button key={tab.name} onClick={() => setActiveTab(tab.name)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
              style={{
                background: active ? `${color}18` : T.surface,
                color: active ? color : T.textSecondary,
                border: `1px solid ${active ? color : T.cardBorder}`,
                cursor: 'pointer',
                boxShadow: active ? `0 2px 8px ${color}20` : 'none',
              }}>
              <tab.icon className="h-4 w-4" />
              {tab.name}
            </button>
          )
        })}
      </div>

      {/* Content card */}
      <div className="rounded-2xl p-5" style={{ background: T.card, border: `1px solid ${T.cardBorder}` }}>
        {renderTab()}
      </div>
    </div>
  )
}