import { defineConfig, loadEnv } from 'vite';
import { copyFileSync, mkdirSync } from 'node:fs';
import { getLiveListingsResponse } from './server/liveListings.js';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    build: { sourcemap: true },
    plugins: [{
      name: 'parcel-sites-runtime',
      configureServer(server) {
        server.middlewares.use('/api/listings/live', async (_request, response) => {
          const liveResponse = await getLiveListingsResponse(env.RENTCAST_API_KEY);
          response.statusCode = liveResponse.status;
          liveResponse.headers.forEach((value, key) => response.setHeader(key, value));
          response.end(await liveResponse.text());
        });
      },
      closeBundle() {
        mkdirSync('dist/server', { recursive: true });
        mkdirSync('dist/.openai', { recursive: true });
        copyFileSync('server/index.js', 'dist/server/index.js');
        copyFileSync('server/liveListings.js', 'dist/server/liveListings.js');
        copyFileSync('.openai/hosting.json', 'dist/.openai/hosting.json');
      },
    }],
  };
});
