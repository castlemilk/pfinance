import { renderToStaticMarkup } from 'react-dom/server.node';
import AppRouteLayout from '../layout';

jest.mock('../../components/AppLayout', () => ({
  __esModule: true,
  default: () => <div data-testid="app-shell">shell</div>,
}));

describe('AppRouteLayout server render', () => {
  it('renders only the skeleton on the server so hydration cannot see provider state', () => {
    const html = renderToStaticMarkup(
      <AppRouteLayout>
        <p data-testid="page">page content</p>
      </AppRouteLayout>
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');

    // Providers restore auth/demo data in mount effects; rendering the app
    // tree on the server made late-hydrating Suspense boundaries mismatch (#418).
    expect(doc.querySelector('[data-testid="app-shell"]')).toBeNull();
    expect(doc.querySelector('[data-testid="page"]')).toBeNull();
    expect(doc.querySelector('main#main-content')).not.toBeNull();
    expect(doc.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });
});
