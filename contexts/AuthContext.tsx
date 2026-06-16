import React, { createContext, useContext, useEffect, useState } from 'react';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'pmc_member';
}

interface AuthContextType {
  user: User | null;
  loginWithEmail: (email: string, password?: string) => Promise<User>;
  logout: () => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STATIC_ADMIN_EMAIL = 'admin@system.local';
const STATIC_ADMIN_PASSWORD = 'admin123';
const STATIC_ADMIN_USER: User = {
  id: 'super-admin',
  name: 'Super Admin',
  email: STATIC_ADMIN_EMAIL,
  role: 'admin',
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    try {
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        setUser(JSON.parse(storedUser));
      }
    } catch (error) {
      console.error('Session restore failed:', error);
      localStorage.removeItem('user');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loginWithEmail = async (email: string, password?: string) => {
    const normalizedEmail = email.trim().toLowerCase();

    if (normalizedEmail !== STATIC_ADMIN_EMAIL || password !== STATIC_ADMIN_PASSWORD) {
      throw new Error('Invalid credentials');
    }

    setUser(STATIC_ADMIN_USER);
    localStorage.setItem('user', JSON.stringify(STATIC_ADMIN_USER));
    return STATIC_ADMIN_USER;
  };

  const logout = async () => {
    setUser(null);
    localStorage.removeItem('user');
  };

  return (
    <AuthContext.Provider value={{ user, loginWithEmail, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};
