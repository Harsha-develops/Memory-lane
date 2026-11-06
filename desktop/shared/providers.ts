import type { AiConfiguration } from './ai';
export const providerPresets: { name: string; configuration: AiConfiguration }[] = [
  {
    name: 'Groq',
    configuration: {
      endpoint: 'https://api.groq.com/openai/v1/chat/completions',
      protocol: 'chat',
      model: 'qwen/qwen3.8-27b',
    },
  },
  {
    name: 'Gemini',
    configuration: {
      endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      protocol: 'chat',
      model: 'gemini-3.1-flash-lite',
    },
  },
  {
    name: 'OpenAI',
    configuration: {
      endpoint: 'https://api.openai.com/v1/chat/completions',
      protocol: 'chat',
      model: 'gpt-4.1-mini',
    },
  },
];
export function sameProvider(a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}
