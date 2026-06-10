import type { NextApiRequest, NextApiResponse } from 'next'
import { adminSupabase, getPlanType, getActualPlanType, isPromoActive } from '../../../utils/checkSubscription'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end()

  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Unauthorized' })

  try {
    const { data: { user } } = await adminSupabase.auth.getUser(token)
    if (!user) return res.status(401).json({ error: 'Invalid token' })

    const planType = await getPlanType(user.id, user.email ?? '')
    const isPro = planType !== 'free'
    const isAdmin = user.email === (process.env.NEXT_PUBLIC_ADMIN_EMAIL ?? 'cosmo22.takumi@gmail.com')

    const PLAN_MONTHLY_LIMIT: Record<string, number> = { standard: 40, pro: 50 }
    const currentMonthKey = new Date().toISOString().slice(0, 7)

    const [{ data: sub }, { data: usageData }, { count: referralCount }] = await Promise.all([
      adminSupabase
        .from('subscriptions')
        .select('status, current_period_end')
        .eq('user_id', user.id)
        .maybeSingle(),
      adminSupabase
        .from('usage')
        .select('report_count, monthly_count, month_key, cinii_count, cinii_month_key')
        .eq('user_id', user.id)
        .maybeSingle(),
      adminSupabase
        .from('referrals')
        .select('*', { count: 'exact', head: true })
        .eq('referrer_id', user.id),
    ])

    const usageCount = (usageData?.report_count as number | null) ?? 0
    const monthKey = (usageData?.month_key as string | null) ?? ''
    const monthlyUsed = monthKey === currentMonthKey
      ? ((usageData?.monthly_count as number | null) ?? 0)
      : 0
    const actualPlanType = isPromoActive() ? await getActualPlanType(user.id, user.email ?? '') : planType
    const isPromoFreeUser = isPromoActive() && actualPlanType === 'free'

    const monthlyLimit = isAdmin || isPromoFreeUser ? null : (isPro ? (PLAN_MONTHLY_LIMIT[planType] ?? null) : null)
    const referralBonus = (referralCount ?? 0)
    const generationsLimit = isAdmin ? null
      : isPromoFreeUser ? 3
      : actualPlanType === 'free' ? 2 + referralBonus
      : null

    const FREE_CINII_LIMIT = 3
    const ciniiMonthKey = (usageData?.cinii_month_key as string | null) ?? ''
    const ciniiUsed = ciniiMonthKey === currentMonthKey
      ? ((usageData?.cinii_count as number | null) ?? 0)
      : 0
    const ciniiLimit = (isAdmin || actualPlanType !== 'free') ? null : FREE_CINII_LIMIT

    res.json({
      planType,
      isPro,
      isAdmin,
      isPromoUser: isPromoFreeUser,
      status: sub?.status ?? 'free',
      currentPeriodEnd: sub?.current_period_end ?? null,
      generationsUsed: usageCount,
      generationsLimit,
      monthlyUsed,
      monthlyLimit,
      ciniiUsed,
      ciniiLimit,
    })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
}
