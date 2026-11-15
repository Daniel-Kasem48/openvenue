import { Catch, HttpException, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { SceneGenerationError } from '../../modules/scene-generation/services/generator';
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (res.headersSent) return;
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: error.issues.map((i) => i.message).join('; ') });
      return;
    }
    const e = error as { code?: string; status?: number; name?: string; message?: string };
    const status =
      e.code === '23P01' || e.code === '23503'
        ? 409
        : error instanceof HttpException
          ? error.getStatus()
          : (e.status ?? 500);
    if (error instanceof HttpException && status === 429) {
      const body = error.getResponse();
      if (typeof body === 'string') res.status(status).send(body);
      else res.status(status).json(body);
      return;
    }
    const message =
      e.code === '23P01'
        ? 'That resource was just reserved. Choose another time or place.'
        : e.code === '23503'
          ? 'Cannot remove a resource with reservation history or event blocks.'
          : error instanceof SceneGenerationError
            ? error.message
            : status >= 500
              ? 'Something went wrong. Please try again.'
              : error instanceof HttpException && status === 404
                ? 'Endpoint not found'
                : e.message;
    if (status >= 500) console.error('API failure', e.code ?? e.name);
    res.status(status).json({ message });
  }
}
