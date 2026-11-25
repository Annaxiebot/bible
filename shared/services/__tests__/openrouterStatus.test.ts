/**
 * openrouterStatus.test.ts — status → failure kind · 状态码映射测试
 */
import { describe, it, expect } from 'vitest';
import {
  classifyOpenRouterStatus, HTTP_BAD_REQUEST, HTTP_UNAUTHORIZED, HTTP_PAYMENT_REQUIRED, HTTP_FORBIDDEN, HTTP_NOT_FOUND,
} from '../openrouterStatus';

describe('classifyOpenRouterStatus', () => {
  it.each([
    [HTTP_UNAUTHORIZED, 'invalid-key'],
    [HTTP_FORBIDDEN, 'invalid-key'],
    [HTTP_PAYMENT_REQUIRED, 'no-credits'],
    [HTTP_BAD_REQUEST, 'model-unavailable'],
    [HTTP_NOT_FOUND, 'model-unavailable'],
    [429, 'http-error'],
    [500, 'http-error'],
    [503, 'http-error'],
  ])('%i → %s', (status, kind) => {
    expect(classifyOpenRouterStatus(status)).toBe(kind);
  });
});
