import { defineConfig } from 'vite';
import { copyFileSync, mkdirSync } from 'node:fs';

export default defineConfig({
  build: { sourcemap: true },
  plugins: [{
    name: 'parcel-sites-runtime',
    closeBundle() {
      mkdirSync('dist/server', { recursive: true });
      mkdirSync('dist/.openai', { recursive: true });
      copyFileSync('server/index.js', 'dist/server/index.js');
      copyFileSync('.openai/hosting.json', 'dist/.openai/hosting.json');
    },
  }],
});
