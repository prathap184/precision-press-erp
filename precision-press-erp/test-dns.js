const dns = require('dns');

console.log('Default order:');
dns.lookup('cluster0.vpefzw4.mongodb.net', (err, address, family) => {
  console.log('Standard lookup:', err || address);
});

dns.resolveSrv('_mongodb._tcp.cluster0.vpefzw4.mongodb.net', (err, addresses) => {
  console.log('SRV resolve:', err || addresses);
});

dns.resolveTxt('cluster0.vpefzw4.mongodb.net', (err, addresses) => {
  console.log('TXT resolve:', err || addresses);
});
