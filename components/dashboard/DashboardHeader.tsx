import { getTokens } from '@/lib/dashboardTheme'
import { PulseDot } from './DashboardUI'

function ago(d: Date): string {
  const h = Math.floor((Date.now() - d.getTime()) / 3600000)
  if (h < 1) {
    const m = Math.floor((Date.now() - d.getTime()) / 60000)
    return m < 1 ? 'just now' : `${m}m ago`
  }
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export function DashboardHeader({
  dark,
  onToggleTheme,
  onRefresh,
  loading,
  lastRefresh,
}: {
  dark: boolean
  onToggleTheme: () => void
  onRefresh: () => void
  loading: boolean
  lastRefresh: Date
}) {
  const T = getTokens(dark)

  return (
    <div
      className="flex items-center justify-between flex-wrap gap-3 mb-5 rounded-xl"
      style={{
        padding: '18px 22px',
        background: dark
          ? T.surface
          : 'linear-gradient(135deg, #1e3a5f 0%, #1e1b4b 55%, #1a1a2e 100%)',
        border: dark ? `1px solid ${T.cardBorder}` : 'none',
        animation: 'fadeIn 0.4s ease',
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{
            background: dark ? T.accentDim : 'rgba(255,255,255,0.1)',
            border: `1px solid ${dark ? T.accentBorder : 'rgba(255,255,255,0.2)'}`,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={dark ? T.accent : '#fff'} strokeWidth="1.8">
            <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
        </div>
        <div>
          <h1
            className="text-[17px] font-bold tracking-tight"
            style={{ color: dark ? T.textPrimary : '#fff', margin: 0 }}
          >
            Taskforce command centre
          </h1>
          <p
            className="text-[11px] mt-0.5"
            style={{
              color: dark ? T.textSecondary : 'rgba(255,255,255,0.6)',
              fontFamily: "'JetBrains Mono', monospace",
              margin: 0,
            }}
          >
            Read-only · Refreshed {ago(lastRefresh)} · Auto-refresh 60s
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Live indicator */}
        <div
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
          style={{
            background: dark ? T.accentDim : 'rgba(0,229,255,0.15)',
            border: `1px solid ${dark ? T.accentBorder : 'rgba(0,229,255,0.3)'}`,
          }}
        >
          <PulseDot color={dark ? T.accent : '#00e5ff'} size={6} />
          <span
            className="text-[11px] font-semibold"
            style={{
              color: dark ? T.accent : '#00e5ff',
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            LIVE
          </span>
        </div>

        {/* Theme toggle */}
        <button
          onClick={onToggleTheme}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all active:scale-95"
          style={{
            background: dark ? T.card : 'rgba(255,255,255,0.1)',
            border: `1px solid ${dark ? T.cardBorder : 'rgba(255,255,255,0.2)'}`,
            color: dark ? T.textPrimary : '#fff',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {dark ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
            </svg>
          )}
          {dark ? 'Light' : 'Dark'}
        </button>

        {/* Refresh */}
        <button
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all active:scale-95"
          style={{
            background: dark ? T.card : 'rgba(255,255,255,0.1)',
            border: `1px solid ${dark ? T.cardBorder : 'rgba(255,255,255,0.2)'}`,
            color: dark ? T.textPrimary : '#fff',
            fontSize: 12,
            fontWeight: 600,
            cursor: loading ? 'wait' : 'pointer',
            opacity: loading ? 0.5 : 1,
          }}
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={{ animation: loading ? 'spin 0.8s linear infinite' : 'none' }}
          >
            <path d="M23 4v6h-6M1 20v-6h6" />
            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
          </svg>
          Refresh
        </button>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </div>
  )
}