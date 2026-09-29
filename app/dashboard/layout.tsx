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
  { label: 'Users', href: '/dashboard/users' },
  { label: 'Brokerages', href: '/dashboard/brokerages' },
  { label: 'Subscriptions', href: '/dashboard/reports/user-activity' },
  { label: 'Promotions', href: '/dashboard/promotions' },
  { label: 'Open Houses', href: '/dashboard/reports/open-house' },
  { label: 'Accounting', href: '/dashboard/accounting' },
  { label: 'Reports', href: '/dashboard/reports' },
  { label: 'System Settings', href: '/dashboard/admin-access' },
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
    <div className="flex min-h-screen bg-[#f4f8fc] text-[#172033]">
      <aside className="hidden w-72 flex-col border-r border-slate-200 bg-white/95 shadow-[12px_0_35px_rgba(36,89,140,0.06)] lg:flex">
        <div className="border-b border-slate-200 px-5 py-6">
          <div className="mb-4">
            <BrandLogo variant="sidebar" />
          </div>
          <div className="rounded-2xl bg-[#eef7ff] px-4 py-3">
            <div className="text-xs font-semibold uppercase text-[#2187e5]">
              Master Admin
            </div>
            <div className="mt-1 text-sm font-medium text-slate-700">
              Internal operations
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-5">
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
                    ? 'bg-[#2187e5] text-white shadow-sm'
                    : 'text-slate-600 hover:bg-[#eef7ff] hover:text-[#172033]',
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
            className="af-focus w-full rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-[#eef7ff]"
          >
            Logout
          </button>
          <p className="mt-2 text-[11px] text-slate-500">
            Logged in as admin. Keep this dashboard private.
          </p>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
          <div className="mb-3 flex items-center justify-between">
            <BrandLogo variant="sidebar" />
            <button
              onClick={handleLogout}
              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
            >
              Logout
            </button>
          </div>
          <nav className="flex gap-2 overflow-x-auto pb-1">
            {navItems.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href !== '/dashboard' && pathname?.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={[
                    'shrink-0 rounded-full px-3 py-2 text-xs font-semibold',
                    isActive ? 'bg-[#2187e5] text-white' : 'bg-[#eef7ff] text-slate-700',
                  ].join(' ')}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      <main className="min-h-screen bg-[#f4f8fc] text-[#172033]">
        {children}
      </main>
      </div>
    </div>
  );
}
