import { BlogPostMeta } from '@/lib/blog';
import BlogCard from './BlogCard';

interface RelatedPostsProps {
  posts: BlogPostMeta[];
}

export default function RelatedPosts({ posts }: RelatedPostsProps) {
  if (posts.length === 0) return null;

  return (
    <section className="mt-16 pt-16 border-t border-border">
      <h2 className="text-2xl font-bold mb-8">Related Articles</h2>
      <div className="grid md:grid-cols-3 gap-6">
        {posts.map((post) => (
          <BlogCard key={post.slug} post={post} />
        ))}
      </div>
    </section>
  );
}
