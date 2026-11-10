import { ZodError } from 'zod';
import type { Middleware, ToolResult } from '../types/index.js';
import { logger } from './logger.js';
import { InDesignError } from './errorHandler.js';
import { toErrorEnvelope } from '../errors/envelope.js';

export function withLogging(handlerName: string): Middleware {
  return (next) =>
    async (args: unknown, extra: any): Promise<ToolResult> => {
      logger.debug(`Handler "${handlerName}" called`, { args });
      try {
        const result = await next(args, extra);
        logger.debug(`Handler "${handlerName}" succeeded`);
        return result;
      } catch (err) {
        logger.error(`Handler "${handlerName}" failed`, {
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    };
}

export function withErrorHandling(): Middleware {
  return (next) =>
    async (args: unknown, extra: any): Promise<ToolResult> => {
      try {
        return await next(args, extra);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // Transport codes (EXECUTION_TIMEOUT, BRIDGE_ERROR, CANCELLED) classify
        // more precisely than the message text can, so pass them through.
        const envelope = toErrorEnvelope({
          message,
          code: err instanceof ZodError ? 'VALIDATION_ERROR' : err instanceof InDesignError ? err.code : undefined,
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(envelope) }],
          isError: true,
        };
      }
    };
}

export function compose(...middlewares: Middleware[]): Middleware {
  return (handler) =>
    middlewares.reduceRight((next, mw) => mw(next), handler);
}
