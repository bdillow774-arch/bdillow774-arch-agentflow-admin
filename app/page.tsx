"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const APP_CALLBACK_BASE = "agentflowv2://auth/callback";
const APP_HOME_URL = "agentflowv2:///";

function hasAuthParams() {
  if (typeof window === "undefined") return false;

  const params = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));

  return Boolean(
    params.get("code") ||
      params.get("access_token") ||
      params.get("refresh_token") ||
      params.get("error") ||
      hashParams.get("access_token") ||
      hashParams.get("refresh_token") ||
      hashParams.get("error"),
  );
}

function buildAppUrl() {
  if (typeof window === "undefined") return APP_HOME_URL;

  if (!hasAuthParams()) return APP_HOME_URL;

  return `${APP_CALLBACK_BASE}${window.location.search}${window.location.hash}`;
}

export default function Page() {
  const [appUrl, setAppUrl] = useState(APP_HOME_URL);
  const [isAuthLink, setIsAuthLink] = useState(false);

  useEffect(() => {
    const nextIsAuthLink = hasAuthParams();
    const nextAppUrl = buildAppUrl();
    setIsAuthLink(nextIsAuthLink);
    setAppUrl(nextAppUrl);

    if (nextIsAuthLink) {
      window.location.replace(nextAppUrl);
    }
  }, []);

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
      <section className="mx-auto flex min-h-[70vh] max-w-xl flex-col justify-center">
        <div className="mb-5 text-sm font-semibold uppercase tracking-[0.24em] text-sky-300">
          AgentFlow
        </div>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          {isAuthLink ? "Finish signing in" : "Open AgentFlow"}
        </h1>
        <p className="mt-4 text-base leading-7 text-slate-300">
          {isAuthLink
            ? "We are opening AgentFlow to finish verifying your email."
            : "AgentFlow is built for your mobile device. Open the app to continue."}
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a
            href={appUrl}
            className="rounded-xl bg-sky-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-300"
          >
            Open AgentFlow
          </a>
          <Link
            href="/dashboard/login"
            className="rounded-xl border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-100 transition hover:border-slate-500"
          >
            Admin Login
          </Link>
        </div>
        <p className="mt-5 text-sm text-slate-400">
          If this came from an email verification link, open the same link on the
          iPhone or iPad where AgentFlow is installed.
        </p>
      </section>
    </main>
  );
}
