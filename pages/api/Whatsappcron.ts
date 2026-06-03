if (typeof window === 'undefined') {
  // Only run on server side
  import('node-cron').then(cron => {
    // 12:05 PM IST = 06:35 UTC
    cron.schedule('35 6 * * *', async () => {
      console.log('[WhatsApp Cron] Triggering pending reports notification...')
      try {
        const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
        const secret = process.env.CRON_SECRET || ''
        const res = await fetch(`${baseUrl}/api/whatsapp-notify?secret=${secret}&force=1`)
        const data = await res.json()
        console.log('[WhatsApp Cron] Result:', JSON.stringify(data))
      } catch (err) {
        console.error('[WhatsApp Cron] Error:', err)
      }
    }, { timezone: 'UTC' })

    console.log('[WhatsApp Cron] Scheduled daily at 12:05 PM IST (06:35 UTC)')
  }).catch(() => {
    console.warn('[WhatsApp Cron] node-cron not installed. Run: npm install node-cron')
  })
}