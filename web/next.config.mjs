/** @type {import('next').NextConfig} */
const nextConfig = {
  // Remove standalone output for Vercel
  trailingSlash: true,
  images: {
    // Enable optimized images for server deployment
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
      },
    ],
  },
  experimental: {
    forceSwcTransforms: true,
  },
  // Turbopack config (Next.js 16+ default bundler)
  turbopack: {
    resolveAlias: {
      './finance_service_pb.js': './finance_service_pb.ts',
    },
  },
  // Keep webpack config for production builds
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