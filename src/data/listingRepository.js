import { SoldListingAdapter } from './adapters/soldListingAdapter.js';
import { ActiveListingAdapter } from './adapters/activeListingAdapter.js';

export class ListingRepository {
  constructor(feedConfig) { this.feedConfig = feedConfig; }

  async load() {
    const soldAdapters = this.feedConfig.sold.map((url) => new SoldListingAdapter(url));
    const activeAdapters = this.feedConfig['for-sale'].map((url) => new ActiveListingAdapter(url));
    const [soldGroups, activeGroups] = await Promise.all([
      Promise.all(soldAdapters.map((adapter) => adapter.load())),
      Promise.all(activeAdapters.map((adapter) => adapter.load())),
    ]);
    return { sold: soldGroups.flat(), 'for-sale': activeGroups.flat() };
  }
}
