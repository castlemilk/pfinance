import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, Calendar, Clock } from 'lucide-react';
import { getPostBySlug, getAllPosts, getRelatedPosts, formatDate } from '@/lib/blog';
import AuthorCard from '@/components/blog/AuthorCard';
import ShareButtons from '@/components/blog/ShareButtons';
import RelatedPosts from '@/components/blog/RelatedPosts';
import BlogPostImage from '@/components/blog/BlogPostImage';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BlogPostJsonLd, BreadcrumbJsonLd } from '@/components/seo/JsonLd';

interface BlogPostPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const posts = getAllPosts();
  return posts.map((post) => ({
    slug: post.slug,
  }));
}

export async function generateMetadata({
  params,
}: BlogPostPageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://pfinance.app';

  if (!post) {
    return {
      title: 'Post Not Found',
    };
  }

  return {
    title: post.title,
    description: post.description,
    authors: [{ name: post.author.name }],
    alternates: {
      canonical: `/blog/${slug}/`,
    },
    openGraph: {
      title: post.title,
      description: post.description,
      type: 'article',
      publishedTime: post.date,
      authors: [post.author.name],
      images: post.image ? [{ url: post.image, width: 1200, height: 630, alt: post.title }] : [],
      tags: post.tags,
      url: `${siteUrl}/blog/${slug}/`,
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.description,
      images: post.image ? [post.image] : [],
    },
  };
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  if (!post) {
    notFound();
  }

  const relatedPosts = getRelatedPosts(slug, 3);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://pfinance.app';
  const postUrl = `${siteUrl}/blog/${slug}/`;

  // Dynamic import of MDX content
  let MDXContent;
  try {
    const mdxModule = await import(`@/../content/blog/${slug}/index.mdx`);
    MDXContent = mdxModule.default;
  } catch {
    // If MDX import fails, we'll render the raw content
    MDXContent = null;
  }

  return (
    <>
      {/* Structured Data for SEO */}
      <BlogPostJsonLd
        title={post.title}
        description={post.description}
        datePublished={post.date}
        authorName={post.author.name}
        url={postUrl}
        image={post.image}
      />
      <BreadcrumbJsonLd
        items={[
          { name: 'Home', url: siteUrl },
          { name: 'Blog', url: `${siteUrl}/blog/` },
          { name: post.title, url: postUrl },
        ]}
      />

      <article className="py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          {/* Back Link */}
          <Link href="/blog">
            <Button variant="ghost" size="sm" className="mb-8 -ml-2">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Blog
            </Button>
          </Link>

          <div className="max-w-3xl mx-auto">
            {/* Header */}
            <header className="mb-12">
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <Badge variant="secondary">{post.category}</Badge>
                {post.tags.slice(0, 3).map((tag) => (
                  <Badge key={tag} variant="outline" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>

              <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-6">
                {post.title}
              </h1>

              <p className="text-xl text-muted-foreground mb-8">
                {post.description}
              </p>

              <div className="flex flex-wrap items-center justify-between gap-4 py-4 border-y border-border">
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-chart-2 flex items-center justify-center text-sm text-primary-foreground font-medium">
                      {post.author.name.charAt(0)}
                    </div>
                    <span className="text-sm font-medium">{post.author.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Calendar className="w-4 h-4" />
                    <span>{formatDate(post.date)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Clock className="w-4 h-4" />
                    <span>{post.readingTime}</span>
                  </div>
                </div>
                <ShareButtons title={post.title} url={postUrl} />
              </div>
            </header>

            {/* Featured Image */}
            <div className="mb-12 rounded-xl overflow-hidden border border-border">
              {post.image ? (
                <Image
                  src={post.image}
                  alt={post.title}
                  width={1200}
                  height={675}
                  className="w-full aspect-[16/9] object-cover"
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 768px, 1200px"
                  priority
                />
              ) : (
                <BlogPostImage
                  title={post.title}
                  category={post.category}
                  className="w-full aspect-[16/9]"
                />
              )}
            </div>

            {/* Content */}
            <div className="prose prose-lg max-w-none dark:prose-invert">
              {MDXContent ? (
                <MDXContent />
              ) : (
                <div
                  dangerouslySetInnerHTML={{ __html: post.content }}
                  className="[&>h2]:mt-10 [&>h2]:mb-4 [&>h2]:text-3xl [&>h2]:font-bold [&>h2]:tracking-tight [&>h2]:border-b [&>h2]:border-border [&>h2]:pb-2 [&>h3]:mt-8 [&>h3]:mb-3 [&>h3]:text-2xl [&>h3]:font-semibold [&>p]:my-4 [&>p]:leading-7 [&>p]:text-muted-foreground [&>ul]:my-4 [&>ul]:ml-6 [&>ul]:list-disc [&>ul]:space-y-2 [&>ol]:my-4 [&>ol]:ml-6 [&>ol]:list-decimal [&>ol]:space-y-2"
                />
              )}
            </div>

            {/* Author Card */}
            <div className="mt-12 pt-8 border-t border-border">
              <AuthorCard author={post.author} />
            </div>

            {/* CTA Section */}
            <div className="mt-12 p-8 bg-gradient-to-br from-primary/5 to-chart-2/5 rounded-xl text-center">
              <h3 className="text-2xl font-bold mb-3">
                Ready to Take Control of Your Finances?
              </h3>
              <p className="text-muted-foreground mb-6">
                Start tracking your expenses and achieving your financial goals today.
              </p>
              <Link href="/personal/income/">
                <Button variant="terminal" size="lg">
                  Get Started Free
                </Button>
              </Link>
            </div>

            {/* Related Posts */}
            <RelatedPosts posts={relatedPosts} />
          </div>
        </div>
      </article>
    </>
  );
}
