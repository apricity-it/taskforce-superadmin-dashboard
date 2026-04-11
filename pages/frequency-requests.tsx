import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  AlertCircle,
  CheckCircle,
  Clock,
  Download,
  Eye,
  RefreshCw,
  X,
  XCircle,
  Star,
} from 'lucide-react'
import { collection, getDocs, updateDoc, doc, onSnapshot, query, orderBy, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'

// ── Types ─────────────────────────────────────────────────────────────────────

type FrequencyType = 'daily' | 'weekly' | 'monthly'

interface InspectionFrequency {
  type: FrequencyType
  value: number
}

interface FrequencyRequest {
  id: string
  feederPointId: string
  feederPointName: string
  userId: string
  userName: string
  images: string[]
  requestedFrequency: InspectionFrequency
  approvedFrequency?: InspectionFrequency
  comment: string
  cleanlinessRating?: number
  status: 'pending' | 'approved' | 'rejected'
  reviewedBy?: string
  reviewedAt?: any
  adminNotes?: string
  createdAt?: any
  updatedAt?: any
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(value: any): string {
  if (!value) return 'N/A'
  if (typeof value.toDate === 'function') return value.toDate().toLocaleString()
  if (value instanceof Date) return value.toLocaleString()
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? 'N/A' : parsed.toLocaleString()
}

function formatFrequency(freq: InspectionFrequency): string {
  const period = freq.type === 'daily' ? 'day' : freq.type === 'weekly' ? 'week' : 'month'
  return `${freq.value}x per ${period}`
}

// ── Firestore helpers ─────────────────────────────────────────────────────────

function onFrequencyRequestsChange(callback: (requests: FrequencyRequest[]) => void) {
  const q = query(collection(db, 'frequencyRequests'), orderBy('createdAt', 'desc'))
  return onSnapshot(q, snapshot => {
    callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as FrequencyRequest)))
  })
}

