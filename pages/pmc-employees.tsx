import { useEffect, useState } from 'react'
import Head from 'next/head'
import {
  UserPlus,
  Mail,
  Phone,
  Lock,
  MapPin,
  Hash,
  ShieldCheck,
  RefreshCcw
} from 'lucide-react'
import { DataService, User, Zone, Ward, Kothi } from '@/lib/dataService'

interface FormState {
  name: string
  employeeCode: string
  email: string
  phone: string
  password: string
  zoneId: string
  zoneName: string
  wardId: string
  wardName: string
  kothiId: string
  kothiName: string
}

export default function PmcEmployeesPage() {
  const [form, setForm] = useState<FormState>({
    name: '',
    employeeCode: '',
    email: '',
    phone: '',
    password: '',
    zoneId: '',
    zoneName: '',
    wardId: '',
    wardName: '',
    kothiId: '',
    kothiName: ''
  })
  const [pmcUsers, setPmcUsers] = useState<User[]>([])
  const [zones, setZones] = useState<Zone[]>([])
  const [wards, setWards] = useState<Ward[]>([])
  const [kothis, setKothis] = useState<Kothi[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [editingUserId, setEditingUserId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [allUsers, allZones, allWards, allKothis] = await Promise.all([
        DataService.getAllUsers(),
        DataService.getZones(),
        DataService.getWards(),
        DataService.getKothis()
      ])
      const pmc = allUsers.filter(user => user.role === 'pmc_member' || user.role === 'pmc_viewer')
      setPmcUsers(pmc)
      setZones(allZones)
      setWards(allWards)
      setKothis(allKothis)
    } catch (error) {
      console.error('Failed to load data', error)
      setStatus({ type: 'error', message: 'Could not load data. Please try again.' })
    } finally {
      setLoading(false)
    }
  }

  const loadUsers = async () => {
    try {
      const allUsers = await DataService.getAllUsers()
      const pmc = allUsers.filter(user => user.role === 'pmc_member' || user.role === 'pmc_viewer')
      setPmcUsers(pmc)
    } catch (error) {
      console.error('Failed to load PMC employees', error)
      setStatus({ type: 'error', message: 'Could not load PMC employees. Please try again.' })
    }
  }

  const updateField = (key: keyof FormState, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  const handleSubmit = async () => {
    setStatus(null)
    if (!form.name.trim() || !form.employeeCode.trim() || !form.email.trim() || !form.phone.trim()) {
      setStatus({ type: 'error', message: 'All fields except password are required.' })
      return
    }
    if (!editingUserId && !form.password.trim()) {
      setStatus({ type: 'error', message: 'Password is required for new users.' })
      return
    }

    setSaving(true)
    try {
      if (editingUserId) {
        await DataService.updatePmcEmployee(editingUserId, {
          name: form.name,
          employeeCode: form.employeeCode,
          email: form.email,
          phone: form.phone,
          password: form.password || undefined,
          zoneNumber: form.zoneName,
          zoneId: form.zoneId,
          zoneName: form.zoneName,
          wardId: form.wardId,
          wardName: form.wardName,
          kothiId: form.kothiId,
          kothiName: form.kothiName
        })
        setStatus({ type: 'success', message: 'PMC employee login updated successfully.' })
      } else {
        await DataService.createPmcEmployee({
          name: form.name,
          employeeCode: form.employeeCode,
          email: form.email,
          phone: form.phone,
          password: form.password,
          zoneNumber: form.zoneName,
          zoneId: form.zoneId,
          zoneName: form.zoneName,
          wardId: form.wardId,
          wardName: form.wardName,
          kothiId: form.kothiId,
          kothiName: form.kothiName
        })
        setStatus({ type: 'success', message: 'PMC employee login created successfully.' })
      }

      setEditingUserId(null)
      setForm({
        name: '',
        employeeCode: '',
        email: '',
        phone: '',
        password: '',
        zoneId: '',
        zoneName: '',
        wardId: '',
        wardName: '',
        kothiId: '',
        kothiName: ''
      })
      await loadUsers()
    } catch (error: any) {
      console.error('Failed to save PMC employee', error)
      setStatus({ type: 'error', message: `Could not save PMC employee: ${error?.message || 'Unknown error'}` })
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (user: User) => {
    setEditingUserId(user.id)
    setForm({
      name: user.name || '',
      employeeCode: user.employeeCode || '',
      email: user.email || '',
      phone: user.phone || '',
      password: '', // Don't populate password
      zoneId: user.zoneId || '',
      zoneName: user.zoneName || '',
      wardId: user.wardId || '',
      wardName: user.wardName || '',
      kothiId: user.kothiId || '',
      kothiName: user.kothiName || ''
    })
    setStatus(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const cancelEdit = () => {
    setEditingUserId(null)
    setForm({
      name: '',
      employeeCode: '',
      email: '',
      phone: '',
      password: '',
      zoneId: '',
      zoneName: '',
      wardId: '',
      wardName: '',
      kothiId: '',
      kothiName: ''
    })
    setStatus(null)
  }

  const handleDelete = async (userId: string) => {
    if (!confirm('Delete this PMC employee login? This cannot be undone.')) return
    setDeletingId(userId)
    setStatus(null)
    try {
      await DataService.deletePmcEmployee(userId)
      setStatus({ type: 'success', message: 'PMC employee deleted.' })
      await loadUsers()
    } catch (error) {
      console.error('Failed to delete PMC employee', error)
      setStatus({ type: 'error', message: 'Could not delete PMC employee. Please try again.' })
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <>
      <Head>
        <title>PMC Employees | SuperAdmin</title>
      </Head>

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">PMC Employees</h1>
            <p className="text-gray-600">Create PMC employee logins and manage their assigned zones.</p>
          </div>
          <button
            onClick={loadUsers}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold text-primary-700 bg-primary-50 border border-primary-100 rounded-lg hover:bg-primary-100 transition-colors"
          >
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 space-y-4">
              <div className="flex items-center gap-2">
                <div className="h-10 w-10 rounded-lg bg-primary-50 flex items-center justify-center border border-primary-100">
                  <UserPlus className="h-5 w-5 text-primary-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">{editingUserId ? 'Edit Login' : 'Create Login'}</p>
                  <p className="text-base font-semibold text-gray-900">PMC Employee</p>
                </div>
              </div>

              <div className="space-y-3">
                <label className="block">
                  <span className="text-sm font-medium text-gray-700 flex items-center gap-1">
                    <ShieldCheck className="h-4 w-4 text-primary-500" /> Name
                  </span>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => updateField('name', e.target.value)}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    placeholder="Employee name"
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-gray-700 flex items-center gap-1">
                    <Hash className="h-4 w-4 text-primary-500" /> Employee Code
                  </span>
                  <input
                    type="text"
                    value={form.employeeCode}
                    onChange={(e) => updateField('employeeCode', e.target.value)}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    placeholder="e.g., PMC-101"
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-gray-700 flex items-center gap-1">
                    <Mail className="h-4 w-4 text-primary-500" /> Email
                  </span>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => updateField('email', e.target.value)}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    placeholder="employee@pmc.gov"
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-gray-700 flex items-center gap-1">
                    <Phone className="h-4 w-4 text-primary-500" /> Phone Number
                  </span>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => updateField('phone', e.target.value)}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    placeholder="10-digit number"
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-gray-700 flex items-center gap-1">
                    <Lock className="h-4 w-4 text-primary-500" /> Password
                  </span>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => updateField('password', e.target.value)}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    placeholder={editingUserId ? "Leave blank to keep unchanged" : "Set login password"}
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-gray-700 flex items-center gap-1">
                    <MapPin className="h-4 w-4 text-primary-500" /> Zone
                  </span>
                  <select
                    value={form.zoneId}
                    onChange={(e) => {
                      const selectedZone = zones.find(z => z.id === e.target.value)
                      setForm(prev => ({ 
                        ...prev, 
                        zoneId: e.target.value, 
                        zoneName: selectedZone?.name || '',
                        wardId: '', wardName: '', kothiId: '', kothiName: '' 
                      }))
                    }}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white"
                  >
                    <option value="">Select Zone</option>
                    {zones.map(zone => (
                      <option key={zone.id} value={zone.id}>
                        {zone.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-gray-700 flex items-center gap-1">
                    <MapPin className="h-4 w-4 text-primary-500" /> Ward
                  </span>
                  <select
                    value={form.wardId}
                    onChange={(e) => {
                      const selectedWard = wards.find(w => w.id === e.target.value)
                      setForm(prev => ({ 
                        ...prev, 
                        wardId: e.target.value, 
                        wardName: selectedWard?.name || '',
                        kothiId: '', kothiName: '' 
                      }))
                    }}
                    disabled={!form.zoneId}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white disabled:bg-gray-100"
                  >
                    <option value="">Select Ward</option>
                    {wards.filter(w => w.zoneId === form.zoneId).map(ward => (
                      <option key={ward.id} value={ward.id}>
                        {ward.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-gray-700 flex items-center gap-1">
                    <MapPin className="h-4 w-4 text-primary-500" /> Kothi
                  </span>
                  <select
                    value={form.kothiId}
                    onChange={(e) => {
                      const selectedKothi = kothis.find(k => k.id === e.target.value)
                      setForm(prev => ({ 
                        ...prev, 
                        kothiId: e.target.value, 
                        kothiName: selectedKothi?.name || '' 
                      }))
                    }}
                    disabled={!form.wardId}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white disabled:bg-gray-100"
                  >
                    <option value="">Select Kothi</option>
                    {kothis.filter(k => k.wardId === form.wardId).map(kothi => (
                      <option key={kothi.id} value={kothi.id}>
                        {kothi.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {status && (
                <div
                  className={`rounded-lg px-3 py-2 text-sm border ${status.type === 'success'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                    : 'bg-red-50 text-red-700 border-red-100'
                    }`}
                >
                  {status.message}
                </div>
              )}

              <div className="flex flex-col gap-3">
                <button
                  onClick={handleSubmit}
                  disabled={saving}
                  className="w-full inline-flex justify-center items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-70 transition-colors"
                >
                  <UserPlus className="h-4 w-4" />
                  {saving ? 'Saving...' : editingUserId ? 'Update PMC Login' : 'Create PMC Login'}
                </button>

                {editingUserId && (
                  <button
                    onClick={cancelEdit}
                    disabled={saving}
                    className="w-full inline-flex justify-center items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-70 transition-colors"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Existing Accounts</p>
                  <p className="text-base font-semibold text-gray-900">PMC Employees ({pmcUsers.length})</p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Name</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Employee Code</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Email</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Phone</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Zone</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Ward</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Kothi</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {loading ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-6 text-center text-gray-500">
                          Loading PMC employees...
                        </td>
                      </tr>
                    ) : pmcUsers.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-6 text-center text-gray-500">
                          No PMC employee logins created yet.
                        </td>
                      </tr>
                    ) : (
                      pmcUsers.map(user => (
                        <tr key={user.id}>
                          <td className="px-4 py-3 text-sm text-gray-900">{user.name || '—'}</td>
                          <td className="px-4 py-3 text-sm text-gray-700">{user.employeeCode || '—'}</td>
                          <td className="px-4 py-3 text-sm text-gray-700">{user.email}</td>
                          <td className="px-4 py-3 text-sm text-gray-700">{user.phone || '—'}</td>
                          <td className="px-4 py-3 text-sm font-semibold text-gray-900">
                            {user.zoneName || (user.zoneNumber ? `Zone ${user.zoneNumber}` : '—')}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700">
                            {user.wardName || '—'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700">
                            {user.kothiName || '—'}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <span className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${user.isActive === false
                              ? 'bg-red-100 text-red-700'
                              : 'bg-emerald-50 text-emerald-700'
                              }`}>
                              {user.isActive === false ? 'Inactive' : 'Active'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleEdit(user)}
                                disabled={deletingId === user.id}
                                className="text-primary-600 hover:text-primary-800 font-semibold text-xs border border-primary-100 rounded-md px-3 py-1 disabled:opacity-60"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDelete(user.id)}
                                disabled={deletingId === user.id}
                                className="text-red-600 hover:text-red-800 font-semibold text-xs border border-red-100 rounded-md px-3 py-1 disabled:opacity-60"
                              >
                                {deletingId === user.id ? 'Deleting...' : 'Delete'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
