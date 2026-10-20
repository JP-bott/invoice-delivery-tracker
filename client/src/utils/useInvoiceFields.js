import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';

// Active custom invoice fields, as configured in Settings. Call reload() to pick up changes made elsewhere.
export function useInvoiceFields(onError) {
  const [fields, setFields] = useState([]);
  const reload = useCallback(() => api('/api/invoice-fields').then(setFields).catch((e) => onError?.(e)), [onError]);
  useEffect(() => { reload(); }, [reload]);
  return { fields, reload };
}
