// Shared helpers for custom invoice fields (Settings, Add/Edit form, filters, table).
export const FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'textarea', label: 'Long text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'checkbox', label: 'Checkbox (yes / no)' },
  { value: 'email', label: 'Email' },
  { value: 'url', label: 'Link (URL)' },
];
export const TYPE_LABEL = Object.fromEntries(FIELD_TYPES.map((t) => [t.value, t.label]));
export const TEXTUAL_TYPES = ['text', 'textarea'];

export const filterKey = (field) => `cf_${field.id}`;
export const isCustomFilterKey = (key) => /^cf_\d+$/.test(key);

// Form value for a field: saved value, else '' (checkbox: 'false'). Values are strings; checkbox is 'true' / 'false'.
export const valueOf = (field, custom = {}) => custom?.[field.id] ?? (field.input_type === 'checkbox' ? 'false' : '');

export function displayValue(field, value) {
  if (field.input_type === 'checkbox') return value === 'true' ? 'Yes' : 'No';
  if (value == null || value === '') return '—';
  if (field.input_type === 'number') { const n = Number(value); return Number.isFinite(n) ? n.toLocaleString('en-PH', { maximumFractionDigits: 10 }) : String(value); }
  return String(value);
}

// Types the type selector may offer when editing a field that already holds values.
export const allowedTypes = (field) => (field?.value_count > 0
  ? FIELD_TYPES.filter((t) => t.value === field.input_type || (TEXTUAL_TYPES.includes(t.value) && TEXTUAL_TYPES.includes(field.input_type)))
  : FIELD_TYPES);

// Light client-side check of dropdown options (the server is authoritative).
export function optionProblem(options) {
  const seen = new Set();
  for (const raw of options) {
    const o = raw.trim();
    if (!o) return 'Dropdown options cannot be empty.';
    if (seen.has(o.toLowerCase())) return `Duplicate option: ${o}`;
    seen.add(o.toLowerCase());
  }
  return options.length ? '' : 'Add at least one dropdown option.';
}
