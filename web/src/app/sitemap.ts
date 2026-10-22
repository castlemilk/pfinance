import { MetadataRoute } from 'next';
import { getAllPosts } from '@/lib/blog';
import { discoveryPages } from '@/lib/marketing-pages';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://pfinance.dev').replace(/\/$/, '');

  const staticPages: MetadataRoute.Sitemap = [
    { url: `${baseUrl}/tools/super-calculator`, changeFrequency: 'monthly', priority: 0.85 },
    {
      url: baseUrl,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${baseUrl}/blog`,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/privacy`,
      changeFrequency: 'yearly',
      priority: 0.4,
    },
    {
      url: `${baseUrl}/terms`,
      changeFrequency: 'yearly',
      priority: 0.4,
    },
  ];

  const discoverySitemapPages: MetadataRoute.Sitemap = discoveryPages.map((page) => ({
    url: `${baseUrl}${page.path}`,
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));

  // Blog posts
  const posts = getAllPosts();
  const blogPages: MetadataRoute.Sitemap = posts.map((post) => ({
    url: `${baseUrl}/blog/${post.slug}`,
    lastModified: new Date(post.date),
    changeFrequency: 'monthly',
    priority: 0.7,
  }));

  // Static pages have no maintained content date; omitting lastmod is more
  // accurate than claiming every deployment changed their content.
  return [...staticPages, ...discoverySitemapPages, ...blogPages].map((entry) => ({
    ...entry,
    url: entry.url.endsWith('/') ? entry.url : `${entry.url}/`,
  }));
}
