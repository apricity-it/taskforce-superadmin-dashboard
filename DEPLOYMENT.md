# Deployment Guide

This dashboard now depends on Next.js API routes and middleware. Deploy it to a server-backed Next.js runtime, not static hosting.

## Required Environment Variables

```env
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
SESSION_SECRET=
```

## Recommended Targets

- Vercel
- Render
- Railway
- Any Node.js server that can run `next start`

## Deploy Steps

1. Set all environment variables.
2. Run `npm run build`.
3. Run `npm start`.
4. Verify `/login`, a protected route redirect, session persistence, and logout.

## Production Validation

- Firebase Authentication login succeeds.
- Matching `approvedUsers` document exists.
- Session cookie is issued after login.
- Visiting a protected page without session redirects to `/login`.
- Visiting `/login` with a valid session redirects to `/`.

## Common Failures

- `Invalid credentials`: Firebase Authentication user is missing or password is wrong.
- `User is not approved for dashboard access`: matching `approvedUsers` record is missing.
- `Role is not allowed`: user role is not `admin` or `pmc_member`.
- Redirect loop: `SESSION_SECRET` is missing or inconsistent across instances.
