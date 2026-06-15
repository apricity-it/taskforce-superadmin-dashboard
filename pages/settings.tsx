import { useAuth } from '@/contexts/AuthContext';

export default function SettingsPage() {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
        <p className="mt-2 text-sm text-gray-600">
          Active dashboard session details and production configuration checkpoints.
        </p>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-medium text-gray-900">Current Session</h2>
        <div className="mt-4 space-y-2 text-sm text-gray-700">
          <p><span className="font-medium">Name:</span> {user?.name || 'Unknown'}</p>
          <p><span className="font-medium">Email:</span> {user?.email || 'Unknown'}</p>
          <p><span className="font-medium">Role:</span> {user?.role || 'Unknown'}</p>
        </div>
      </section>

      <section className="rounded-xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
        <h2 className="text-lg font-medium text-amber-900">Production Checklist</h2>
        <ul className="mt-4 space-y-2 text-sm text-amber-900">
          <li>Set `SESSION_SECRET` in the deployment environment.</li>
          <li>Use Firebase Authentication users instead of Firestore passwords.</li>
          <li>Restrict Firestore rules so `approvedUsers` is not publicly readable.</li>
        </ul>
      </section>
    </div>
  );
}
