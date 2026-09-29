// app/api/admin/open-house/route.ts
import { NextResponse } from 'next/server';
import { logAdminAudit } from '@/lib/adminAudit';
import { requireDashboardAdmin } from '@/lib/dashboardAdminAuth';
import { supabaseAdminClient } from '@/lib/supabaseAdminClient';

function isMissingTableError(error: { message?: string; code?: string } | null | undefined) {
  const message = String(error?.message || '').toLowerCase();
  return (
    error?.code === '42P01' ||
    error?.code === 'PGRST205' ||
    message.includes('relation') ||
    message.includes('does not exist') ||
    message.includes('could not find the table')
  );
}

function normalizeText(value: unknown) {
  if (value === null || value === undefined) return null;
  const next = String(value).trim();
  return next.length > 0 ? next : null;
}

function findAddressComponents(value: unknown): Array<Record<string, any>> {
  if (!value || typeof value !== 'object') return [];

  if (Array.isArray(value)) {
    const looksLikeAddressComponents = value.some((item) =>
      Boolean(
        item &&
          typeof item === 'object' &&
          Array.isArray((item as Record<string, any>).types),
      ),
    );

    return looksLikeAddressComponents ? (value as Array<Record<string, any>>) : [];
  }

  const record = value as Record<string, any>;
  const candidateKeys = [
    'address_components',
    'addressComponents',
    'google_address_components',
    'googleAddressComponents',
  ];

  for (const key of candidateKeys) {
    const nested = findAddressComponents(record[key]);
    if (nested.length > 0) return nested;
  }

  const nestedObjectKeys = [
    'place',
    'place_details',
    'placeDetails',
    'google_place',
    'googlePlace',
    'google_place_details',
    'location',
    'property_location',
    'propertyLocation',
  ];

  for (const key of nestedObjectKeys) {
    const nested = findAddressComponents(record[key]);
    if (nested.length > 0) return nested;
  }

  return [];
}

function countyFromAddressComponents(value: unknown) {
  const countyComponent = findAddressComponents(value).find((component) =>
    (component.types ?? []).includes('administrative_area_level_2'),
  );

  return (
    normalizeText(countyComponent?.long_name) ??
    normalizeText(countyComponent?.short_name)
  );
}

function deriveLocationFields(lead: Record<string, any>) {
  return {
    city:
      normalizeText(lead.city) ??
      normalizeText(lead.property_city) ??
      normalizeText(lead.lead_city),
    state:
      normalizeText(lead.state) ??
      normalizeText(lead.property_state) ??
      normalizeText(lead.lead_state),
    county:
      normalizeText(lead.county) ??
      normalizeText(lead.property_county) ??
      normalizeText(lead.lead_county) ??
      countyFromAddressComponents(lead),
    zip_code:
      normalizeText(lead.zip_code) ??
      normalizeText(lead.zip) ??
      normalizeText(lead.property_zip),
  };
}

function deriveHasAgent(lead: Record<string, any>) {
  const workingWithAgent = String(lead.working_with_agent || '').toLowerCase();
  if (workingWithAgent === 'yes') return true;
  if (workingWithAgent === 'no') return false;

  return Boolean(
    normalizeText(lead.agent_name) ??
      normalizeText(lead.agent_email) ??
      normalizeText(lead.agent_phone),
  );
}

function normalizeLead(lead: Record<string, any>, propertyNameMap: Map<string, string | null>) {
  const location = deriveLocationFields(lead);

  return {
    ...lead,
    property_name:
      lead.property_name ??
      lead.property_address ??
      (lead.session_id ? propertyNameMap.get(lead.session_id) ?? null : null),
    archived: Boolean(lead.archived),
    archived_at: normalizeText(lead.archived_at),
    source: lead.archived ? 'archived' : 'active',
    has_agent: deriveHasAgent(lead),
    ...location,
  };
}

async function loadArchivedLeads() {
  const { data, error } = await supabaseAdminClient
    .from('open_house_lead_archive')
    .select('*')
    .order('archived_at', { ascending: false });

  if (error) {
    if (isMissingTableError(error)) {
      return { rows: [], warning: 'Open house archive table is not installed yet.' };
    }

    throw error;
  }

  const rows = (data ?? []).map((row) => {
    const payload = (row.lead_payload ?? {}) as Record<string, any>;
    return {
      ...payload,
      id: payload.id ?? row.original_lead_id,
      session_id: payload.session_id ?? row.session_id,
      property_name: row.property_name ?? payload.property_name ?? null,
      property_address: row.property_address ?? payload.property_address ?? null,
      email: row.email ?? payload.email ?? null,
      working_with_agent: row.working_with_agent ?? payload.working_with_agent ?? null,
      city: row.city ?? payload.city ?? payload.property_city ?? null,
      state: row.state ?? payload.state ?? payload.property_state ?? null,
      county:
        row.county ??
        payload.county ??
        payload.property_county ??
        countyFromAddressComponents(payload) ??
        null,
      zip_code: row.zip_code ?? payload.zip_code ?? payload.zip ?? payload.property_zip ?? null,
      created_at: payload.created_at ?? row.created_at,
      archived: true,
      archived_at: row.archived_at,
    };
  });

  return { rows, warning: null as string | null };
}

