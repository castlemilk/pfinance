import { streamText, convertToModelMessages, stepCountIs, UIMessage } from 'ai';
import { getChatModel } from '@/lib/chat/model';
import { createBackendClient } from '@/lib/chat/backend-client';
import { createTools } from '@/lib/chat/tools';
import { buildSystemPrompt } from '@/lib/chat/system-prompt';
import { getAuth } from 'firebase-admin/auth';
import { getApps, initializeApp, cert } from 'firebase-admin/app';

// Initialize Firebase Admin SDK (once).
// Prefers a full service account credential when available.
// Falls back to project-ID-only initialization — sufficient for verifyIdToken
// which uses Google's public keys and only needs the project ID for claim validation.
function getFirebaseAdmin() {
  if (getApps().length > 0) return;

  // Option 1: full service account JSON (most capable)
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (serviceAccount) {
    try {
      const parsed = JSON.parse(serviceAccount);
      initializeApp({ credential: cert(parsed) });
      return;
    } catch {
      // Invalid JSON — fall through
    }
  }

  // Option 2: project ID only (works on Vercel without a service account)
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
    || process.env.GOOGLE_CLOUD_PROJECT;
  initializeApp(projectId ? { projectId } : undefined);
}

// Truncate message history to avoid sending excessive context to the model.
// Keep the first message (often sets context) and the most recent messages.
const MAX_HISTORY_MESSAGES = 40;

function truncateMessages(messages: UIMessage[]): UIMessage[] {
  if (messages.length <= MAX_HISTORY_MESSAGES) return messages;
  // Keep first message + last (MAX - 1) messages
  return [messages[0], ...messages.slice(-(MAX_HISTORY_MESSAGES - 1))];
}

export async function POST(request: Request) {
  const { messages } = (await request.json()) as { messages: UIMessage[] };

  const authToken = request.headers.get('X-Firebase-Token');
  let userId = request.headers.get('X-User-ID') || '';
  const displayName = request.headers.get('X-User-DisplayName') || '';
  const email = request.headers.get('X-User-Email') || '';

  if (!userId) {
    return new Response(JSON.stringify({ error: 'User not authenticated' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Verify token and extract verified userId + subscription claims
  let isPro = false;
  if (authToken) {
    try {
      getFirebaseAdmin();
      const decodedToken = await getAuth().verifyIdToken(authToken);
      userId = decodedToken.uid;
      isPro = decodedToken.subscription_tier === 'PRO' && decodedToken.subscription_status === 'ACTIVE';
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const errCode = (err as { code?: string }).code || 'unknown';
      console.error('[Chat API] Token verification failed:', errMsg);
      return new Response(JSON.stringify({
        error: 'Invalid authentication token',
        debug: {
          code: errCode,
          message: errMsg,
          hasProjectId: !!(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT),
          hasServiceAccount: !!process.env.FIREBASE_SERVICE_ACCOUNT,
        },
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  const client = createBackendClient(authToken, userId, email, displayName);
  const tools = createTools(client, userId, isPro);

  // RES-05: truncate message history to prevent excessive context
  const trimmedMessages = truncateMessages(messages);

  const result = streamText({
    model: getChatModel(),
    system: buildSystemPrompt({ userId, displayName, email, isPro }),
    messages: await convertToModelMessages(trimmedMessages),
    tools,
    stopWhen: stepCountIs(10),
  });

  return result.toUIMessageStreamResponse();
}
