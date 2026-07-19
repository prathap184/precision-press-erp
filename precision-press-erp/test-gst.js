const API_KEY = "key_live_071080bf9fd644da8ea337e0eb5a598d";
const API_SECRET = "secret_live_09988fe58cb44f65958d057b26d2962f";
const API_VERSION = "1.0";
const gstin = "27AAACR4849R1ZL";

async function run() {
  const authResponse = await fetch(`https://api.sandbox.co.in/authenticate`, {
    method: 'POST',
    headers: {
      'x-api-key': API_KEY,
      'x-api-secret': API_SECRET,
      'x-api-version': API_VERSION,
      'Content-Type': 'application/json',
    },
  });

  const authData = await authResponse.json();
  const accessToken = authData?.data?.access_token;

  if (!accessToken) {
    console.log("No token", authData);
    return;
  }

  const verifyResponse = await fetch(`https://api.sandbox.co.in/gst/compliance/public/gstin/search`, {
    method: 'POST',
    headers: {
      'x-api-key': API_KEY,
      'authorization': accessToken,
      'x-api-version': API_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ gstin }),
  });

  const verifyData = await verifyResponse.json();
  console.log("Response:", JSON.stringify(verifyData, null, 2));
}

run();
