import type { ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router-dom';

interface NavItem {
  to: string;
  label: string;
  icon: (active: boolean) => ReactNode;
}

const iconClass = 'h-[18px] w-[18px]';

const navItems: NavItem[] = [
  {
    to: '/app/home',
    label: '首页',
    icon: (active) => (
      <svg viewBox="0 0 24 24" className={iconClass} fill="none">
        <path
          d="M4 10.8L12 4l8 6.8V20a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1v-9.2Z"
          stroke={active ? '#534AB7' : '#9A97A8'}
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
          stroke={active ? '#534AB7' : '#9A97A8'}
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    to: '/app/circle',
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
    to: '/app/plan',
    label: '规划',
    icon: (active) => (
      <svg viewBox="0 0 24 24" className={iconClass} fill="none">
        <path
          d="M4 6.5h16M4 12h16M4 17.5h10"
          stroke={active ? '#534AB7' : '#9A97A8'}
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
          stroke={active ? '#534AB7' : '#9A97A8'}
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
    <div className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col bg-white">
      <main className="flex-1 px-4 py-4 pb-24">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 left-1/2 z-20 w-full max-w-[430px] -translate-x-1/2 border-t border-[#ECEAF8] bg-white px-3 pb-4 pt-2">
        <ul className="grid grid-cols-5 gap-2">
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
                  <>
                    {item.icon(isActive)}
                    <span className="mt-1">{item.label}</span>
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
