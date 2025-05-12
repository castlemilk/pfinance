// Add custom jest matchers from testing-library
import '@testing-library/jest-dom';

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