import type { NextApiRequest, NextApiResponse } from 'next'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase'

// ─── Config: pick ONE provider ─────────────────────────────────────────────
// Option A: Meta WhatsApp Cloud API (free 1000 conversations/month)
const META_TOKEN = process.env.WHATSAPP_META_TOKEN || ''
const META_PHONE_ID = process.env.WHATSAPP_META_PHONE_NUMBER_ID || ''

// Option B: MSG91 (Indian service, ~₹0.5/msg)
const MSG91_AUTH_KEY = process.env.MSG91_AUTH_KEY || ''
const MSG91_TEMPLATE_ID = process.env.MSG91_TEMPLATE_ID || ''

// Recipients (comma-separated phone numbers with country code, e.g. 919876543210)
const NOTIFY_NUMBERS = (process.env.WHATSAPP_NOTIFY_NUMBERS || '').split(',').filter(Boolean)

const CRON_SECRET = process.env.CRON_SECRET || ''

// ─── Meta WhatsApp Cloud API sender ────────────────────────────────────────
async function sendViaMeta(to: string, message: string) {
  const res = await fetch(
    `https://graph.facebook.com/v18.0/${META_PHONE_ID}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${META_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: to.replace(/\D/g, ''),
        type: 'text',
        text: { body: message },
      }),
    }
  )
  return res.json()
}

// ─── MSG91 sender ──────────────────────────────────────────────────────────
async function sendViaMSG91(to: string, feederPending: number, chronicPending: number, total: number) {
  const res = await fetch('https://control.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/', {
    method: 'POST',
    headers: {
      authkey: MSG91_AUTH_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      template_name: MSG91_TEMPLATE_ID,
      integrated_number: META_PHONE_ID || to,
      content_type: 'template',
      payload: {
        messaging_product: 'whatsapp',
        type: 'template',
        template: {
          name: MSG91_TEMPLATE_ID,
          language: { code: 'en', policy: 'deterministic' },
          namespace: '',
          to_and_components: [
            {
              to: [to.replace(/\D/g, '')],
              components: {
                body_1: { type: 'text', value: String(total) },
                body_2: { type: 'text', value: String(feederPending) },
                body_3: { type: 'text', value: String(chronicPending) },
              },
            },
          ],
        },
      },
    }),
  })
  return res.json()
}

// ─── Main handler ──────────────────────────────────────────────────────────
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Auth check
  const secret = req.headers['x-cron-secret'] || req.query.secret
  if (CRON_SECRET && secret !== CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const now = new Date()
  const hour = now.getUTCHours() + 5.5 // IST offset
  if (hour < 12 && !req.query.force) {
    return res.status(200).json({ skipped: true, reason: 'Before 12 noon IST' })
  }

  try {
    const pendingSnap = await getDocs(
      query(collection(db, 'complianceReports'), where('status', '==', 'pending'))
    )

    let feederPending = 0
    let chronicPending = 0

    pendingSnap.docs.forEach(doc => {
      const d = doc.data()
      const type = d.feederPointType ?? 'feeder'
      if (type === 'chronic') chronicPending++
      else feederPending++
    })

    const total = feederPending + chronicPending

    if (total === 0) {
      return res.status(200).json({ sent: false, reason: 'No pending reports' })
    }

    const message =
      `🚨 *Taskforce Report Alert*\n\n` +
      `There are *${total}* pending compliance reports awaiting approval:\n\n` +
      `📍 Feeder Point Reports: *${feederPending}*\n` +
      `⚡ Chronic Point Reports: *${chronicPending}*\n\n` +
      `Kindly review and approve the reports at your earliest.\n\n` +
      `📅 ${now.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}\n` +
      `🕐 ${now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`

    const useMeta = !!META_TOKEN && !!META_PHONE_ID
    const useMSG91 = !!MSG91_AUTH_KEY && !!MSG91_TEMPLATE_ID

    const results = []
    for (const num of NOTIFY_NUMBERS) {
      try {
        let r
        if (useMeta) {
          r = await sendViaMeta(num.trim(), message)
        } else if (useMSG91) {
          r = await sendViaMSG91(num.trim(), feederPending, chronicPending, total)
        } else {
          r = { error: 'No WhatsApp provider configured. Set META or MSG91 env vars.' }
        }
        results.push({ to: num.trim(), result: r })
      } catch (e: any) {
        results.push({ to: num.trim(), error: e.message })
      }
    }

    return res.status(200).json({ sent: true, total, feederPending, chronicPending, provider: useMeta ? 'meta' : useMSG91 ? 'msg91' : 'none', results })
  } catch (err: any) {
    return res.status(500).json({ error: err.message })
  }
}