import Stripe from 'stripe'
import type { NextApiRequest, NextApiResponse } from 'next'
import { adminSupabase } from '../../../utils/checkSubscription'

export const config = { api: { bodyParser: false } }

function readRawBody(req: NextApiRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const stripeKey = process.env.STRIPE_SECRET_KEY
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!stripeKey || !webhookSecret) {
    return res.status(500).json({ error: 'Stripe webhook が設定されていません' })
  }

  const rawBody = await readRawBody(req)
  const sig = req.headers['stripe-signature']
  if (!sig) return res.status(400).json({ error: 'stripe-signature ヘッダーがありません' })

  const stripe = new Stripe(stripeKey)
  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret)
  } catch (err) {
    console.error('Webhook signature error:', err)
    return res.status(400).json({ error: `Webhook Error: ${String(err)}` })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const userId = session.metadata?.user_id
        const planType = session.metadata?.plan_type ?? 'standard'
        if (!userId) break

        let periodEnd: string | null = null
        if (session.subscription) {
          const sub = await stripe.subscriptions.retrieve(String(session.subscription)) as unknown as { current_period_end: number }
          periodEnd = new Date(sub.current_period_end * 1000).toISOString()
        }

        await adminSupabase.from('subscriptions').upsert(
          {
            user_id: userId,
            stripe_customer_id: String(session.customer),
            stripe_subscription_id: String(session.subscription),
            status: 'active',
            plan_type: planType,
            current_period_end: periodEnd,
          },
          { onConflict: 'user_id' }
        )
        console.log(`✓ Subscription activated: user=${userId} plan=${planType}`)
        break
      }

      case 'invoice.paid': {
        const invoice = event.data.object as unknown as { subscription: string }
        const subId = invoice.subscription
        if (!subId) break

        const sub = await stripe.subscriptions.retrieve(subId) as unknown as {
          metadata: Record<string, string>
          current_period_end: number
        }
        const userId = sub.metadata?.user_id
        const planType = sub.metadata?.plan_type ?? 'standard'
        if (!userId) break

        await adminSupabase.from('subscriptions').upsert(
          {
            user_id: userId,
            status: 'active',
            plan_type: planType,
            current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
          },
          { onConflict: 'user_id' }
        )
        break
      }

      case 'customer.subscription.deleted':
      case 'invoice.payment_failed': {
        const obj = event.data.object as unknown as { id: string; object: string; subscription?: string }
        const subId = obj.object === 'subscription' ? obj.id : (obj.subscription ?? null)
        if (!subId) break

        await adminSupabase
          .from('subscriptions')
          .update({ status: event.type === 'customer.subscription.deleted' ? 'cancelled' : 'past_due' })
          .eq('stripe_subscription_id', subId)
        break
      }
    }
  } catch (err) {
    console.error('Webhook handler error:', err)
    return res.status(500).json({ error: String(err) })
  }

  res.json({ received: true })
}
