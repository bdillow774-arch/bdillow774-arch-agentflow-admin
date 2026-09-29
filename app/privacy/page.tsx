import Link from "next/link";

export const metadata = {
  title: "Privacy Policy | AgentFlow",
  description: "AgentFlow privacy policy and data practices.",
};

const sections = [
  {
    title: "Information we collect",
    body:
      "AgentFlow may collect account information, profile information, subscription information, device information, app activity, location information, mileage information, calendar-related data, open house lead information, property details, and uploaded property photos when you use app features.",
  },
  {
    title: "How we use information",
    body:
      "We use information to provide AgentFlow features, manage accounts and subscriptions, support route planning, open house lead capture, mileage tracking, reports, calendar tools, app security, customer support, fraud prevention, analytics, and service operations.",
  },
  {
    title: "Location and mileage",
    body:
      "If you grant permission, AgentFlow may use location data to support navigation, route planning, and mileage tracking. Background location may be used only when mileage tracking is enabled.",
  },
  {
    title: "Photos and open houses",
    body:
      "AgentFlow may access selected photo library images when you choose a property photo for an Open House sign-in page. Open house lead submissions and related property information may be stored for reporting and business administration.",
  },
  {
    title: "Subscriptions",
    body:
      "AgentFlow subscriptions are processed by the applicable app marketplace, such as Apple App Store or Google Play. Subscription status may be used to determine access to app features.",
  },
  {
    title: "Sharing",
    body:
      "We do not sell personal information. We may share information with service providers only as needed to operate AgentFlow, including hosting, authentication, mapping, subscription processing, analytics, security, and support.",
  },
  {
    title: "Retention and deletion",
    body:
      "You may delete your AgentFlow account in the mobile app from Settings > Profile > Delete Account. We may retain limited non-identifying operational, legal, accounting, fraud prevention, security, and business reporting records where permitted or required.",
  },
  {
    title: "Contact",
    body:
      "For privacy questions or account deletion help, contact AgentFlow support through the business contact information associated with your AgentFlow account.",
  },
];

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
      <section className="mx-auto max-w-2xl">
        <div className="mb-5 text-sm font-semibold uppercase tracking-[0.24em] text-sky-300">
          AgentFlow
        </div>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Privacy Policy
        </h1>
        <p className="mt-4 text-base leading-7 text-slate-300">
          This Privacy Policy explains how AgentFlow collects, uses, stores, and
          protects information associated with your use of the AgentFlow mobile
          app and related services.
        </p>

        <div className="mt-8 space-y-5">
          {sections.map((section) => (
            <div
              key={section.title}
              className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5"
            >
              <h2 className="text-xl font-semibold">{section.title}</h2>
              <p className="mt-3 leading-7 text-slate-300">{section.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/account/delete"
            className="rounded-xl bg-sky-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-300"
          >
            Delete Account
          </Link>
          <Link
            href="/"
            className="rounded-xl border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-100 transition hover:border-slate-500"
          >
            Open AgentFlow
          </Link>
        </div>
      </section>
    </main>
  );
}
