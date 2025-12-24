import Link from 'next/link';

export default function ReportsHomePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-base font-semibold text-slate-50">Reports</h1>
        <p className="text-xs text-slate-400">
          Admin reporting for Open Houses, Mileage, and User Activity.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Link
          href="/dashboard/reports/open-house"
          className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 hover:bg-slate-800/40"
        >
          <div className="text-sm font-semibold text-slate-50">
            Open House Reports
          </div>
          <div className="mt-1 text-xs text-slate-400">
            Filter sign-ins, search visitors, export CSV, and manage records.
          </div>
        </Link>

        <Link
          href="/dashboard/reports/user-activity"
          className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 hover:bg-slate-800/40"
        >
          <div className="text-sm font-semibold text-slate-50">
            User Activity Reports
          </div>
          <div className="mt-1 text-xs text-slate-400">
            Users, subscription status, plan type, devices, last login, and open
            house counts.
          </div>
        </Link>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 opacity-80">
          <div className="text-sm font-semibold text-slate-50">
            Mileage Reports
          </div>
          <div className="mt-1 text-xs text-slate-400">
            Coming next: date range filters and exports.
          </div>
        </div>
      </div>
    </div>
  );
}

