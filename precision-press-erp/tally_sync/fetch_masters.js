/**
 * FETCH MASTERS — Tally Sync Engine
 * ──────────────────────────────────
 * Standalone test script to verify the Tally connection.
 * 
 * Usage: node fetch_masters.js
 * 
 * This script:
 *   1. Sends an Export Data request to Tally on localhost:9000
 *   2. Pulls all Ledgers (Customers, Suppliers, Bank Accounts)
 *   3. Saves the result to masters.json
 */

require('dotenv').config();
const axios = require('axios');
const xml2js = require('xml2js');
const fs = require('fs');
const path = require('path');
const { buildFetchMastersXML } = require('./xml-builder');

const TALLY_URL = process.env.TALLY_URL || 'http://localhost:9000';
const COMPANY_NAME = process.env.TALLY_COMPANY_NAME || 'Hindustan Enterprises';

async function fetchMasters() {
  console.log('');
  console.log('═══════════════════════════════════════════════');
  console.log('  FETCH MASTERS — Tally Connection Test');
  console.log('═══════════════════════════════════════════════');
  console.log(`  Tally URL:    ${TALLY_URL}`);
  console.log(`  Company:      ${COMPANY_NAME}`);
  console.log('═══════════════════════════════════════════════');
  console.log('');

  try {
    // Step 1: Build the Export Data XML
    const xml = buildFetchMastersXML(COMPANY_NAME);
    console.log('📤 Sending Export Data request to Tally...');

    // Step 2: Send to Tally
    const response = await axios.post(TALLY_URL, xml, {
      headers: { 'Content-Type': 'text/xml; charset=utf-8' },
      timeout: 30000,
      responseType: 'text',
    });

    console.log('📥 Received response from Tally!');

    // Step 3: Parse the XML response - save raw first for debugging
    const rawPath = path.join(__dirname, 'raw_masters.xml');
    fs.writeFileSync(rawPath, response.data);
    console.log(`💾 Raw XML saved to: ${rawPath}`);

    // Extract LEDGER entries using regex (more reliable than xml2js for Tally's format)
    const raw = response.data;
    const ledgerRegex = /<LEDGER NAME="([^"]*)"[^>]*>([\s\S]*?)<\/LEDGER>/gi;
    const ledgers = [];
    let match;

    while ((match = ledgerRegex.exec(raw)) !== null) {
      const ledgerName = match[1];
      const ledgerBody = match[2];

      // Extract parent group
      const parentMatch = ledgerBody.match(/<PARENT>([^<]*)<\/PARENT>/i);
      const parent = parentMatch ? parentMatch[1] : '';

      // Extract GSTIN
      const gstMatch = ledgerBody.match(/<PARTYGSTIN>([^<]*)<\/PARTYGSTIN>/i);
      const gstin = gstMatch ? gstMatch[1] : '';

      // Extract state
      const stateMatch = ledgerBody.match(/<LEDSTATENAME>([^<]*)<\/LEDSTATENAME>/i);
      const state = stateMatch ? stateMatch[1] : '';

      // Extract aliases from NAME.LIST
      const aliases = [];
      const nameListMatch = ledgerBody.match(/<NAME\.LIST>([\s\S]*?)<\/NAME\.LIST>/i);
      if (nameListMatch) {
        const nameRegex = /<NAME>([^<]*)<\/NAME>/gi;
        let nameMatch;
        let first = true;
        while ((nameMatch = nameRegex.exec(nameListMatch[1])) !== null) {
          if (first) { first = false; continue; } // Skip first (primary name)
          aliases.push(nameMatch[1]);
        }
      }

      // Extract opening balance
      const balMatch = ledgerBody.match(/<OPENINGBALANCE>([^<]*)<\/OPENINGBALANCE>/i);
      const openingBalance = balMatch ? balMatch[1].trim() : '0';

      // Extract bill-wise flag
      const billMatch = ledgerBody.match(/<ISBILLWISEON>([^<]*)<\/ISBILLWISEON>/i);
      const isBillWise = billMatch ? billMatch[1] : 'No';

      ledgers.push({
        name: ledgerName,
        aliases,
        parent,
        openingBalance,
        gstin,
        state,
        isBillWise,
      });
    }

    // Categorize
    const customers = ledgers.filter(m => m.parent === 'Sundry Debtors');
    const suppliers = ledgers.filter(m => m.parent === 'Sundry Creditors');
    const banks = ledgers.filter(m => m.parent === 'Bank Accounts');
    const cash = ledgers.filter(m => m.parent === 'Cash-in-hand' || m.parent === 'Cash-in-Hand');

    console.log('');
    console.log(`✅ Total Ledgers:    ${ledgers.length}`);
    console.log(`   Customers:        ${customers.length}`);
    console.log(`   Suppliers:        ${suppliers.length}`);
    console.log(`   Bank Accounts:    ${banks.length}`);
    console.log(`   Cash Accounts:    ${cash.length}`);
    console.log('');

    // Print first 10 customers
    if (customers.length > 0) {
      console.log('── Customers (first 10) ──');
      for (const c of customers.slice(0, 10)) {
        const alias = c.aliases.length > 0 ? ` (Alias: ${c.aliases[0]})` : '';
        console.log(`   ${c.name}${alias} | GSTIN: ${c.gstin || 'N/A'}`);
      }
      console.log('');
    }

    // Print bank accounts
    if (banks.length > 0) {
      console.log('── Bank Accounts ──');
      for (const b of banks) {
        console.log(`   ${b.name}`);
      }
      console.log('');
    }

    // Save to file
    const outputPath = path.join(__dirname, 'masters.json');
    fs.writeFileSync(outputPath, JSON.stringify({
      fetchedAt: new Date().toISOString(),
      companyName: COMPANY_NAME,
      totalLedgers: ledgers.length,
      customers,
      suppliers,
      banks,
      cash,
      allLedgers: ledgers,
    }, null, 2));

    console.log(`💾 Saved to: ${outputPath}`);
    console.log('');
    console.log('✅ Tally connection test PASSED!');

  } catch (err) {
    if (err.code === 'ECONNREFUSED') {
      console.error('');
      console.error('❌ Cannot connect to Tally!');
      console.error('   Make sure TallyPrime is running on this computer.');
      console.error(`   Expected URL: ${TALLY_URL}`);
      console.error('');
    } else {
      console.error('❌ Error:', err.message);
    }
    process.exit(1);
  }
}

fetchMasters();
