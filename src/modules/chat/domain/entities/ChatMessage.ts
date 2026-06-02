/**
 * Pure domain entity — no framework or ORM dependencies.
 */
export interface ChatMessage {
  id: string;
  userId: string;
  question: string;
  answer: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  createdAt: Date;
}
