import axios from 'axios';
import { useEffect, useState, type ReactElement } from 'react';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from 'react-router-dom';

import client from '@/api/client';
import AdminLayout from '@/components/AdminLayout';
import Layout from '@/components/Layout';
import CirclePage from '@/pages/CirclePage';
import HomePage from '@/pages/HomePage';
import LoginPage from '@/pages/LoginPage';
import PlanPage from '@/pages/PlanPage';
import ProfilePage from '@/pages/ProfilePage';
import RegisterPage from '@/pages/RegisterPage';
import StatsPage from '@/pages/StatsPage';
import AdminApplicationsPage from '@/pages/admin/AdminApplicationsPage';
import AdminCirclesPage from '@/pages/admin/AdminCirclesPage';
import AdminUsersPage from '@/pages/admin/AdminUsersPage';
import { useAuthStore } from '@/store/authStore';
import type { ApiResponse, User } from '@/types';

interface GuardProps {
  children: ReactElement;
}

type ProtectedMode = 'admin' | 'user';

const getAuthedHome = (user: User | null): string =>
  user?.is_admin ? '/admin/circles' : '/app/home';

function GuestRoute({ children }: GuardProps) {
  const accessToken = useAuthStore((state) => state.accessToken);
  const user = useAuthStore((state) => state.user);
  if (accessToken) {
    return <Navigate to={getAuthedHome(user)} replace />;
  }
  return children;
}

function ProtectedRoute({
  children,
  mode,
}: GuardProps & { mode: ProtectedMode }) {
  const accessToken = useAuthStore((state) => state.accessToken);
  const user = useAuthStore((state) => state.user);
  const updateUser = useAuthStore((state) => state.updateUser);
  const logout = useAuthStore((state) => state.logout);

  const [, setLoadingProfile] = useState(false);
  const userReady = Boolean(user && typeof user.is_admin === 'boolean');

  useEffect(() => {
    if (!accessToken || userReady) {
      return;
    }

    let cancelled = false;
    setLoadingProfile(true);

    client
      .get<ApiResponse<User>>('/auth/me')
      .then((response) => {
        if (cancelled) {
          return;
        }
        if (response.data.success && response.data.data) {
          updateUser(response.data.data);
        }
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        if (axios.isAxiosError(error)) {
          logout();
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingProfile(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, userReady, updateUser, logout]);

  if (!accessToken) {
    return <Navigate to="/login" replace />;
  }

  if (accessToken && !userReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8F7FE]">
        <p className="text-sm text-[#8A8799]">正在加载...</p>
      </div>
    );
  }

  if (userReady) {
    if (mode === 'admin' && !user?.is_admin) {
      return <Navigate to="/app/home" replace />;
    }
    if (mode === 'user' && user?.is_admin) {
      return <Navigate to="/admin/circles" replace />;
    }
  }

  return children;
}

function App() {
  const accessToken = useAuthStore((state) => state.accessToken);
  const user = useAuthStore((state) => state.user);

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            accessToken ? (
              <Navigate to={getAuthedHome(user)} replace />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        <Route
          path="/login"
          element={
            <GuestRoute>
              <LoginPage />
            </GuestRoute>
          }
        />
        <Route
          path="/register"
          element={
            <GuestRoute>
              <RegisterPage />
            </GuestRoute>
          }
        />

        <Route
          path="/app"
          element={
            <ProtectedRoute mode="user">
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="home" replace />} />
          <Route path="home" element={<HomePage />} />
          <Route path="stats" element={<StatsPage />} />
          <Route path="circle" element={<CirclePage />} />
          <Route path="circle/admin/applications" element={<AdminApplicationsPage />} />
          <Route path="plan" element={<PlanPage />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>

        <Route
          path="/admin"
          element={
            <ProtectedRoute mode="admin">
              <AdminLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="circles" replace />} />
          <Route path="circles" element={<AdminCirclesPage />} />
          <Route path="applications" element={<AdminApplicationsPage />} />
          <Route path="users" element={<AdminUsersPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
