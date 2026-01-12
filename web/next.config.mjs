/** @type {import('next').NextConfig} */
const nextConfig = {
  // Remove standalone output for Vercel
  trailingSlash: true,
  images: {
    // Enable optimized images for server deployment
    domains: ['firebasestorage.googleapis.com'],
  },
  experimental: {
    forceSwcTransforms: true,
  },
  eslint: {
    ignoreDuringBuilds: true, // Ignore ESLint errors during build
  },
  webpack: (config) => {
    // Add alias to resolve .js imports to .ts files for protobuf
    config.resolve.alias = {
      ...config.resolve.alias,
      './finance_service_pb.js': './finance_service_pb.ts',
    };
    return config;
  },
};

export default nextConfig; 