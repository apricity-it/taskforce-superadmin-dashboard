import type { NextApiRequest, NextApiResponse } from 'next';
import { buildExpiredSessionCookie } from '@/lib/session';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ message: 'Method not allowed' });
  }

  res.setHeader('Set-Cookie', buildExpiredSessionCookie());
  return res.status(200).json({ ok: true });
}
