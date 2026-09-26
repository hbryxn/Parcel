import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const CACHE_DIR = new URL('../.cache/', import.meta.url);
const USER_AGENT = 'ParcelPipeline/2.0 (+local research build)';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const cachePath = (name) => new URL(name, CACHE_DIR);

export async function fetchWithRetry(url, { attempts = 4, timeoutMs = 60000, headers = {}, ...options } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal, headers: { 'User-Agent': USER_AGENT, ...headers } });
      if (response.status === 429 || response.status >= 500) throw new Error(`HTTP ${response.status}`);
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(750 * 2 ** (attempt - 1));
    } finally { clearTimeout(timer); }
  }
  throw new Error(`Request failed after ${attempts} attempts (${url.split('?')[0]}): ${lastError?.message}`);
}

async function freshEnough(file, maxAgeHours) {
  try {
    const info = await stat(file);
    return (Date.now() - info.mtimeMs) / 3600000 <= maxAgeHours ? info : null;
  } catch { return null; }
}

// JSON-producing work is memoized on disk so re-runs are fast and polite to sources.
export async function cached(name, maxAgeHours, producer, { offline = false } = {}) {
  const file = cachePath(name);
  await mkdir(path.dirname(file.pathname), { recursive: true });
  const info = await freshEnough(file, offline ? Infinity : maxAgeHours);
  if (info) return { value: JSON.parse(await readFile(file, 'utf8')), cachedAt: info.mtime.toISOString(), fromCache: true };
  if (offline) throw new Error(`Offline mode and no cache for ${name}`);
  const value = await producer();
  await writeFile(file, JSON.stringify(value));
  return { value, cachedAt: new Date().toISOString(), fromCache: false };
}

export async function getJSON(url, options) {
  const response = await fetchWithRetry(url, options);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url.split('?')[0]}`);
  return response.json();
}

export const hashKey = (value) => createHash('sha1').update(value).digest('hex').slice(0, 12);

// Stream a remote text file line by line without holding it in memory.
export async function* streamLines(url, options = {}) {
  const response = await fetchWithRetry(url, { timeoutMs: 600000, ...options });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  let body = response.body;
  if (options.gzip) body = body.pipeThrough(new DecompressionStream('gzip'));
  const reader = body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      yield buffer.slice(0, newline).replace(/\r$/, '');
      buffer = buffer.slice(newline + 1);
    }
  }
  if (buffer) yield buffer;
}

// Minimal RFC-4180 line splitter (quoted fields, escaped quotes).
export const splitCSVLine = (line, delimiter = ',') => {
  const cells = []; let cell = ''; let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted) {
      if (char === '"' && line[index + 1] === '"') { cell += '"'; index += 1; } else if (char === '"') quoted = false; else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === delimiter) { cells.push(cell); cell = ''; } else cell += char;
  }
  cells.push(cell);
  return cells;
};
