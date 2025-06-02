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
};

export default nextConfig; 