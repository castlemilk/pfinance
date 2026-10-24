import type { ComponentPropsWithoutRef } from 'react';

/** Keep wide Markdown tables inside the article column and keyboard-scrollable. */
export function ArticleTable({ className, ...props }: ComponentPropsWithoutRef<'table'>) {
  return (
    <div
      role="region"
      aria-label="Article table"
      tabIndex={0}
      className="my-6 w-full min-w-0 max-w-full overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <table className={`w-full border-collapse break-normal ${className ?? ''}`} {...props} />
    </div>
  );
}
