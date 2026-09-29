"use client";

import { useEffect, useMemo, useState } from "react";

const APP_CALLBACK_BASE = "agentflowv2://auth/callback";

function buildAppCallbackUrl() {
  if (typeof window === "undefined") return APP_CALLBACK_BASE;

  const suffix = `${window.location.search}${window.location.hash}`;
  return `${APP_CALLBACK_BASE}${suffix}`;
}

export default function AuthCallbackPage() {
  const [appUrl, setAppUrl] = useState(APP_CALLBACK_BASE);
  const [didTryOpen, setDidTryOpen] = useState(false);

  const supportUrl = useMemo(() => "mailto:bdillow774@gmail.com", []);

  useEffect(() => {
    const callbackUrl = buildAppCallbackUrl();
    setAppUrl(callbackUrl);
    setDidTryOpen(true);
    window.location.replace(callbackUrl);
  }, []);

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
      <section className="mx-auto flex min-h-[70vh] max-w-xl flex-col justify-center">
        <div className="mb-5 text-sm font-semibold uppercase tracking-[0.24em] text-sky-300">
          AgentFlow
        </div>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Finish signing in
        </h1>
        <p className="mt-4 text-base leading-7 text-slate-300">
          We are opening AgentFlow to finish verifying your email. If the app does
          not open automatically, tap the button below from your phone.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a
            href={appUrl}
            className="rounded-xl bg-sky-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-300"
          >
            Open AgentFlow
          </a>
          <a
            href={supportUrl}
            className="rounded-xl border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-100 transition hover:border-slate-500"
          >
            Contact Support
          </a>
        </div>
        {didTryOpen ? (
          <p className="mt-5 text-sm text-slate-400">
            If you are on a desktop computer, open this same email link on the
            iPhone or iPad where AgentFlow is installed.
          </p>
        ) : null}
      </section>
    </main>
  );
}
