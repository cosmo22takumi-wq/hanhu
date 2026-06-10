import { createClient } from '@supabase/supabase-js'
import type { PlanType } from './planTypes'

export type { PlanType }

const ADMIN_EMAIL_FALLBACK = 'cosmo22.takumi@gmail.com'

// 6/1 12:00 JST (UTC+9) = 6/1 03:00 UTC
const PROMO_END = new Date('2026-06-01T03:00:00Z')

export function isPromoActive(): boolean {
  return new Date() < PROMO_END
}

export const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
)

function isActiveRow(data: { status: string; current_period_end?: string | null } | null): boolean {
  if (!data) return false
  if (data.status !== 'active') return false
  if (data.current_period_end && new Date(data.current_period_end) < new Date()) return false
  return true
}

export async function getPlanType(userId: string, userEmail: string): Promise<PlanType> {
  const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL ?? ADMIN_EMAIL_FALLBACK
  if (userEmail === adminEmail) return 'pro'
  if (isPromoActive()) return 'pro'

  try {
    const { data } = await adminSupabase
      .from('subscriptions')
      .select('status, current_period_end, plan_type')
      .eq('user_id', userId)
      .maybeSingle()

    if (!isActiveRow(data)) return 'free'
    return (data?.plan_type as PlanType) || 'standard'
  } catch {
    return 'free'
  }
}

// 後方互換: isPro = plan !== 'free'
export async function hasActiveSubscription(userId: string, userEmail: string): Promise<boolean> {
  const plan = await getPlanType(userId, userEmail)
  return plan !== 'free'
}

// プロモ期間オーバーライドを無視した実際のプランを返す（使用回数チェック用）
export async function getActualPlanType(userId: string, userEmail: string): Promise<PlanType> {
  const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL ?? ADMIN_EMAIL_FALLBACK
  if (userEmail === adminEmail) return 'pro'
  try {
    const { data } = await adminSupabase
      .from('subscriptions')
      .select('status, current_period_end, plan_type')
      .eq('user_id', userId)
      .maybeSingle()
    if (!isActiveRow(data)) return 'free'
    return (data?.plan_type as PlanType) || 'standard'
  } catch {
    return 'free'
  }
}
