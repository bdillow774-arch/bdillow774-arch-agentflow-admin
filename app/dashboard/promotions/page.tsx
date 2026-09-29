// app/dashboard/promotions/page.tsx
'use client';

import React, { useEffect, useState } from 'react';

type PromotionSettingsRow = {
  id: string;
  free_trial_enabled: boolean;
  free_trial_length_days: number;
  created_at: string | null;
  updated_at: string | null;
};

const TRIAL_OPTIONS = [1, 2, 3, 5, 7];

export default function PromotionsPage() {
  const [settings, setSettings] = useState<PromotionSettingsRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---- LOAD SETTINGS ROW (ARRAY-BASED, NO INSERT) ----
  useEffect(() => {
    const loadSettings = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/admin/promotion-settings', {
          cache: 'no-store',
        });
        const payload = await response.json();

        if (!response.ok || !payload.ok) {
          throw new Error(
            payload.error || 'Could not load promotion settings.',
          );
        }

        if (!payload.settings) {
          setError(
            'No promotion settings row found. Please insert one row into "promotion_settings" in Supabase.',
          );
          return;
        }

        setSettings(payload.settings as PromotionSettingsRow);
      } catch (err: any) {
        console.error('Unexpected error loading promotion settings:', err);
        setError(
          err?.message ||
            'Unexpected error loading promotion settings. Check console for details.',
        );
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- UPDATE HELPERS ----

  const updateSettings = async (patch: Partial<PromotionSettingsRow>) => {
    if (!settings) return;

    setSaving(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/promotion-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(
          payload.error || 'Could not update promotion settings.',
        );
      }

      setSettings(payload.settings as PromotionSettingsRow);
    } catch (err: any) {
      console.error('Unexpected error updating promotion_settings:', err);
      setError(
        err?.message ||
          'Unexpected error updating promotion settings. Please try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleToggleFreeTrial = (next: boolean) => {
    if (!settings || loading || saving) return;
    updateSettings({ free_trial_enabled: next });
  };

  const handleSelectDays = (days: number) => {
    if (!settings || loading || saving) return;
    updateSettings({ free_trial_length_days: days });
  };

  // ---- UI ----

  const isReady = !!settings && !loading;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 text-slate-50">
      <h1 className="mb-2 text-2xl font-semibold">
        Promotions &amp; Free Trials
      </h1>
      <p className="mb-6 text-sm text-slate-400">
        Control whether new users can start a free trial in the AgentFlow app
        and how long that trial lasts.
      </p>

      {loading && (
        <div className="mb-4 rounded-md border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
          Loading promotion settings…
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      )}

      <div className="space-y-5 rounded-lg border border-slate-800 bg-slate-900/80 p-5 shadow-sm">
        {/* Enable Free Trial */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-50">
              Enable Free Trial
            </p>
            <p className="mt-1 max-w-md text-xs text-slate-400">
              When enabled, new users can start a free trial when they create
              an account in the app. When disabled, all new accounts will be
              created as Free or Paid only.
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              handleToggleFreeTrial(!settings?.free_trial_enabled)
            }
            disabled={!isReady || saving}
            className={[
              'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-sky-400',
              settings?.free_trial_enabled
                ? 'bg-sky-500'
                : 'bg-slate-700',
              (!isReady || saving) ? 'opacity-60 cursor-not-allowed' : '',
            ].join(' ')}
          >
            <span
              className={[
                'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
                settings?.free_trial_enabled ? 'translate-x-5' : 'translate-x-1',
              ].join(' ')}
            />
          </button>
        </div>

        {/* Trial Length */}
        <div>
          <p className="mb-1 text-sm font-medium text-slate-50">
            Free Trial Length
          </p>
          <p className="mb-3 max-w-md text-xs text-slate-400">
            Choose how many days the free trial should last. This value is used
            when promotions are enabled in the mobile app.
          </p>

          <div className="flex flex-wrap gap-2">
            {TRIAL_OPTIONS.map(days => {
              const isActive = settings?.free_trial_length_days === days;
              const disabled =
                !isReady || saving || !settings?.free_trial_enabled;

              return (
                <button
                  key={days}
                  type="button"
                  onClick={() => handleSelectDays(days)}
                  disabled={disabled}
                  className={[
                    'px-3 py-1.5 rounded-full text-sm border transition-colors',
                    isActive
                      ? 'border-sky-500 bg-sky-500 text-white'
                      : 'border-slate-700 bg-slate-950 text-slate-200 hover:bg-slate-800',
                    disabled ? 'opacity-60 cursor-not-allowed' : '',
                  ].join(' ')}
                >
                  {days} day{days !== 1 ? 's' : ''}
                </button>
              );
            })}
          </div>
        </div>

        {/* Status */}
        <div className="border-t border-slate-800 pt-3">
          <p className="text-xs text-slate-400">
            Current status:{' '}
            {settings?.free_trial_enabled ? (
              <span className="font-medium text-emerald-300">
                Free trials enabled
              </span>
            ) : (
              <span className="font-medium text-slate-200">
                Free trials disabled
              </span>
            )}
            {settings?.free_trial_enabled &&
              settings.free_trial_length_days > 0 && (
                <>
                  {' '}
                  ·{' '}
                  <span className="font-medium">
                    {settings.free_trial_length_days}
                  </span>{' '}
                  day trial
                </>
              )}
          </p>
        </div>
      </div>
    </div>
  );
}
