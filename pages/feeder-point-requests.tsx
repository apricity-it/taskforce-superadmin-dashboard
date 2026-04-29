import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { AlertCircle, CheckCircle, Clock, Download, Eye, MapPin, X, XCircle } from 'lucide-react'
import { DataService, FeederPointRequest } from '@/lib/dataService'

function formatDate(value: any): string {
  if (!value) return 'N/A'
  if (typeof value.toDate === 'function') {
    return value.toDate().toLocaleString()
  }
  if (value instanceof Date) {
    return value.toLocaleString()
  }
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? 'N/A' : parsed.toLocaleString()
}

export default function FeederPointRequestsPage() {
  const [requests, setRequests] = useState<FeederPointRequest[]>([])
  const [selectedRequest, setSelectedRequest] = useState<FeederPointRequest | null>(null)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all')
  const [zoneFilter, setZoneFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [isEditingZone, setIsEditingZone] = useState(false)
  const [editingZoneValue, setEditingZoneValue] = useState('')
  const [isUpdating, setIsUpdating] = useState(false)
  
  const [selectedRequestIds, setSelectedRequestIds] = useState<Set<string>>(new Set())
  const [bulkZoneValue, setBulkZoneValue] = useState('')
  const [isBulkUpdating, setIsBulkUpdating] = useState(false)

  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 50

  useEffect(() => {
    const unsubscribe = DataService.onFeederPointRequestsChange(requestsData => {
      setRequests(requestsData)
      setLoading(false)
    })
    return () => unsubscribe?.()
  }, [])

  const uniqueZones = useMemo(() => {
    const zones = new Set(requests.map(r => r.zoneNumber).filter(z => !!z))
    return Array.from(zones).sort((a, b) => {
      const numA = Number(a)
      const numB = Number(b)
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB
      return String(a).localeCompare(String(b))
    })
  }, [requests])
  
const handleApprove = async (request: FeederPointRequest) => {
  try {
    // 🔥 1. CREATE FEEDER POINT
    await DataService.createFeederPoint({
      name: request.feederPointName || request.areaName,
      kothiId: request.kothiName,   // optional mapping
      kothiName: request.kothiName,
      status: 'active',
      priority: request.priority || 'medium',
      location: {
        address: request.nearestLandmark || request.areaName || '',
        latitude: request.coordinates?.latitude || 0,
        longitude: request.coordinates?.longitude || 0,
      },
    });

    // 🔥 2. UPDATE REQUEST STATUS
    await DataService.updateFeederPointRequest(request.id, {
      status: 'approved',
      reviewedAt: new Date(),
    });

    alert("✅ Feeder Point Approved & Created");

  } catch (error) {
    console.error(error);
    alert("❌ Error approving request");
  }
};

const handleReject = async (request: FeederPointRequest) => {
  const reason = prompt("Enter rejection reason:");

  if (!reason) return;

  try {
    await DataService.updateFeederPointRequest(request.id, {
      status: 'rejected',
      rejectionReason: reason,
      reviewedAt: new Date(),
    });

    alert("❌ Request Rejected");

  } catch (error) {
    console.error(error);
    alert("Error rejecting request");
  }
};

  const baseFilteredRequests = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return requests
      .filter(request => zoneFilter === 'all' || (request.zoneNumber || '').toString() === zoneFilter)
      .filter(request => {
        if (!term) return true
        const textFields = [
          request.feederPointName,
          request.areaName,
          request.nearestLandmark,
          request.userName,
          request.userEmail,
          request.userPhone,
          request.zoneNumber,
          request.wardNumber,
          request.kothiName,        // ← added
          request.areaDescription,
        ]
        return textFields.some(field => (field || '').toString().toLowerCase().includes(term))
      })
  }, [requests, zoneFilter, searchTerm])

  const stats = useMemo(() => ({
    total: baseFilteredRequests.length,
    pending: baseFilteredRequests.filter(r => r.status === 'pending').length,
    approved: baseFilteredRequests.filter(r => r.status === 'approved').length,
    rejected: baseFilteredRequests.filter(r => r.status === 'rejected').length
  }), [baseFilteredRequests])

  const filteredRequests = useMemo(() => {
    return baseFilteredRequests.filter(request => statusFilter === 'all' || request.status === statusFilter)
  }, [baseFilteredRequests, statusFilter])

  useEffect(() => {
    setCurrentPage(1)
  }, [statusFilter, zoneFilter, searchTerm])

  const paginatedRequests = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage
    return filteredRequests.slice(startIndex, startIndex + itemsPerPage)
  }, [filteredRequests, currentPage])

  const totalPages = Math.ceil(filteredRequests.length / itemsPerPage)

  const getStatusBadge = (status: string) => {
    const badgeClasses = {
      pending: 'badge-warning',
      approved: 'badge-success',
      rejected: 'badge-danger'
    }
    return badgeClasses[status as keyof typeof badgeClasses] || 'badge-info'
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return <CheckCircle className="h-4 w-4 text-success-600" />
      case 'rejected':
        return <XCircle className="h-4 w-4 text-danger-600" />
      default:
        return <Clock className="h-4 w-4 text-warning-600" />
    }
  }

  const handleEditZone = async () => {
    if (!selectedRequest) return
    setIsUpdating(true)
    try {
      await DataService.updateFeederPointRequest(selectedRequest.id, {
        zoneNumber: editingZoneValue
      })
      setSelectedRequest({ ...selectedRequest, zoneNumber: editingZoneValue })
      setIsEditingZone(false)
    } catch (e) {
      console.error(e)
    }
    setIsUpdating(false)
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedRequestIds(new Set(paginatedRequests.map(r => r.id)))
    } else {
      setSelectedRequestIds(new Set())
    }
  }

  const handleSelectOne = (id: string, checked: boolean) => {
    const newSet = new Set(selectedRequestIds)
    if (checked) newSet.add(id)
    else newSet.delete(id)
    setSelectedRequestIds(newSet)
  }

  const handleBulkUpdateZone = async () => {
    if (selectedRequestIds.size === 0 || !bulkZoneValue) return
    setIsBulkUpdating(true)
    try {
      const promises = Array.from(selectedRequestIds).map(id => 
        DataService.updateFeederPointRequest(id, { zoneNumber: bulkZoneValue })
      )
      await Promise.all(promises)
      setSelectedRequestIds(new Set())
      setBulkZoneValue('')
    } catch (e) {
      console.error(e)
    }
    setIsBulkUpdating(false)
  }

  const handleDownload = async () => {
    if (filteredRequests.length === 0) return

    const XLSX = await import('xlsx')
    const rows = filteredRequests.map(request => ({
      'Request ID': request.id,
      'Feeder Point': request.feederPointName || request.areaName || 'N/A',
      'Area Name': request.areaName || '',
      Zone: request.zoneNumber || '',
      Ward: request.wardNumber || '',
      Kothi: request.kothiName || '',                    // ← added
      'Feeder Point Name': request.feederPointName || '', // ← added
      Priority: request.priority || 'N/A',
      Status: (request.status || '').toUpperCase(),
      'Requested By': request.userName || '',
      'User Email': request.userEmail || '',
      'User Phone': request.userPhone || '',
      'Submitted At': formatDate(request.submittedAt),
      Coordinates: request.coordinates ? `${request.coordinates.latitude}, ${request.coordinates.longitude}` : '',
      'Nearest Landmark': request.nearestLandmark || '',
      'Households (Approx)': request.approximateHouseholds || '',
      'Vehicle Type': request.vehicleType || '',
      'Additional Details': request.additionalDetails || '',
      'Area Description': request.areaDescription || '',
      'Image URL': request.imageURL || '',
    }))

    const worksheet = XLSX.utils.json_to_sheet(rows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Feeder Requests')
    const suffix = statusFilter === 'all' ? 'all' : statusFilter
    XLSX.writeFile(workbook, `feeder-point-requests-${suffix}.xlsx`)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-gray-200 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Feeder Point Request List</h1>
            <p className="mt-2 text-gray-600">
              Track every requested feeder point and review details before approving.
            </p>
          </div>
          <div className="flex space-x-3">
            <button
              onClick={handleDownload}
              className="btn-secondary flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={filteredRequests.length === 0}
            >
              <Download className="h-4 w-4" />
              <span>Download (.xlsx)</span>
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center space-x-3">
              <label className="text-sm font-medium text-gray-700">Status:</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="all">All</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
            <div className="flex items-center space-x-3">
              <label className="text-sm font-medium text-gray-700">Zone:</label>
              <select
                value={zoneFilter}
                onChange={(e) => setZoneFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="all">All Zones</option>
                {uniqueZones.map((zone) => (
                  <option key={String(zone)} value={String(zone)}>
                    Zone {zone}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex-1">
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by feeder point, area, kothi, requester or zone..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <StatCard title="Pending" value={stats.pending} icon={<Clock className="h-6 w-6 text-white" />} bg="bg-warning-500" />
        <StatCard title="Approved" value={stats.approved} icon={<CheckCircle className="h-6 w-6 text-white" />} bg="bg-success-500" />
        <StatCard title="Rejected" value={stats.rejected} icon={<XCircle className="h-6 w-6 text-white" />} bg="bg-danger-500" />
        <StatCard title="Total Requests" value={stats.total} icon={<MapPin className="h-6 w-6 text-white" />} bg="bg-primary-500" />
      </div>

      <div className="table-container">
        {selectedRequestIds.size > 0 && (
          <div className="m-4 bg-indigo-50 border border-indigo-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="text-sm font-medium text-indigo-800">
              {selectedRequestIds.size} request(s) selected
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="text"
                placeholder="Enter Zone"
                value={bulkZoneValue}
                onChange={(e) => setBulkZoneValue(e.target.value)}
                className="px-3 py-1.5 text-sm border border-indigo-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 w-32"
              />
              <button
                onClick={handleBulkUpdateZone}
                disabled={isBulkUpdating || !bulkZoneValue.trim()}
                className="px-4 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {isBulkUpdating ? 'Updating...' : 'Update Selected'}
              </button>
              <button
                onClick={() => setSelectedRequestIds(new Set())}
                className="text-indigo-600 hover:text-indigo-800 text-sm font-medium ml-2"
              >
                Clear
              </button>
            </div>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="table-header w-12 text-center">
                  <input
                    type="checkbox"
                    checked={paginatedRequests.length > 0 && paginatedRequests.every(r => selectedRequestIds.has(r.id))}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer w-4 h-4 mt-1"
                  />
                </th>
                <th className="table-header">Requested Feeder Point</th>
                <th className="table-header">Requester</th>
                {/* ── Zone / Ward / Kothi column ── */}
                <th className="table-header">Zone / Ward / Kothi</th>
                <th className="table-header">Priority</th>
                <th className="table-header">Status</th>
                <th className="table-header">Submitted</th>
                <th className="table-header">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedRequests.map((request) => (
                <tr key={request.id} className={`hover:bg-gray-50 ${selectedRequestIds.has(request.id) ? 'bg-indigo-50/30' : ''}`}>
                  <td className="table-cell text-center">
                    <input
                      type="checkbox"
                      checked={selectedRequestIds.has(request.id)}
                      onChange={(e) => handleSelectOne(request.id, e.target.checked)}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer w-4 h-4"
                    />
                  </td>
                  <td className="table-cell">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 rounded-lg bg-indigo-50 text-indigo-700">
                        <MapPin className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-gray-900">
                          {request.feederPointName || request.areaName || 'Requested feeder point'}
                        </div>
                        <div className="text-xs text-gray-500">
                          {request.areaName || 'Area not provided'}
                          {request.nearestLandmark ? ` • ${request.nearestLandmark}` : ''}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="table-cell">
                    <div className="text-sm font-medium text-gray-900">{request.userName || 'Unknown requester'}</div>
                    <div className="text-xs text-gray-500">{request.userEmail || 'Email not set'}</div>
                  </td>

                  {/* ── Zone / Ward / Kothi cell ── */}
                  <td className="table-cell">
                    <div className="text-sm text-gray-900">Zone: {request.zoneNumber || 'N/A'}</div>
                    <div className="text-xs text-gray-500">Ward: {request.wardNumber || 'N/A'}</div>
                    {request.kothiName && (
                      <div className="text-xs text-gray-500">Kothi: {request.kothiName}</div>
                    )}
                    {request.feederPointName && (
                      <div className="text-xs text-indigo-500">FP: {request.feederPointName}</div>
                    )}
                  </td>

                  <td className="table-cell">
                    <span className="badge badge-info">{request.priority || 'medium'}</span>
                  </td>
                  <td className="table-cell">
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(request.status)}
                      <span className={`badge ${getStatusBadge(request.status)}`}>
                        {request.status?.toUpperCase?.() || 'PENDING'}
                      </span>
                    </div>
                  </td>
                  <td className="table-cell">
                    <div className="text-sm text-gray-900">{formatDate(request.submittedAt)}</div>
                    {request.reviewedAt && (
                      <div className="text-xs text-gray-500">Reviewed: {formatDate(request.reviewedAt)}</div>
                    )}
                  </td>
                  <td className="table-cell">
                    <button
                      onClick={() => {
                        setSelectedRequest(request)
                        setIsEditingZone(false)
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
            <div className="flex justify-center mb-3">
              <AlertCircle className="h-10 w-10 text-gray-400" />
            </div>
            <div className="text-gray-500">No feeder point requests found for the current filters.</div>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-4 bg-white border-t border-gray-200 sm:px-6">
            <div className="flex justify-between flex-1 sm:hidden">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="relative inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="relative ml-3 inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
              >
                Next
              </button>
            </div>
            <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-gray-700">
                  Showing <span className="font-medium">{((currentPage - 1) * itemsPerPage) + 1}</span> to{' '}
                  <span className="font-medium">{Math.min(currentPage * itemsPerPage, filteredRequests.length)}</span> of{' '}
                  <span className="font-medium">{filteredRequests.length}</span> results
                </p>
              </div>
              <div>
                <nav className="inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="relative inline-flex items-center px-2 py-2 text-gray-400 bg-white border border-gray-300 rounded-l-md hover:bg-gray-50 disabled:opacity-50"
                  >
                    <span className="sr-only">Previous</span>
                    <span className="px-2">&larr; Prev</span>
                  </button>
                  <div className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border-t border-b border-gray-300">
                    Page {currentPage} of {totalPages}
                  </div>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="relative inline-flex items-center px-2 py-2 text-gray-400 bg-white border border-gray-300 rounded-r-md hover:bg-gray-50 disabled:opacity-50"
                  >
                    <span className="sr-only">Next</span>
                    <span className="px-2">Next &rarr;</span>
                  </button>
                </nav>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Detail Card ── */}
      {selectedRequest && (
        <div id="details-card" className="card mt-6 border-2 border-primary-500 shadow-lg">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Requested Feeder Point</p>
              <h2 className="text-2xl font-bold text-gray-900">
                {selectedRequest.feederPointName || selectedRequest.areaName || 'Requested feeder point'}
              </h2>
              <p className="text-gray-600 mt-1">
                {selectedRequest.areaDescription || selectedRequest.additionalDetails || 'No description provided.'}
              </p>
            </div>
            <button
              onClick={() => setSelectedRequest(null)}
              className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100"
              aria-label="Close detail view"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <InfoRow label="Requested By" value={selectedRequest.userName} />
            <InfoRow label="Email" value={selectedRequest.userEmail} />
            <InfoRow label="Phone" value={selectedRequest.userPhone} />
            <InfoRow label="Status" value={selectedRequest.status?.toUpperCase?.()} />
            <InfoRow label="Priority" value={selectedRequest.priority || 'N/A'} />
            <InfoRow label="Submitted At" value={formatDate(selectedRequest.submittedAt)} />

            {/* ── Zone (editable) ── */}
            {isEditingZone ? (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Zone</p>
                <div className="flex items-center space-x-2 mt-1">
                  <input
                    type="text"
                    value={editingZoneValue}
                    onChange={(e) => setEditingZoneValue(e.target.value)}
                    className="px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500 w-24"
                    placeholder="Zone"
                  />
                  <button
                    onClick={handleEditZone}
                    disabled={isUpdating}
                    className="px-2 py-1 text-xs bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setIsEditingZone(false)}
                    disabled={isUpdating}
                    className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="group relative flex items-center justify-between">
                <InfoRow label="Zone" value={selectedRequest.zoneNumber} />
                <button
                  onClick={() => {
                    setEditingZoneValue(selectedRequest.zoneNumber || '')
                    setIsEditingZone(true)
                  }}
                  className="px-2 py-1 text-xs bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-primary-600 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Edit Zone"
                >
                  Edit
                </button>
              </div>
            )}

            <InfoRow label="Ward" value={selectedRequest.wardNumber} />

            {/* ── NEW: Kothi & Feeder Point ── */}
            <InfoRow label="Kothi" value={selectedRequest.kothiName} />
            <InfoRow label="Feeder Point" value={selectedRequest.feederPointName} />

            <InfoRow label="Nearest Landmark" value={selectedRequest.nearestLandmark} />
            <InfoRow label="Approx. Households" value={selectedRequest.approximateHouseholds} />
            <InfoRow label="Vehicle Type" value={selectedRequest.vehicleType} />
            <InfoRow label="Population Density" value={selectedRequest.populationDensity} />
            <InfoRow label="Accessibility" value={selectedRequest.accessibility} />
          </div>

          {selectedRequest.coordinates && (
            <div className="mt-4">
              <InfoRow
                label="Coordinates"
                value={`${selectedRequest.coordinates.latitude}, ${selectedRequest.coordinates.longitude}`}
              />
            </div>
          )}

          {selectedRequest.imageURL && (
            <div className="mt-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Location Photo</p>
              <img
                src={selectedRequest.imageURL}
                alt="Location"
                className="rounded-lg max-h-64 object-cover border border-gray-200"
              />
            </div>
          )}

          {selectedRequest.adminNotes && (
            <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">Admin Notes</p>
              <p className="text-sm text-blue-800">{selectedRequest.adminNotes}</p>
            </div>
          )}

          {selectedRequest.rejectionReason && (
            <div className="mt-4 p-3 bg-red-50 rounded-lg border border-red-200">
              <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-1">Rejection Reason</p>
              <p className="text-sm text-red-800">{selectedRequest.rejectionReason}</p>
            </div>
          )}

          <div className="flex gap-3 mt-6">
  {/* APPROVE */}
  <button
    onClick={() => handleApprove(selectedRequest)}
    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
  >
    Approve
  </button>

  {/* REJECT */}
  <button
    onClick={() => handleReject(selectedRequest)}
    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
  >
    Reject
  </button>
</div>
        </div>
      )}
    </div>
  )
}

function StatCard({ title, value, icon, bg }: { title: string; value: number; icon: ReactNode; bg: string }) {
  return (
    <div className="stat-card">
      <div className="flex items-center">
        <div className={`p-3 rounded-lg ${bg}`}>
          {icon}
        </div>
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