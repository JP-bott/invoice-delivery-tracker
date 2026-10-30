// The stored invoice structure (products + positioned text rows) is the single
// source of truth. Flatten only for editing/printing, then serialize moves back
// to the existing arrays, so old invoices continue to display identically.
export const isSpacer = (row) => row?.kind === 'space';

export function orderedInvoiceLines(items = [], textRows = []) {
  const lines = [];
  for (let at = 0; at <= items.length; at++) {
    textRows.forEach((row, index) => {
      if (Number(row?.after_item) === at) lines.push({ kind: isSpacer(row) ? 'space' : 'description', index, value: row });
    });
    if (at < items.length) lines.push({ kind: 'product', index: at, value: items[at] });
  }
  return lines;
}

// Converts a single visual order back to the two persisted arrays. Each text
// row belongs to the nearest preceding product, with position 0 for preamble.
export function serializeInvoiceLines(lines) {
  const items = [], text_rows = [];
  for (const line of lines) {
    if (line.kind === 'product') items.push(line.value);
    else text_rows.push({ ...line.value, after_item: items.length });
  }
  return { items, text_rows };
}

export function appendProduct(items, textRows, product) {
  return serializeInvoiceLines([...orderedInvoiceLines(items, textRows), { kind: 'product', value: product }]);
}

// Adds description or blank space immediately after the chosen displayed row.
export function insertSupportingLine(items, textRows, afterVisualIndex, row) {
  const lines = orderedInvoiceLines(items, textRows);
  const position = Math.max(0, Math.min(afterVisualIndex + 1, lines.length));
  lines.splice(position, 0, { kind: isSpacer(row) ? 'space' : 'description', value: row });
  return serializeInvoiceLines(lines);
}

export function removeProduct(items, textRows, productIndex) {
  if (items.length <= 1) return { items, text_rows: textRows };
  const remaining = items.filter((_, index) => index !== productIndex);
  const removedPosition = productIndex + 1;
  return {
    items: remaining,
    text_rows: textRows.map(row => {
      const at = Number(row.after_item);
      if (at > removedPosition) return { ...row, after_item: at - 1 };
      if (at === removedPosition) return { ...row, after_item: Math.max(1, productIndex) };
      return row;
    }),
  };
}

// Move a product together with all rows attached beneath it. This guarantees
// product + description groupings stay intact on product reordering.
export function moveProductGroup(items, textRows, productIndex, direction) {
  const nextIndex = productIndex + direction;
  if (nextIndex < 0 || nextIndex >= items.length) return null;
  const preamble = textRows.filter(row => Number(row.after_item) === 0);
  const groups = items.map((item, index) => ({
    item,
    rows: textRows.filter(row => Number(row.after_item) === index + 1),
  }));
  [groups[productIndex], groups[nextIndex]] = [groups[nextIndex], groups[productIndex]];
  const lines = [
    ...preamble.map(value => ({ kind: isSpacer(value) ? 'space' : 'description', value })),
    ...groups.flatMap(group => [
      { kind: 'product', value: group.item },
      ...group.rows.map(value => ({ kind: isSpacer(value) ? 'space' : 'description', value })),
    ]),
  ];
  return serializeInvoiceLines(lines);
}

// Move one description/space one visible row at a time; passing a product moves
// it to that product's section. Priced descriptions cannot precede every product.
export function moveSupportingLine(items, textRows, textIndex, direction) {
  const lines = orderedInvoiceLines(items, textRows);
  const from = lines.findIndex(line => line.kind !== 'product' && line.index === textIndex);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= lines.length) return null;
  const moved = [...lines];
  [moved[from], moved[to]] = [moved[to], moved[from]];
  const serialized = serializeInvoiceLines(moved);
  if (serialized.text_rows.some(row => row.is_priced === true && row.after_item === 0)) return null;
  return serialized;
}

export const blankSpace = () => ({ kind: 'space', text: '', after_item: 0 });
export const blankDescription = () => ({ text: '', after_item: 0, is_priced: false, quantity: '1', unit_cost: '' });
