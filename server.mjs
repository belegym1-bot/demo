import { createServer } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile, stat } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyAction, createSeed, getPhoto, publicState, RuleError } from './domain.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const dataFile = resolve(process.env.BELE_DATA_FILE || join(root, '.bele-data', 'state.json'));
const port = Number(process.env.PORT || 4173);
const bindHost = process.env.HOST || '127.0.0.1';
const cookieName = 'bele_sessao';
const sessionAgeSeconds = 12 * 60 * 60;
const sessionAge = sessionAgeSeconds * 1000;
const allowedTopLevel = new Set(['index.html', 'app.js', 'views.js', 'styles.css', 'views.css', 'intro.js', 'intro.css', 'manifest.webmanifest', 'sw.js', 'supabase-test.html', 'supabase-client.js', 'supabase-config.js']);
const contentTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.mp4': 'video/mp4', '.webm': 'video/webm',
};

async function save(nextData) {
  await mkdir(dirname(dataFile), { recursive: true });
  const temporary = `${dataFile}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(nextData), { encoding: 'utf8', flag: 'wx' });
  await rename(temporary, dataFile);
}

async function load() {
  try {
    return JSON.parse(await readFile(dataFile, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const initial = createSeed();
    await save(initial);
    return initial;
  }
}

let data = await load();
// Serializa gravações para impedir que duas ações simultâneas sobrescrevam dados uma da outra.
let writeQueue = Promise.resolve();
function serializeWrite(operation) {
  const pending = writeQueue.then(operation, operation);
  writeQueue = pending.catch(() => {});
  return pending;
}

function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}

function readSession(request) {
  const value = request.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  const key = /^[\w-]{36}$/.test(value || '') ? hash(value) : null;
  const session = key && data.sessions[key];
  return { key, userId: session?.expiresAt > Date.now() ? session.userId : null };
}

function setCookie(response, value, seconds = sessionAgeSeconds) {
  response.setHeader('Set-Cookie', `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${seconds}`);
}

function sendJson(response, status, body) {
  const result = JSON.stringify(body);
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(result);
}

async function readJson(request) {
  if (request.headers['content-type']?.split(';')[0].trim() !== 'application/json') {
    throw new RuleError('Envie os dados em JSON.', 415);
  }
  const maxSize = 10 * 1024 * 1024;
  if (Number(request.headers['content-length']) > maxSize) throw new RuleError('O arquivo é grande demais.', 413);
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxSize) throw new RuleError('O arquivo é grande demais.', 413);
    chunks.push(chunk);
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch {
    throw new RuleError('Os dados enviados são inválidos.');
  }
}

function isAllowedHost(host) {
  try {
    const hostname = new URL(`http://${host}`).hostname.replace(/^\[|\]$/g, '');
    if (hostname === 'localhost' || hostname === '::1' || hostname === '127.0.0.1') return true;
    const octets = hostname.split('.').map(Number);
    if (octets.length !== 4 || octets.some(value => !Number.isInteger(value) || value < 0 || value > 255)) return false;
    return octets[0] === 10 || octets[0] === 192 && octets[1] === 168 || octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31;
  } catch {
    return false;
  }
}

function allowActionOrigin(request) {
  if (request.headers['sec-fetch-site'] === 'cross-site') return false;
  const origin = request.headers.origin;
  return !origin || origin === `http://${request.headers.host}`;
}

