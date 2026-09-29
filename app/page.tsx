'use client';

import AgentFlowBrand from '@/app/_components/agentflow-brand';
import Link from 'next/link';
import { useEffect, useState } from 'react';

const APP_CALLBACK_BASE = 'agentflowv2://auth/callback';
const APP_HOME_URL = 'agentflowv2:///';

const brokeragePlans = [
  ['10 agents', '$49.99/month'],
  ['25 agents', '$119.99/month'],
  ['50 agents', '$224.99/month'],
  ['100 agents', '$424.99/month'],
  ['250 agents', '$999.99/month'],
  ['251+', 'Contact AgentFlow'],
];

const features = [
  {
    title: 'Showing route optimization',
    body: 'Plan an efficient showing day, reduce backtracking, and keep clients on schedule.',
  },
  {
    title: 'Calendar-ready planning',
    body: 'Organize route timing around appointments and showing windows.',
  },
  {
    title: 'Mileage tracking',
    body: 'Keep better records of the driving that happens across your real estate day.',
  },
  {
    title: 'Open-house lead capture',
    body: 'Capture sign-ins and keep follow-up information connected to your workflow.',
  },
];

function hasAuthParams() {
  if (typeof window === 'undefined') return false;

  const params = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));

  return Boolean(
    params.get('code') ||
      params.get('access_token') ||
      params.get('refresh_token') ||
      params.get('error') ||
      hashParams.get('access_token') ||
      hashParams.get('refresh_token') ||
      hashParams.get('error'),
  );
}

function buildAppUrl() {
  if (typeof window === 'undefined') return APP_HOME_URL;
  if (!hasAuthParams()) return APP_HOME_URL;
  return `${APP_CALLBACK_BASE}${window.location.search}${window.location.hash}`;
}

