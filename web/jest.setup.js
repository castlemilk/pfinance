// Add custom jest matchers from testing-library
import '@testing-library/jest-dom';

// Polyfill TextEncoder/TextDecoder for Node.js (required by @bufbuild/protobuf v2)
import { TextEncoder, TextDecoder } from 'util';
if (typeof globalThis.TextEncoder === 'undefined') {
  globalThis.TextEncoder = TextEncoder;
}
if (typeof globalThis.TextDecoder === 'undefined') {
  globalThis.TextDecoder = TextDecoder;
}

// Polyfill structuredClone for jsdom (required by ai SDK generateText)
// Node 22 has structuredClone natively but jsdom may not expose it
if (typeof globalThis.structuredClone === 'undefined') {
  const { structuredClone: nodeStructuredClone } = require('node:util');
  if (nodeStructuredClone) {
    globalThis.structuredClone = nodeStructuredClone;
  } else {
    // Fallback that handles BigInt via v8 serialize/deserialize
    const v8 = require('v8');
    globalThis.structuredClone = (val) => v8.deserialize(v8.serialize(val));
  }
}

// Polyfill Web Streams API for jsdom (required by ai SDK / eventsource-parser)
const streams = require('stream/web');
if (typeof globalThis.TransformStream === 'undefined') {
  globalThis.TransformStream = streams.TransformStream;
}
if (typeof globalThis.ReadableStream === 'undefined') {
  globalThis.ReadableStream = streams.ReadableStream;
}
if (typeof globalThis.WritableStream === 'undefined') {
  globalThis.WritableStream = streams.WritableStream;
}

// Polyfill fetch for Node.js test environment
// OpenAI client requires fetch to be available globally
if (typeof globalThis.fetch === 'undefined') {
  // Create a minimal fetch implementation that satisfies OpenAI client requirements
  globalThis.fetch = async (url, options) => {
    const response = {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({}),
      text: async () => '',
      blob: async () => new Blob(),
      arrayBuffer: async () => new ArrayBuffer(0),
      headers: new Headers(),
      url: typeof url === 'string' ? url : url.toString(),
      clone: function() { return this; },
      redirected: false,
      type: 'default',
      body: null,
      bodyUsed: false,
    };
    return response;
  };
  
  // Also ensure Headers is available
  if (typeof globalThis.Headers === 'undefined') {
    globalThis.Headers = class Headers {
      constructor() {
        this.headers = new Map();
      }
      get(name) { return this.headers.get(name.toLowerCase()) || null; }
      set(name, value) { this.headers.set(name.toLowerCase(), value); }
      has(name) { return this.headers.has(name.toLowerCase()); }
      delete(name) { this.headers.delete(name.toLowerCase()); }
      forEach(callback) {
        this.headers.forEach((value, key) => callback(value, key));
      }
    };
  }
}

// Mock the next/navigation features
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

// Suppress console errors during tests
const originalConsoleError = console.error;
console.error = (...args) => {
  if (
    typeof args[0] === 'string' &&
    (args[0].includes('ReactDOM.render') || 
     args[0].includes('Warning: An update to') ||
     args[0].includes('Warning: React has detected a change in'))
  ) {
    return;
  }
  originalConsoleError(...args);
}; 