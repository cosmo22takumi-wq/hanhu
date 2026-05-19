import type { NextApiRequest, NextApiResponse } from 'next'
import { adminSupabase, hasActiveSubscription } from '../../../utils/checkSubscription'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end()

  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Unauthorized' })

  try {
    const { data: { user } } = await adminSupabase.auth.getUser(token)
    if (!user) return res.status(401).json({ error: 'Invalid token' })

    const isPro = await hasActiveSubscription(user.id, user.email ?? '')

    const [{ data: sub }, { data: usageData }] = await Promise.all([
      adminSupabase
        .from('subscriptions')
        .select('status, current_period_end')
        .eq('user_id', user.id)
        .maybeSingle(),
      adminSupabase
        .from('usage')
        .select('report_count')
        .eq('user_id', user.id)
        .maybeSingle(),
    ])

    const usageCount = (usageData?.report_count as number | null) ?? 0
    const isAdmin = user.email === (process.env.NEXT_PUBLIC_ADMIN_EMAIL ?? 'cosmo22.takumi@gmail.com')
    res.json({
      isPro,
      isAdmin,
      status: sub?.status ?? 'free',
      currentPeriodEnd: sub?.current_period_end ?? null,
      generationsUsed: usageCount,
      generationsLimit: isPro ? 10 : 2,
      // legacy fields
      freeGenerationsUsed: usageCount,
      freeGenerationsLimit: 2,
    })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
}
