export interface MockOpenAIUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface MockOpenAIResponse {
  message: string;
  usage: MockOpenAIUsage;
}

// Rough token estimate — not exact, but close enough for a mock
function estimateTokens(text: string): number {
  return Math.ceil(text.split(' ').length * 1.3);
}

// Simulates OpenAI chat completion with realistic latency (1.5–3s)
export async function mockOpenAIResponse(question: string): Promise<MockOpenAIResponse> {
  const delay = Math.floor(Math.random() * 1500) + 1500;
  await new Promise<void>((resolve) => setTimeout(resolve, delay));

  const promptTokens = estimateTokens(question);
  const completionTokens = 47;

  return {
    message: `This is a mock response to: "${question}"`,
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    },
  };
}
