import { loadSettings } from '../settings.store';
import { readSse, toLlmError } from './llm-provider';

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      chunks.forEach((c) => controller.enqueue(encoder.encode(c)));
      controller.close();
    },
  });
  return new Response(body);
}

describe('readSse', () => {
  it('yields data lines even when split across network chunks', async () => {
    const out: string[] = [];
    for await (const d of readSse(sseResponse(['data: {"a"', ':1}\n\nevent: x\nda', 'ta: [DONE]\n']))) out.push(d);
    expect(out).toEqual(['{"a":1}', '[DONE]']);
  });
});

describe('toLlmError', () => {
  it('adds an actionable hint for auth and rate-limit errors', async () => {
    const auth = await toLlmError(new Response('{"error":{"message":"bad key"}}', { status: 401 }), 'Groq');
    expect(auth.message).toBe('Groq error 401. Check your API key in Settings. bad key');
    const limit = await toLlmError(new Response('oops', { status: 429 }), 'Gemini');
    expect(limit.message).toContain('Rate limit');
    expect(limit.status).toBe(429);
  });
});

describe('loadSettings', () => {
  it('defaults to Demo and clamps a bad chunk size', () => {
    expect(loadSettings({}).provider).toBe('demo');
    expect(loadSettings({ chunkChars: 10 }).chunkChars).toBe(2000);
    expect(loadSettings({ chunkChars: Number.NaN }).chunkChars).toBe(4000);
    expect(loadSettings({ models: { gemini: 'x' } as never }).models.groq).toBe('llama-3.3-70b-versatile');
  });
});
