import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import readingTime from 'reading-time';

const BLOG_DIR = path.join(process.cwd(), 'content', 'blog');

export interface BlogPostMeta {
  slug: string;
  title: string;
  description: string;
  date: string;
  author: {
    name: string;
    avatar?: string;
  };
  category: string;
  tags: string[];
  image?: string;
  readingTime: string;
  featured?: boolean;
}

export interface BlogPost extends BlogPostMeta {
  content: string;
}

function getPostFiles(): string[] {
  if (!fs.existsSync(BLOG_DIR)) {
    return [];
  }
  return fs.readdirSync(BLOG_DIR).filter((file) => {
    const filePath = path.join(BLOG_DIR, file);
    return fs.statSync(filePath).isDirectory();
  });
}

export function getPostBySlug(slug: string): BlogPost | null {
  const fullPath = path.join(BLOG_DIR, slug, 'index.mdx');

  if (!fs.existsSync(fullPath)) {
    return null;
  }

  const fileContents = fs.readFileSync(fullPath, 'utf8');
  const { data, content } = matter(fileContents);
  const readTime = readingTime(content);

  return {
    slug,
    title: data.title || '',
    description: data.description || '',
    date: data.date || '',
    author: data.author || { name: 'PFinance Team' },
    category: data.category || 'General',
    tags: data.tags || [],
    image: data.image,
    featured: data.featured || false,
    readingTime: readTime.text,
    content,
  };
}

export function getAllPosts(): BlogPostMeta[] {
  const slugs = getPostFiles();

  const posts = slugs
    .map((slug) => getPostBySlug(slug))
    .filter((post): post is BlogPost => post !== null)
    .map(({ content, ...meta }) => meta) // Remove content for listing
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return posts;
}

export function getFeaturedPosts(): BlogPostMeta[] {
  return getAllPosts().filter((post) => post.featured);
}

export function getPostsByCategory(category: string): BlogPostMeta[] {
  return getAllPosts().filter(
    (post) => post.category.toLowerCase() === category.toLowerCase()
  );
}

export function getPostsByTag(tag: string): BlogPostMeta[] {
  return getAllPosts().filter((post) =>
    post.tags.map((t) => t.toLowerCase()).includes(tag.toLowerCase())
  );
}

export function getRelatedPosts(
  currentSlug: string,
  limit = 3
): BlogPostMeta[] {
  const currentPost = getPostBySlug(currentSlug);
  if (!currentPost) return [];

  const allPosts = getAllPosts().filter((post) => post.slug !== currentSlug);

  // Score posts by relevance (shared tags and category)
  const scoredPosts = allPosts.map((post) => {
    let score = 0;

    // Category match
    if (post.category === currentPost.category) {
      score += 3;
    }

    // Tag matches
    const sharedTags = post.tags.filter((tag) =>
      currentPost.tags.includes(tag)
    );
    score += sharedTags.length;

    return { post, score };
  });

  // Sort by score and return top matches
  return scoredPosts
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.post);
}

export function getAllCategories(): string[] {
  const posts = getAllPosts();
  const categories = new Set(posts.map((post) => post.category));
  return Array.from(categories).sort();
}

export function getAllTags(): string[] {
  const posts = getAllPosts();
  const tags = new Set(posts.flatMap((post) => post.tags));
  return Array.from(tags).sort();
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
