import { Metadata } from 'next';
import { getAllPosts, getFeaturedPosts } from '@/lib/blog';
import BlogHeader from '@/components/blog/BlogHeader';
import BlogCard from '@/components/blog/BlogCard';

export const metadata: Metadata = {
  title: 'Blog - Personal Finance Tips & Guides',
  description: 'Learn how to manage your money better with our expert guides on budgeting, saving, investing, and more.',
  openGraph: {
    title: 'PFinance Blog - Personal Finance Tips & Guides',
    description: 'Learn how to manage your money better with our expert guides on budgeting, saving, investing, and more.',
  },
};

export default function BlogPage() {
  const allPosts = getAllPosts();
  const featuredPosts = getFeaturedPosts();
  const regularPosts = allPosts.filter((post) => !post.featured);

  // If no posts yet, show a coming soon message
  if (allPosts.length === 0) {
    return (
      <>
        <BlogHeader />
        <section className="py-16">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center py-16 bg-muted/30 rounded-xl">
              <span className="text-6xl mb-4 block">📝</span>
              <h2 className="text-2xl font-bold mb-2">Coming Soon</h2>
              <p className="text-muted-foreground">
                We&apos;re working on some great content. Check back soon!
              </p>
            </div>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <BlogHeader />

      <section className="py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          {/* Featured Posts */}
          {featuredPosts.length > 0 && (
            <div className="mb-16">
              <h2 className="text-2xl font-bold mb-6">Featured</h2>
              <div className="grid md:grid-cols-2 gap-6">
                {featuredPosts.slice(0, 2).map((post) => (
                  <BlogCard key={post.slug} post={post} featured />
                ))}
              </div>
            </div>
          )}

          {/* All Posts */}
          <div>
            <h2 className="text-2xl font-bold mb-6">All Articles</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {(featuredPosts.length > 0 ? regularPosts : allPosts).map((post) => (
                <BlogCard key={post.slug} post={post} />
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