async function archiveLeadsBeforeDelete(ids: string[]) {
  const { data: leads, error: leadsError } = await supabaseAdminClient
    .from('open_house_leads')
    .select('*')
    .in('id', ids);

  if (leadsError) {
    throw leadsError;
  }

  if (!leads || leads.length === 0) {
    return;
  }

  const payload = leads.map((lead) => {
    const location = deriveLocationFields(lead);

    return {
      original_lead_id: String(lead.id),
      session_id: normalizeText(lead.session_id),
      property_name:
        normalizeText(lead.property_name) ?? normalizeText(lead.property_address),
      property_address: normalizeText(lead.property_address),
      city: location.city,
      state: location.state,
      county: location.county,
      zip_code: location.zip_code,
      email: normalizeText(lead.email),
      working_with_agent: normalizeText(lead.working_with_agent),
      lead_payload: lead,
      archived_at: new Date().toISOString(),
      archive_reason: 'admin_delete',
    };
  });

  const { error } = await supabaseAdminClient
    .from('open_house_lead_archive')
    .upsert(payload, { onConflict: 'original_lead_id' });

  if (error && !isMissingTableError(error)) {
    throw error;
  }
}

// GET /api/admin/open-house -> list all open house leads
export async function GET(req: Request) {
  try {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    const url = new URL(req.url);
    const includeArchived = url.searchParams.get('includeArchived') !== 'false';

    const [{ data: leads, error }, { data: sessions, error: sessionsError }] =
      await Promise.all([
        supabaseAdminClient
          .from('open_house_leads')
          .select('*')
          .order('created_at', { ascending: false }),
        supabaseAdminClient
          .from('open_house_sessions')
          .select('id, property_name'),
      ]);

    if (error) {
      console.error('open_house_leads error', error);
      return NextResponse.json(
        {
          error:
            error.message ||
            'Failed to load open house leads. Check that the open_house_leads table exists.',
        },
        { status: 500 }
      );
    }

    const sessionMap = new Map(
      (sessions ?? []).map((session) => [
        session.id,
        session.property_name ?? null,
      ]),
    );

    const warnings: string[] = [];
    if (sessionsError) {
      warnings.push(`Open house sessions unavailable: ${sessionsError.message}`);
    }

    const currentLeads = (leads ?? []).map((lead) => normalizeLead(lead, sessionMap));
    let archivedLeads: Array<Record<string, any>> = [];

    if (includeArchived) {
      const archivedResult = await loadArchivedLeads();
      archivedLeads = archivedResult.rows.map((lead) => normalizeLead(lead, sessionMap));
      if (archivedResult.warning) {
        warnings.push(archivedResult.warning);
      }
    }

    const mergedLeads = [...currentLeads, ...archivedLeads].sort((a: any, b: any) => {
      const aTime = new Date(String(a.created_at || a.archived_at || 0)).getTime();
      const bTime = new Date(String(b.created_at || b.archived_at || 0)).getTime();
      return bTime - aTime;
    });

    await logAdminAudit({
      action: 'read',
      resourceType: 'open_house_leads',
      actor: auth.user,
      details: {
        count: mergedLeads.length,
        includeArchived,
      },
    });

    return NextResponse.json({
      leads: mergedLeads,
      warnings,
    });
  } catch (err: any) {
    console.error('List open house leads failed', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to load open house reports.' },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/open-house -> delete selected leads by id
export async function DELETE(req: Request) {
  try {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    const body = await req.json().catch(() => null);
    const ids = body?.ids as string[] | undefined;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: 'No IDs provided for deletion.' },
        { status: 400 }
      );
    }

    await archiveLeadsBeforeDelete(ids);

    const { error } = await supabaseAdminClient
      .from('open_house_leads')
      .delete()
      .in('id', ids);

    if (error) {
      console.error('open_house_leads delete error', error);
      return NextResponse.json(
        {
          error:
            error.message ||
            'Failed to delete selected open house leads. Please try again.',
        },
        { status: 500 }
      );
    }

    await logAdminAudit({
      action: 'delete',
      resourceType: 'open_house_leads',
      actor: auth.user,
      request: req,
      details: {
        deletedCount: ids.length,
        ids,
      },
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Delete open house leads failed', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to delete selected leads.' },
      { status: 500 }
    );
  }
}
