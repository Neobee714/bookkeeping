import type { ReactNode } from 'react';
import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';

import { useAuthStore } from '@/store/authStore';

interface NavItem {
  to: string;
  label: string;
  icon: (active: boolean) => ReactNode;
}

const iconClass = 'h-[18px] w-[18px]';

const navItems: NavItem[] = [
  {
    to: '/admin/circles',
    label: '圈子',
    icon: (active) => (
      <svg viewBox="0 0 24 24" className={iconClass} fill="none">
        <path
          d="M7 7.5h10a3.5 3.5 0 0 1 0 7H13l-3.8 3v-3H7a3.5 3.5 0 0 1 0-7Z"
          stroke={active ? '#534AB7' : '#9A97A8'}
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path
          d="M9.5 10.75h5M9.5 13h3"
          stroke={active ? '#534AB7' : '#9A97A8'}
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    to: '/admin/users',
    label: '用户',
    icon: (active) => (
      <svg viewBox="0 0 24 24" className={iconClass} fill="none">
        <path
          d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0"
          stroke={active ? '#534AB7' : '#9A97A8'}
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
    <div className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col bg-white">
      <header className="border-b border-[#ECEAF8] bg-[#F6F5FB]">
        <div className="flex items-start justify-between px-4 py-4">
          <div>
            <p className="text-[13px] text-[#8A8799]">{user?.username ?? '管理员'} · 管理员</p>
            <h1 className="mt-1 text-lg font-semibold text-[#2D2940]">管理后台</h1>
          </div>
          <button
            type="button"
            onClick={() => setConfirmOpen((current) => !current)}
            className="text-[13px] text-[#E24B4A]"
          >
            退出
          </button>
        </div>

        <div
          className={`overflow-hidden border-t transition-all duration-200 ${
            confirmOpen
              ? 'max-h-[44px] border-[#E9A6A6] bg-[#FCEBEB]'
              : 'max-h-0 border-transparent bg-transparent'
          }`}
        >
          <div className="flex h-[44px] items-center justify-between px-4">
            <span className="text-[13px] text-[#E24B4A]">确定退出登录？</span>
            <div className="flex items-center gap-4 text-[13px]">
              <button type="button" onClick={() => setConfirmOpen(false)} className="text-[#8A8799]">
                取消
              </button>
              <button type="button" onClick={handleLogout} className="text-[#E24B4A]">
                确认退出
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 py-4 pb-24">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 left-1/2 z-20 w-full max-w-[430px] -translate-x-1/2 border-t border-[#ECEAF8] bg-white px-3 pb-4 pt-2">
        <ul className="grid grid-cols-2 gap-2">
          {navItems.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  `flex h-[56px] flex-col items-center justify-center rounded-[10px] text-xs transition-colors ${
                    isActive
                      ? 'bg-[#EEEDFE] text-[#534AB7]'
                      : 'bg-transparent text-[#9A97A8]'
                  }`
                }
              >
                {({ isActive }) => (
                  <span className="flex flex-col items-center justify-center">
                    {item.icon(isActive)}
                    <span className="mt-1">{item.label}</span>
                  </span>
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
