import { useEffect, useMemo, useState } from 'react'
import {
  MapPin,
  Search,
  Filter,
  Eye,
  Edit,
  Trash2,
  Users,
  Calendar,
  AlertTriangle,
  CheckCircle,
  Clock,
  TrendingUp,
  Activity,
  Zap,
  Settings,
  User as UserIcon,
  X,
  Ban
} from 'lucide-react'
import { DataService, FeederPoint, Team, User, ComplianceReport, ComplianceAnswer } from '@/lib/dataService'
import { AIService } from '@/lib/aiService'

const YES_ANSWER_VALUES = new Set(['yes', 'y', 'true', 'clean', 'present', 'available', 'segregated', '1', '�o"�,?', '�o.'])
const NO_ANSWER_VALUES = new Set(['no', 'n', 'false', 'dirty', 'absent', 'not present', 'not available', 'not clean', 'not segregated', '0', '�?O', '�o-�,?'])
const REPORT_QUESTION_KEYS = {
  zone: ['q1', 'q1_zone_name', 'zone_name', 'zone'],
  ward: ['q2', 'q2_ward_number', 'ward_number'],
  cleanliness: ['q4', 'feeder_point_clean', 'scp_area_clean'],
  segregation: ['q7', 'waste_segregated', 'wet_dry_waste_segregation'],
  vehicle: ['vehicle_separate_compartments', 'vehicle_available', 'vehicle_present'],
  swach: ['swach_workers_present', 'swach_workers_count', 'staff_present'],
  nearbyArea: ['q5', 'surrounding_area_clean', 'surrounding_area_maintained'],
  signboard: ['q11', 'signboard_qr_display', 'qr_display', 'visible_signboard'],
  compliance: ['q12', 'overall_score', 'overall_compliance_rating']
} as const
const TRIP_SEQUENCE = [1, 2, 3] as const
const HISTORY_PAGE_SIZE = 10

interface TripRow {
  label: string
  time: string
  distance: string
  clean: string
  segregated: string
  vehicle: string
  workers: string
  photo: string
  hasData: boolean
  photos: string[]
}

type ReportHistoryStatus = ComplianceReport['status'] | 'unknown'
type ReportHistoryFilter = 'all' | ComplianceReport['status']

interface ReportHistoryItem {
  key: string
  id: string
  date: string
  trip: string
  status: ReportHistoryStatus
  statusLabel: string
  statusColor: string
  submittedBy: string
  reportRef: ComplianceReport
}

