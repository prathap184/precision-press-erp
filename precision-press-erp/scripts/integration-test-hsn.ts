import { HSNService } from '../src/services/hsnService';
import { supabase } from '../src/lib/supabase';

// Basic assert function
function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`[ASSERT FAILED] ${message}`);
  }
}

async function runHSNIntegrationTests() {
  console.log('--- Starting HSN Integration Tests ---');
  const testHSNCode = '99999999';
  const testUserId = 'test-audit-user';

  try {
    // Cleanup any previous run
    await supabase.from('hsn_master').delete().eq('hsn_code', testHSNCode);

    // 1. Create HSN & initial GST history entry
    console.log('1. Creating HSN...');
    await HSNService.createHSN(testHSNCode, 'Test HSN Product', 18.00, '2026-01-01', testUserId);
    console.log('✅ HSN Created successfully.');

    // 2. Prevent overlapping effective dates / Invalid dates
    console.log('2. Testing overlapping/invalid date protection...');
    let caughtDateError = false;
    try {
      await HSNService.addNewGSTRate(
        // we need the ID of the HSN code first
        (await getHsnId(testHSNCode)), 
        12.00, 
        '2025-12-31', // earlier than current active rate (2026-01-01)
        testUserId
      );
    } catch (err: any) {
      caughtDateError = true;
      assert(err.message.includes('must be later than current'), 'Expected specific date error message.');
    }
    assert(caughtDateError, 'System should reject older effective dates to protect history.');
    console.log('✅ Overlapping/Invalid date prevented.');

    // Add a valid new rate
    console.log('3. Testing valid new rate (GST History)...');
    const hsnId = await getHsnId(testHSNCode);
    await HSNService.addNewGSTRate(hsnId, 12.00, '2026-06-01', testUserId);
    const history = await HSNService.getHSNHistory(hsnId);
    assert(history.length === 2, 'History should have 2 entries.');
    assert(history[0].gst_rate === 12.00, 'Latest rate should be 12%.');
    assert(history[0].effective_to === null, 'Latest rate should be active.');
    assert(history[1].gst_rate === 18.00, 'Old rate should be 18%.');
    assert(history[1].effective_to === '2026-06-01', 'Old rate should be retired on the new effective date.');
    console.log('✅ GST History updated and preserved successfully.');

    // 4. Search by HSN / Description
    console.log('4. Testing search functionality...');
    const searchResult = await HSNService.searchHSNs('9999');
    assert(searchResult.some(r => r.hsn_code === testHSNCode), 'Should find HSN by code prefix.');
    const searchResultDesc = await HSNService.searchHSNs('Test HSN');
    assert(searchResultDesc.some(r => r.hsn_code === testHSNCode), 'Should find HSN by description.');
    console.log('✅ Search logic verified.');

    // 5. Disable HSN
    console.log('5. Testing disable HSN (Soft Delete)...');
    await HSNService.disableHSN(hsnId, testHSNCode, testUserId, 'Test disable');
    
    // Verify it doesn't appear in active list (used by product autocomplete)
    const activeList = await HSNService.getActiveHSNs();
    assert(!activeList.some(r => r.hsn_code === testHSNCode), 'Disabled HSN should not appear in active HSN list.');
    console.log('✅ Disabled HSN removed from active product autocomplete list.');

    // 6. Verify history remains accessible
    console.log('6. Testing history accessibility for disabled HSNs...');
    const searchDisabled = await HSNService.searchHSNs(testHSNCode);
    assert(searchDisabled.length === 1, 'Should still be able to search for a disabled HSN.');
    assert(searchDisabled[0].is_active === false, 'Should be marked as inactive.');
    const disabledHistory = await HSNService.getHSNHistory(hsnId);
    assert(disabledHistory.length === 2, 'Disabled HSN should retain full GST history.');
    console.log('✅ Disabled history retained completely.');

    console.log('--- All HSN Integration Tests PASSED ---');

  } catch (error: any) {
    console.error('❌ TEST FAILED:', error.message || error);
    process.exit(1);
  } finally {
    // Cleanup
    await supabase.from('hsn_master').delete().eq('hsn_code', testHSNCode);
  }
}

async function getHsnId(code: string): Promise<string> {
  const { data } = await supabase.from('hsn_master').select('id').eq('hsn_code', code).single();
  if (!data) throw new Error('Could not find HSN code.');
  return data.id;
}

runHSNIntegrationTests();
