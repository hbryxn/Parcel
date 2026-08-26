import { getLiveListingsResponse } from './liveListings.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/listings/live') return getLiveListingsResponse(env.RENTCAST_API_KEY);
    return env.ASSETS.fetch(request);
  },
};
