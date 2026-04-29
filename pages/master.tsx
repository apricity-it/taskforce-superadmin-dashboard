import { useState, useEffect } from 'react'
import { Map, Building2, Home, ClipboardList, Plus, Pencil, Trash2, X, Loader2, AlertCircle } from 'lucide-react'
import { DataService, Zone, Ward, Kothi, Assignment } from '@/lib/dataService'

const tabs = [
  { name: 'Zones', icon: Map },
  { name: 'Wards', icon: Building2 },
  { name: 'Kothis', icon: Home },
  { name: 'Assignment', icon: ClipboardList },
]

// ─── Reusable Modal ───────────────────────────────────────────────────────────
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6 relative">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ─── Confirm Delete Modal ─────────────────────────────────────────────────────
function ConfirmDelete({ name, onConfirm, onCancel, loading }: { name: string; onConfirm: () => void; onCancel: () => void; loading: boolean }) {
  return (
    <Modal title="Confirm Delete" onClose={onCancel}>
      <div className="flex items-start gap-3 mb-6">
        <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
        <p className="text-sm text-gray-600">
          Are you sure you want to delete <span className="font-semibold text-gray-900">"{name}"</span>? This action cannot be undone.
        </p>
      </div>
      <div className="flex gap-3 justify-end">
        <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
          Cancel
        </button>
        <button onClick={onConfirm} disabled={loading} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-60 flex items-center gap-2 transition-colors">
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Delete
        </button>
      </div>
    </Modal>
  )
}

// ─── ZONES TAB ────────────────────────────────────────────────────────────────
function ZonesTab() {
  const [zones, setZones] = useState<Zone[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Zone | null>(null)
  const [formName, setFormName] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Zone | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const unsub = DataService.onZonesChange(setZones)
    setLoading(false)
    return unsub
  }, [])

  const openAdd = () => { setEditing(null); setFormName(''); setShowModal(true) }
  const openEdit = (z: Zone) => { setEditing(z); setFormName(z.name); setShowModal(true) }

  const handleSave = async () => {
    if (!formName.trim()) return
    setSaving(true)
    try {
      if (editing) {
        await DataService.updateZone(editing.id, { name: formName.trim() })
      } else {
        await DataService.createZone({ name: formName.trim() })
      }
      setShowModal(false)
    } catch (e) { console.error(e) }
    setSaving(false)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try { await DataService.deleteZone(deleteTarget.id) } catch (e) { console.error(e) }
    setDeleting(false)
    setDeleteTarget(null)
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-gray-500">{zones.length} zone{zones.length !== 1 ? 's' : ''}</p>
        <button onClick={openAdd} className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
          <Plus className="h-4 w-4" /> Add Zone
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>
      ) : zones.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Map className="h-10 w-10 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No zones yet. Add your first zone.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">#</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Zone Name</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {zones.map((z, i) => (
                <tr key={z.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-gray-400">{i + 1}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{z.name}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => openEdit(z)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => setDeleteTarget(z)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <Modal title={editing ? 'Edit Zone' : 'Add Zone'} onClose={() => setShowModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Zone Name</label>
              <input
                type="text"
                value={formName}
                onChange={e => setFormName(e.target.value)}
                placeholder="Enter zone name"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                onKeyDown={e => e.key === 'Enter' && handleSave()}
                autoFocus
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={handleSave} disabled={saving || !formName.trim()} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2 transition-colors">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {editing ? 'Update' : 'Add'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {deleteTarget && (
        <ConfirmDelete name={deleteTarget.name} onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} loading={deleting} />
      )}
    </div>
  )
}

