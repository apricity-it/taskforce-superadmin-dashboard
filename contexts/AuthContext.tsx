import React, { createContext, useContext, useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'pmc_member';
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
      if (!password) {
        throw new Error('Password is required');
      }

      const usersRef = collection(db, 'approvedUsers');
      const q = query(usersRef, where('email', '==', email));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        throw new Error('Invalid credentials');
      }

      const userDoc = querySnapshot.docs[0];
      const userData = userDoc.data();

      if (userData.password !== password) {
        throw new Error('Invalid credentials');
      }

      if (userData.isActive === false) {
        throw new Error('Account is deactivated');
      }

      const dbUser: User = {
        id: userDoc.id,
        name: userData.name,
        email: userData.email,
        role: userData.role as 'admin' | 'pmc_member',
      };

      setUser(dbUser);
      localStorage.setItem('user', JSON.stringify(dbUser));
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
