import type { NextApiRequest, NextApiResponse } from 'next';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/session';

function readCookie(req: NextApiRequest, cookieName: string) {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) {
    return null;
  }

  const cookies = cookieHeader.split(';').map((part) => part.trim());
  const match = cookies.find((part) => part.startsWith(`${cookieName}=`));
  return match ? decodeURIComponent(match.slice(cookieName.length + 1)) : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const token = readCookie(req, SESSION_COOKIE_NAME);
  const session = await verifySessionToken(token);

  if (!session) {
    return res.status(401).json({ message: 'Unauthenticated' });
  }

  const { exp, ...user } = session;
  return res.status(200).json({ user });
}
