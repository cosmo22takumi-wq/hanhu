import type { NextApiRequest, NextApiResponse } from 'next'
import { adminSupabase } from '../../../utils/checkSubscription'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Unauthorized' })

  const { data: { user } } = await adminSupabase.auth.getUser(token)
  if (!user) return res.status(401).json({ error: 'Invalid token' })

  const { referrerId } = req.body as { referrerId?: string }
  if (!referrerId || referrerId === user.id) return res.status(400).json({ error: 'Invalid referrer' })

  // 既に紹介済みなら何もしない
  const { data: existing } = await adminSupabase
    .from('referrals')
    .select('id')
    .eq('referred_user_id', user.id)
    .maybeSingle()
  if (existing) return res.json({ ok: true, alreadyRegistered: true })

  // 紹介元ユーザーの存在確認
  const { data: referrerUser } = await adminSupabase.auth.admin.getUserById(referrerId)
  if (!referrerUser?.user) return res.status(400).json({ error: 'Referrer not found' })

  await adminSupabase.from('referrals').insert({
    referrer_id: referrerId,
    referred_user_id: user.id,
  })

  res.json({ ok: true })
}
