import { Logger } from '@nestjs/common';

/**
 * Optional chat-completion adapter for any OpenAI-compatible API.
 * Configure with AI_API_KEY (required to enable), AI_BASE_URL and AI_MODEL. With no key the assistant uses its built-in rules.
 */
export interface LlmSettings {
  apiKey: string;
  baseUrl: string;
  model: string;
}

const logger = new Logger('AiLlm');

export function llmSettingsFromEnv(env: NodeJS.ProcessEnv = process.env): LlmSettings | null {
  const apiKey = (env.AI_API_KEY ?? '').trim();
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: (env.AI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/+$/, ''),
    model: env.AI_MODEL ?? 'gpt-4o-mini',
  };
}

/** Returns the model's text, or null if the call fails or times out. Never throws. */
export async function completeChat(
  settings: LlmSettings,
  system: string,
  user: string,
  timeoutMs = 20_000,
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${settings.baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify({
        model: settings.model,
        temperature: 0.4,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
    if (!res.ok) {
      logger.warn(`AI provider responded ${res.status}`);
      return null;
    }
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return json.choices?.[0]?.message?.content?.trim() || null;
  } catch (err) {
    logger.warn(`AI provider call failed: ${(err as Error).name}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
