import { streamText, convertToModelMessages, stepCountIs, UIMessage } from 'ai';
import { getChatModel } from '@/lib/chat/model';
import { createBackendClient } from '@/lib/chat/backend-client';
import { createTools } from '@/lib/chat/tools';
import { buildSystemPrompt } from '@/lib/chat/system-prompt';

export async function POST(request: Request) {
  const { messages } = (await request.json()) as { messages: UIMessage[] };

  const authToken = request.headers.get('X-Firebase-Token');
  const userId = request.headers.get('X-User-ID') || '';
  const displayName = request.headers.get('X-User-DisplayName') || '';
  const email = request.headers.get('X-User-Email') || '';
  const isPro = request.headers.get('X-User-IsPro') === 'true';

  if (!userId) {
    return new Response(JSON.stringify({ error: 'User not authenticated' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const client = createBackendClient(authToken, userId, email, displayName);
  const tools = createTools(client, userId, isPro);

  const result = streamText({
    model: getChatModel(),
    system: buildSystemPrompt({ userId, displayName, email, isPro }),
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: stepCountIs(5),
  });

  return result.toUIMessageStreamResponse();
}
