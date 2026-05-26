import Stripe from 'stripe'
import type { NextApiRequest, NextApiResponse } from 'next'
import { adminSupabase } from '../../../utils/checkSubscription'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const stripeKey = process.env.STRIPE_SECRET_KEY
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  if (!stripeKey) return res.status(500).json({ error: 'Stripe が設定されていません' })

  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Unauthorized' })

  const { data: { user }, error } = await adminSupabase.auth.getUser(token)
  if (error || !user) return res.status(401).json({ error: 'Invalid token' })

  const { plan } = req.body as { plan?: 'standard' | 'pro' }
  const planType: 'standard' | 'pro' = plan === 'pro' ? 'pro' : 'standard'

  const priceId = planType === 'pro'
    ? process.env.STRIPE_PRICE_ID_PRO
    : process.env.STRIPE_PRICE_ID_STANDARD

  if (!priceId) return res.status(500).json({ error: `STRIPE_PRICE_ID_${planType.toUpperCase()} が設定されていません` })

  const stripe = new Stripe(stripeKey)

  const { data: existing } = await adminSupabase
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .maybeSingle()

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/?payment=success`,
      cancel_url: `${appUrl}/?payment=cancel`,
      customer: existing?.stripe_customer_id ?? undefined,
      customer_email: existing?.stripe_customer_id ? undefined : (user.email ?? undefined),
      metadata: { user_id: user.id, plan_type: planType },
      subscription_data: { metadata: { user_id: user.id, plan_type: planType } },
      phone_number_collection: { enabled: false },
      locale: 'ja',
    })
    res.json({ url: session.url })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('Stripe checkout error:', message)
    res.status(500).json({ error: message })
  }
}
