import type { ReactNode } from 'react';
import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';

import { useAuthStore } from '@/store/authStore';

interface NavItem {
  to: string;
  label: string;
  icon: (active: boolean) => ReactNode;
}

const iconClass = 'h-6 w-6';

const navItems: NavItem[] = [
  {
    to: '/admin/users',
    label: '用户',
    icon: (active) => (
      <svg viewBox="0 0 24 24" className={iconClass} fill="none">
        <path
          d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0"
          stroke={active ? '#007AFF' : '#8E8E93'}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
];

function AdminLayout() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-[430px] flex-col bg-[#F2F2F7]">
      <div className="ios-bg-blobs">
        <div className="blob blob-1" />
        <div className="blob blob-2" />
        <div className="blob blob-3" />
        <div className="blob blob-4" />
      </div>

      <header className="relative z-10 px-5 pt-5">
        <div className="ios-glass ios-glass-strong p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[13px] text-[#8E8E93]">{user?.username ?? '管理员'} · 管理员</p>
              <h1 className="mt-1 text-[22px] font-semibold text-[#1C1C1E]">管理后台</h1>
            </div>
            <button
              type="button"
              onClick={() => setConfirmOpen((current) => !current)}
              className="h-8 rounded-[10px] bg-[rgba(255,59,48,0.1)] px-3 text-[13px] font-medium text-[#FF3B30]"
            >
              退出
            </button>
          </div>

          {confirmOpen && (
            <div className="mt-3 flex items-center justify-between rounded-[10px] bg-[rgba(255,59,48,0.08)] px-3 py-2">
              <span className="text-[13px] text-[#FF3B30]">确定退出登录？</span>
              <div className="flex items-center gap-3 text-[13px]">
                <button type="button" onClick={() => setConfirmOpen(false)} className="text-[#8E8E93]">
                  取消
                </button>
                <button type="button" onClick={handleLogout} className="text-[#FF3B30] font-medium">
                  确认退出
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="relative z-10 flex-1 px-5 py-4 pb-28">
        <Outlet />
      </main>

      <nav className="ios-glass-tabbar fixed bottom-0 left-1/2 z-20 w-full max-w-[430px] -translate-x-1/2 px-0 pb-[calc(env(safe-area-inset-bottom,0)+18px)] pt-1.5">
        <ul className="flex">
          {navItems.map((item) => (
            <li key={item.to} className="flex-1">
              <NavLink
                to={item.to}
                className="flex flex-col items-center justify-center gap-0.5 py-1.5"
              >
                {({ isActive }) => (
                  <>
                    {item.icon(isActive)}
                    <span
                      className="text-[10px] font-medium"
                      style={{ color: isActive ? '#007AFF' : '#8E8E93' }}
                    >
                      {item.label}
                    </span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

export default AdminLayout;
