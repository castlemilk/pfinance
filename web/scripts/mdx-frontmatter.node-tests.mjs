import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { evaluateSync } from '@mdx-js/mdx';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as runtime from 'react/jsx-runtime';
import matter from 'gray-matter';
import { mdxOptions } from '../next.config.mjs';

const blogDirectory = new URL('../content/blog/', import.meta.url);

for (const slug of readdirSync(blogDirectory)) {
  test(`${slug}: compiled article preserves prose without rendering YAML metadata`, () => {
    const source = readFileSync(new URL(`${slug}/index.mdx`, blogDirectory), 'utf8');
    const { data, content } = matter(source);
    const { default: Article } = evaluateSync(source, { ...mdxOptions, ...runtime });
    const html = renderToStaticMarkup(createElement(Article, {
      components: { Callout: ({ children }) => createElement('aside', null, children) },
    }));

    assert.ok(data.title && data.description && data.date, 'metadata remains available to the page loader');
    assert.equal(/(?:title|description|featured|image):/.test(html), false, 'YAML frontmatter must not become visible article content');
    assert.doesNotMatch(html, /<h1\b/, 'the route supplies the single article H1');
    for (const heading of content.matchAll(/^## (.+)$/gm)) {
      // rehype-autolink-headings wraps heading text in a link.
      const text = heading[1].replaceAll('&', '&amp;');
      assert.ok(html.includes(text), `missing editorial heading: ${heading[1]}`);
    }
    assert.match(html, /<aside>/, 'custom MDX callouts still render');
  });
}
