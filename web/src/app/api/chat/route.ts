import { streamText, convertToModelMessages, stepCountIs, UIMessage } from 'ai';
import { getChatModel } from '@/lib/chat/model';
import { createBackendClient } from '@/lib/chat/backend-client';
import { createTools } from '@/lib/chat/tools';
import { buildSystemPrompt } from '@/lib/chat/system-prompt';
import { getAuth } from 'firebase-admin/auth';
import { getApps, initializeApp, cert } from 'firebase-admin/app';

// Initialize Firebase Admin SDK (once)
function getFirebaseAdmin() {
  if (getApps().length > 0) return;
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (serviceAccount) {
    try {
      const parsed = JSON.parse(serviceAccount);
      initializeApp({ credential: cert(parsed) });
    } catch {
      initializeApp();
    }
  } else {
    initializeApp();
  }
}

export async function POST(request: Request) {
  const { messages } = (await request.json()) as { messages: UIMessage[] };

  const authToken = request.headers.get('X-Firebase-Token');
  const userId = request.headers.get('X-User-ID') || '';
  const displayName = request.headers.get('X-User-DisplayName') || '';
  const email = request.headers.get('X-User-Email') || '';

  if (!userId) {
    return new Response(JSON.stringify({ error: 'User not authenticated' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // P0-4 fix: verify isPro from Firebase token claims instead of trusting client header
  let isPro = false;
  if (authToken) {
    try {
      getFirebaseAdmin();
      const decodedToken = await getAuth().verifyIdToken(authToken);
      isPro = decodedToken.subscription_tier === 'PRO' && decodedToken.subscription_status === 'ACTIVE';
    } catch (err) {
      console.error('[Chat API] Token verification failed:', err);
      // Fall through with isPro=false — user can still use free tools
    }
  }

  const client = createBackendClient(authToken, userId, email, displayName);
  const tools = createTools(client, userId, isPro);

  const result = streamText({
    model: getChatModel(),
    system: buildSystemPrompt({ userId, displayName, email, isPro }),
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: stepCountIs(10),
  });

  return result.toUIMessageStreamResponse();
}
