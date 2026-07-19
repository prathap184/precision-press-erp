const dns = require('dns');

console.log('Trying with default DNS servers...');
dns.resolveSrv('_mongodb._tcp.cluster0.vpefzw4.mongodb.net', (err, addresses) => {
  console.log('Default SRV resolve:', err || addresses);
});

console.log('Setting DNS servers to 8.8.8.8, 1.1.1.1...');
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
  dns.resolveSrv('_mongodb._tcp.cluster0.vpefzw4.mongodb.net', (err, addresses) => {
    console.log('Custom DNS SRV resolve:', err || addresses);
  });
} catch (e) {
  console.error('Failed to set DNS servers:', e);
}
