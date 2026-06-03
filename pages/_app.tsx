import type { AppProps } from 'next/app'
import { useRouter } from 'next/router'
import { useEffect } from 'react'

import { AuthProvider } from '@/contexts/AuthContext'
import { ThemeProvider } from '@/contexts/ThemeContext'
import AppDataProvider from '@/contexts/AppDataProvider'
import AuthGuard from '@/components/AuthGuard'
import Layout from '@/components/Layout'

import '../styles/globals.css'
import 'leaflet/dist/leaflet.css'

const PUBLIC_PATHS = new Set(['/login'])

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter()

  useEffect(() => {
    const redirectPath = sessionStorage.getItem('redirect')
    if (redirectPath) {
      sessionStorage.removeItem('redirect')
      router.replace(redirectPath)
    }
  }, [router])

  const isPublic = PUBLIC_PATHS.has(router.pathname)

  return (
    <ThemeProvider>
      <AuthProvider>
        <AppDataProvider>
          {isPublic ? (
            <Component {...pageProps} />
          ) : (
            <AuthGuard>
              <Layout>
                <Component {...pageProps} />
              </Layout>
            </AuthGuard>
          )}
        </AppDataProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}