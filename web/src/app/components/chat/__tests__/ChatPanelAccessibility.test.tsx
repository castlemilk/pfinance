import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useChat } from '@ai-sdk/react';

import { ChatPanel } from '../ChatPanel';

const mockCreateConversation = jest.fn(() => 'conversation-1');
const mockSaveMessages = jest.fn();
const mockLoadMessages = jest.fn(() => []);
const mockSetMessages = jest.fn();
const mockScrollIntoView = jest.fn();

jest.mock('@ai-sdk/react', () => ({
  useChat: jest.fn(),
}));

jest.mock('ai', () => ({
  DefaultChatTransport: jest.fn(),
}));

jest.mock('../../../context/AuthWithAdminContext', () => ({
  useAuth: () => ({
    user: {
      uid: 'user-1',
      email: 'person@example.com',
      displayName: 'Person',
      getIdToken: jest.fn().mockResolvedValue('token'),
    },
    loading: false,
  }),
}));

jest.mock('../../../hooks/useSubscription', () => ({
  useSubscription: () => ({ isPro: true }),
}));

jest.mock('@/lib/chat/ChatHistoryContext', () => ({
  useChatHistory: () => ({
    activeConversationId: null,
    createConversation: mockCreateConversation,
    saveMessages: mockSaveMessages,
    loadMessages: mockLoadMessages,
  }),
}));

jest.mock('../ChatMessage', () => ({
  ChatMessage: () => <div>Assistant response</div>,
}));

jest.mock('../ConversationList', () => ({
  ConversationList: () => <div>Conversation list</div>,
}));

function setReducedMotion(matches: boolean) {
  window.matchMedia = jest.fn().mockImplementation(() => ({
    matches,
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    addListener: jest.fn(),
    removeListener: jest.fn(),
    dispatchEvent: jest.fn(),
  }));
}

function renderPanel({
  messages = [
    {
      id: 'message-1',
      role: 'assistant',
      parts: [{ type: 'text', text: 'Hello' }],
    },
  ],
  status = 'ready',
  error,
}: {
  messages?: Array<{
    id: string;
    role: string;
    parts: Array<{ type: string; text: string }>;
  }>;
  status?: string;
  error?: Error;
} = {}) {
  jest.mocked(useChat).mockReturnValue({
    messages,
    sendMessage: jest.fn(),
    status,
    setMessages: mockSetMessages,
    error,
    stop: jest.fn(),
    regenerate: jest.fn(),
  } as unknown as ReturnType<typeof useChat>);

  return render(<ChatPanel compact />);
}

describe('ChatPanel accessibility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setReducedMotion(false);
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: mockScrollIntoView,
    });
  });

  it('names the primary chat controls and gives each a 40px focusable target', () => {
    renderPanel();

    const history = screen.getByRole('button', { name: 'Show chat history' });
    const newChat = screen.getByRole('button', { name: 'Start new chat' });
    const clear = screen.getByRole('button', { name: 'Clear current chat' });
    const textbox = screen.getByRole('textbox', {
      name: 'Message finance assistant',
    });
    const send = screen.getByRole('button', { name: 'Send message' });

    for (const button of [history, newChat, clear, send]) {
      expect(button).toHaveClass('min-h-10', 'min-w-10');
      expect(button).toHaveClass('focus-visible:ring-2');
    }
    expect(textbox).toHaveClass('min-h-10');
  });

  it('keeps suggested, stop, and retry actions at least 40px high', () => {
    const { rerender } = renderPanel({ messages: [] });

    for (const prompt of [
      'What did I spend this month?',
      'Show my budget progress',
      'Top expenses by category',
      'List my incomes',
    ]) {
      expect(screen.getByRole('button', { name: prompt })).toHaveClass(
        'min-h-10'
      );
    }

    jest.mocked(useChat).mockReturnValue({
      messages: [],
      sendMessage: jest.fn(),
      status: 'streaming',
      setMessages: mockSetMessages,
      error: new Error('Network unavailable'),
      stop: jest.fn(),
      regenerate: jest.fn(),
    } as unknown as ReturnType<typeof useChat>);
    rerender(<ChatPanel compact />);

    expect(screen.getByRole('button', { name: 'Stop' })).toHaveClass('min-h-10');
    expect(screen.getByRole('button', { name: 'Retry' })).toHaveClass('min-h-10');
  });

  it('announces whether chat history is expanded', async () => {
    const user = userEvent.setup();
    renderPanel();

    const showHistory = screen.getByRole('button', {
      name: 'Show chat history',
    });
    expect(showHistory).toHaveAttribute('aria-expanded', 'false');

    await user.click(showHistory);

    const hideHistory = screen.getByRole('button', {
      name: 'Hide chat history',
    });
    expect(hideHistory).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Conversation list')).toBeInTheDocument();
  });

  it('uses instant auto-scroll when reduced motion is requested', async () => {
    setReducedMotion(true);
    renderPanel();

    await waitFor(() =>
      expect(mockScrollIntoView).toHaveBeenCalledWith({ behavior: 'auto' })
    );
  });

  it('preserves smooth auto-scroll when reduced motion is not requested', async () => {
    renderPanel();

    await waitFor(() =>
      expect(mockScrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth' })
    );
  });
});