async function approveFrequencyRequest(
  requestId: string,
  feederPointId: string,
  approvedFrequency: InspectionFrequency,
  reviewedBy: string,
  adminNotes?: string
): Promise<void> {
  await updateDoc(doc(db, 'frequencyRequests', requestId), {
    status: 'approved',
    approvedFrequency,
    reviewedBy,
    adminNotes: adminNotes || null,
    reviewedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  await updateDoc(doc(db, 'feederPoints', feederPointId), {
    inspectionFrequency: approvedFrequency,
    updatedAt: serverTimestamp(),
  })
}

async function rejectFrequencyRequest(
  requestId: string,
  reviewedBy: string,
  adminNotes?: string
): Promise<void> {
  await updateDoc(doc(db, 'frequencyRequests', requestId), {
    status: 'rejected',
    reviewedBy,
    adminNotes: adminNotes || null,
    reviewedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function FrequencyRequestsPage() {
  const [requests, setRequests] = useState<FrequencyRequest[]>([])
  const [selectedRequest, setSelectedRequest] = useState<FrequencyRequest | null>(null)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [zoomedImage, setZoomedImage] = useState<string | null>(null)
  const [isUpdating, setIsUpdating] = useState(false)

  // Review form state
  const [approvedType, setApprovedType] = useState<FrequencyType>('daily')
  const [approvedValue, setApprovedValue] = useState('1')
  const [adminNotes, setAdminNotes] = useState('')

  useEffect(() => {
    const unsubscribe = onFrequencyRequestsChange(data => {
      setRequests(data)
      setLoading(false)
    })
    return () => unsubscribe?.()
  }, [])

  // Pre-fill review form when a request is selected
  useEffect(() => {
    if (selectedRequest) {
      setApprovedType(selectedRequest.requestedFrequency.type)
      setApprovedValue(String(selectedRequest.requestedFrequency.value))
      setAdminNotes('')
    }
  }, [selectedRequest])

  const filteredRequests = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return requests
      .filter(r => statusFilter === 'all' || r.status === statusFilter)
      .filter(r => {
        if (!term) return true
        return (
          r.feederPointName?.toLowerCase().includes(term) ||
          r.userName?.toLowerCase().includes(term) ||
          r.comment?.toLowerCase().includes(term)
        )
      })
  }, [requests, statusFilter, searchTerm])

  const stats = useMemo(() => ({
    total: requests.length,
    pending: requests.filter(r => r.status === 'pending').length,
    approved: requests.filter(r => r.status === 'approved').length,
    rejected: requests.filter(r => r.status === 'rejected').length,
  }), [requests])

  const handleApprove = async () => {
    if (!selectedRequest) return
    const value = parseInt(approvedValue, 10)
    if (!value || value < 1) {
      alert('Please enter a valid frequency value.')
      return
    }
    if (!confirm(`Approve ${value}x per ${approvedType} for "${selectedRequest.feederPointName}"?`)) return

    setIsUpdating(true)
    try {
      await approveFrequencyRequest(
        selectedRequest.id,
        selectedRequest.feederPointId,
        { type: approvedType, value },
        'SuperAdmin',
        adminNotes.trim() || undefined
      )
      alert('✅ Request approved. Feeder point frequency updated.')
      setSelectedRequest(null)
    } catch (e) {
      console.error(e)
      alert('❌ Error approving request.')
    }
    setIsUpdating(false)
  }

  const handleReject = async () => {
    if (!selectedRequest) return
    if (!confirm('Reject this frequency request?')) return

    setIsUpdating(true)
    try {
      await rejectFrequencyRequest(
        selectedRequest.id,
        'SuperAdmin',
        adminNotes.trim() || undefined
      )
      alert('Request rejected.')
      setSelectedRequest(null)
    } catch (e) {
      console.error(e)
      alert('❌ Error rejecting request.')
    }
    setIsUpdating(false)
  }

  const handleDownload = async () => {
    if (filteredRequests.length === 0) return
    const XLSX = await import('xlsx')
    const rows = filteredRequests.map(r => ({
      'Request ID': r.id,
      'Feeder Point': r.feederPointName,
      'User': r.userName,
      'Requested Frequency': formatFrequency(r.requestedFrequency),
      'Approved Frequency': r.approvedFrequency ? formatFrequency(r.approvedFrequency) : 'N/A',
      'Comment': r.comment,
      'Cleanliness Rating': r.cleanlinessRating || 'N/A',
      'Status': r.status.toUpperCase(),
      'Admin Notes': r.adminNotes || '',
      'Reviewed By': r.reviewedBy || '',
      'Submitted At': formatDate(r.createdAt),
      'Reviewed At': formatDate(r.reviewedAt),
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Frequency Requests')
    XLSX.writeFile(wb, `frequency-requests-${statusFilter}.xlsx`)
  }

  const getStatusBadge = (status: string) => ({
    pending: 'badge-warning',
    approved: 'badge-success',
    rejected: 'badge-danger',
  }[status] || 'badge-info')

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved': return <CheckCircle className="h-4 w-4 text-success-600" />
      case 'rejected': return <XCircle className="h-4 w-4 text-danger-600" />
      default: return <Clock className="h-4 w-4 text-warning-600" />
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="border-b border-gray-200 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Inspection Frequency Requests</h1>
            <p className="mt-2 text-gray-600">
              Review and approve reduced inspection frequency requests from taskforce users.
            </p>
          </div>
          <button
            onClick={handleDownload}
            disabled={filteredRequests.length === 0}
            className="btn-secondary flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="h-4 w-4" />
            <span>Download (.xlsx)</span>
          </button>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="card">
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex items-center space-x-3">
            <label className="text-sm font-medium text-gray-700">Status:</label>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
          <div className="flex-1">
            <input
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search by feeder point, user, or comment…"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <StatCard title="Pending" value={stats.pending} icon={<Clock className="h-6 w-6 text-white" />} bg="bg-warning-500" />
        <StatCard title="Approved" value={stats.approved} icon={<CheckCircle className="h-6 w-6 text-white" />} bg="bg-success-500" />
        <StatCard title="Rejected" value={stats.rejected} icon={<XCircle className="h-6 w-6 text-white" />} bg="bg-danger-500" />
        <StatCard title="Total" value={stats.total} icon={<RefreshCw className="h-6 w-6 text-white" />} bg="bg-primary-500" />
      </div>

      {/* ── Table ── */}
      <div className="table-container">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="table-header">Feeder Point</th>
                <th className="table-header">Requested By</th>
                <th className="table-header">Requested Frequency</th>
                <th className="table-header">Approved Frequency</th>
                <th className="table-header">Cleanliness</th>
                <th className="table-header">Status</th>
                <th className="table-header">Submitted</th>
                <th className="table-header">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredRequests.map(request => (
                <tr key={request.id} className="hover:bg-gray-50">
                  <td className="table-cell">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 rounded-lg bg-blue-50 text-blue-700">
                        <RefreshCw className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-gray-900">{request.feederPointName}</div>
                        <div className="text-xs text-gray-500 max-w-xs truncate">{request.comment}</div>
                      </div>
                    </div>
                  </td>
                  <td className="table-cell">
                    <div className="text-sm font-medium text-gray-900">{request.userName}</div>
                  </td>
                  <td className="table-cell">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {formatFrequency(request.requestedFrequency)}
                    </span>
                  </td>
                  <td className="table-cell">
                    {request.approvedFrequency ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        {formatFrequency(request.approvedFrequency)}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="table-cell">
                    {request.cleanlinessRating ? (
                      <div className="flex items-center space-x-1">
                        <Star className="h-4 w-4 text-yellow-400 fill-yellow-400" />
                        <span className="text-sm text-gray-700">{request.cleanlinessRating}/5</span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="table-cell">
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(request.status)}
                      <span className={`badge ${getStatusBadge(request.status)}`}>
                        {request.status.toUpperCase()}
                      </span>
                    </div>
                  </td>
                  <td className="table-cell">
                    <div className="text-sm text-gray-900">{formatDate(request.createdAt)}</div>
                    {request.reviewedAt && (
                      <div className="text-xs text-gray-500">Reviewed: {formatDate(request.reviewedAt)}</div>
                    )}
                  </td>
                  <td className="table-cell">
                    <button
                      onClick={() => {
                        setSelectedRequest(request)
                        setTimeout(() => {
                          document.getElementById('details-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                        }, 100)
                      }}
                      className="p-2 text-gray-500 hover:text-primary-600 rounded-lg hover:bg-gray-100"
                      title="View details"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredRequests.length === 0 && (
          <div className="text-center py-12">
            <AlertCircle className="h-10 w-10 text-gray-400 mx-auto mb-3" />
            <div className="text-gray-500">No frequency requests found for current filters.</div>
          </div>
        )}
      </div>

      {/* ── Detail Card ── */}
      {selectedRequest && (
        <div id="details-card" className="card mt-6 border-2 border-primary-500 shadow-lg">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Frequency Change Request</p>
              <h2 className="text-2xl font-bold text-gray-900">{selectedRequest.feederPointName}</h2>
              <p className="text-gray-600 mt-1">{selectedRequest.comment}</p>
            </div>
            <button
              onClick={() => setSelectedRequest(null)}
              className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <InfoRow label="Requested By" value={selectedRequest.userName} />
            <InfoRow label="Status" value={selectedRequest.status.toUpperCase()} />
            <InfoRow label="Requested Frequency" value={formatFrequency(selectedRequest.requestedFrequency)} />
            {selectedRequest.approvedFrequency && (
              <InfoRow label="Approved Frequency" value={formatFrequency(selectedRequest.approvedFrequency)} />
            )}
            {selectedRequest.cleanlinessRating && (
              <InfoRow label="Cleanliness Rating" value={`${selectedRequest.cleanlinessRating} / 5`} />
            )}
            <InfoRow label="Submitted At" value={formatDate(selectedRequest.createdAt)} />
            {selectedRequest.reviewedBy && (
              <InfoRow label="Reviewed By" value={selectedRequest.reviewedBy} />
            )}
            {selectedRequest.reviewedAt && (
              <InfoRow label="Reviewed At" value={formatDate(selectedRequest.reviewedAt)} />
            )}
          </div>

          {/* Images */}
          {selectedRequest.images?.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Supporting Photos</p>
              <div className="flex flex-wrap gap-3">
                {selectedRequest.images.map((url, idx) => (
                  <img
                    key={idx}
                    src={url}
                    alt={`Evidence ${idx + 1}`}
                    onClick={() => setZoomedImage(url)}
                    className="h-24 w-24 object-cover rounded-lg border border-gray-200 cursor-pointer hover:opacity-80 transition-opacity"
                  />
                ))}
              </div>
            </div>
          )}

          {selectedRequest.adminNotes && (
            <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">Admin Notes</p>
              <p className="text-sm text-blue-800">{selectedRequest.adminNotes}</p>
            </div>
          )}

          {/* Review form — only show for pending */}
          {selectedRequest.status === 'pending' && (
            <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-sm font-semibold text-gray-700 mb-3">Set Approved Frequency</p>

              <div className="flex flex-wrap items-center gap-4 mb-4">
                {/* Type */}
                <div className="flex items-center space-x-2">
                  <label className="text-sm text-gray-600">Type:</label>
                  <select
                    value={approvedType}
                    onChange={e => setApprovedType(e.target.value as FrequencyType)}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>

                {/* Value */}
                <div className="flex items-center space-x-2">
                  <label className="text-sm text-gray-600">Times:</label>
                  <input
                    type="number"
                    min="1"
                    max="99"
                    value={approvedValue}
                    onChange={e => setApprovedValue(e.target.value)}
                    className="w-20 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <span className="text-sm text-gray-500">
                    per {approvedType === 'daily' ? 'day' : approvedType === 'weekly' ? 'week' : 'month'}
                  </span>
                </div>
              </div>

              {/* Admin notes */}
              <div className="mb-4">
                <label className="text-sm text-gray-600 block mb-1">Admin Notes (optional)</label>
                <textarea
                  value={adminNotes}
                  onChange={e => setAdminNotes(e.target.value)}
                  placeholder="Add a note for the user…"
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleApprove}
                  disabled={isUpdating}
                  className="px-5 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center space-x-2"
                >
                  <CheckCircle className="h-4 w-4" />
                  <span>{isUpdating ? 'Saving…' : 'Approve'}</span>
                </button>
                <button
                  onClick={handleReject}
                  disabled={isUpdating}
                  className="px-5 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center space-x-2"
                >
                  <XCircle className="h-4 w-4" />
                  <span>{isUpdating ? 'Saving…' : 'Reject'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Image zoom modal ── */}
      {zoomedImage && (
        <div
          className="fixed inset-0 z-50 bg-black bg-opacity-80 flex items-center justify-center p-4"
          onClick={() => setZoomedImage(null)}
        >
          <div className="relative max-w-3xl w-full">
            <button
              onClick={() => setZoomedImage(null)}
              className="absolute -top-10 right-0 text-white hover:text-gray-300"
            >
              <X className="h-6 w-6" />
            </button>
            <img
              src={zoomedImage}
              alt="Zoomed"
              className="w-full rounded-lg max-h-[80vh] object-contain"
              onClick={e => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ title, value, icon, bg }: { title: string; value: number; icon: ReactNode; bg: string }) {
  return (
    <div className="stat-card">
      <div className="flex items-center">
        <div className={`p-3 rounded-lg ${bg}`}>{icon}</div>
        <div className="ml-4">
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-2xl font-semibold text-gray-900">{value}</p>
        </div>
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-sm text-gray-900 break-words">{value || 'N/A'}</p>
    </div>
  )
}