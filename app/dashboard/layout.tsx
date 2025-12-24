'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

type DashboardLayoutProps = {
  children: React.ReactNode;
};

const navItems = [
  { label: 'Overview', href: '/dashboard' },
  { label: 'Users', href: '/dashboard/users' },
  { label: 'Promotions', href: '/dashboard/promotions' },
  { label: 'Reports', href: '/dashboard/reports' },
];

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();

  // Do NOT wrap the login page in the dashboard chrome
  if (pathname === '/dashboard/login') {
    return <>{children}</>;
  }

  const handleLogout = () => {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem('agentflow-admin-session');
      }
    } catch {
      // ignore
    }
    router.push('/dashboard/login');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex">
      {/* Sidebar */}
      <aside className="w-64 border-r border-slate-800 bg-slate-950/90 flex flex-col">
        <div className="px-5 py-4 border-b border-slate-800">
          <div className="text-xs uppercase tracking-widest text-slate-400 mb-1">
            AgentFlow
          </div>
          <div className="text-lg font-semibold">Admin Dashboard</div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(item => {
            const isActive =
              pathname === item.href ||
              (item.href !== '/dashboard' && pathname?.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  'flex items-center rounded-lg px-3 py-2 text-sm transition-colors',
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-200 hover:bg-slate-800 hover:text-white',
                ].join(' ')}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="px-3 py-4 border-t border-slate-800">
          <button
            onClick={handleLogout}
            className="w-full rounded-lg bg-slate-800 hover:bg-slate-700 text-sm py-2 text-slate-100 transition-colors"
          >
            Logout
          </button>
          <p className="mt-2 text-[11px] text-slate-500">
            Logged in as admin. Keep this dashboard private.
          </p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-h-screen bg-slate-950 text-slate-50">
        {children}
      </main>
    </div>
  );
}
