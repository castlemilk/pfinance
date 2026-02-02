import createMDX from '@next/mdx';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Configure pageExtensions to include MDX files
  pageExtensions: ['js', 'jsx', 'md', 'mdx', 'ts', 'tsx'],

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

const withMDX = createMDX({
  options: {
    remarkPlugins: [remarkGfm],
    rehypePlugins: [
      rehypeSlug,
      [rehypeAutolinkHeadings, { behavior: 'wrap' }],
    ],
  },
});

export default withMDX(nextConfig);