export default function FeederPointsPage() {
  const [feederPoints, setFeederPoints] = useState<FeederPoint[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [enhancedFeederPoints, setEnhancedFeederPoints] = useState<any[]>([])
  const [filteredFeederPoints, setFilteredFeederPoints] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('active')
  const [assignmentFilter, setAssignmentFilter] = useState('all')
  const [selectedFeederPoint, setSelectedFeederPoint] = useState<any>(null)
  const [showDetailsModal, setShowDetailsModal] = useState(false)
  const [feederPointReports, setFeederPointReports] = useState<ComplianceReport[]>([])
  const [reportLoading, setReportLoading] = useState(false)
  const [reportError, setReportError] = useState<string | null>(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingFeederPoint, setEditingFeederPoint] = useState<any | null>(null)
  const [togglingEliminated, setTogglingEliminated] = useState<string | null>(null)

  useEffect(() => {
    const unsubscribeFeederPoints = DataService.onFeederPointsChange(feederPointsData => {
      setFeederPoints(feederPointsData)
      setLoading(false)
    })

    const unsubscribeTeams = DataService.onTeamsChange(teamsData => {
      setTeams(teamsData)
    })

    const unsubscribeUsers = DataService.onUsersChange(usersData => {
      setUsers(usersData)
    })

    return () => {
      unsubscribeFeederPoints()
      unsubscribeTeams()
      unsubscribeUsers()
    }
  }, [])

  useEffect(() => {
    const enhanced = feederPoints.map(fp => {
      let assignmentDetails = null

      if (fp.assignedUserId) {
        const assignedUser = users.find(user => user.id === fp.assignedUserId)
        if (assignedUser) {
          assignmentDetails = {
            type: 'individual',
            name: assignedUser.name || 'Unknown User',
            email: assignedUser.email || '',
            id: fp.assignedUserId,
            role: assignedUser.role || 'User'
          }
        }
      }

      if (fp.assignedTeamId) {
        const assignedTeam = teams.find(team => team.id === fp.assignedTeamId)
        if (assignedTeam) {
          const activeMembers = assignedTeam.members?.filter(member => member.isActive) || []
          assignmentDetails = {
            type: 'team',
            name: assignedTeam.name || 'Unknown Team',
            memberCount: activeMembers.length,
            id: fp.assignedTeamId,
            members: activeMembers
          }
        }
      }

      return {
        ...fp,
        assignmentDetails
      }
    })
    setEnhancedFeederPoints(enhanced)
  }, [feederPoints, teams, users])

  useEffect(() => {
    filterFeederPoints()
  }, [feederPoints, enhancedFeederPoints, searchTerm, statusFilter, assignmentFilter])

  const loadFeederPoints = async () => {
    setLoading(true);
    const points = await DataService.getAllFeederPoints();
    setFeederPoints(points);
    setLoading(false);
  };

  // const filterFeederPoints = () => {
  //   let filtered = enhancedFeederPoints

  //   // Search filter
  //   if (searchTerm) {
  //     filtered = filtered.filter(fp =>
  //       fp.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
  //       fp.location?.address?.toLowerCase().includes(searchTerm.toLowerCase()) ||
  //       fp.assignmentDetails?.name?.toLowerCase().includes(searchTerm.toLowerCase())
  //     )
  //   }

  //   // Status filter
  //   if (statusFilter !== 'all') {
  //     filtered = filtered.filter(fp => fp.status === statusFilter)
  //   }

  //   // Assignment filter
  //   if (assignmentFilter !== 'all') {
  //     if (assignmentFilter === 'assigned') {
  //       filtered = filtered.filter(fp => fp.assignmentDetails)
  //     } else if (assignmentFilter === 'unassigned') {
  //       filtered = filtered.filter(fp => !fp.assignmentDetails)
  //     } else if (assignmentFilter === 'individual') {
  //       filtered = filtered.filter(fp => fp.assignmentDetails?.type === 'individual')
  //     } else if (assignmentFilter === 'team') {
  //       filtered = filtered.filter(fp => fp.assignmentDetails?.type === 'team')
  //     }
  //   }

  //   setFilteredFeederPoints(filtered)
  // }

  const filterFeederPoints = () => {
    let filtered = enhancedFeederPoints

    if (searchTerm) {
      filtered = filtered.filter(fp =>
        fp.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        fp.location?.address?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        fp.assignmentDetails?.name?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    if (statusFilter === 'eliminated') {
      filtered = filtered.filter(fp => fp.isEliminated === true)
    } else {
      filtered = filtered.filter(fp => !fp.isEliminated)
      if (statusFilter !== 'all') {
        filtered = filtered.filter(fp => fp.status === statusFilter)
      }
    }

    if (assignmentFilter !== 'all') {
      if (assignmentFilter === 'assigned') {
        filtered = filtered.filter(fp => fp.assignmentDetails)
      } else if (assignmentFilter === 'unassigned') {
        filtered = filtered.filter(fp => !fp.assignmentDetails)
      } else if (assignmentFilter === 'individual') {
        filtered = filtered.filter(fp => fp.assignmentDetails?.type === 'individual')
      } else if (assignmentFilter === 'team') {
        filtered = filtered.filter(fp => fp.assignmentDetails?.type === 'team')
      }
    }

    setFilteredFeederPoints(filtered)
  }

  const handleToggleEliminated = async (feederPoint: any) => {
    const isCurrentlyEliminated = !!feederPoint.isEliminated

    const message = isCurrentlyEliminated
      ? `Are you sure you want to remove "${feederPoint.name}" from eliminated list and mark it as active again?`
      : `Are you sure you want to eliminate "${feederPoint.name}"? It will be hidden from active feeder points.`

    const confirmed = window.confirm(message)
    if (!confirmed) return

    setTogglingEliminated(feederPoint.id)
    try {
      await DataService.updateFeederPoint(feederPoint.id, {
        isEliminated: !isCurrentlyEliminated
      })
    } catch (error) {
      console.error('Error toggling eliminated:', error)
    }
    setTogglingEliminated(null)
  }

  const handleViewDetails = async (feederPoint: any) => {
    setSelectedFeederPoint(feederPoint)
    setShowDetailsModal(true)
    setReportError(null)
    setReportLoading(true)

    try {
      const reports = await DataService.getFeederPointReports(feederPoint.id, feederPoint.name)
      setFeederPointReports(reports)
    } catch (error) {
      console.error('Error loading feeder point report:', error)
      setReportError('Unable to load compliance data for this feeder point. Please try again.')
      setFeederPointReports([])
    } finally {
      setReportLoading(false)
    }
  }

  const handleCloseDetails = () => {
    setShowDetailsModal(false)
    setSelectedFeederPoint(null)
    setFeederPointReports([])
    setReportError(null)
  }

  const handleEditFeederPoint = (feederPoint: any) => {
    setEditingFeederPoint({ ...feederPoint })
    setShowEditModal(true)
  }

  const handleSaveFeederPoint = async () => {
    if (!editingFeederPoint) return

    try {
      await DataService.updateFeederPoint(editingFeederPoint.id, editingFeederPoint)
      await loadFeederPoints()
      setShowEditModal(false)
      setEditingFeederPoint(null)
      alert('Feeder point updated successfully!')
    } catch (error) {
      console.error('Error updating feeder point:', error)
      alert('Error updating feeder point. Please try again.')
    }
  }

  const handleDeleteFeederPoint = async (feederPoint: any) => {
    if (!confirm(`Are you sure you want to delete feeder point "${feederPoint.name}"?`)) {
      return
    }

    try {
      await DataService.deleteFeederPoint(feederPoint.id)
      await loadFeederPoints()
      alert('Feeder point deleted successfully!')
    } catch (error) {
      console.error('Error deleting feeder point:', error)
      alert('Error deleting feeder point. Please try again.')
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800'
      case 'maintenance':
        return 'bg-yellow-100 text-yellow-800'
      case 'inactive':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'bg-red-100 text-red-800'
      case 'medium':
        return 'bg-yellow-100 text-yellow-800'
      case 'low':
        return 'bg-green-100 text-green-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  const stats = {
    total: enhancedFeederPoints.length,
    active: enhancedFeederPoints.filter(fp => fp.status === 'active').length,
    maintenance: enhancedFeederPoints.filter(fp => fp.status === 'maintenance').length,
    inactive: enhancedFeederPoints.filter(fp => fp.status === 'inactive').length,
    assigned: enhancedFeederPoints.filter(fp => fp.assignmentDetails).length,
    unassigned: enhancedFeederPoints.filter(fp => !fp.assignmentDetails).length,
    individual: enhancedFeederPoints.filter(fp => fp.assignmentDetails?.type === 'individual').length,
    team: enhancedFeederPoints.filter(fp => fp.assignmentDetails?.type === 'team').length
  }

  return (
    <div className="space-y-6 scrollable-content">
      {/* Page Header */}
      <div className="border-b border-gray-200 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Zap className="h-8 w-8 text-blue-600" />
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Feeder Points Monitor</h1>
              <p className="mt-1 text-sm sm:text-base text-gray-600">
                Real-time monitoring of all feeder points and assignments
              </p>
            </div>
          </div>

          {/* Actions intentionally removed for restricted roles */}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <div className="stat-card">
          <div className="flex items-center">
            <div className="p-3 rounded-lg bg-blue-500">
              <Zap className="h-6 w-6 text-white" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Points</p>
              <p className="text-2xl font-semibold text-gray-900">{stats.total}</p>
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="flex items-center">
            <div className="p-3 rounded-lg bg-green-500">
              <CheckCircle className="h-6 w-6 text-white" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Active</p>
              <p className="text-2xl font-semibold text-gray-900">{stats.active}</p>
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="flex items-center">
            <div className="p-3 rounded-lg bg-yellow-500">
              <Settings className="h-6 w-6 text-white" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Maintenance</p>
              <p className="text-2xl font-semibold text-gray-900">{stats.maintenance}</p>
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="flex items-center">
            <div className="p-3 rounded-lg bg-purple-500">
              <Users className="h-6 w-6 text-white" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Assigned</p>
              <p className="text-2xl font-semibold text-gray-900">{stats.assigned}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Assignment Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Assignment Status</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Assigned</span>
              <div className="flex items-center space-x-2">
                <div className="w-32 bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-green-500 h-2 rounded-full"
                    style={{ width: `${(stats.assigned / stats.total) * 100}%` }}
                  ></div>
                </div>
                <span className="text-sm font-semibold text-gray-900">{stats.assigned}</span>
              </div>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Unassigned</span>
              <div className="flex items-center space-x-2">
                <div className="w-32 bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-red-500 h-2 rounded-full"
                    style={{ width: `${(stats.unassigned / stats.total) * 100}%` }}
                  ></div>
                </div>
                <span className="text-sm font-semibold text-gray-900">{stats.unassigned}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Assignment Types</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Individual</span>
              <div className="flex items-center space-x-2">
                <div className="w-32 bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full"
                    style={{ width: `${stats.assigned > 0 ? (stats.individual / stats.assigned) * 100 : 0}%` }}
                  ></div>
                </div>
                <span className="text-sm font-semibold text-gray-900">{stats.individual}</span>
              </div>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Team</span>
              <div className="flex items-center space-x-2">
                <div className="w-32 bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-purple-500 h-2 rounded-full"
                    style={{ width: `${stats.assigned > 0 ? (stats.team / stats.assigned) * 100 : 0}%` }}
                  ></div>
                </div>
                <span className="text-sm font-semibold text-gray-900">{stats.team}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="card">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0 sm:space-x-4">
          <div className="flex-1 max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <input
                type="text"
                placeholder="Search feeder points..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="flex space-x-4">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="maintenance">Maintenance</option>
              <option value="inactive">Inactive</option>
              <option value="eliminated">Eliminated</option>
            </select>

            <select
              value={assignmentFilter}
              onChange={(e) => setAssignmentFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="all">All Assignments</option>
              <option value="assigned">Assigned</option>
              <option value="unassigned">Unassigned</option>
              <option value="individual">Individual</option>
              <option value="team">Team</option>
            </select>
          </div>
        </div>
      </div>

      {/* Feeder Points Table */}
      <div className="card">
        <div className="px-4 py-5 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Feeder Points ({filteredFeederPoints.length})
            </h2>

            <div className="flex items-center space-x-2 text-sm text-gray-500">
              <Activity className="h-4 w-4" />
              <span>Real-time data</span>
            </div>
          </div>

          <div className="scrollable-table">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Eliminated
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Feeder Point
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Location
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Assignment
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Priority
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Last Inspection
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredFeederPoints.map((feederPoint, index) => (
                  // <tr key={feederPoint.id || index} className="hover:bg-gray-50">
                  <tr key={feederPoint.id || index} className={`hover:bg-gray-50 ${feederPoint.isEliminated ? 'opacity-60 bg-red-50' : ''}`}>
                    <td className="px-4 py-4 whitespace-nowrap text-center">
                      <input
                        type="checkbox"
                        checked={!!feederPoint.isEliminated}
                        disabled={togglingEliminated === feederPoint.id}
                        onChange={() => handleToggleEliminated(feederPoint)}
                        className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500 cursor-pointer"
                        title={feederPoint.isEliminated ? 'Mark as active' : 'Mark as eliminated'}
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10">
                          <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                            <Zap className="h-5 w-5 text-blue-600" />
                          </div>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {feederPoint.name || `Feeder Point ${index + 1}`}
                          </div>
                          <div className="text-sm text-gray-500">
                            ID: {feederPoint.id}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <MapPin className="h-4 w-4 text-gray-400 mr-2" />
                        <div>
                          <div className="text-sm text-gray-900">
                            {feederPoint.location?.address ||
                              feederPoint.address ||
                              (feederPoint.location?.latitude && feederPoint.location?.longitude
                                ? `${feederPoint.location.latitude}, ${feederPoint.location.longitude}`
                                : 'No location data')}
                          </div>
                          {feederPoint.location?.latitude && feederPoint.location?.longitude && (
                            <div className="text-xs text-gray-500">
                              {feederPoint.location.latitude.toFixed(4)}, {feederPoint.location.longitude.toFixed(4)}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(feederPoint.status)}`}>
                        {feederPoint.status || 'unknown'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {feederPoint.assignmentDetails ? (
                        <div className="flex items-center">
                          {feederPoint.assignmentDetails.type === 'individual' ? (
                            <UserIcon className="h-4 w-4 text-blue-500 mr-2" />
                          ) : (
                            <Users className="h-4 w-4 text-purple-500 mr-2" />
                          )}
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {feederPoint.assignmentDetails.name}
                            </div>
                            <div className="text-xs text-gray-500">
                              {feederPoint.assignmentDetails.type === 'individual' ? 'Individual' : `Team (${feederPoint.assignmentDetails.memberCount} members)`}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-500">Unassigned</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getPriorityColor(feederPoint.priority)}`}>
                        {feederPoint.priority || 'normal'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {feederPoint.lastInspection ? (
                        <div className="flex items-center">
                          <Calendar className="h-4 w-4 mr-1" />
                          {feederPoint.lastInspection.toDate?.()?.toLocaleDateString() || 'Invalid date'}
                        </div>
                      ) : (
                        <span className="text-gray-400">Never</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button
                        onClick={() => handleViewDetails(feederPoint)}
                        className="text-primary-600 hover:text-primary-900 mr-3"
                        title="View Details"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleEditFeederPoint(feederPoint)}
                        className="text-yellow-600 hover:text-yellow-900 mr-3"
                        title="Edit Feeder Point"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteFeederPoint(feederPoint)}
                        className="text-red-600 hover:text-red-900"
                        title="Delete Feeder Point"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredFeederPoints.length === 0 && !loading && (
            <div className="text-center py-12">
              <Zap className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">
                {feederPoints.length === 0 ? 'No feeder points in database' : 'No feeder points match your filters'}
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                {feederPoints.length === 0
                  ? 'Feeder points will appear here when they are created in the mobile app.'
                  : searchTerm || statusFilter !== 'all' || assignmentFilter !== 'all'
                    ? 'Try adjusting your search or filters.'
                    : 'All feeder points are currently filtered out.'}
              </p>
              {/* Creation options removed */}
            </div>
          )}
        </div>
      </div>

      {/* Feeder Point Report Modal */}
      {showDetailsModal && selectedFeederPoint && (
        <FeederPointReportModal
          feederPoint={selectedFeederPoint}
          reports={feederPointReports}
          loading={reportLoading}
          error={reportError}
          onClose={handleCloseDetails}
        />
      )}

      {/* Edit Feeder Point Modal */}
      {showEditModal && editingFeederPoint && (
        <FeederPointFormModal
          title="Edit Feeder Point"
          feederPoint={editingFeederPoint}
          onClose={() => setShowEditModal(false)}
          onSave={handleSaveFeederPoint}
        />
      )}
    </div>
  )
}

function FeederPointFormModal({ title, feederPoint, onClose, onSave }: any) {
  const [formData, setFormData] = useState(feederPoint || {})

  const handleChange = (e: any) => {
    const { name, value } = e.target
    setFormData({ ...formData, [name]: value })
  }

  const handleSave = () => {
    onSave(formData)
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={onClose} />
        <div className="bg-white rounded-lg shadow-xl transform transition-all sm:max-w-lg sm:w-full">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900">{title}</h3>
            <div className="mt-4 space-y-4">
              <input type="text" name="name" value={formData.name || ''} onChange={handleChange} placeholder="Name" className="w-full px-3 py-2 border border-gray-300 rounded-md" />
              <input type="text" name="location.address" value={formData.location?.address || ''} onChange={handleChange} placeholder="Address" className="w-full px-3 py-2 border border-gray-300 rounded-md" />
              <select name="status" value={formData.status || ''} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-md">
                <option value="active">Active</option>
                <option value="maintenance">Maintenance</option>
                <option value="inactive">Inactive</option>
              </select>
              <select name="priority" value={formData.priority || ''} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-md">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>
          <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
            <button type="button" onClick={handleSave} className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 sm:ml-3 sm:w-auto sm:text-sm">Save</button>
            <button type="button" onClick={onClose} className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function FeederPointReportModal({
  feederPoint,
  reports,
  loading,
  error,
  onClose
}: {
  feederPoint: any
  reports: ComplianceReport[]
  loading: boolean
  error: string | null
  onClose: () => void
}) {
  const latestReport = reports[0]
  const latestReportDate = latestReport ? getReportPrimaryDate(latestReport) : null
  const zoneValue = getAnswerFromReports(reports, REPORT_QUESTION_KEYS.zone)
  const wardValue = getAnswerFromReports(reports, REPORT_QUESTION_KEYS.ward)
  const cleanlinessStatus = formatBooleanAnswer(
    getAnswerFromReports(reports, REPORT_QUESTION_KEYS.cleanliness),
    'Clean',
    'Not Clean',
    'Data Not Available'
  )
  const segregationStatus = formatBooleanAnswer(
    getAnswerFromReports(reports, REPORT_QUESTION_KEYS.segregation),
    'Segregated',
    'Not Segregated',
    'Data Not Available'
  )
  const vehicleStatus = formatBooleanAnswer(
    getAnswerFromReports(reports, REPORT_QUESTION_KEYS.vehicle),
    'Present',
    'Not Present',
    'Data Not Available'
  )
  const nearbyAreaStatus = formatBooleanAnswer(
    getAnswerFromReports(reports, REPORT_QUESTION_KEYS.nearbyArea),
    'Yes',
    'No',
    'Not Documented'
  )
  const signboardStatus = formatBooleanAnswer(
    getAnswerFromReports(reports, REPORT_QUESTION_KEYS.signboard),
    'Yes',
    'No',
    'Not Documented'
  )
  const swachValue = getAnswerFromReports(reports, REPORT_QUESTION_KEYS.swach)
  const swachPresence = formatWorkerPresence(swachValue)
  const finalComplianceScore = formatTitleValue(
    getAnswerFromReports(reports, REPORT_QUESTION_KEYS.compliance),
    'Not Available'
  )
  const tripRows = buildTripRows(reports)
  const totalTrips = getDistinctTripCount(reports)
  const submittedBy = latestReport?.userName || feederPoint.assignmentDetails?.name || 'Not Provided'
  const observations = deriveObservations(cleanlinessStatus, segregationStatus, vehicleStatus, swachPresence, signboardStatus)
  const statusSummary = getStatusSummary(reports)
  const reportHistory = buildReportHistory(reports)
  const [historyStatusFilter, setHistoryStatusFilter] = useState('all' as ReportHistoryFilter)
  const [historyPage, setHistoryPage] = useState(1)
  const [selectedHistoryReport, setSelectedHistoryReport] = useState<ComplianceReport | null>(null)
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [analysisResult, setAnalysisResult] = useState<string | null>(null)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const filteredReportHistory = useMemo(() => {
    if (historyStatusFilter === 'all') {
      return reportHistory
    }
    return reportHistory.filter(item => item.status === historyStatusFilter)
  }, [reportHistory, historyStatusFilter])
  const historyTotalPages = useMemo(() => {
    const total = filteredReportHistory.length
    return Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE))
  }, [filteredReportHistory])
  const paginatedReportHistory = useMemo(() => {
    const startIndex = (historyPage - 1) * HISTORY_PAGE_SIZE
    return filteredReportHistory.slice(startIndex, startIndex + HISTORY_PAGE_SIZE)
  }, [filteredReportHistory, historyPage])
  const historyRangeStart = filteredReportHistory.length === 0 ? 0 : (historyPage - 1) * HISTORY_PAGE_SIZE + 1
  const historyRangeEnd = Math.min(historyPage * HISTORY_PAGE_SIZE, filteredReportHistory.length)
  const selectedReportBadge = selectedHistoryReport ? getStatusBadge(selectedHistoryReport.status) : null
  const selectedReportDate = selectedHistoryReport ? getReportPrimaryDate(selectedHistoryReport) : null

  useEffect(() => {
    setHistoryStatusFilter('all')
    setSelectedHistoryReport(null)
    setHistoryPage(1)
  }, [reports])

  useEffect(() => {
    if (historyPage > historyTotalPages) {
      setHistoryPage(historyTotalPages)
    }
  }, [historyPage, historyTotalPages])

  useEffect(() => {
    setHistoryPage(1)
  }, [historyStatusFilter])

  useEffect(() => {
    setAnalysisLoading(false)
    setAnalysisResult(null)
    setAnalysisError(null)
  }, [selectedHistoryReport])

  const handleHistoryRowClick = (report: ComplianceReport) => {
    setSelectedHistoryReport(report)
  }

  const handleAnalyzeResponses = async () => {
    if (!selectedHistoryReport) {
      return
    }
    try {
      setAnalysisLoading(true)
      setAnalysisError(null)
      const analysis = await AIService.analyzeReportCompliance({
        report: selectedHistoryReport,
        feederPointName: feederPoint.name || feederPoint.feederPointName || 'Unknown Feeder Point',
      })
      setAnalysisResult(analysis)
    } catch (error) {
      console.error('Error analyzing report compliance:', error)
      setAnalysisError('Unable to analyze responses right now. Please try again later.')
    } finally {
      setAnalysisLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center px-4 py-8">
        <div className="fixed inset-0 bg-black bg-opacity-30" onClick={onClose} />
        <div className="relative z-10 w-full max-w-5xl rounded-2xl bg-white p-6 shadow-2xl">
          <div className="flex items-start justify-between border-b pb-4">
            <div>
              <h3 className="text-2xl font-semibold text-gray-900">Feeder Point Inspection Report</h3>
              <p className="text-sm text-gray-500">Generated {new Date().toLocaleString()}</p>
            </div>
            <button
              onClick={onClose}
              className="inline-flex rounded-full bg-gray-100 p-2 text-gray-600 hover:bg-gray-200"
              aria-label="Close report"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {loading && (
            <div className="mt-4 rounded-md bg-blue-50 px-4 py-3 text-sm text-blue-700">
              Generating the latest report. Please wait...
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {!loading && reports.length === 0 && !error && (
            <div className="mt-4 rounded-md bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
              No compliance reports are linked to this feeder point yet. The template below uses default placeholders.
            </div>
          )}

          <div className="mt-6 space-y-6">
            <section>
              <h4 className="text-base font-semibold text-gray-900">1. Basic Information</h4>
              <div className="mt-3 grid gap-4 text-sm sm:grid-cols-2">
                <InfoCell label="Feeder Point Name" value={feederPoint.name || 'Not Provided'} />
                <InfoCell label="Zone" value={zoneValue || 'Not Provided'} />
                <InfoCell label="Ward" value={wardValue || 'Not Provided'} />
                <InfoCell
                  label="Date"
                  value={latestReportDate ? latestReportDate.toLocaleDateString() : 'Not Available'}
                />
                <InfoCell label="Total Trips" value={totalTrips ? totalTrips.toString() : '0'} />
                <InfoCell label="Submitted By" value={submittedBy || 'Not Provided'} />
              </div>
            </section>

            <Divider />

            <section>
              <h4 className="text-base font-semibold text-gray-900">2. Overall Status</h4>
              <div className="mt-3 grid gap-4 text-sm sm:grid-cols-2">
                <InfoCell label="Feeder Point Cleanliness" value={cleanlinessStatus} />
                <InfoCell label="Segregation Status" value={segregationStatus} />
                <InfoCell label="Vehicle Availability" value={vehicleStatus} />
                <InfoCell label="Swach Worker Presence" value={swachPresence} />
                <InfoCell label="Nearby Area Cleanliness" value={nearbyAreaStatus} />
                <InfoCell label="Signboard/QR Availability" value={signboardStatus} />
                <InfoCell label="Final Compliance Score" value={finalComplianceScore} />
              </div>
            </section>

            <Divider />

            <section>
              <h4 className="text-base font-semibold text-gray-900">3. Trip-wise Summary</h4>
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">Trip</th>
                      <th className="px-3 py-2 text-left font-semibold">Time</th>
                      <th className="px-3 py-2 text-left font-semibold">Distance</th>
                      <th className="px-3 py-2 text-left font-semibold">Clean</th>
                      <th className="px-3 py-2 text-left font-semibold">Segregated</th>
                      <th className="px-3 py-2 text-left font-semibold">Vehicle</th>
                      <th className="px-3 py-2 text-left font-semibold">Workers</th>
                      <th className="px-3 py-2 text-left font-semibold">Photo Attached</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {tripRows.map(row => (
                      <tr key={row.label}>
                        <td className="px-3 py-2 font-medium text-gray-900">{row.label}</td>
                        <td className="px-3 py-2 text-gray-700">{row.time}</td>
                        <td className="px-3 py-2 text-gray-700">{row.distance}</td>
                        <td className="px-3 py-2 text-gray-700">{row.clean}</td>
                        <td className="px-3 py-2 text-gray-700">{row.segregated}</td>
                        <td className="px-3 py-2 text-gray-700">{row.vehicle}</td>
                        <td className="px-3 py-2 text-gray-700">{row.workers}</td>
                        <td className="px-3 py-2 text-gray-700">{row.photo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <Divider />

            <section>
              <h4 className="text-base font-semibold text-gray-900">4. Key Observations</h4>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-gray-700">
                {observations.map((item, index) => (
                  <li key={`${item}-${index}`}>{item}</li>
                ))}
              </ul>
            </section>

            <Divider />

            <section>
              <h4 className="text-base font-semibold text-gray-900">5. Photo Evidence</h4>
              <div className="mt-3 space-y-4">
                {tripRows.map(row => (
                  <div key={row.label} className="rounded-lg border border-dashed border-gray-200 p-4">
                    <div className="flex items-center justify-between text-sm">
                      <p className="font-semibold text-gray-900">{row.label} Photo</p>
                      <span className="text-xs uppercase tracking-wide text-gray-500">
                        {row.photos.length > 0
                          ? `${row.photos.length} attachment${row.photos.length > 1 ? 's' : ''}`
                          : row.hasData
                            ? 'No attachments'
                            : 'Pending'}
                      </span>
                    </div>

                    {row.photos.length > 0 ? (
                      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {row.photos.map((url, index) => (
                          <a
                            key={`${row.label}-${index}-${url}`}
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="group relative block overflow-hidden rounded-lg border border-gray-100 bg-gray-50"
                          >
                            <img
                              src={url}
                              alt={`${row.label} photo ${index + 1}`}
                              className="h-32 w-full object-cover transition duration-200 group-hover:scale-105"
                            />
                            <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-xs font-semibold uppercase tracking-wide text-white transition group-hover:bg-black/40">
                              View Full Photo
                            </span>
                          </a>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-gray-600">
                        {row.hasData ? 'No photos were attached for this trip.' : 'Awaiting documentation.'}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <Divider />

            <section>
              <div className="flex flex-col gap-2 text-base font-semibold text-gray-900 sm:flex-row sm:items-center sm:justify-between">
                <h4>6. Report History</h4>
                <span className="text-sm font-medium text-gray-500">Complete records since first submission</span>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatusStat label="Total Reports" value={statusSummary.total} color="text-gray-900" />
                <StatusStat label="Approved" value={statusSummary.approved} color="text-green-600" />
                <StatusStat label="Rejected" value={statusSummary.rejected} color="text-red-600" />
                <StatusStat label="Requires Action" value={statusSummary.requiresAction} color="text-orange-600" />
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <label htmlFor="report-history-status-filter" className="text-sm font-medium text-gray-700">
                  Filter by status
                </label>
                <select
                  id="report-history-status-filter"
                  value={historyStatusFilter}
                  onChange={event => setHistoryStatusFilter(event.target.value as ReportHistoryFilter)}
                  className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="all">All Reports</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                  <option value="pending">Pending</option>
                  <option value="requires_action">Requires Action</option>
                </select>
              </div>

              <div className="mt-4 overflow-x-auto rounded-lg border border-gray-100">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="px-4 py-2 text-left font-semibold">Date</th>
                      <th className="px-4 py-2 text-left font-semibold">Trip</th>
                      <th className="px-4 py-2 text-left font-semibold">Status</th>
                      <th className="px-4 py-2 text-left font-semibold">Submitted By</th>
                      <th className="px-4 py-2 text-left font-semibold">Report ID</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {filteredReportHistory.length > 0 ? (
                      paginatedReportHistory.map(item => {
                        const isSelected = selectedHistoryReport === item.reportRef
                        return (
                          <tr
                            key={item.key}
                            onClick={() => handleHistoryRowClick(item.reportRef)}
                            className={`cursor-pointer transition-colors ${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                          >
                            <td className="px-4 py-2 text-gray-900">{item.date}</td>
                            <td className="px-4 py-2 text-gray-700">{item.trip}</td>
                            <td className="px-4 py-2">
                              <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${item.statusColor}`}>
                                {item.statusLabel}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-gray-700">{item.submittedBy}</td>
                            <td className="px-4 py-2 font-mono text-xs text-gray-500">{item.id}</td>
                          </tr>
                        )
                      })
                    ) : (
                      <tr>
                        <td colSpan={5} className="px-4 py-4 text-center text-gray-500">
                          {historyStatusFilter === 'all'
                            ? 'No historical reports available.'
                            : 'No reports match the selected status.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {historyTotalPages > 1 && (
                <div className="mt-3 flex flex-col gap-2 text-sm text-gray-700 sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    Showing {historyRangeStart}-{historyRangeEnd} of {filteredReportHistory.length} reports
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setHistoryPage(current => Math.max(1, current - 1))}
                      disabled={historyPage === 1}
                      className="rounded-md border border-gray-200 px-3 py-1 font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Page {historyPage} of {historyTotalPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => setHistoryPage(current => Math.min(historyTotalPages, current + 1))}
                      disabled={historyPage === historyTotalPages}
                      className="rounded-md border border-gray-200 px-3 py-1 font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}

              {selectedHistoryReport && (
                <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50/40 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-blue-900">Report details</p>
                      <p className="text-xs text-gray-600">Click another history row to inspect a different submission.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedHistoryReport(null)}
                      className="text-xs font-medium text-blue-700 hover:text-blue-900"
                    >
                      Clear selection
                    </button>
                  </div>

                  <div className="mt-4 grid gap-4 text-sm text-gray-900 sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Feeder Point</p>
                      <p className="mt-1">{selectedHistoryReport.feederPointName || 'Not Provided'}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Submitted By</p>
                      <p className="mt-1">
                        {selectedHistoryReport.userName || 'Unknown'}
                        {selectedHistoryReport.teamName ? ` (${selectedHistoryReport.teamName})` : ''}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Trip</p>
                      <p className="mt-1">
                        {selectedHistoryReport.tripNumber ? `Trip ${selectedHistoryReport.tripNumber}` : 'Not Specified'}
                        {selectedHistoryReport.tripDate ? ` • ${selectedHistoryReport.tripDate}` : ''}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Submitted At</p>
                      <p className="mt-1">{selectedReportDate ? selectedReportDate.toLocaleString() : 'Not Available'}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Status</p>
                      <span
                        className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${selectedReportBadge?.colorClass || 'bg-gray-100 text-gray-700'}`}
                      >
                        {selectedReportBadge?.label || 'Unknown'}
                      </span>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Priority</p>
                      <p className="mt-1 capitalize">{selectedHistoryReport.priority || 'Not Provided'}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Report ID</p>
                      <p className="mt-1 font-mono text-xs text-gray-900">{selectedHistoryReport.id || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Location</p>
                      <p className="mt-1 text-sm">{selectedHistoryReport.submittedLocation?.address || 'Not Provided'}</p>
                      {typeof selectedHistoryReport.distanceFromFeederPoint === 'number' && (
                        <p className="text-xs text-gray-500">
                          {selectedHistoryReport.distanceFromFeederPoint.toFixed(2)} m from feeder point
                        </p>
                      )}
                    </div>
                  </div>

                  {selectedHistoryReport.description && (
                    <div className="mt-4 text-sm text-gray-700">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Description</p>
                      <p className="mt-1">{selectedHistoryReport.description}</p>
                    </div>
                  )}

                  {selectedHistoryReport.attachments && selectedHistoryReport.attachments.length > 0 && (
                    <div className="mt-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Attachments</p>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {selectedHistoryReport.attachments.map(attachment => (
                          <a
                            key={attachment.id}
                            href={attachment.url}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center justify-between rounded border border-blue-100 bg-white px-3 py-2 text-sm text-blue-700 transition hover:bg-blue-50"
                          >
                            <span className="truncate">{attachment.filename || attachment.type}</span>
                            <Eye className="ml-3 h-4 w-4" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedHistoryReport.answers && selectedHistoryReport.answers.length > 0 && (
                    <div className="mt-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Submitted Responses</p>
                        <button
                          type="button"
                          onClick={handleAnalyzeResponses}
                          disabled={analysisLoading}
                          className="inline-flex items-center rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {analysisLoading ? 'Analyzing…' : 'Analyze with AI'}
                        </button>
                      </div>
                      <div className="mt-2 divide-y divide-gray-100 rounded-lg border border-gray-100 bg-white">
                        {selectedHistoryReport.answers.map((answer, index) => {
                          const questionLabel = getAnswerQuestionLabel(answer, index)
                          const answerValue = getAnswerDisplayValue(answer)
                          return (
                            <div key={`${answer.questionId || 'answer'}-${index}`} className="px-4 py-3">
                              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{questionLabel}</p>
                              <p className="mt-1 text-sm text-gray-900">{answerValue}</p>
                              {answer.notes && <p className="mt-1 text-xs text-gray-500">Notes: {answer.notes}</p>}
                              {answer.photos && answer.photos.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {answer.photos.map((photoUrl, photoIndex) => (
                                    <a
                                      key={`${answer.questionId || 'photo'}-${photoIndex}-${photoUrl}`}
                                      href={photoUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center rounded border border-blue-100 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 transition hover:bg-blue-100"
                                    >
                                      View Photo {photoIndex + 1}
                                    </a>
                                  ))}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                      {analysisError && (
                        <p className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                          {analysisError}
                        </p>
                      )}
                      {analysisResult && (
                        <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50/60 p-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-blue-900">AI Assessment</p>
                          <pre className="mt-2 whitespace-pre-wrap text-sm text-gray-900">{analysisResult}</pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

            </section>
          </div>
        </div>
      </div>
    </div>
  )
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-gray-900">{value || 'Not Provided'}</p>
    </div>
  )
}

function Divider() {
  return <div className="border-t border-dashed border-gray-200" />
}

function StatusStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${color}`}>{value}</p>
    </div>
  )
}

function getAnswerFromReports(reports: ComplianceReport[], keys: readonly string[]): string | null {
  for (const report of reports) {
    const value = getAnswerFromReport(report, keys)
    if (value) {
      return value
    }
  }
  return null
}

function getAnswerFromReport(report: ComplianceReport | undefined, keys: readonly string[]): string | null {
  if (!report?.answers) {
    return null
  }

  const normalizedKeys = keys.map(key => key.toLowerCase())
  for (const answer of report.answers) {
    const answerId = (answer.questionId || '').toLowerCase()
    const answerDescription = (answer.description || '').toLowerCase()

    if (normalizedKeys.includes(answerId) || (answerDescription && normalizedKeys.includes(answerDescription))) {
      const value = answer.answer
      return value ? value.toString() : null
    }
  }

  return null
}

function normalizeAnswerValue(value: string | null) {
  return value?.toString().trim().toLowerCase() || ''
}

function formatBooleanAnswer(value: string | null, positiveLabel: string, negativeLabel: string, fallback: string) {
  if (!value) {
    return fallback
  }

  const normalized = normalizeAnswerValue(value)
  if (YES_ANSWER_VALUES.has(normalized)) {
    return positiveLabel
  }
  if (NO_ANSWER_VALUES.has(normalized)) {
    return negativeLabel
  }
  return value
}

function formatWorkerPresence(value: string | null) {
  if (!value) {
    return 'Not Documented'
  }

  const normalized = normalizeAnswerValue(value)
  const numericValue = Number(normalized)
  if (!Number.isNaN(numericValue) && numericValue > 0) {
    return `${numericValue} worker${numericValue === 1 ? '' : 's'} present`
  }

  if (YES_ANSWER_VALUES.has(normalized)) {
    return 'Present'
  }
  if (NO_ANSWER_VALUES.has(normalized)) {
    return 'Not Present'
  }

  return value
}

function formatTitleValue(value: string | null, fallback: string) {
  if (!value) {
    return fallback
  }

  return value
    .split(' ')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}

function getAnswerQuestionLabel(answer: ComplianceAnswer, index: number) {
  if (answer.description && answer.description.trim()) {
    return answer.description.trim()
  }
  if (answer.questionId && answer.questionId.trim()) {
    return humanizeQuestionKey(answer.questionId)
  }
  return `Question ${index + 1}`
}

function getAnswerDisplayValue(answer: ComplianceAnswer) {
  if (answer.answer === null || answer.answer === undefined || answer.answer === '') {
    return 'Not Provided'
  }
  const value = answer.answer.toString()
  return value.trim() || 'Not Provided'
}

function humanizeQuestionKey(value: string) {
  return value
    .split(/[_-]+/)
    .map(part => (part ? part.charAt(0).toUpperCase() + part.slice(1) : ''))
    .join(' ')
    .trim() || value
}

function buildTripRows(reports: ComplianceReport[]): TripRow[] {
  const sortedReports = [...reports].sort((a, b) => {
    const aDate = getReportPrimaryDate(a)
    const bDate = getReportPrimaryDate(b)
    const aTime = aDate ? aDate.getTime() : 0
    const bTime = bDate ? bDate.getTime() : 0
    return bTime - aTime
  })

  return TRIP_SEQUENCE.map((tripNumber, index) => {
    const matchedReport = sortedReports.find(item => item.tripNumber === tripNumber)
    const report = matchedReport || sortedReports[index]
    const reportDate = report ? getReportPrimaryDate(report) : null
    const photos = collectReportPhotoUrls(report)
    const cleanliness = formatBooleanAnswer(
      getAnswerFromReport(report, REPORT_QUESTION_KEYS.cleanliness),
      'Yes',
      'No',
      'Yes / No'
    )
    const segregation = formatBooleanAnswer(
      getAnswerFromReport(report, REPORT_QUESTION_KEYS.segregation),
      'Yes',
      'No',
      'Yes / No'
    )
    const vehicle = formatBooleanAnswer(
      getAnswerFromReport(report, REPORT_QUESTION_KEYS.vehicle),
      'Yes',
      'No',
      'Yes / No'
    )
    const workers = getAnswerFromReport(report, REPORT_QUESTION_KEYS.swach) || '__________'
    const photoAttached = report ? (photos.length > 0 ? 'Yes' : 'No') : 'Yes / No'
    const distance = typeof report?.distanceFromFeederPoint === 'number'
      ? `${Math.round(report.distanceFromFeederPoint)} m`
      : '__________'

    return {
      label: `Trip ${tripNumber}`,
      time: reportDate ? reportDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '__________',
      distance,
      clean: cleanliness,
      segregated: segregation,
      vehicle,
      workers,
      photo: photoAttached,
      hasData: Boolean(report),
      photos
    }
  })
}

function getReportPrimaryDate(report: ComplianceReport) {
  return (
    coerceDate(report.submittedAt) ||
    coerceDate(report.updatedAt) ||
    coerceDate(report.createdAt) ||
    (report.tripDate ? coerceDate(report.tripDate) : null)
  )
}

function coerceDate(value: any): Date | null {
  if (!value) {
    return null
  }
  if (value instanceof Date) {
    return value
  }
  if (typeof value.toDate === 'function') {
    return value.toDate()
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  return null
}

function collectReportPhotoUrls(report?: ComplianceReport) {
  if (!report) {
    return []
  }
  const urls = new Set<string>()
  report.attachments?.forEach(attachment => {
    if (attachment.type === 'photo' && attachment.url) {
      urls.add(attachment.url)
    }
  })
  report.answers?.forEach(answer => {
    answer.photos?.forEach(photoUrl => {
      if (photoUrl) {
        urls.add(photoUrl)
      }
    })
  })
  return Array.from(urls)
}

function getDistinctTripCount(reports: ComplianceReport[]) {
  const tripNumbers = new Set<number>()
  reports.forEach(report => {
    if (typeof report.tripNumber === 'number') {
      tripNumbers.add(report.tripNumber)
    }
  })
  return tripNumbers.size || Math.min(reports.length, TRIP_SEQUENCE.length)
}

function getStatusSummary(reports: ComplianceReport[]) {
  const summary = {
    total: reports.length,
    approved: 0,
    rejected: 0,
    requiresAction: 0
  }

  reports.forEach(report => {
    if (report.status === 'approved') {
      summary.approved += 1
    } else if (report.status === 'rejected') {
      summary.rejected += 1
    } else if (report.status === 'requires_action') {
      summary.requiresAction += 1
    }
  })

  return summary
}

function buildReportHistory(reports: ComplianceReport[]): ReportHistoryItem[] {
  const sorted = [...reports].sort((a, b) => {
    const aDate = getReportPrimaryDate(a)
    const bDate = getReportPrimaryDate(b)
    const aTime = aDate ? aDate.getTime() : 0
    const bTime = bDate ? bDate.getTime() : 0
    return aTime - bTime
  })

  return sorted.map((report, index) => {
    const reportDate = getReportPrimaryDate(report)
    const badge = getStatusBadge(report.status)
    const derivedStatus: ReportHistoryStatus = report.status || 'unknown'
    const key =
      report.id ||
      `${report.feederPointId || 'feeder'}-${report.tripDate || 'date'}-${report.tripNumber || 'trip'}-${index}`

    return {
      key,
      id: report.id || 'N/A',
      date: reportDate ? reportDate.toLocaleString() : 'Date Not Available',
      trip: report.tripNumber ? `Trip ${report.tripNumber}` : 'Not Specified',
      status: derivedStatus,
      statusLabel: badge.label,
      statusColor: badge.colorClass,
      submittedBy: report.userName || report.submittedBy || 'Unknown',
      reportRef: report
    }
  })
}

function getStatusBadge(status?: ComplianceReport['status']) {
  switch (status) {
    case 'approved':
      return { label: 'Approved', colorClass: 'bg-green-100 text-green-700' }
    case 'rejected':
      return { label: 'Rejected', colorClass: 'bg-red-100 text-red-700' }
    case 'requires_action':
      return { label: 'Requires Action', colorClass: 'bg-orange-100 text-orange-700' }
    case 'pending':
      return { label: 'Pending', colorClass: 'bg-yellow-100 text-yellow-700' }
    default:
      return { label: 'Unknown', colorClass: 'bg-gray-100 text-gray-700' }
  }
}

function deriveObservations(
  cleanlinessStatus: string,
  segregationStatus: string,
  vehicleStatus: string,
  swachPresence: string,
  signboardStatus: string
) {
  return [
    cleanlinessStatus === 'Clean'
      ? 'Cleanliness levels appear consistent across trips.'
      : 'Cleanliness inconsistencies were noted across recent trips.',
    segregationStatus === 'Segregated'
      ? 'Segregation was properly maintained in the reviewed trips.'
      : 'Segregation lapses were observed and require follow-up.',
    vehicleStatus === 'Present'
      ? 'Vehicle availability was confirmed during inspections.'
      : 'Vehicle availability could not be verified for all documented trips.',
    swachPresence !== 'Not Documented'
      ? `Worker presence verified (${swachPresence}).`
      : 'Worker presence needs better documentation.',
    signboardStatus === 'Yes'
      ? 'Signage visibility is clear at the feeder point.'
      : 'Signage visibility appears obstructed or unverified.'
  ]
}
