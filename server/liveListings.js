const RENTCAST_ENDPOINT = 'https://api.rentcast.io/v1/listings/sale';

// Matches the pipeline region (pipeline/config.js): every listing within 40 miles of Savannah.
export const REGION = { latitude: 32.08, longitude: -81.1, radiusMiles: 40 };

const jsonResponse = (body, status = 200, cache = 'no-store') => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cache },
});

const timestamp = (value) => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const historyOf = (listing) => Object.entries(listing.history || {})
  .map(([date, event]) => ({ date: String(date).slice(0, 10), event: event.event || 'Listing', price: Number(event.price) }))
  .filter((event) => Number.isFinite(event.price) && event.price > 0)
  .sort((a, b) => timestamp(a.date) - timestamp(b.date));

export const normalizeRentCastListing = (listing) => {
  const price = Number(listing.price);
  const history = historyOf(listing);
  const before = [...history].reverse().find((event) => event.price !== price)?.price;
  return {
    id: listing.id,
    address: listing.addressLine1 || listing.formattedAddress,
    city: listing.city,
    zip: String(listing.zipCode || ''),
    list_price: price,
    sqft: Number(listing.squareFootage) || null,
    lot_size: Number(listing.lotSize) || null,
    beds: Number(listing.bedrooms) || null,
    baths: Number(listing.bathrooms) || null,
    property_type: listing.propertyType,
    listed_date: listing.listedDate,
    source_updated_at: listing.lastSeenDate || listing.listedDate,
    days_on_market: Number(listing.daysOnMarket) || null,
    price_change_pct: before > 0 && price > 0 ? (price - before) / before * 100 : 0,
    history,
    source_url: null,
    latitude: Number(listing.latitude),
    longitude: Number(listing.longitude),
  };
};

// Each page is one billable RentCast request; raise maxPages only on a paid plan.
export async function getLiveListingsResponse(apiKey, fetchImpl = fetch, { maxPages = 1 } = {}) {
  if (!apiKey) return jsonResponse({ code: 'LIVE_PROVIDER_NOT_CONFIGURED', message: 'Live provider is not configured.' }, 503);

  try {
    const properties = [];
    for (let offset = 0; offset < maxPages * 500; offset += 500) {
      const query = new URLSearchParams({
        latitude: String(REGION.latitude), longitude: String(REGION.longitude), radius: String(REGION.radiusMiles), status: 'Active', limit: '500', offset: String(offset),
      });
      const upstream = await fetchImpl(`${RENTCAST_ENDPOINT}?${query}`, { headers: { 'X-Api-Key': apiKey, Accept: 'application/json' } });
      if (!upstream.ok) {
        if (properties.length) break;
        return jsonResponse({ code: 'LIVE_PROVIDER_ERROR', message: `Live provider returned ${upstream.status}.` }, 502);
      }
      const payload = await upstream.json();
      const page = Array.isArray(payload) ? payload : [];
      properties.push(...page.map(normalizeRentCastListing)
        .filter((listing) => listing.id && listing.address && listing.list_price > 10000 && Number.isFinite(listing.latitude) && Number.isFinite(listing.longitude)));
      if (page.length < 500) break;
    }
    const sourceTimes = properties.map((listing) => timestamp(listing.source_updated_at)).filter(Boolean);

    return jsonResponse({
      provider: 'RentCast',
      retrieved_at: new Date().toISOString(),
      source_updated_at: sourceTimes.length ? new Date(Math.max(...sourceTimes)).toISOString() : null,
      properties,
    }, 200, 'public, max-age=300, s-maxage=3600, stale-while-revalidate=600');
  } catch {
    return jsonResponse({ code: 'LIVE_PROVIDER_UNAVAILABLE', message: 'Live provider is temporarily unavailable.' }, 502);
  }
}
