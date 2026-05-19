import { useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../utils/supabaseClient'

export default function AuthCallback() {
  const router = useRouter()

  useEffect(() => {
    async function handleCallback() {
      // Handle PKCE code exchange (email confirmation / OAuth)
      const params = new URLSearchParams(window.location.search)
      const code = params.get('code')
      const errorParam = params.get('error')
      const errorDescription = params.get('error_description')

      if (errorParam) {
        console.error('Auth error:', errorParam, errorDescription)
        router.replace('/?auth_error=' + encodeURIComponent(errorDescription ?? errorParam))
        return
      }

      if (code) {
        try {
          await supabase.auth.exchangeCodeForSession(code)
        } catch (err) {
          console.error('Code exchange failed:', err)
        }
      }

      // Hash-based token (implicit flow) is handled automatically by the client
      // Just redirect home — the session will be active
      router.replace('/')
    }

    handleCallback()
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-violet-50">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
        <p className="text-gray-500 text-sm">ログイン中...</p>
      </div>
    </div>
  )
}
