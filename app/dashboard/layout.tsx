'use client';

import React from 'react';
import { clearDashboardSessionCookie, syncDashboardSessionCookie } from '@/lib/adminSessionClient';
import BrandLogo from '@/app/dashboard/_components/brand-logo';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { supabaseBrowserClient } from '@/lib/supabaseClient';

type DashboardLayoutProps = {
  children: React.ReactNode;
};

const navItems = [
  { label: 'Overview', href: '/dashboard' },
  { label: 'Admin Access', href: '/dashboard/admin-access' },
  { label: 'Users', href: '/dashboard/users' },
  { label: 'Accounting', href: '/dashboard/accounting' },
  { label: 'Promotions', href: '/dashboard/promotions' },
  { label: 'Reports', href: '/dashboard/reports' },
];

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const isLoginPage = pathname === '/dashboard/login';

  useEffect(() => {
    const checkAuth = async () => {
      try {
        if (isLoginPage) {
          setAuthChecked(true);
          setIsAuthenticated(false);
          return;
        }

        const { data, error } = await supabaseBrowserClient.auth.getUser();

        if (error) {
          throw error;
        }

        const user = data.user;

        if (!user) {
          await clearDashboardSessionCookie();
          setIsAuthenticated(false);
          setAuthChecked(true);
          router.replace('/dashboard/login');
          return;
        }

        const appMetadata = user.app_metadata ?? {};
        const userMetadata = user.user_metadata ?? {};

        const hasDashboardAccess =
          appMetadata.dashboard_admin === true ||
          userMetadata.role === 'dashboard_admin' ||
          userMetadata.role === 'admin';

        if (!hasDashboardAccess || appMetadata.dashboard_active === false) {
          await supabaseBrowserClient.auth.signOut();
          await clearDashboardSessionCookie();
          setIsAuthenticated(false);
          setAuthChecked(true);
          router.replace('/dashboard/login');
          return;
        }

        await syncDashboardSessionCookie();
        setIsAuthenticated(true);
        setAuthChecked(true);
      } catch (error) {
        console.warn('Dashboard auth session was cleared.', error);
        await supabaseBrowserClient.auth.signOut({ scope: 'local' });
        await clearDashboardSessionCookie();
        setIsAuthenticated(false);
        setAuthChecked(true);
        router.replace('/dashboard/login');
      }
    };

    void checkAuth();
  }, [isLoginPage, router]);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabaseBrowserClient.auth.onAuthStateChange((_event, session) => {
      if (isLoginPage) {
        return;
      }

      if (!session?.access_token) {
        setIsAuthenticated(false);
        void clearDashboardSessionCookie();
        return;
      }

      void syncDashboardSessionCookie(session.access_token);
      setIsAuthenticated(true);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [isLoginPage]);

  const handleLogout = async () => {
    try {
      await supabaseBrowserClient.auth.signOut();
      await clearDashboardSessionCookie();
    } catch {
      // ignore
    }
    router.push('/dashboard/login');
  };

  // Do NOT wrap the login page in the dashboard chrome
  if (isLoginPage) {
    return <>{children}</>;
  }

  if (!authChecked || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-600">
        Loading dashboard...
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-100 text-slate-900">
      {/* Sidebar */}
      <aside className="flex w-72 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-5">
          <div className="mb-4">
            <BrandLogo variant="sidebar" />
          </div>
          <div className="mb-1 text-xs uppercase tracking-[0.22em] text-slate-500">
            AgentFlow
          </div>
          <div className="text-lg font-semibold text-slate-900">
            Admin Dashboard
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          {navItems.map(item => {
            const isActive =
              pathname === item.href ||
              (item.href !== '/dashboard' && pathname?.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  'flex items-center rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-sky-500 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                ].join(' ')}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 px-3 py-4">
          <button
            onClick={handleLogout}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
          >
            Logout
          </button>
          <p className="mt-2 text-[11px] text-slate-500">
            Logged in as admin. Keep this dashboard private.
          </p>
        </div>
      </aside>

      {/* Main content */}
      <main className="min-h-screen flex-1 bg-slate-50 text-slate-900">
        {children}
      </main>
    </div>
  );
}
