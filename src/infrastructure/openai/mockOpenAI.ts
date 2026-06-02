export interface MockOpenAIUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface MockOpenAIResponse {
  message: string;
  usage: MockOpenAIUsage;
}

/**
 * Simulates an OpenAI chat completion with realistic latency and token counts.
 *
 * @param question - The user's input question
 * @returns A mock response object mirroring the OpenAI API shape
 */
export async function mockOpenAIResponse(question: string): Promise<MockOpenAIResponse> {
  // Simulate network + model latency: 1500–3000 ms
  const delay = Math.floor(Math.random() * 1500) + 1500;
  await new Promise<void>((resolve) => setTimeout(resolve, delay));

  const promptTokens = Math.ceil(question.split(' ').length * 1.3);
  const completionTokens = 47;
  const totalTokens = promptTokens + completionTokens;

  return {
    message: `This is a mock response to: "${question}"`,
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens,
    },
  };
}
