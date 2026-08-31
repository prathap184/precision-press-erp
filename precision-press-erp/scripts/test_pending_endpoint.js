// scripts/test_pending_endpoint.js
require('dotenv').config({ path: 'tally-connector/.env' });
const axios = require('axios');

async function test() {
  const ERP_BASE_URL = process.env.ERP_BASE_URL;
  const CONNECTOR_SECRET = process.env.CONNECTOR_SECRET;

  console.log(`Connecting to ${ERP_BASE_URL}/api/tally/connector/pending...`);
  try {
    const res = await axios.get(`${ERP_BASE_URL}/api/tally/connector/pending`, {
      headers: { 'x-connector-secret': CONNECTOR_SECRET },
      timeout: 10000,
    });
    console.log('Response status:', res.status);
    console.log('Response data:', res.data);
  } catch (err) {
    console.error('Error:', err.message, err.response?.data || '');
  }
}

test();
