const median = (values) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const money = (value) => Math.round(value || 0);
const normalizeAddress = (record) => `${record.address} ${record.zip}`.toLowerCase().replace(/[^a-z0-9]/g, '');

export class DataQualityService {
  evaluate({ listings, references, provenance, now = new Date() }) {
    const active = listings['for-sale'];
    return {
      generatedAt: now.toISOString(),
      source: this.sourceHealth(active, provenance, now),
      completeness: this.completeness(active),
      backtest: this.backtest(listings.sold),
      reconciliation: this.reconcile(active, references.activeSnapshot, provenance.live),
    };
  }

  sourceHealth(records, provenance, now) {
    const timestamps = records.map((record) => Date.parse(record.sourceUpdatedAt)).filter(Number.isFinite);
    const newest = timestamps.length ? Math.max(...timestamps) : null;
    const ageHours = newest ? Math.max(0, (now.getTime() - newest) / 3600000) : null;
    const status = ageHours == null ? 'unknown' : ageHours <= 36 ? 'current' : ageHours <= 96 ? 'aging' : 'stale';
    return { ...provenance, recordCount: records.length, newestRecordAt: newest ? new Date(newest).toISOString() : null, ageHours, status };
  }

  completeness(records) {
    const fields = ['address', 'zip', 'price', 'coordinates', 'sqft', 'sourceUpdatedAt'];
    const present = (record, field) => field === 'coordinates' ? record.coordinates.every(Number.isFinite) : record[field] !== null && record[field] !== undefined && record[field] !== '';
    const byField = Object.fromEntries(fields.map((field) => [field, records.length ? records.filter((record) => present(record, field)).length / records.length * 100 : 0]));
    return { overallPct: median(Object.values(byField)), byField };
  }

  backtest(records) {
    const eligible = records.filter((record) => record.price >= 50000 && record.price <= 5000000 && record.sqft >= 400 && record.sqft <= 12000 && record.pricePerSqft >= 40 && record.pricePerSqft <= 1200);
    const predictions = [];
    for (let fold = 0; fold < 5; fold += 1) {
      const train = eligible.filter((_, index) => index % 5 !== fold);
      const test = eligible.filter((_, index) => index % 5 === fold);
      const globalPpsf = median(train.map((record) => record.pricePerSqft));
      const byZip = train.reduce((groups, record) => {
        groups.set(record.zip, [...(groups.get(record.zip) || []), record.pricePerSqft]); return groups;
      }, new Map());
      for (const record of test) {
        const zipValues = byZip.get(record.zip) || [];
        const predicted = (zipValues.length >= 5 ? median(zipValues) : globalPpsf) * record.sqft;
        const error = predicted - record.price;
        predictions.push({ predicted, actual: record.price, error, ape: Math.abs(error) / record.price * 100 });
      }
    }
    return {
      method: '5-fold ZIP median $/ft² baseline', sampleSize: predictions.length, excluded: records.length - eligible.length,
      mae: money(predictions.reduce((sum, item) => sum + Math.abs(item.error), 0) / (predictions.length || 1)),
      medianErrorPct: median(predictions.map((item) => item.ape)),
      within10Pct: predictions.length ? predictions.filter((item) => item.ape <= 10).length / predictions.length * 100 : 0,
      within20Pct: predictions.length ? predictions.filter((item) => item.ape <= 20).length / predictions.length * 100 : 0,
      biasPct: predictions.length ? predictions.reduce((sum, item) => sum + item.error / item.actual * 100, 0) / predictions.length : 0,
    };
  }

  reconcile(primary, reference, live) {
    if (!live) return { available: false, matched: 0, message: 'Connect the live provider to compare it with the saved snapshot.' };
    const referenceByAddress = new Map(reference.map((record) => [normalizeAddress(record), record]));
    const matches = primary.map((record) => ({ primary: record, reference: referenceByAddress.get(normalizeAddress(record)) })).filter((item) => item.reference);
    const variances = matches.map(({ primary, reference: saved }) => Math.abs(primary.price - saved.price) / saved.price * 100);
    return { available: true, matched: matches.length, primaryCount: primary.length, referenceCount: reference.length, medianVariancePct: median(variances), within2Pct: matches.length ? variances.filter((value) => value <= 2).length / matches.length * 100 : 0 };
  }
}
