import { useState } from 'react'
import { Map, Building2, Home, ClipboardList } from 'lucide-react'

const tabs = [
  { name: 'Zones', icon: Map },
  { name: 'Wards', icon: Building2 },
  { name: 'Kothis', icon: Home },
  { name: 'Assignment', icon: ClipboardList },
]

export default function MasterPage() {
  const [activeTab, setActiveTab] = useState('Zones')

  return (
    <div className="space-y-6">

      {/* Page Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Master</h2>
        <p className="mt-1 text-sm text-gray-500">
          Manage master data for zones, wards, kothis and assignments.
        </p>
      </div>

      {/* Tab Buttons */}
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.name
          return (
            <button
              key={tab.name}
              onClick={() => setActiveTab(tab.name)}
              className={`
                inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all
                ${isActive
                  ? 'bg-blue-600 text-white shadow'
                  : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50'
                }
              `}
            >
              <tab.icon className="h-4 w-4" />
              {tab.name}
            </button>
          )
        })}
      </div>

      {/* Tab Content Area */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-10 min-h-[400px] flex items-center justify-center">
        <div className="text-center text-gray-400">
          <p className="text-xl font-semibold">{activeTab}</p>
          <p className="text-sm mt-1">Content for <span className="font-medium">{activeTab}</span> coming soon.</p>
        </div>
      </div>

    </div>
  )
}