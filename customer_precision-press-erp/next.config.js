/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  images: {
    domains: ['firebasestorage.googleapis.com'],
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      'firebase/firestore': path.resolve(__dirname, 'src/lib/supabase-firestore-shim.ts'),
    };
    // Allow importing from @hindustan/shared subpaths
    config.resolve.modules = [
      ...(config.resolve.modules || []),
      path.resolve(__dirname, '../'),
    ];
    return config;
  },
};

module.exports = nextConfig;
