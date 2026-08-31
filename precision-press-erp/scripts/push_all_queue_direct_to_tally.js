// scripts/push_all_queue_direct_to_tally.js
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: 'tally-connector/.env' });
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const xml2js = require('xml2js');
const {
  buildSalesInvoiceXML,
  buildReceiptVoucherXML,
  buildPaymentVoucherXML,
} = require('../tally-connector/xml-builder');

const TALLY_URL = `${process.env.TALLY_HOST || 'http://localhost'}:${process.env.TALLY_PORT || 9000}`;
const EDUCATIONAL_MODE = (process.env.TALLY_EDUCATIONAL_MODE || 'true').toLowerCase() === 'true';

async function pushAll() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: queue, error } = await supabase
    .from('tally_sync_queue')
    .select('*')
    .neq('status', 'SUCCESS')
    .order('createdAt', { ascending: true });

  if (error || !queue || queue.length === 0) {
    console.log('No pending vouchers to sync!');
    return;
  }

  console.log(`\n🚀 Starting direct sync of ${queue.length} vouchers to TallyPrime...\n`);

  for (const item of queue) {
    console.log(`───────────────────────────────────────────────────────────`);
    console.log(`Processing: [${item.syncType}] ${item.voucherId || item.id} | ₹${item.amountSnap}`);

    let xml = '';
    try {
      if (item.syncType === 'SALES_INVOICE') {
        xml = buildSalesInvoiceXML(item.payload, EDUCATIONAL_MODE);
      } else if (item.syncType === 'RECEIPT_VOUCHER') {
        xml = buildReceiptVoucherXML(item.payload, EDUCATIONAL_MODE);
      } else if (item.syncType === 'PAYMENT_VOUCHER') {
        xml = buildPaymentVoucherXML(item.payload, EDUCATIONAL_MODE);
      } else {
        console.log(`⚠️ Unsupported syncType: ${item.syncType}, skipping.`);
        continue;
      }
    } catch (buildErr) {
      console.error(`❌ XML Generation failed for ${item.id}:`, buildErr.message);
      continue;
    }

    try {
      const res = await axios.post(TALLY_URL, xml, {
        headers: { 'Content-Type': 'application/xml' },
        timeout: 30000,
      });

      const parsed = await xml2js.parseStringPromise(res.data, { explicitArray: false });
      const resp = parsed?.RESPONSE || parsed?.ENVELOPE?.BODY?.IMPORTDATA?.IMPORTRESULT;

      const created = parseInt(resp?.CREATED || '0', 10);
      const altered = parseInt(resp?.ALTERED || '0', 10);
      const errors = parseInt(resp?.ERRORS || '0', 10);
      const exceptions = parseInt(resp?.EXCEPTIONS || '0', 10);
      const lineerror = resp?.LINEERROR || '';

      if ((created + altered) > 0 && errors === 0 && exceptions === 0) {
        console.log(`✅ SUCCESS in Tally: created=${created}, altered=${altered}`);
        await supabase
          .from('tally_sync_queue')
          .update({
            status: 'SUCCESS',
            processedAt: new Date().toISOString(),
            lastError: null,
          })
          .eq('id', item.id);
      } else {
        console.log(`❌ TALLY REJECTED: ${lineerror || `errors=${errors}, exceptions=${exceptions}`}`);
        await supabase
          .from('tally_sync_queue')
          .update({
            status: 'FAILED',
            lastError: lineerror || `errors=${errors}, exceptions=${exceptions}`,
          })
          .eq('id', item.id);
      }
    } catch (postErr) {
      console.error(`❌ HTTP Error:`, postErr.message);
    }
  }

  console.log(`\n🎉 All vouchers processed! Check your Tally Day Book.`);
}

pushAll().catch(console.error);
