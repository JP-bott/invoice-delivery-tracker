import { describe, it, expect } from 'vitest';
import { nodeHandler } from '../node-adapter.js';

const fakeRes = () => { const r = { headers: {}, setHeader(k, v) { r.headers[k] = v; }, end(b) { r.out = b; } }; return r; };
describe('node adapter', () => {
  it('returns JSON 400 for malformed bodies', async () => {
    const res = fakeRes();
    await nodeHandler({ method: 'POST', url: '/api/invoices', body: '{bad' }, res);
    expect(res.statusCode).toBe(400); expect(JSON.parse(res.out).error.code).toBe('BAD_REQUEST');
  });
  it('returns JSON 404 for unknown routes', async () => {
    const res = fakeRes();
    await nodeHandler({ method: 'GET', url: '/api/zzz', body: undefined, [Symbol.asyncIterator]: async function* () {} }, res);
    expect(res.statusCode).toBe(404);
  });
});
