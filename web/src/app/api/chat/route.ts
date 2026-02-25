import { streamText, convertToModelMessages, stepCountIs, UIMessage } from 'ai';
import { getChatModel } from '@/lib/chat/model';
import { createBackendClient } from '@/lib/chat/backend-client';
import { createTools } from '@/lib/chat/tools';
import { buildSystemPrompt } from '@/lib/chat/system-prompt';
import { getAuth } from 'firebase-admin/auth';
import { getApps, initializeApp, cert } from 'firebase-admin/app';

// The canonical Firebase project ID for this app.
// Trim whitespace — Vercel env vars sometimes include trailing newlines.
const FIREBASE_PROJECT_ID = (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'pfinance-app-1748773335').trim();

// Initialize Firebase Admin SDK (once).
// Uses a service account credential if it matches our project, otherwise
// falls back to project-ID-only init (sufficient for verifyIdToken).
function getFirebaseAdmin() {
  if (getApps().length > 0) return;

  // Option 1: full service account JSON — only if it matches our project
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (serviceAccount) {
    try {
      const parsed = JSON.parse(serviceAccount);
      if (parsed.project_id === FIREBASE_PROJECT_ID) {
        initializeApp({ credential: cert(parsed) });
        return;
      }
      console.warn(`[Chat API] FIREBASE_SERVICE_ACCOUNT is for project "${parsed.project_id}", expected "${FIREBASE_PROJECT_ID}". Ignoring.`);
    } catch {
      // Invalid JSON — fall through
    }
  }

  // Option 2: project ID only (works on Vercel without a matching service account)
  initializeApp({ projectId: FIREBASE_PROJECT_ID });
}

// Truncate message history to avoid sending excessive context to the model.
// Preserves tool-call/tool-result message pairs to avoid "Tool results are missing" errors.
const MAX_HISTORY_MESSAGES = 40;

function truncateMessages(messages: UIMessage[]): UIMessage[] {
  if (messages.length <= MAX_HISTORY_MESSAGES) return messages;

  // Keep the most recent messages, but ensure we don't split tool-call/result pairs.
  // Assistant messages with tool-invocation parts must be followed by their result messages.
  // Strategy: take last N messages, then walk backward to find a safe cut point where
  // no assistant tool-call message is orphaned from its results.
  const cutIndex = messages.length - MAX_HISTORY_MESSAGES;

  // Walk forward from the cut point to find a safe boundary:
  // - Skip past any assistant message that has tool invocations (its results follow it)
  let safeCut = cutIndex;
  for (let i = cutIndex; i < messages.length; i++) {
    const msg = messages[i];
    // If this is an assistant message with tool parts, its results are in subsequent messages.
    // Skip past it so we don't orphan tool calls.
    const hasToolParts = msg.role === 'assistant' && msg.parts?.some(
      (p) => p.type === 'tool-invocation'
    );
    if (hasToolParts) {
      safeCut = i + 1;
    } else {
      // Found a safe boundary (user message or assistant text-only message)
      break;
    }
  }

  return messages.slice(safeCut);
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
      console.error('[Chat API] Token verification failed:', err);
      return new Response(JSON.stringify({ error: 'Invalid authentication token' }), {
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
