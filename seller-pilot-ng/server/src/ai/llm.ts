/**
 * Pluggable LLM provider. Anything that speaks the OpenAI Chat Completions API works:
 * OpenAI, Groq, OpenRouter, Together, Ollama/LM Studio (local), and Google Gemini
 * through its OpenAI-compatible endpoint. With no key configured, `llmAvailable()` is
 * false and SellerPilot runs entirely on the offline rule engine in rules.ts.
 */
import { config } from '../config.js';

export interface ChatMsg { role: 'system' | 'user' | 'assistant' | 'tool'; content: string | null; tool_calls?: any[]; tool_call_id?: string; name?: string }

function provider(): { name: string; baseUrl: string; key: string; model: string } | null {
  const a = config.ai;
  const want = a.provider;
  if (want === 'rules') return null;
  if ((want === 'gemini' || want === 'auto') && a.geminiKey)
    return { name: `gemini:${a.geminiModel}`, baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', key: a.geminiKey, model: a.geminiModel };
  if ((want === 'openai' || want === 'auto') && (a.openaiKey || /localhost|127\.0\.0\.1/.test(a.openaiBaseUrl) && want === 'openai'))
    return { name: `openai-compatible:${a.openaiModel}`, baseUrl: a.openaiBaseUrl, key: a.openaiKey || 'local', model: a.openaiModel };
  return null;
}

export const llmAvailable = () => provider() !== null;
export const engineName = () => provider()?.name ?? 'rules (offline)';

export async function chat(messages: ChatMsg[], opts: { tools?: any[]; json?: boolean; temperature?: number } = {}): Promise<{ content: string | null; tool_calls?: any[] }> {
  const p = provider();
  if (!p) throw new Error('No LLM provider configured');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25_000);
  try {
    const res = await fetch(`${p.baseUrl}/chat/completions`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.key}` },
      body: JSON.stringify({
        model: p.model,
        messages,
        temperature: opts.temperature ?? 0.4,
        ...(opts.tools ? { tools: opts.tools, tool_choice: 'auto' } : {}),
        ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
      }),
    });
    if (!res.ok) throw new Error(`LLM ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data: any = await res.json();
    const msg = data.choices?.[0]?.message ?? {};
    return { content: msg.content ?? null, tool_calls: msg.tool_calls };
  } finally {
    clearTimeout(timer);
  }
}

export async function chatJson<T>(system: string, user: string): Promise<T> {
  const r = await chat([{ role: 'system', content: system }, { role: 'user', content: user }], { json: true, temperature: 0.5 });
  const text = (r.content || '').replace(/^```(?:json)?|```$/g, '').trim();
  return JSON.parse(text) as T;
}
