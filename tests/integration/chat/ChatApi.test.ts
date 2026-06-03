/**
 * ChatApi.test.ts
 *
 * Integration tests for POST /api/v1/chat.
 * Auth0 is mocked. syncUser and mockOpenAI are mocked to avoid real DB/AI calls.
 */

// Mocks (MUST be before any src imports)
import { mockAuth0 } from '../../mocks/auth0.mock';
mockAuth0('USER');

jest.mock('../../../src/infrastructure/openai/mockOpenAI', () => ({
  mockOpenAIResponse: jest.fn().mockResolvedValue({
    message: 'This is a mock response to: "What is TypeScript?"',
    usage: { prompt_tokens: 4, completion_tokens: 47, total_tokens: 51 },
  }),
}));

jest.mock('../../../src/shared/middleware/userSync.middleware', () => ({
  syncUser: (
    req: import('express').Request,
    _res: import('express').Response,
    next: import('express').NextFunction,
  ) => {
    req.dbUser = { id: 'test-db-user-id', email: 'test@example.com', role: 'USER' };
    req.userId = 'test-db-user-id';
    next();
  },
}));

// Mock ChatRepository to avoid real DB
jest.mock('../../../src/modules/chat/repositories/ChatRepository', () => {
  return {
    ChatRepository: jest.fn().mockImplementation(() => ({
      getMonthlyUsage: jest.fn().mockResolvedValue(null), // no usage — free tier available
      incrementMonthlyUsage: jest.fn().mockResolvedValue(undefined),
      saveMessage: jest.fn().mockResolvedValue({
        id: 'msg-test-id',
        userId: 'test-db-user-id',
        question: 'What is TypeScript?',
        answer: 'This is a mock response to: "What is TypeScript?"',
        promptTokens: 4,
        completionTokens: 47,
        totalTokens: 51,
        createdAt: new Date().toISOString(),
      }),
      getByUserId: jest.fn().mockResolvedValue([]),
      getById: jest.fn().mockResolvedValue(null),
      deductBundleQuota: jest.fn().mockResolvedValue(undefined),
    })),
  };
});

// Imports
import request from 'supertest';
import { createApp } from '../../../src/app';

const app    = createApp();
const BEARER = 'Bearer test-token';

function validHeaders(nonce?: string) {
  return {
    Authorization: BEARER,
    'X-Request-Timestamp': Date.now().toString(),
    'X-Nonce': nonce ?? `nonce-${Math.random().toString(36).slice(2)}`,
    'Content-Type': 'application/json',
  };
}

describe('Chat API', () => {
  // POST /api/v1/chat

  it('POST /api/v1/chat returns 200 with chat data for valid request', async () => {
    const res = await request(app)
      .post('/api/v1/chat')
      .set(validHeaders())
      .send({ question: 'What is TypeScript?' });

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.question).toBe('What is TypeScript?');
    expect(res.body.data.answer).toBeDefined();
  });

  it('POST /api/v1/chat returns 401 when no Authorization header is sent', async () => {
    const res = await request(app)
      .post('/api/v1/chat')
      .set('X-Request-Timestamp', Date.now().toString())
      .set('X-Nonce', `nonce-no-auth-${Date.now()}`)
      .set('Content-Type', 'application/json')
      .send({ question: 'hello' });

    expect(res.status).toBe(401);
  });

  it('POST /api/v1/chat returns 400 when unknown extra field is sent', async () => {
    const res = await request(app)
      .post('/api/v1/chat')
      .set(validHeaders())
      .send({ question: 'hello', unknownField: 'should be rejected' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('POST /api/v1/chat returns 400 when question is empty', async () => {
    const res = await request(app)
      .post('/api/v1/chat')
      .set(validHeaders())
      .send({ question: '' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('POST /api/v1/chat returns 400 when body is missing question field', async () => {
    const res = await request(app)
      .post('/api/v1/chat')
      .set(validHeaders())
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
