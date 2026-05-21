import { createClient } from '@supabase/supabase-js'
import type { NextApiRequest, NextApiResponse } from 'next'

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end()

  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: '認証トークンがありません' })

  const { data: { user }, error: authError } = await adminClient.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ error: '無効なトークンです' })

  if (user.email !== process.env.NEXT_PUBLIC_ADMIN_EMAIL) {
    return res.status(403).json({ error: '管理者権限が必要です' })
  }

  const { data: usersData, error: listError } = await adminClient.auth.admin.listUsers()
  if (listError) return res.status(500).json({ error: listError.message })

  const { count: materialCount } = await adminClient
    .from('materials')
    .select('*', { count: 'exact', head: true })

  res.json({
    userCount: usersData.users.length,
    materialCount: materialCount ?? 0,
    users: usersData.users.map((u) => ({
      id: u.id,
      email: u.email ?? '',
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at ?? '',
    })),
  })
}