export default function Page() {
  const [appUrl, setAppUrl] = useState(APP_HOME_URL);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const nextAppUrl = buildAppUrl();
    setAppUrl(nextAppUrl);

    if (hasAuthParams()) {
      window.location.replace(nextAppUrl);
    }
  }, []);

  return (
    <main className="min-h-screen overflow-hidden bg-white text-[#172033]">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/88 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 lg:px-8">
          <Link href="/" aria-label="AgentFlow home" className="af-focus rounded-lg">
            <AgentFlowBrand priority className="max-w-[190px]" />
          </Link>
          <nav className="hidden items-center gap-7 text-sm font-medium text-slate-700 md:flex">
            <a className="af-focus rounded-md" href="#features">Features</a>
            <a className="af-focus rounded-md" href="#brokerages">For Brokerages</a>
            <a className="af-focus rounded-md" href="#pricing">Pricing</a>
            <Link className="af-focus rounded-md" href="/dashboard/login">Sign In</Link>
            <a
              href={appUrl}
              className="af-focus rounded-full bg-[#2187e5] px-5 py-2.5 font-semibold text-white shadow-sm hover:bg-[#1068bd]"
            >
              Get AgentFlow
            </a>
          </nav>
          <button
            type="button"
            className="af-focus rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 md:hidden"
            onClick={() => setMenuOpen((next) => !next)}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
          >
            Menu
          </button>
        </div>
        {menuOpen && (
          <nav
            id="mobile-nav"
            className="border-t border-slate-200 bg-white px-5 py-4 md:hidden"
          >
            <div className="grid gap-3 text-sm font-semibold text-slate-700">
              <a href="#features" onClick={() => setMenuOpen(false)}>Features</a>
              <a href="#brokerages" onClick={() => setMenuOpen(false)}>For Brokerages</a>
              <a href="#pricing" onClick={() => setMenuOpen(false)}>Pricing</a>
              <Link href="/dashboard/login">Sign In</Link>
              <a className="rounded-full bg-[#2187e5] px-5 py-3 text-center text-white" href={appUrl}>
                Get AgentFlow
              </a>
            </div>
          </nav>
        )}
      </header>

      <section className="relative bg-[linear-gradient(180deg,#f7fbff_0%,#ffffff_78%)]">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 py-16 lg:grid-cols-[1fr_0.88fr] lg:px-8 lg:py-24">
          <div className="flex flex-col justify-center">
            <p className="text-sm font-semibold uppercase text-[#2187e5]">
              Showing-day intelligence for real estate agents
            </p>
            <h1 className="mt-5 max-w-3xl text-5xl font-semibold leading-[1.02] text-[#172033] sm:text-6xl lg:text-7xl">
              Your Real Estate Day. Optimized.
            </h1>
            <p className="mt-6 max-w-2xl text-xl leading-8 text-slate-600">
              Plan smarter. Drive less. Close more. AgentFlow brings route
              planning, showing-day organization, mileage tracking, and open-house
              lead capture into one focused mobile workflow.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a
                href={appUrl}
                className="af-focus rounded-full bg-[#2187e5] px-7 py-4 text-center text-sm font-semibold text-white shadow-lg shadow-sky-200 hover:bg-[#1068bd]"
              >
                Get AgentFlow
              </a>
              <a
                href="#brokerages"
                className="af-focus rounded-full border border-slate-300 bg-white px-7 py-4 text-center text-sm font-semibold text-slate-800 hover:border-sky-300"
              >
                Brokerage Plans
              </a>
            </div>
          </div>

          <ProductVisual />
        </div>
      </section>

      <section id="features" className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase text-[#2187e5]">Features</p>
          <h2 className="mt-3 text-3xl font-semibold text-[#172033] sm:text-4xl">
            Built around the real work of an agent’s day.
          </h2>
        </div>
        <div className="mt-9 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => (
            <article key={feature.title} className="af-card rounded-2xl p-6">
              <div className="mb-5 h-10 w-10 rounded-xl bg-[#eef7ff] text-center text-2xl leading-10 text-[#2187e5]">
                •
              </div>
              <h3 className="text-lg font-semibold text-[#172033]">{feature.title}</h3>
              <p className="mt-3 text-sm leading-6 text-slate-600">{feature.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="brokerages" className="bg-[#f4f9ff] px-5 py-16 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="text-sm font-semibold uppercase text-[#2187e5]">
              For Brokerages
            </p>
            <h2 className="mt-3 text-3xl font-semibold text-[#172033] sm:text-4xl">
              Seat-based access for teams that want a cleaner showing workflow.
            </h2>
            <p className="mt-4 text-base leading-7 text-slate-600">
              Brokerage subscriptions are purchased seats. Agents still create or
              use their own AgentFlow account, enter the brokerage join code, and
              wait for approval before a seat is assigned.
            </p>
            <Link
              href="/dashboard/login"
              className="af-focus mt-7 inline-flex rounded-full bg-[#2187e5] px-6 py-3 text-sm font-semibold text-white hover:bg-[#1068bd]"
            >
              Brokerage Admin Sign In
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {brokeragePlans.map(([seats, price]) => (
              <div key={seats} className="rounded-2xl border border-sky-100 bg-white p-5 shadow-sm">
                <div className="text-sm font-semibold text-slate-500">{seats}</div>
                <div className="mt-2 text-2xl font-semibold text-[#172033]">{price}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="af-card rounded-2xl p-7">
            <p className="text-sm font-semibold uppercase text-[#2187e5]">Individual</p>
            <h2 className="mt-3 text-4xl font-semibold text-[#172033]">$5.99/month</h2>
            <p className="mt-4 text-sm leading-6 text-slate-600">
              Individual subscriptions remain inside the mobile app through the
              existing Apple/RevenueCat purchase flow.
            </p>
          </div>
          <div className="af-card rounded-2xl p-7">
            <p className="text-sm font-semibold uppercase text-[#2187e5]">Brokerage</p>
            <h2 className="mt-3 text-4xl font-semibold text-[#172033]">From $49.99/month</h2>
            <p className="mt-4 text-sm leading-6 text-slate-600">
              Minimum package is 10 purchased seats. Stripe checkout is used for
              brokerage billing once configured; this page does not simulate payment.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

function ProductVisual() {
  return (
    <div className="relative mx-auto w-full max-w-[430px]">
      <div className="rounded-[2.4rem] border border-slate-200 bg-white p-4 shadow-2xl shadow-sky-100">
        <div className="rounded-[1.9rem] bg-[#f7fbff] p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold uppercase text-[#2187e5]">
                Today’s Route
              </div>
              <div className="mt-1 text-xl font-semibold text-[#172033]">
                6 showings planned
              </div>
            </div>
            <div className="rounded-full bg-[#2187e5] px-3 py-1 text-xs font-semibold text-white">
              42 mi
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-sky-100 bg-white p-3">
            <div className="relative h-44 overflow-hidden rounded-xl bg-[#eaf5ff]">
              <div className="absolute left-8 top-8 h-28 w-64 rotate-[-8deg] rounded-full border-[10px] border-white" />
              <div className="absolute left-16 top-12 h-24 w-44 rotate-[18deg] rounded-full border-[8px] border-sky-200" />
              {[
                ['18%', '28%'],
                ['52%', '18%'],
                ['72%', '58%'],
                ['28%', '70%'],
              ].map(([left, top], index) => (
                <div
                  key={`${left}-${top}`}
                  className="absolute h-7 w-7 rounded-full border-4 border-white bg-[#2187e5] text-center text-xs font-semibold leading-5 text-white shadow"
                  style={{ left, top }}
                >
                  {index + 1}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 grid gap-3">
            {['1248 Maple Ridge', '88 Lakeview Court', 'Generate Directions'].map((item, index) => (
              <div
                key={item}
                className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-sm"
              >
                <div>
                  <div className="text-sm font-semibold text-[#172033]">{item}</div>
                  <div className="text-xs text-slate-500">
                    {index === 2 ? 'Ready for navigation' : `${index + 1}:30 PM showing`}
                  </div>
                </div>
                <div className="h-9 w-9 rounded-full bg-[#eef7ff]" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
