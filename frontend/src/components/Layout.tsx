import type { ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router-dom';

import UpdateReadyBanner from '@/components/UpdateReadyBanner';

interface NavItem {
  to: string;
  label: string;
  icon: (active: boolean) => ReactNode;
}

const iconClass = 'h-6 w-6';

const navItems: NavItem[] = [
  {
    to: '/app/home',
    label: '首页',
    icon: (active) => (
      <svg viewBox="0 0 24 24" className={iconClass} fill="none">
        <path
          d="M4 10.8L12 4l8 6.8V20a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1v-9.2Z"
          stroke={active ? '#007AFF' : '#8E8E93'}
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    to: '/app/stats',
    label: '图表',
    icon: (active) => (
      <svg viewBox="0 0 24 24" className={iconClass} fill="none">
        <path
          d="M5 19h14M7 16V9m5 7V5m5 11v-4"
          stroke={active ? '#007AFF' : '#8E8E93'}
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    to: '/app/plan',
    label: '规划',
    icon: (active) => (
      <svg viewBox="0 0 24 24" className={iconClass} fill="none">
        <path
          d="M4 6.5h16M4 12h16M4 17.5h10"
          stroke={active ? '#007AFF' : '#8E8E93'}
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    to: '/app/profile',
    label: '我的',
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

function Layout() {
  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-[430px] flex-col bg-[#F2F2F7]">
      <UpdateReadyBanner />
      <div className="ios-bg-blobs">
        <div className="blob blob-1" />
        <div className="blob blob-2" />
        <div className="blob blob-3" />
        <div className="blob blob-4" />
      </div>

      <main className="relative flex-1 px-5 pb-28 pt-4">
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

export default Layout;
