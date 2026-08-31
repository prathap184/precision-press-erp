// scripts/test_erp_url.js
const axios = require('axios');

async function test() {
  console.log('Testing localhost:3000...');
  try {
    const res1 = await axios.get('http://localhost:3000/api/v1/health', { timeout: 3000 });
    console.log('localhost:3000 responded:', res1.status);
  } catch (e) {
    console.log('localhost:3000 error:', e.message);
  }

  console.log('\nTesting 40.81.236.61:3000...');
  try {
    const res2 = await axios.get('http://40.81.236.61:3000/api/v1/health', { timeout: 3000 });
    console.log('40.81.236.61:3000 responded:', res2.status);
  } catch (e) {
    console.log('40.81.236.61:3000 error:', e.message);
  }
}

test();
