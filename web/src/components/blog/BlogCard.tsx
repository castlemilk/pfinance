import Link from 'next/link';
import { Calendar, Clock, ArrowRight } from 'lucide-react';
import { BlogPostMeta, formatDate } from '@/lib/blog';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import BlogPostImage from './BlogPostImage';

interface BlogCardProps {
  post: BlogPostMeta;
  featured?: boolean;
}

export default function BlogCard({ post, featured = false }: BlogCardProps) {
  return (
    <article
      className={cn(
        'group relative bg-card border border-border/50 rounded-xl overflow-hidden',
        'hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300',
        featured && 'md:col-span-2 md:grid md:grid-cols-2 md:gap-6'
      )}
    >
      {/* Image */}
      {post.image ? (
        <div
          className={cn(
            'relative overflow-hidden bg-muted',
            featured ? 'aspect-[4/3] md:aspect-auto md:h-full' : 'aspect-[16/9]'
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={post.image}
            alt={post.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        </div>
      ) : (
        <div
          className={cn(
            'relative overflow-hidden',
            featured ? 'aspect-[4/3] md:aspect-auto md:h-full' : 'aspect-[16/9]'
          )}
        >
          <BlogPostImage
            title={post.title}
            category={post.category}
            className="w-full h-full group-hover:scale-105 transition-transform duration-500"
          />
        </div>
      )}

      {/* Content */}
      <div className="p-6">
        {/* Category & Date */}
        <div className="flex items-center gap-3 mb-3">
          <Badge variant="secondary" className="text-xs">
            {post.category}
          </Badge>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="w-3 h-3" />
            <span>{formatDate(post.date)}</span>
          </div>
        </div>

        {/* Title */}
        <h3
          className={cn(
            'font-bold tracking-tight mb-2 group-hover:text-primary transition-colors',
            featured ? 'text-2xl' : 'text-lg'
          )}
        >
          <Link href={`/blog/${post.slug}`} className="after:absolute after:inset-0">
            {post.title}
          </Link>
        </h3>

        {/* Description */}
        <p
          className={cn(
            'text-muted-foreground mb-4 line-clamp-2',
            featured ? 'text-base' : 'text-sm'
          )}
        >
          {post.description}
        </p>

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 border-t border-border/50">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary to-chart-2 flex items-center justify-center text-xs text-primary-foreground font-medium">
              {post.author.name.charAt(0)}
            </div>
            <span className="text-sm text-muted-foreground">{post.author.name}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />
            <span>{post.readingTime}</span>
          </div>
        </div>

        {/* Read More Arrow */}
        <div className="absolute bottom-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity">
          <ArrowRight className="w-5 h-5 text-primary" />
        </div>
      </div>
    </article>
  );
}