// ─── WARDS TAB ────────────────────────────────────────────────────────────────
function WardsTab() {
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
    const unsubWards = DataService.onWardsChange(setWards)
    const unsubZones = DataService.onZonesChange(setZones)
    setLoading(false)
    return () => { unsubWards(); unsubZones() }
  }, [])

  const getZoneName = (zoneId: string) => zones.find(z => z.id === zoneId)?.name ?? '—'
  const filteredWards = zoneFilter ? wards.filter(w => w.zoneId === zoneFilter) : wards

  const openAdd = () => { setEditing(null); setFormName(''); setFormZoneId(''); setShowModal(true) }
  const openEdit = (w: Ward) => { setEditing(w); setFormName(w.name); setFormZoneId(w.zoneId); setShowModal(true) }

  const handleSave = async () => {
    if (!formName.trim() || !formZoneId) return
    setSaving(true)
    try {
      const zoneName = getZoneName(formZoneId)
      if (editing) {
        await DataService.updateWard(editing.id, { name: formName.trim(), zoneId: formZoneId, zoneName })
      } else {
        await DataService.createWard({ name: formName.trim(), zoneId: formZoneId, zoneName })
      }
      setShowModal(false)
    } catch (e) { console.error(e) }
    setSaving(false)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try { await DataService.deleteWard(deleteTarget.id) } catch (e) { console.error(e) }
    setDeleting(false)
    setDeleteTarget(null)
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        {/* <p className="text-sm text-gray-500">{wards.length} ward{wards.length !== 1 ? 's' : ''}</p> */}
        <div className="flex items-center gap-3">
          <p className="text-sm text-gray-500">{filteredWards.length} ward{filteredWards.length !== 1 ? 's' : ''}</p>
          <select
            value={zoneFilter}
            onChange={e => setZoneFilter(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Zones</option>
            {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
          </select>
        </div>
        <button onClick={openAdd} className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
          <Plus className="h-4 w-4" /> Add Ward
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>
      ) : wards.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Building2 className="h-10 w-10 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No wards yet. Add your first ward.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">#</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Ward Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Zone</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredWards.map((w, i) => (
                <tr key={w.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-gray-400">{i + 1}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{w.name}</td>
                  <td className="px-4 py-3 text-gray-500">{w.zoneName || getZoneName(w.zoneId)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => openEdit(w)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => setDeleteTarget(w)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <Modal title={editing ? 'Edit Ward' : 'Add Ward'} onClose={() => setShowModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ward Name</label>
              <input
                type="text"
                value={formName}
                onChange={e => setFormName(e.target.value)}
                placeholder="Enter ward name"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Zone</label>
              <select
                value={formZoneId}
                onChange={e => setFormZoneId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select a zone</option>
                {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
              </select>
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={handleSave} disabled={saving || !formName.trim() || !formZoneId} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2 transition-colors">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {editing ? 'Update' : 'Add'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {deleteTarget && (
        <ConfirmDelete name={deleteTarget.name} onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} loading={deleting} />
      )}
    </div>
  )
}

// ─── KOTHIS TAB ───────────────────────────────────────────────────────────────
function KothisTab() {
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
    const unsubKothis = DataService.onKothisChange(setKothis)
    const unsubWards = DataService.onWardsChange(setWards)
    const unsubZones = DataService.onZonesChange(setZones)
    setLoading(false)
    return () => { unsubKothis(); unsubWards(); unsubZones() }
  }, [])


  const getWardName = (wardId: string) => wards.find(w => w.id === wardId)?.name ?? '—'
  const filteredWardOptions = zoneFilter ? wards.filter(w => w.zoneId === zoneFilter) : wards
  const filteredKothis = kothis.filter(k => {
    if (wardFilter) return k.wardId === wardFilter
    if (zoneFilter) return filteredWardOptions.some(w => w.id === k.wardId)
    return true
  })

  const openAdd = () => { setEditing(null); setFormName(''); setFormWardId(''); setShowModal(true) }
  const openEdit = (k: Kothi) => { setEditing(k); setFormName(k.name); setFormWardId(k.wardId); setShowModal(true) }

  const handleSave = async () => {
    if (!formName.trim() || !formWardId) return
    setSaving(true)
    try {
      const wardName = getWardName(formWardId)
      if (editing) {
        await DataService.updateKothi(editing.id, { name: formName.trim(), wardId: formWardId, wardName })
      } else {
        await DataService.createKothi({ name: formName.trim(), wardId: formWardId, wardName })
      }
      setShowModal(false)
    } catch (e) { console.error(e) }
    setSaving(false)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try { await DataService.deleteKothi(deleteTarget.id) } catch (e) { console.error(e) }
    setDeleting(false)
    setDeleteTarget(null)
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-3 flex-wrap">
          <p className="text-sm text-gray-500">{filteredKothis.length} kothi{filteredKothis.length !== 1 ? 's' : ''}</p>
          <select
            value={zoneFilter}
            onChange={e => { setZoneFilter(e.target.value); setWardFilter('') }}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Zones</option>
            {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
          </select>
          <select
            value={wardFilter}
            onChange={e => setWardFilter(e.target.value)}
            disabled={!zoneFilter}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
          >
            <option value="">All Wards</option>
            {filteredWardOptions.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
        <button onClick={openAdd} className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
          <Plus className="h-4 w-4" /> Add Kothi
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>
      ) : kothis.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Home className="h-10 w-10 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No kothis yet. Add your first kothi.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">#</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Kothi Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Ward</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredKothis.map((k, i) => (
                <tr key={k.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-gray-400">{i + 1}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{k.name}</td>
                  <td className="px-4 py-3 text-gray-500">{k.wardName || getWardName(k.wardId)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => openEdit(k)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => setDeleteTarget(k)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <Modal title={editing ? 'Edit Kothi' : 'Add Kothi'} onClose={() => setShowModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kothi Name</label>
              <input
                type="text"
                value={formName}
                onChange={e => setFormName(e.target.value)}
                placeholder="Enter kothi name"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ward</label>
              <select
                value={formWardId}
                onChange={e => setFormWardId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select a ward</option>
                {wards.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={handleSave} disabled={saving || !formName.trim() || !formWardId} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2 transition-colors">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {editing ? 'Update' : 'Add'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {deleteTarget && (
        <ConfirmDelete name={deleteTarget.name} onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} loading={deleting} />
      )}
    </div>
  )
}

// ─── ASSIGNMENT TAB ───────────────────────────────────────────────────────────
function AssignmentTab() {
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [allFeederPoints, setAllFeederPoints] = useState<any[]>([])
  const [allWards, setAllWards] = useState<Ward[]>([])
  const [allKothis, setAllKothis] = useState<Kothi[]>([])
  const [allZones, setAllZones] = useState<Zone[]>([])
  const [taskForceUsers, setTaskForceUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Assignment | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Assignment | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Form state - cascading
  const [formZoneId, setFormZoneId] = useState('')
  const [formWardId, setFormWardId] = useState('')
  const [formKothiId, setFormKothiId] = useState('')
  const [formFeederPointId, setFormFeederPointId] = useState('')
  const [formUserId, setFormUserId] = useState('')

  useEffect(() => {
    const unsubAssignments = DataService.onAssignmentsChange(setAssignments)
    const unsubFeederPoints = DataService.onFeederPointsChange(setAllFeederPoints)
    const unsubZones = DataService.onZonesChange(setAllZones)
    const unsubWards = DataService.onWardsChange(setAllWards)
    const unsubKothis = DataService.onKothisChange(setAllKothis)
    DataService.getAllUsers().then(users => {
      setTaskForceUsers(users.filter(u => u.role === 'task_force_team'))
      setLoading(false)
    })
    return () => { unsubAssignments(); unsubFeederPoints(); unsubZones(); unsubWards(); unsubKothis() }
  }, [])

  // Cascading filters
  const filteredWards = allWards.filter(w => w.zoneId === formZoneId)
  const filteredKothis = allKothis.filter(k => k.wardId === formWardId)
  // Feeder points filtered by zone (since FP already has zone info)
  // const filteredFeederPoints = formZoneId
  //   ? allFeederPoints.filter(f => f.zoneId === formZoneId || f.zoneNumber === formZoneId || f.zone === formZoneId)
  //   : allFeederPoints
  // const filteredFeederPoints = allFeederPoints
  const filteredFeederPoints = formKothiId
    ? allFeederPoints.filter(f => f.kothiId === formKothiId)
    : []

  const getZoneName = (id: string) => allZones.find(z => z.id === id)?.name ?? '—'
  const getWardName = (id: string) => allWards.find(w => w.id === id)?.name ?? '—'
  const getKothiName = (id: string) => allKothis.find(k => k.id === id)?.name ?? '—'
  const getFeederPointName = (id: string) => allFeederPoints.find(f => f.id === id)?.name ?? '—'
  const getUserName = (id: string) => taskForceUsers.find(u => u.id === id)?.name ?? '—'

  const resetForm = () => {
    setFormZoneId(''); setFormWardId(''); setFormKothiId('')
    setFormFeederPointId(''); setFormUserId('')
  }

  const openAdd = () => { setEditing(null); resetForm(); setShowModal(true) }
  const openEdit = (a: Assignment) => {
    setEditing(a)
    setFormZoneId(a.zoneId || '')
    setFormWardId(a.wardId || '')
    setFormKothiId(a.kothiId || '')
    setFormFeederPointId(a.feederPointId)
    setFormUserId(a.userId)
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!formFeederPointId || !formUserId) return
    setSaving(true)
    try {
      const zoneName = getZoneName(formZoneId)
      const wardName = getWardName(formWardId)
      const kothiName = getKothiName(formKothiId)
      const feederPointName = getFeederPointName(formFeederPointId)
      const userName = getUserName(formUserId)

      const payload: Omit<Assignment, 'id'> = {
        zoneId: formZoneId, zoneName,
        wardId: formWardId, wardName,
        kothiId: formKothiId, kothiName,
        feederPointId: formFeederPointId, feederPointName,
        userId: formUserId, userName,
      }

      if (editing) {
        await DataService.updateAssignment(editing.id, payload)
      } else {
        await DataService.createAssignment(payload)
      }

      // Also update feeder point document with kothiId & kothiName
      if (formFeederPointId && formKothiId) {
        await DataService.updateFeederPoint(formFeederPointId, { kothiId: formKothiId, kothiName })
      }

      setShowModal(false)
    } catch (e) { console.error(e) }
    setSaving(false)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try { await DataService.deleteAssignment(deleteTarget.id) } catch (e) { console.error(e) }
    setDeleting(false)
    setDeleteTarget(null)
  }

  const selectClass = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-gray-500">{assignments.length} assignment{assignments.length !== 1 ? 's' : ''}</p>
        <button onClick={openAdd} className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
          <Plus className="h-4 w-4" /> Add Assignment
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>
      ) : assignments.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <ClipboardList className="h-10 w-10 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No assignments yet. Assign a feeder point to a task force user.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">#</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Zone</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Ward</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Kothi</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Feeder Point</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Assigned To</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {assignments.map((a, i) => (
                <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-gray-400">{i + 1}</td>
                  <td className="px-4 py-3 text-gray-500">{a.zoneName || getZoneName(a.zoneId || '')}</td>
                  <td className="px-4 py-3 text-gray-500">{a.wardName || getWardName(a.wardId || '')}</td>
                  <td className="px-4 py-3 text-gray-500">{a.kothiName || getKothiName(a.kothiId || '')}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{a.feederPointName || getFeederPointName(a.feederPointId)}</td>
                  <td className="px-4 py-3 text-gray-500">{a.userName || getUserName(a.userId)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => openEdit(a)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => setDeleteTarget(a)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <Modal title={editing ? 'Edit Assignment' : 'Add Assignment'} onClose={() => setShowModal(false)}>
          <div className="space-y-4">

            {/* Zone */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Zone</label>
              <select value={formZoneId} onChange={e => { setFormZoneId(e.target.value); setFormWardId(''); setFormKothiId(''); setFormFeederPointId('') }} className={selectClass}>
                <option value="">Select a zone</option>
                {allZones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
              </select>
            </div>

            {/* Ward */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ward</label>
              <select value={formWardId} onChange={e => { setFormWardId(e.target.value); setFormKothiId(''); setFormFeederPointId('') }} disabled={!formZoneId} className={selectClass}>
                <option value="">Select a ward</option>
                {filteredWards.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>

            {/* Kothi */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kothi</label>
              <select value={formKothiId} onChange={e => { setFormKothiId(e.target.value); setFormFeederPointId('') }} disabled={!formWardId} className={selectClass}>
                <option value="">Select a kothi</option>
                {filteredKothis.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
              </select>
            </div>

            {/* Feeder Point */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Feeder Point</label>
              {/* <select value={formFeederPointId} onChange={e => setFormFeederPointId(e.target.value)} disabled={!formZoneId} className={selectClass}> */}
              <select
                value={formFeederPointId}
                onChange={e => setFormFeederPointId(e.target.value)}
                disabled={!formKothiId}
                className={selectClass}
              >
                <option value="">Select a feeder point</option>
                {filteredFeederPoints.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>

            {/* Task Force User */}
            {/* <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Task Force User</label>
              <select value={formUserId} onChange={e => setFormUserId(e.target.value)} className={selectClass}>
                <option value="">Select a user</option>
                {taskForceUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div> */}

            <div className="flex gap-3 justify-end pt-2">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={handleSave} disabled={saving || !formFeederPointId || !formUserId} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2 transition-colors">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {editing ? 'Update' : 'Assign'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {deleteTarget && (
        <ConfirmDelete
          name={`${deleteTarget.feederPointName} → ${deleteTarget.userName}`}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          loading={deleting}
        />
      )}
    </div>
  )
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function MasterPage() {
  const [activeTab, setActiveTab] = useState('Zones')

  const renderTab = () => {
    switch (activeTab) {
      case 'Zones': return <ZonesTab />
      case 'Wards': return <WardsTab />
      case 'Kothis': return <KothisTab />
      case 'Assignment': return <AssignmentTab />
      default: return null
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Master</h2>
        <p className="mt-1 text-sm text-gray-500">Manage master data for zones, wards, kothis and assignments.</p>
      </div>

      {/* Tab Buttons */}
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.name
          return (
            <button
              key={tab.name}
              onClick={() => setActiveTab(tab.name)}
              className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${isActive ? 'bg-blue-600 text-white shadow' : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50'
                }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.name}
            </button>
          )
        })}
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        {renderTab()}
      </div>
    </div>
  )
}