import { useEffect } from 'react'
import { useRouter } from 'next/router'
import { Loader2, ShieldCheck } from 'lucide-react'

import { useAuth } from '@/contexts/AuthContext'
import SimpleDashboard from '@/components/SimpleDashboard'
import TaskforceAssistant from '@/components/TaskforceAssistant'

export default function Dashboard() {
  const { user, isLoading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!router.isReady || isLoading) return

    if (!user) {
      router.replace('/login')
      return
    }

    if (user.role === 'qc') {
      router.replace('/qc/dashboard')
    }
  }, [router, router.isReady, user, isLoading])

  const isRedirecting =
    !router.isReady ||
    isLoading ||
    !user ||
    user.role === 'qc'

  if (isRedirecting) {
    return (
      <DashboardLoadingState
        message={user?.role === 'qc' ? 'Opening QC dashboard...' : 'Preparing dashboard...'}
      />
    )
  }

  return (
    <>
      <SimpleDashboard />
      {/* <TaskforceAssistant /> */}
    </>
  )
}

function DashboardLoadingState({ message }: { message: string }) {
  return (
    <div className="flex min-h-[calc(100vh-160px)] items-center justify-center px-4">
      <div className="tf-card w-full max-w-md">
        <div className="tf-card-content p-8 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-400 shadow-lg shadow-cyan-400/10">
            <ShieldCheck className="h-8 w-8" strokeWidth={1.7} />
          </div>

          <h1 className="text-xl font-black tracking-tight text-[var(--tf-text)]">
            Taskforce Command Center
          </h1>

          <p className="mt-2 text-sm leading-6 text-[var(--tf-muted)]">
            {message}
          </p>

          <div className="mt-6 flex items-center justify-center gap-2 text-sm font-semibold text-cyan-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading secure workspace</span>
          </div>

          <div className="mt-6 h-1.5 overflow-hidden rounded-full bg-cyan-400/10">
            <div className="h-full w-1/2 animate-pulse rounded-full bg-gradient-to-r from-cyan-400 to-blue-500" />
          </div>
        </div>
      </div>
    </div>
  )
}