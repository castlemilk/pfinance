import { BlogPostMeta } from '@/lib/blog';

interface AuthorCardProps {
  author: BlogPostMeta['author'];
}

export default function AuthorCard({ author }: AuthorCardProps) {
  return (
    <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-chart-2 flex items-center justify-center text-lg text-primary-foreground font-semibold">
        {author.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={author.avatar}
            alt={author.name}
            className="w-full h-full rounded-full object-cover"
          />
        ) : (
          author.name.charAt(0)
        )}
      </div>
      <div>
        <p className="font-semibold">{author.name}</p>
        <p className="text-sm text-muted-foreground">Author</p>
      </div>
    </div>
  );
}
