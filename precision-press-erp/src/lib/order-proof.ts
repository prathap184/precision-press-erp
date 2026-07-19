import { Order } from '@/types/models';

export function getDeliveryProofMeta(order?: Order | null) {
  return order?.deliveryProof || order?.workflow?.deliveryProof || null;
}

export function isValidDeliveryProofUrl(url?: string | null) {
  if (!url) return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (/^file:\/\//i.test(trimmed)) return false;
  if (/^https?:\/\//i.test(trimmed)) return true;
  if (/^blob:\/\//i.test(trimmed)) return true;
  if (/^data:image\//i.test(trimmed)) return true;
  return false;
}

export function getDeliveryProofUrl(order?: Order | null) {
  const url = getDeliveryProofMeta(order)?.url || null;
  return isValidDeliveryProofUrl(url) ? url : null;
}

export function hasDeliveryProof(order?: Order | null) {
  return Boolean(getDeliveryProofUrl(order));
}

export function getDeliveryProofWarning(order?: Order | null) {
  const meta = getDeliveryProofMeta(order);
  if (!meta?.url) return null;
  if (isValidDeliveryProofUrl(meta.url)) return null;
  return 'Delivery proof is stored as a local file path and cannot be displayed in the browser. Upload a new proof image to replace it.';
}
