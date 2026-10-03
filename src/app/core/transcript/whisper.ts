import { Segment, uid } from '../models';
import { LlmError, toLlmError } from '../llm/llm-provider';
import { DEFAULT_SPEAKER } from './transcript';

export const WHISPER_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
export const WHISPER_MODEL = 'whisper-large-v3-turbo';
/** Groq's upload limit for the free tier. */
export const WHISPER_MAX_BYTES = 25 * 1024 * 1024;

interface WhisperSegment { start?: number; end?: number; text?: string }
interface WhisperBody { text?: string; duration?: number; segments?: WhisperSegment[] }

/** Converts a verbose_json reply into transcript segments. */
export function whisperToSegments(body: WhisperBody, speaker = DEFAULT_SPEAKER): Segment[] {
  const list = (body.segments ?? [])
    .map((s) => ({ start: Number(s.start) || 0, end: Number(s.end) || undefined, text: (s.text ?? '').trim() }))
    .filter((s) => s.text);
  if (!list.length && body.text?.trim()) {
    return [{ id: uid('s'), start: 0, ...(body.duration ? { end: body.duration } : {}), speaker, text: body.text.trim() }];
  }
  return list.map((s) => ({
    id: uid('s'),
    start: Math.round(s.start * 10) / 10,
    ...(s.end ? { end: Math.round(s.end * 10) / 10 } : {}),
    speaker,
    text: s.text,
  }));
}

/** "en-US" -> "en": Whisper wants ISO-639-1. */
export function whisperLanguage(lang: string): string | undefined {
  const code = lang.trim().toLowerCase().split(/[-_]/)[0];
  return /^[a-z]{2}$/.test(code) ? code : undefined;
}

export async function transcribeAudio(
  file: Blob, filename: string, apiKey: string, opts: { language?: string; signal?: AbortSignal } = {},
): Promise<Segment[]> {
  if (!apiKey) throw new LlmError('Add a Groq API key in Settings to transcribe audio with Whisper.');
  if (file.size > WHISPER_MAX_BYTES) {
    throw new LlmError(`That file is ${(file.size / 1048576).toFixed(1)} MB. Whisper accepts up to 25 MB: trim it or export at a lower bitrate.`);
  }
  const form = new FormData();
  form.append('file', file, filename);
  form.append('model', WHISPER_MODEL);
  form.append('response_format', 'verbose_json');
  form.append('temperature', '0');
  const language = opts.language ? whisperLanguage(opts.language) : undefined;
  if (language) form.append('language', language);

  const res = await fetch(WHISPER_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}` },
    body: form,
    signal: opts.signal,
  });
  if (!res.ok) throw await toLlmError(res, 'Groq Whisper');
  const segments = whisperToSegments(await res.json());
  if (!segments.length) throw new LlmError('Whisper did not hear any speech in that audio.');
  return segments;
}
