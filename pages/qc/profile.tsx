import { useAuth } from '@/contexts/AuthContext'

export default function QCProfile() {
  const { user, logout } = useAuth()

  return (
    <div>
      <h1>QC Profile</h1>
      <p>{user?.name}</p>
      <p>{user?.email}</p>

      <button onClick={logout}>Logout</button>
    </div>
  )
}