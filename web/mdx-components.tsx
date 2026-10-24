import type { MDXComponents } from 'mdx/types';
import Link from 'next/link';
import { articleFigureComponents } from '@/components/mdx/article-figures';
import { ArticleTable } from '@/components/mdx/article-table';

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    // Override default HTML elements with styled versions
    h1: ({ children, ...props }) => (
      <h2
        className="mt-10 mb-4 text-3xl font-bold tracking-tight scroll-mt-24 border-b border-border pb-2"
        {...props}
      >
        {children}
      </h2>
    ),
    h2: ({ children, ...props }) => (
      <h2
        className="mt-10 mb-4 text-3xl font-bold tracking-tight scroll-mt-24 border-b border-border pb-2"
        {...props}
      >
        {children}
      </h2>
    ),
    h3: ({ children, ...props }) => (
      <h3
        className="mt-8 mb-3 text-2xl font-semibold tracking-tight scroll-mt-24"
        {...props}
      >
        {children}
      </h3>
    ),
    h4: ({ children, ...props }) => (
      <h4
        className="mt-6 mb-2 text-xl font-semibold tracking-tight scroll-mt-24"
        {...props}
      >
        {children}
      </h4>
    ),
    p: ({ children, ...props }) => (
      <p className="my-4 leading-7 text-muted-foreground" {...props}>
        {children}
      </p>
    ),
    a: ({ href, children, ...props }) => {
      const isExternal = href?.startsWith('http');
      if (isExternal) {
        return (
          <a
            href={href}
            className="text-primary hover:text-primary/80 underline underline-offset-4 transition-colors"
            target="_blank"
            rel="noopener noreferrer"
            {...props}
          >
            {children}
          </a>
        );
      }
      return (
        <Link
          href={href || '#'}
          className="text-primary hover:text-primary/80 underline underline-offset-4 transition-colors"
          {...props}
        >
          {children}
        </Link>
      );
    },
    ul: ({ children, ...props }) => (
      <ul className="my-4 ml-6 list-disc space-y-2 [&>li]:pl-1" {...props}>
        {children}
      </ul>
    ),
    ol: ({ children, ...props }) => (
      <ol className="my-4 ml-6 list-decimal space-y-2 [&>li]:pl-1" {...props}>
        {children}
      </ol>
    ),
    li: ({ children, ...props }) => (
      <li className="leading-7 text-muted-foreground" {...props}>
        {children}
      </li>
    ),
    blockquote: ({ children, ...props }) => (
      <blockquote
        className="my-6 border-l-4 border-primary/50 pl-6 italic text-muted-foreground"
        {...props}
      >
        {children}
      </blockquote>
    ),
    code: ({ children, ...props }) => (
      <code
        className="relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm"
        {...props}
      >
        {children}
      </code>
    ),
    pre: ({ children, ...props }) => (
      <pre
        className="my-6 overflow-x-auto rounded-lg bg-muted p-4 font-mono text-sm"
        {...props}
      >
        {children}
      </pre>
    ),
    table: ArticleTable,
    th: ({ children, ...props }) => (
      <th
        className="border border-border bg-muted px-4 py-2 text-left font-semibold"
        {...props}
      >
        {children}
      </th>
    ),
    td: ({ children, ...props }) => (
      <td className="border border-border px-4 py-2" {...props}>
        {children}
      </td>
    ),
    hr: (props) => <hr className="my-8 border-border" {...props} />,
    img: (props) => (
      // eslint-disable-next-line @next/next/no-img-element
      <img className="my-6 rounded-lg border border-border" alt="" {...props} />
    ),
    // Rich article figure components (Callout, Quote, Steps, GraphStat, GraphRank, GraphWaterfall, GraphFlow, GraphTimeline, GraphCompare, GraphSlope, GraphKpi, GraphSpark, GraphMeter, GraphTable)
    ...articleFigureComponents,
    ...components,
  };
}
