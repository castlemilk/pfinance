import { type LanguageModel } from 'ai';

export function getChatModel(): LanguageModel {
  const provider = process.env.CHAT_MODEL_PROVIDER || 'google';
  const modelId = process.env.CHAT_MODEL_ID;

  switch (provider) {
    case 'anthropic': {
      const { createAnthropic } = require('@ai-sdk/anthropic');
      const anthropic = createAnthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });
      return anthropic(modelId || 'claude-sonnet-4-5-20250929');
    }
    case 'openai': {
      const { createOpenAI } = require('@ai-sdk/openai');
      const openai = createOpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
      return openai(modelId || 'gpt-4o');
    }
    default: {
      // The @ai-sdk/google package checks GOOGLE_GENERATIVE_AI_API_KEY env var internally.
      // Ensure it's set from GEMINI_API_KEY if the canonical env var is missing.
      const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || '';
      if (apiKey && !process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
        process.env.GOOGLE_GENERATIVE_AI_API_KEY = apiKey;
      }
      const { createGoogleGenerativeAI } = require('@ai-sdk/google');
      const google = createGoogleGenerativeAI({ apiKey });
      return google(modelId || 'gemini-2.0-flash');
    }
  }
}
