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

// Mirrors slugifyHeading in web/src/lib/blog.ts (github-slugger semantics:
// punctuation stripped, each whitespace char becomes its own hyphen).
const slugifyHeading = (text) =>
  text
    .toLowerCase()
    .replace(/[`*_~]/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s/g, '-');

const extractTocIds = (markdown) =>
  [...markdown.matchAll(/^(#{2,3})\s+(.+)$/gm)]
    .map((m) => slugifyHeading(m[2].trim()))
    .filter(Boolean);

// Lightweight server-compatible stand-ins for figure tags in raw node --test
// (so scripts/mdx-frontmatter.node-tests.mjs runs without a TS loader).
const figureStub = (tag) => ({ title, corner, children, ...props }) =>
  createElement(
    tag,
    { 'data-article-figure': true, 'data-title': title, 'data-corner': corner },
    title ? createElement('figcaption', null, title) : null,
    children ?? JSON.stringify(props)
  );

const mdxTestComponents = {
  Callout: ({ children, title }) => createElement('aside', { 'data-article-callout': true }, title, children),
  Quote: figureStub('figure'),
  Steps: figureStub('figure'),
  GraphStat: figureStub('figure'),
  GraphKpi: figureStub('figure'),
  GraphSlope: figureStub('figure'),
  GraphRank: figureStub('figure'),
  GraphTimeline: figureStub('figure'),
  GraphTable: figureStub('figure'),
  GraphSpark: figureStub('figure'),
  GraphMeter: figureStub('figure'),
  GraphWaterfall: figureStub('figure'),
  GraphCompare: figureStub('figure'),
  GraphFlow: figureStub('figure'),
};

for (const slug of readdirSync(blogDirectory)) {
  test(`${slug}: compiled article preserves prose without rendering YAML metadata`, () => {
    const source = readFileSync(new URL(`${slug}/index.mdx`, blogDirectory), 'utf8');
    const { data, content } = matter(source);
    const { default: Article } = evaluateSync(source, { ...mdxOptions, ...runtime });
    const html = renderToStaticMarkup(createElement(Article, {
      components: mdxTestComponents,
    }));

    assert.ok(data.title && data.description && data.date, 'metadata remains available to the page loader');
    assert.equal(/(?:title|description|featured|image):/.test(html), false, 'YAML frontmatter must not become visible article content');
    assert.doesNotMatch(html, /<h1\b/, 'the route supplies the single article H1');
    for (const heading of content.matchAll(/^## (.+)$/gm)) {
      // rehype-autolink-headings wraps heading text in a link.
      const text = heading[1].replaceAll('&', '&amp;');
      assert.ok(html.includes(text), `missing editorial heading: ${heading[1]}`);
    }
    assert.match(html, /<aside\b/, 'custom MDX callouts still render');
    assert.match(html, /data-article-figure/, 'each article includes at least one structured MDX figure/diagram');
    for (const id of extractTocIds(content)) {
      assert.ok(html.includes(`id="${id}"`), `TOC anchor id="${id}" must match a rendered heading id`);
    }
  });
}
