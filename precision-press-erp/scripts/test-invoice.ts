import { generateInvoiceForGroup } from '@/lib/actions/documents';
generateInvoiceForGroup('ORD-341738').then(res => console.log(JSON.stringify(res, null, 2))).catch(console.error);
