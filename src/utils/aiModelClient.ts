export const SELECTED_AI_MODEL_KEY = 'craftcv.selectedAiModel.v1';

/** Never store API keys in a browser. Only save a server-approved model identifier. */
export function selectedAIModelId(): string {
  try {
    return localStorage.getItem(SELECTED_AI_MODEL_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveSelectedAIModelId(id: string): void {
  try {
    if (id) localStorage.setItem(SELECTED_AI_MODEL_KEY, id);
    else localStorage.removeItem(SELECTED_AI_MODEL_KEY);
  } catch {
    // Browser storage may be disabled; server will choose its default model.
  }
}

/** Reuses the same model choice in every CraftCV AI workflow. */
export function aiFetch(url: string, options: RequestInit): Promise<Response> {
  const headers = new Headers(options.headers);
  const id = selectedAIModelId();
  if (id) headers.set('X-CraftCV-AI-Model', id);
  return fetch(url, { ...options, headers });
}
