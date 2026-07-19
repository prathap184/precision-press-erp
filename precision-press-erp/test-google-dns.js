const dns = require('dns');

dns.lookup('google.com', (err, address, family) => {
  console.log('google.com Standard lookup:', err || address);
});
