/**
 * Client DeepSeek (API compatible OpenAI).
 * Clé : DEEPSEEK_API_KEY — jamais en dur dans le code.
 */

const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
const DEFAULT_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

export function isDeepSeekConfigured() {
  return Boolean(process.env.DEEPSEEK_API_KEY?.trim());
}

/**
 * @param {Array<{role: string, content: string}>} messages
 * @param {{ maxTokens?: number, model?: string, temperature?: number, timeoutMs?: number }} opts
 */
export async function deepseekChat(messages, opts = {}) {
  const key = process.env.DEEPSEEK_API_KEY?.trim();
  if (!key) throw new Error('DEEPSEEK_API_KEY non configuré');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 12000);
  let response;
  try {
    response = await fetch(`${DEEPSEEK_BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: opts.model || DEFAULT_MODEL,
        messages,
        temperature: opts.temperature ?? 0.05,
        max_tokens: opts.maxTokens ?? 800,
      }),
    });
  } catch (err) {
    if (err?.name === 'AbortError') throw new Error('DeepSeek timeout');
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`DeepSeek ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

export function parseJsonFromAi(text) {
  const raw = (text || '').trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1].trim() : raw;
  try {
    return JSON.parse(body);
  } catch {
    const start = body.indexOf('{');
    const end = body.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(body.slice(start, end + 1));
    throw new Error('JSON IA invalide');
  }
}
