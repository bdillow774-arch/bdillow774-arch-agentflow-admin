import Link from "next/link";

export const metadata = {
  title: "Delete Account | AgentFlow",
  description: "How to delete your AgentFlow account and request account data deletion.",
};

export default function DeleteAccountPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
      <section className="mx-auto max-w-2xl">
        <div className="mb-5 text-sm font-semibold uppercase tracking-[0.24em] text-sky-300">
          AgentFlow
        </div>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Delete Your AgentFlow Account
        </h1>
        <p className="mt-4 text-base leading-7 text-slate-300">
          AgentFlow users can delete their account directly inside the AgentFlow
          mobile app. Account deletion removes sign-in access and deletes or
          anonymizes account profile data associated with the user.
        </p>

        <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <h2 className="text-xl font-semibold">How to delete your account</h2>
          <ol className="mt-4 list-decimal space-y-3 pl-5 text-slate-300">
            <li>Open the AgentFlow mobile app.</li>
            <li>Sign in to the account you want to delete.</li>
            <li>Go to Settings.</li>
            <li>Open Profile.</li>
            <li>Scroll to the bottom and tap Delete Account.</li>
            <li>Review the subscription notice and confirm deletion.</li>
          </ol>
        </div>

        <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <h2 className="text-xl font-semibold">What is deleted</h2>
          <p className="mt-3 leading-7 text-slate-300">
            Account deletion removes the user&apos;s AgentFlow sign-in account,
            profile record, and locally stored app data on the device after the
            deletion request completes.
          </p>
        </div>

        <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <h2 className="text-xl font-semibold">Data we may retain</h2>
          <p className="mt-3 leading-7 text-slate-300">
            AgentFlow may retain limited non-identifying operational, billing,
            fraud prevention, security, legal, accounting, and business reporting
            records where permitted or required by law. Marketplace subscriptions
            must be managed separately through Apple App Store or Google Play
            subscription settings.
          </p>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/"
            className="rounded-xl bg-sky-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-300"
          >
            Open AgentFlow
          </Link>
          <Link
            href="/privacy"
            className="rounded-xl border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-100 transition hover:border-slate-500"
          >
            Privacy Policy
          </Link>
        </div>
      </section>
    </main>
  );
}
