import type { NextApiRequest, NextApiResponse } from 'next';
import { collection, getDocs, limit, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { buildSessionCookie, createSessionToken } from '@/lib/session';

type LoginResponse =
  | { user: { id: string; name: string; email: string; role: 'admin' | 'pmc_member' } }
  | { message: string };

const ALLOWED_ROLES = new Set(['admin', 'pmc_member']);

async function authenticateWithFirebase(email: string, password: string) {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

  if (!apiKey) {
    throw new Error('Firebase API key is missing');
  }

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: true,
      }),
    }
  );

  if (!response.ok) {
    throw new Error('Invalid credentials');
  }

  return response.json();
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<LoginResponse>) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  try {
    await authenticateWithFirebase(email, password);

    const userQuery = query(
      collection(db, 'approvedUsers'),
      where('email', '==', email),
      limit(1)
    );
    const userSnapshot = await getDocs(userQuery);

    if (userSnapshot.empty) {
      return res.status(403).json({ message: 'User is not approved for dashboard access' });
    }

    const userDoc = userSnapshot.docs[0];
    const userData = userDoc.data();

    if (userData.isActive === false) {
      return res.status(403).json({ message: 'Account is deactivated' });
    }

    if (!ALLOWED_ROLES.has(userData.role)) {
      return res.status(403).json({ message: 'Role is not allowed to access this dashboard' });
    }

    const sessionUser = {
      id: userDoc.id,
      name: userData.name || 'Dashboard User',
      email,
      role: userData.role as 'admin' | 'pmc_member',
    };

    const sessionToken = await createSessionToken(sessionUser);
    res.setHeader('Set-Cookie', buildSessionCookie(sessionToken));

    updateDoc(userDoc.ref, { lastLogin: serverTimestamp() }).catch(() => null);

    return res.status(200).json({ user: sessionUser });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Login failed';
    return res.status(401).json({ message });
  }
}
