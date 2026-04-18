import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/router'
import { useEffect } from 'react'
import SimpleDashboard from '@/components/SimpleDashboard'

export default function Dashboard() {
  const { user, isLoading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        router.push('/login')
      } else if (user.role === 'qc') {
        router.push('/qc/dashboard')
      }
    }
  }, [user, isLoading])

  if (user?.role === 'qc') return null

  return <SimpleDashboard />
}


//=================== without QC ==========================

// import SimpleDashboard from '@/components/SimpleDashboard'

// export default function Dashboard() {
//   return <SimpleDashboard />
// }
