// Adapts a Node (req, res) pair to handle(). Used by api/index.js (Vercel) and the Vite dev server.
import { handle } from './handler.js';
import { fail } from './http.js';

async function readBody(req) {
  let raw = req.body;
  if (raw === undefined) { // not pre-parsed (Vite dev server)
    const chunks = [];
    for await (const c of req) chunks.push(c);
    raw = Buffer.concat(chunks).toString('utf8');
  }
  if (typeof raw !== 'string') return raw;
  return raw.trim() ? JSON.parse(raw) : undefined;
}

export async function nodeHandler(req, res) {
  let r;
  try {
    const url = new URL(req.url, 'http://localhost');
    let body;
    try { body = await readBody(req); } catch { body = null; r = fail(400, 'BAD_REQUEST', 'Malformed JSON body'); }
    r ||= await handle({ method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), body });
  } catch (e) { console.error(e); r = fail(500, 'SERVER_ERROR', 'Internal error'); }
  res.statusCode = r.status;
  if (r.body === undefined) return res.end();
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(r.body));
}
