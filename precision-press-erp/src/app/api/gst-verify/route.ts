import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { gstin } = await request.json();

    if (!gstin || gstin.length !== 15) {
      return NextResponse.json({ error: 'Invalid GSTIN format' }, { status: 400 });
    }

    const API_KEY = process.env.SANDBOX_API_KEY;
    const API_SECRET = process.env.SANDBOX_API_SECRET;
    const API_VERSION = process.env.SANDBOX_API_VERSION || '1.0';

    if (!API_KEY || !API_SECRET) {
      console.error('Sandbox API keys missing from environment variables');
      return NextResponse.json({ error: 'Verification service is currently unavailable.' }, { status: 503 });
    }

    // Determine environment URL based on key prefix
    const isTest = API_KEY.startsWith('key_test');
    const baseUrl = isTest ? 'https://test-api.sandbox.co.in' : 'https://api.sandbox.co.in';

    // Step 1: Authenticate and get Access Token
    const authResponse = await fetch(`${baseUrl}/authenticate`, {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY,
        'x-api-secret': API_SECRET,
        'x-api-version': API_VERSION,
        'Content-Type': 'application/json',
      },
    });

    if (!authResponse.ok) {
      const authErr = await authResponse.text();
      console.error('Sandbox Auth Error:', authErr);
      return NextResponse.json({ error: 'Failed to authenticate with verification service.' }, { status: 500 });
    }

    const authData = await authResponse.json();
    const accessToken = authData?.data?.access_token;

    if (!accessToken) {
      return NextResponse.json({ error: 'Failed to retrieve access token.' }, { status: 500 });
    }

    // Step 2: Fetch GSTIN Details
    const verifyResponse = await fetch(`${baseUrl}/gst/compliance/public/gstin/search`, {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY,
        'authorization': accessToken,
        'x-api-version': API_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ gstin }),
    });

    if (!verifyResponse.ok) {
      const verifyErr = await verifyResponse.text();
      console.error('Sandbox Verify Error:', verifyErr);
      return NextResponse.json({ error: 'Failed to verify GSTIN. It may be invalid or not found.' }, { status: 404 });
    }

    const verifyData = await verifyResponse.json();
    
    // Sandbox typically returns the GST details inside the `data` object
    if (verifyData.code !== 200 || !verifyData.data) {
      return NextResponse.json({ error: verifyData.message || 'GSTIN not found or inactive.' }, { status: 404 });
    }

    // Parse out useful fields to send back to the client
    const gstData = verifyData.data?.data || verifyData.data;
    
    // Address fields can be nested differently based on Sandbox's response schema
    // Commonly: gstData.pradr.addr (Principal Address)
    let addressStr = '';
    if (gstData.pradr && gstData.pradr.addr) {
      const a = gstData.pradr.addr;
      const parts = [a.bno, a.bnm, a.st, a.loc, a.dst, a.stcd, a.pncd].filter(Boolean);
      addressStr = parts.join(', ');
    } else if (gstData.address) {
      addressStr = gstData.address;
    }

    return NextResponse.json({
      success: true,
      data: {
        legalName: gstData.lgnm || gstData.legal_name || gstData.legalName || '',
        tradeName: gstData.tradeNam || gstData.trade_name || gstData.tradeName || '',
        status: gstData.sts || gstData.status || '',
        registrationDate: gstData.rgdt || gstData.registration_date || gstData.registrationDate || '',
        constitution: gstData.ctb || gstData.constitution_of_business || gstData.businessConstitution || '',
        taxpayerType: gstData.dty || gstData.taxpayer_type || gstData.taxpayerType || '',
        jurisdictionState: gstData.stj || gstData.stjCd || gstData.stateJurisdiction || '',
        jurisdictionCenter: gstData.ctj || gstData.ctjCd || gstData.centerJurisdiction || '',
        address: addressStr || gstData.principalAddress || '',
        raw: verifyData.data // Include raw data for debugging or more fields if needed
      }
    });

  } catch (error: any) {
    console.error('GST Verification Exception:', error);
    return NextResponse.json({ error: 'Internal Server Error during verification' }, { status: 500 });
  }
}
