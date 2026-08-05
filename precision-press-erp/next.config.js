/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    domains: ['firebasestorage.googleapis.com'],
  },
  experimental: {
    serverComponentsExternalPackages: ['undici', 'sharp'],
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      'firebase/firestore': path.resolve(__dirname, 'src/lib/supabase-firestore-shim.ts'),
    };
    config.resolve.modules = [
      ...(config.resolve.modules || []),
      path.resolve(__dirname, '../'),
    ];
    return config;
  },
  async redirects() {
    const routes = [
      'settings',
      'contacts',
      'crm',
      'documents',
      'inventory',
      'payroll',
      'projects',
      'teams',
      'accounts',
      'journals',
      'ledger',
      'sales',
      'purchases',
      'banking',
      'reports',
      'tax',
    ];

    const redirectList = [];
    for (const r of routes) {
      redirectList.push({
        source: `/${r}`,
        destination: `/accounting/${r}`,
        permanent: false,
      });
      redirectList.push({
        source: `/${r}/:path*`,
        destination: `/accounting/${r}/:path*`,
        permanent: false,
      });
    }
    return redirectList;
  },
};

module.exports = nextConfig;
