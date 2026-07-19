/**
 * Shared utility formatters — used by both ERP and Customer Portal.
 */

/** Format a number as Indian Rupees */
export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(amount);
};

/** Format a date as DD/MM/YYYY */
export const formatDate = (date: Date | string | null | undefined): string => {
  if (!date) return '—';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

/** Format a date as DD MMM YYYY (e.g. 27 Jun 2026) */
export const formatDateLong = (date: Date | string | null | undefined): string => {
  if (!date) return '—';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

/** Format a date with time */
export const formatDateTime = (date: Date | string | null | undefined): string => {
  if (!date) return '—';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

/** Truncate a string to maxLength, appending "..." */
export const truncate = (str: string, maxLength: number): string => {
  if (!str) return '';
  return str.length > maxLength ? str.slice(0, maxLength) + '...' : str;
};

/** Format phone number with country code */
export const formatPhone = (phone: string | undefined): string => {
  if (!phone) return '—';
  return phone.startsWith('+91') ? phone : `+91 ${phone}`;
};

/** Format square feet */
export const formatSqft = (sqft: number): string => {
  return `${sqft.toFixed(2)} sq.ft`;
};

/** Get initials from a name */
export const getInitials = (name: string): string => {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
};
