// Helpers for registered clients (Settings > Clients, and the client autocomplete in the Add/Edit Invoice form).
const squash = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
const digits = (s) => String(s ?? '').replace(/\D/g, '');

// The registered client whose name equals `name` (ignoring case and extra spaces), else undefined.
export const findClient = (clients, name) => { const n = squash(name); return n ? clients.find((c) => squash(c.name) === n) : undefined; };

// What the invoice stores for a client: Name, TIN and Address ('' when empty).
export const clientFields = (c) => ({ client_name: c.name, client_tin: c.tin ?? '', client_address: c.address ?? '' });

// Registered clients that match what the user typed, best first: name starts with it, a word starts with it, name contains it,
// then TIN contains it (digits only, so "123456" finds 123-456-789-00000). An empty query returns every client in the given order.
export function matchClients(clients, query) {
  const q = squash(query);
  if (!q) return clients;
  const qDigits = digits(q) && digits(q).length >= 3 && /^[\d\s-]+$/.test(q) ? digits(q) : '';
  const ranked = [];
  for (const c of clients) {
    const name = squash(c.name), at = name.indexOf(q);
    let rank = -1;
    if (at === 0) rank = 0;
    else if (at > 0 && name[at - 1] === ' ') rank = 1;
    else if (at > 0) rank = 2;
    else if (qDigits && digits(c.tin).includes(qDigits)) rank = 3;
    if (rank >= 0) ranked.push({ c, rank, name });
  }
  return ranked.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name)).map((r) => r.c);
}
