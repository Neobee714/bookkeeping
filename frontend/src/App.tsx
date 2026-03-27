import axios from 'axios';
import { useEffect, useState, type ReactElement } from 'react';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from 'react-router-dom';

import client from '@/api/client';
import Layout from '@/components/Layout';
import AdminApplicationsPage from '@/pages/AdminApplicationsPage';
import CirclePage from '@/pages/CirclePage';
import HomePage from '@/pages/HomePage';
import LoginPage from '@/pages/LoginPage';
import PlanPage from '@/pages/PlanPage';
import ProfilePage from '@/pages/ProfilePage';
import RegisterPage from '@/pages/RegisterPage';
import StatsPage from '@/pages/StatsPage';
import { useAuthStore } from '@/store/authStore';
import type { ApiResponse, User } from '@/types';

interface GuardProps {
  children: ReactElement;
}

function GuestRoute({ children }: GuardProps) {
  const accessToken = useAuthStore((state) => state.accessToken);
  if (accessToken) {
    return <Navigate to="/app/home" replace />;
  }
  return children;
}

function ProtectedRoute({ children }: GuardProps) {
  const accessToken = useAuthStore((state) => state.accessToken);
  const user = useAuthStore((state) => state.user);
  const updateUser = useAuthStore((state) => state.updateUser);
  const logout = useAuthStore((state) => state.logout);

  const [loadingProfile, setLoadingProfile] = useState(false);

  useEffect(() => {
    if (!accessToken || user) {
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
  }, [accessToken, user, updateUser, logout]);

  if (!accessToken) {
    return <Navigate to="/login" replace />;
  }

  if (loadingProfile && !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8F7FE]">
        <p className="text-sm text-[#8A8799]">正在加载...</p>
      </div>
    );
  }

  return children;
}

function App() {
  const accessToken = useAuthStore((state) => state.accessToken);

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            accessToken ? (
              <Navigate to="/app/home" replace />
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
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="home" replace />} />
          <Route path="home" element={<HomePage />} />
          <Route path="stats" element={<StatsPage />} />
          <Route path="circle" element={<CirclePage />} />
          <Route path="circle/admin/:circleId/applications" element={<AdminApplicationsPage />} />
          <Route path="plan" element={<PlanPage />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
