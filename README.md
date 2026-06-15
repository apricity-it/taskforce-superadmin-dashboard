# Super Admin Dashboard

A centralized Next.js dashboard for Taskforce management with secure server-backed login, protected routes, and Firebase-powered data access.

## Authentication

- Firebase Authentication handles email/password sign-in.
- Firestore `approvedUsers` controls dashboard access and roles.
- Production sessions are signed with `SESSION_SECRET`.

## Setup

1. Install dependencies with `npm install`.
2. Create `.env.local` with:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_storage_bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
SESSION_SECRET=replace_with_a_long_random_secret
```

3. Start the app with `npm run dev`.
4. Sign in with a Firebase Authentication user whose email also exists in `approvedUsers`.

## Access Rules

- Supported dashboard roles: `admin`, `pmc_member`
- Inactive users are blocked.
- Protected routes redirect to `/login`.
- Active sessions survive refresh and are cleared on logout.

## Production Notes

- Deploy to a Next.js runtime such as Vercel, Render, Railway, or a Node server.
- Do not deploy this version to static hosting like GitHub Pages because it uses API routes and middleware.
- Restrict Firestore rules so client users cannot read sensitive user records directly.
