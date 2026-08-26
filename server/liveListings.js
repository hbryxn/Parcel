const RENTCAST_ENDPOINT = 'https://api.rentcast.io/v1/listings/sale';

export const COVERED_ZIPS = new Set([
  '31312', '31322', '31326',
  '31401', '31404', '31405', '31406', '31407', '31408', '31410', '31411', '31415', '31419',
]);

const jsonResponse = (body, status = 200, cache = 'no-store') => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cache },
});

const timestamp = (value) => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const priorPrice = (listing) => {
  const events = Object.entries(listing.history || {}).map(([date, event]) => ({ date, ...event }))
    .filter((event) => Number.isFinite(Number(event.price)))
    .sort((a, b) => timestamp(b.date) - timestamp(a.date));
  return events.find((event) => Number(event.price) !== Number(listing.price))?.price ?? null;
};

export const normalizeRentCastListing = (listing) => {
  const before = Number(priorPrice(listing));
  const price = Number(listing.price);
  const priceChange = before > 0 && price > 0 ? (price - before) / before * 100 : 0;
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
    price_change_pct: priceChange,
    source_url: null,
    latitude: Number(listing.latitude),
    longitude: Number(listing.longitude),
  };
};

export async function getLiveListingsResponse(apiKey, fetchImpl = fetch) {
  if (!apiKey) return jsonResponse({ code: 'LIVE_PROVIDER_NOT_CONFIGURED', message: 'Live provider is not configured.' }, 503);

  const query = new URLSearchParams({
    latitude: '32.144', longitude: '-81.205', radius: '45', status: 'Active', limit: '500',
  });

  try {
    const upstream = await fetchImpl(`${RENTCAST_ENDPOINT}?${query}`, {
      headers: { 'X-Api-Key': apiKey, Accept: 'application/json' },
    });
    if (!upstream.ok) {
      return jsonResponse({ code: 'LIVE_PROVIDER_ERROR', message: `Live provider returned ${upstream.status}.` }, 502);
    }

    const payload = await upstream.json();
    const properties = (Array.isArray(payload) ? payload : [])
      .filter((listing) => COVERED_ZIPS.has(String(listing.zipCode || '')))
      .map(normalizeRentCastListing)
      .filter((listing) => listing.id && listing.address && listing.list_price > 10000 && Number.isFinite(listing.latitude) && Number.isFinite(listing.longitude));
    const sourceTimes = properties.map((listing) => timestamp(listing.source_updated_at)).filter(Boolean);
    const retrievedAt = new Date().toISOString();

    return jsonResponse({
      provider: 'RentCast',
      retrieved_at: retrievedAt,
      source_updated_at: sourceTimes.length ? new Date(Math.max(...sourceTimes)).toISOString() : null,
      properties,
    }, 200, 'public, max-age=300, s-maxage=3600, stale-while-revalidate=600');
  } catch {
    return jsonResponse({ code: 'LIVE_PROVIDER_UNAVAILABLE', message: 'Live provider is temporarily unavailable.' }, 502);
  }
}
