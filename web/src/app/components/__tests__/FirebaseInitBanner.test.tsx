import { act, render, screen } from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server.node';

import { FirebaseInitBanner } from '../FirebaseInitBanner';

jest.mock('@/lib/firebase', () => ({
  firebaseInitError:
    'Firebase configuration is missing. Please check environment variables.',
}));

describe('FirebaseInitBanner', () => {
  it('keeps SSR and the initial hydration tree empty before showing one alert', async () => {
    const container = document.createElement('div');
    const serverMarkup = renderToString(<FirebaseInitBanner />);
    container.innerHTML = serverMarkup;
    document.body.appendChild(container);

    expect(serverMarkup).toBe('');
    expect(container.querySelector('[role="alert"]')).toBeNull();

    const onRecoverableError = jest.fn();
    let root: ReturnType<typeof hydrateRoot> | undefined;

    try {
      await act(async () => {
        root = hydrateRoot(container, <FirebaseInitBanner />, {
          onRecoverableError,
        });

        expect(container.querySelector('[role="alert"]')).toBeNull();
      });

      expect(onRecoverableError).not.toHaveBeenCalled();
      expect(container.querySelectorAll('[role="alert"]')).toHaveLength(1);
      expect(container).toHaveTextContent('Connection issue');
    } finally {
      await act(async () => {
        root?.unmount();
      });
      container.remove();
    }
  });

  it('uses a compact, pointer-transparent bottom notice', () => {
    render(<FirebaseInitBanner />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('aria-atomic', 'true');
    expect(alert).toHaveClass(
      'fixed',
      'inset-x-0',
      'bottom-20',
      'md:bottom-4',
      'pointer-events-none'
    );
    expect(alert).not.toHaveClass('top-0');
    expect(alert.firstElementChild).toHaveClass('max-w-xl', 'px-3', 'py-2');
  });
});
