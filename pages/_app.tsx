import type { AppProps } from 'next/app'
import { AuthProvider } from '@/contexts/AuthContext'
import AuthGuard from '@/components/AuthGuard'
import Layout from '@/components/Layout'
import { useRouter } from 'next/router'
import { useEffect } from 'react'
import '../styles/globals.css'

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter()

  // ✅ Handle GitHub Pages refresh redirect
  useEffect(() => {
    const redirectPath = sessionStorage.getItem("redirect")
    if (redirectPath) {
      sessionStorage.removeItem("redirect")
      router.replace(redirectPath)
    }
  }, [router])

  if (router.pathname === '/login') {
    return (
      <AuthProvider>
        <Component {...pageProps} />
      </AuthProvider>
    )
  }

  return (
    <AuthProvider>
      <AuthGuard>
        <Layout>
          <Component {...pageProps} />
        </Layout>
      </AuthGuard>
    </AuthProvider>
  )
}
