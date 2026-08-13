export type ChatHistoryItem = { role: 'user' | 'bot'; text: string };

export interface DisputeChatRequest {
  question: string;
  history: ChatHistoryItem[];
  context: Record<string, unknown>;
}

export interface DisputeChatResponse {
  answer: string;
  model: string;
}

export async function requestDisputeChat(payload: DisputeChatRequest): Promise<DisputeChatResponse> {
  const response = await fetch('/api/dispute-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = (await response.json().catch(() => ({}))) as DisputeChatResponse & { error?: string };
  if (!response.ok) throw new Error(data.error ?? '챗봇 요청에 실패했습니다.');
  return data;
}
