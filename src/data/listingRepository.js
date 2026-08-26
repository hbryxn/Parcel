import { SoldListingAdapter } from './adapters/soldListingAdapter.js';
import { ActiveListingAdapter } from './adapters/activeListingAdapter.js';
import { LiveListingAdapter } from './adapters/liveListingAdapter.js';

export class ListingRepository {
  constructor(feedConfig, liveConfig = null) { this.feedConfig = feedConfig; this.liveConfig = liveConfig; }

  async load() {
    const soldAdapters = this.feedConfig.sold.map((url) => new SoldListingAdapter(url));
    const snapshotAdapters = this.feedConfig['for-sale'].map((url) => new ActiveListingAdapter(url));
    const [soldGroups, snapshotGroups] = await Promise.all([
      Promise.all(soldAdapters.map((adapter) => adapter.load())),
      Promise.all(snapshotAdapters.map((adapter) => adapter.load())),
    ]);
    const sold = soldGroups.flat();
    const snapshot = snapshotGroups.flat();
    let active = snapshot;
    let provenance = { provider: 'Curated market snapshot', live: false, fallbackReason: 'Live provider is not configured.', retrievedAt: snapshot[0]?.retrievedAt || null };

    if (this.liveConfig) {
      try {
        const liveResult = await new LiveListingAdapter(this.liveConfig).load();
        active = liveResult.records;
        provenance = { ...liveResult.metadata, provider: liveResult.metadata.provider || 'RentCast', live: true, fallbackReason: null };
      } catch (error) {
        provenance = { ...provenance, fallbackReason: error.name === 'AbortError' ? 'Live provider timed out.' : error.message };
      }
    }

    return { listings: { sold, 'for-sale': active }, references: { activeSnapshot: snapshot }, provenance };
  }
}