async function serveStatic(pathname, request, response) {
  const relativePath = pathname === '/' ? 'index.html' : pathname.slice(1);
  const allowedAsset = /^assets\/(?:[a-z0-9_-]+\/)*[a-z0-9][a-z0-9_.-]*$/i.test(relativePath);
  const type = contentTypes[extname(relativePath).toLowerCase()];
  if (!type || (!allowedTopLevel.has(relativePath) && !allowedAsset)) return false;
  const fullPath = join(root, relativePath);
  let size;
  try {
    const info = await stat(fullPath);
    if (!info.isFile()) return false;
    size = info.size;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
  const cacheControl = relativePath.startsWith('assets/') ? 'public, max-age=3600, stale-while-revalidate=86400' : 'no-cache';
  if (request.method === 'HEAD') {
    response.writeHead(200, { 'Content-Type': type, 'Content-Length': size, 'Cache-Control': cacheControl });
    response.end();
    return true;
  }
  const buffer = await readFile(fullPath);
  const headers = { 'Content-Type': type, 'Content-Length': buffer.length, 'Cache-Control': cacheControl, 'Cross-Origin-Resource-Policy': 'same-origin' };
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range || '');
  if (range && type.startsWith('video/')) {
    const start = range[1] ? Number(range[1]) : Math.max(0, buffer.length - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), buffer.length - 1) : buffer.length - 1;
    if (start > end || start >= buffer.length) {
      response.writeHead(416, { 'Content-Range': `bytes */${buffer.length}` });
      response.end();
      return true;
    }
    response.writeHead(206, {
      ...headers, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1,
      'Content-Range': `bytes ${start}-${end}/${buffer.length}`,
    });
    response.end(buffer.subarray(start, end + 1));
    return true;
  }
  response.writeHead(200, headers);
  response.end(buffer);
  return true;
}

const server = createServer(async (request, response) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  const host = request.headers.host || `localhost:${port}`;
  if (!isAllowedHost(host)) {
    sendJson(response, 400, { error: 'Endereço de acesso não permitido.' });
    return;
  }

  try {
    const path = new URL(request.url, `http://${host}`).pathname;
    const { key, userId } = readSession(request);
    if (path === '/api/state' && request.method === 'GET') {
      sendJson(response, 200, publicState(data, userId));
      return;
    }

    if (path === '/api/action' && request.method === 'POST') {
      if (!allowActionOrigin(request)) throw new RuleError('A origem do pedido não é permitida.', 403);
      const action = await readJson(request);
      const outcome = await serializeWrite(async () => {
        const current = readSession(request);
        const next = structuredClone(data);
        const result = applyAction(next, current.userId, action);
        let newToken;
        if (result.sessionUser !== undefined) {
          if (current.key) delete next.sessions[current.key];
          if (result.sessionUser) {
            newToken = randomUUID();
            next.sessions[hash(newToken)] = { userId: result.sessionUser, expiresAt: Date.now() + sessionAge };
          }
        }
        const now = Date.now();
        for (const [sessionKey, session] of Object.entries(next.sessions)) {
          if (session.expiresAt <= now) delete next.sessions[sessionKey];
        }
        await save(next);
        data = next;
        return { result, newToken };
      });
      if (outcome.newToken) setCookie(response, outcome.newToken);
      else if (outcome.result.sessionUser === null) setCookie(response, '', 0);
      const { sessionUser, ...details } = outcome.result;
      sendJson(response, 200, details);
      return;
    }

    const photoMatch = /^\/api\/photo\/([\w-]+)$/.exec(path);
    if (photoMatch && request.method === 'GET') {
      const photo = getPhoto(data, userId, photoMatch[1]);
      response.writeHead(200, { 'Content-Type': photo.type, 'Cache-Control': 'private, no-store', 'Content-Length': photo.bytes.length });
      response.end(photo.bytes);
      return;
    }

    if (['GET', 'HEAD'].includes(request.method) && await serveStatic(path, request, response)) return;
    sendJson(response, 404, { error: 'Página não encontrada.' });
  } catch (error) {
    if (error instanceof RuleError) {
      sendJson(response, error.status, { error: error.message });
      return;
    }
    console.error(error);
    sendJson(response, 500, { error: 'Não foi possível concluir a operação.' });
  }
});

server.listen(port, bindHost, () => {
  console.log(`Belê GYM disponível na porta ${port}`);
  console.log(`Acesso local: http://localhost:${port}`);
  if (bindHost === '0.0.0.0') console.log('Acesso pela rede local: use o IP deste computador e a mesma porta.');
});
