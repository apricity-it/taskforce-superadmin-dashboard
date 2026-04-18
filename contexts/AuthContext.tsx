import React, { createContext, useContext, useState, useEffect } from 'react';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'pmc_member' | 'qc';
}

interface AuthContextType {
  user: User | null;
  loginWithEmail: (email: string, password?: string) => Promise<void>;
  logout: () => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

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
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
    setIsLoading(false);
  }, []);

  const loginWithEmail = async (email: string, password?: string) => {
    try {
      if (email === 'admin@system.local' || email === 'admin') {
        if (password && password !== 'admin123' && password !== 'password') {
          throw new Error('Invalid admin credentials');
        }

        const adminUser: User = {
          id: 'admin-1',
          name: 'System Administrator',
          email: 'admin@system.local',
          role: 'admin',
        };

        setUser(adminUser);
        localStorage.setItem('user', JSON.stringify(adminUser));
        return;
      }
      if (email === 'qc' || email === 'qc@system.local') {
        if (password !== 'qc@123') {
          throw new Error('Invalid QC credentials');
        }

        const qcUser: User = {
          id: 'qc-1',
          name: 'QC Officer',
          email: 'qc@system.local',
          role: 'qc',
        };

        setUser(qcUser);
        localStorage.setItem('user', JSON.stringify(qcUser));
        return;
      }
      if (email === 'iswm.pmc@gmail.com') {
        if (password !== 'pmc789@#') {
          throw new Error('Invalid PMC credentials');
        }

        const pmcUser: User = {
          id: 'pmc-1',
          name: 'PMC Member',
          email: 'iswm.pmc@gmail.com',
          role: 'pmc_member',
        };

        setUser(pmcUser);
        localStorage.setItem('user', JSON.stringify(pmcUser));
        return;
      }

      throw new Error('Invalid credentials');
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
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
