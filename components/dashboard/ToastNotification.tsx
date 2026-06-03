import { useState, useCallback, createContext, useContext, type ReactNode } from 'react'
import { getTokens } from '@/lib/dashboardTheme'

interface Toast {
  id: string
  message: string
  type: 'success' | 'error' | 'info'
  ts: number
}

interface ToastContextType {
  toast: (message: string, type?: 'success' | 'error' | 'info') => void
}

const ToastContext = createContext<ToastContextType>({ toast: () => {} })

export function useToast() { return useContext(ToastContext) }

const MAX_TOASTS  = 4
const DURATION_MS = 4000

export function ToastProvider({ children, dark }: { children: ReactNode; dark: boolean }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((message: string, type: Toast['type'] = 'success') => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    setToasts(prev => {
      const next = [...prev, { id, message, type, ts: Date.now() }]
      // Keep only the latest MAX_TOASTS
      return next.slice(-MAX_TOASTS)
    })
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), DURATION_MS)
  }, [])

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}
      <ToastContainer
        toasts={toasts}
        dark={dark}
        onDismiss={id => setToasts(prev => prev.filter(t => t.id !== id))}
      />
    </ToastContext.Provider>
  )
}

function ToastContainer({
  toasts, dark, onDismiss,
}: {
  toasts: Toast[]
  dark: boolean
  onDismiss: (id: string) => void
}) {
  const T = getTokens(dark)
  if (toasts.length === 0) return null

  const ICON  = { success: '✓', error: '✕', info: 'ℹ' }
  const COLOR = { success: T.green, error: T.red, info: T.accent }

  return (
    <>
      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateX(60px) scale(0.92); }
          to   { opacity: 1; transform: translateX(0)    scale(1);    }
        }
        @keyframes toastProgress {
          from { width: 100%; }
          to   { width: 0%;   }
        }
      `}</style>

      <div style={{
        position: 'fixed', bottom: 20, right: 20, zIndex: 9999,
        display: 'flex', flexDirection: 'column', gap: 8,
        maxWidth: 360, width: '100%',
      }}>
        {toasts.map(t => (
          <div
            key={t.id}
            onClick={() => onDismiss(t.id)}
            style={{
              position: 'relative', overflow: 'hidden',
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px 14px',
              borderRadius: 10,
              background: dark ? '#1a2030' : '#ffffff',
              border: `1px solid ${COLOR[t.type]}30`,
              borderLeft: `3px solid ${COLOR[t.type]}`,
              boxShadow: dark
                ? '0 8px 24px rgba(0,0,0,0.5)'
                : '0 8px 24px rgba(0,0,0,0.12)',
              animation: 'toastIn 0.3s cubic-bezier(0.16,1,0.3,1)',
              cursor: 'pointer',
              fontSize: 13,
              color: T.textPrimary,
              fontFamily: 'system-ui, sans-serif',
            }}
          >
            {/* Icon */}
            <span style={{
              width: 22, height: 22, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: `${COLOR[t.type]}20`,
              color: COLOR[t.type],
              fontSize: 12, fontWeight: 800, flexShrink: 0,
            }}>
              {ICON[t.type]}
            </span>

            {/* Message */}
            <span style={{ flex: 1, lineHeight: 1.4 }}>{t.message}</span>

            {/* Dismiss × */}
            <span style={{
              fontSize: 14, color: T.textMuted, flexShrink: 0,
              lineHeight: 1, marginLeft: 4,
            }}>
              ×
            </span>

            {/* Progress bar */}
            <div style={{
              position: 'absolute', bottom: 0, left: 0,
              height: 3, background: COLOR[t.type],
              animation: `toastProgress ${DURATION_MS}ms linear forwards`,
              borderRadius: '0 0 0 10px',
            }} />
          </div>
        ))}
      </div>
    </>
  )
}