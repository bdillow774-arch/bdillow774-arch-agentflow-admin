// app/dashboard/promotions/page.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { supabaseBrowserClient } from '@/lib/supabaseClient';

type PromotionSettingsRow = {
  id: string;
  free_trial_enabled: boolean;
  free_trial_length_days: number;
  created_at: string | null;
  updated_at: string | null;
};

const TRIAL_OPTIONS = [1, 2, 3, 5, 7];

export default function PromotionsPage() {
  // supabaseBrowserClient is a client instance, not a function
  const supabase = supabaseBrowserClient;

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
        const { data, error: selectError } = await supabase
          .from('promotion_settings')
          .select('*')
          .order('created_at', { ascending: true })
          .limit(1);

        if (selectError) {
          console.error('Error loading promotion_settings:', selectError);
          setError(
            selectError.message ||
              'Could not load promotion settings. Check the Supabase table & RLS.',
          );
          return;
        }

        if (!data || data.length === 0) {
          setError(
            'No promotion settings row found. Please insert one row into "promotion_settings" in Supabase.',
          );
          return;
        }

        setSettings(data[0] as PromotionSettingsRow);
      } catch (err: any) {
        console.error('Unexpected error loading promotion_settings:', err);
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
      const { data, error: updateError } = await supabase
        .from('promotion_settings')
        .update({
          ...patch,
          updated_at: new Date().toISOString(),
        })
        .eq('id', settings.id)
        .select('*');

      if (updateError) {
        console.error('Error updating promotion_settings:', updateError);
        setError(
          updateError.message ||
            'Could not update promotion settings. Please try again.',
        );
        return;
      }

      // data will be an array; take first element
      if (data && data.length > 0) {
        setSettings(data[0] as PromotionSettingsRow);
      }
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
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold text-gray-900 mb-2">
        Promotions &amp; Free Trials
      </h1>
      <p className="text-sm text-gray-600 mb-6">
        Control whether new users can start a free trial in the AgentFlow app
        and how long that trial lasts.
      </p>

      {loading && (
        <div className="mb-4 rounded-md bg-blue-50 px-4 py-3 text-sm text-blue-700">
          Loading promotion settings…
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="bg-white shadow-sm rounded-lg border border-gray-200 p-5 space-y-5">
        {/* Enable Free Trial */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900">
              Enable Free Trial
            </p>
            <p className="text-xs text-gray-500 mt-1 max-w-md">
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
              'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500',
              settings?.free_trial_enabled
                ? 'bg-indigo-600'
                : 'bg-gray-300',
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
          <p className="text-sm font-medium text-gray-900 mb-1">
            Free Trial Length
          </p>
          <p className="text-xs text-gray-500 mb-3 max-w-md">
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
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50',
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
        <div className="pt-3 border-t border-gray-100">
          <p className="text-xs text-gray-500">
            Current status:{' '}
            {settings?.free_trial_enabled ? (
              <span className="font-medium text-green-600">
                Free trials enabled
              </span>
            ) : (
              <span className="font-medium text-gray-700">
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
