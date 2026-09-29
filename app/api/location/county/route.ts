import { NextResponse } from 'next/server';

type AddressComponent = {
  long_name?: string;
  short_name?: string;
  types?: string[];
};

function normalizeText(value: unknown) {
  if (value === null || value === undefined) return null;
  const next = String(value).trim();
  return next.length > 0 ? next : null;
}

function countyFromAddressComponents(components: AddressComponent[]) {
  const countyComponent = components.find((component) =>
    (component.types ?? []).includes('administrative_area_level_2'),
  );

  return (
    normalizeText(countyComponent?.long_name) ??
    normalizeText(countyComponent?.short_name)
  );
}

async function fetchGoogleCountyFromPlaceId(placeId: string) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();

  if (!apiKey) {
    return {
      ok: false as const,
      status: 500,
      error: 'GOOGLE_MAPS_API_KEY is not configured.',
    };
  }

  const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
  url.searchParams.set('place_id', placeId);
  url.searchParams.set('fields', 'address_components');
  url.searchParams.set('key', apiKey);

  const response = await fetch(url, { cache: 'no-store' });
  const payload = await response.json();

  if (!response.ok || payload.status !== 'OK') {
    return {
      ok: false as const,
      status: 502,
      error: payload.error_message || payload.status || 'Google Place lookup failed.',
    };
  }

  return {
    ok: true as const,
    county: countyFromAddressComponents(payload.result?.address_components ?? []),
    addressComponents: payload.result?.address_components ?? [],
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const placeId = normalizeText(body?.placeId ?? body?.place_id);
    const addressComponents = Array.isArray(body?.addressComponents)
      ? body.addressComponents
      : Array.isArray(body?.address_components)
        ? body.address_components
        : null;

    if (addressComponents) {
      return NextResponse.json({
        ok: true,
        county: countyFromAddressComponents(addressComponents),
        source: 'address_components',
      });
    }

    if (!placeId) {
      return NextResponse.json(
        {
          ok: false,
          error: 'placeId or addressComponents is required.',
        },
        { status: 400 },
      );
    }

    const result = await fetchGoogleCountyFromPlaceId(placeId);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.status },
      );
    }

    return NextResponse.json({
      ok: true,
      county: result.county,
      addressComponents: result.addressComponents,
      source: 'google_place_details',
    });
  } catch (error: any) {
    console.error('County lookup failed', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'County lookup failed.' },
      { status: 500 },
    );
  }
}
