const safeNumber = (value) => Number.isFinite(Number(value)) ? Number(value) : null;

export const makeListing = (input) => {
  const price = safeNumber(input.price);
  const sqft = safeNumber(input.sqft);
  return Object.freeze({
    id: input.id,
    mode: input.mode,
    priceKind: input.mode === 'sold' ? 'sale' : 'ask',
    address: input.address || 'Address withheld',
    city: input.city || 'Savannah area',
    zip: String(input.zip || 'Unknown'),
    price,
    pricePerSqft: safeNumber(input.pricePerSqft) || (price && sqft ? price / sqft : null),
    sqft,
    lotSize: safeNumber(input.lotSize),
    beds: safeNumber(input.beds),
    baths: safeNumber(input.baths),
    type: input.type || 'Single Family Residential',
    eventDate: input.eventDate || null,
    trend: safeNumber(input.trend) || 0,
    insight: input.insight || null,
    sourceUrl: input.sourceUrl || null,
    footprint: input.footprint || null,
    coordinates: [safeNumber(input.longitude), safeNumber(input.latitude)],
  });
};

export const isMappableListing = (listing) => listing.price > 10000 && listing.coordinates.every(Number.isFinite);
