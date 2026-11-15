import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { resolve } from 'node:path';
import 'reflect-metadata';
import { AppModule } from './app.module';
import type { AppConfig } from './config';

export async function createApp(config: AppConfig) {
  if (config.adminPassword.length < 16)
    throw new Error('ADMIN_PASSWORD must contain at least 16 characters');
  const app = await NestFactory.create(AppModule.forRoot(config), {
    logger: false,
    bodyParser: false,
    abortOnError: false,
  });
  app.setGlobalPrefix('api');
  const securityHeaders = (embeddable: boolean) =>
    helmet({
      frameguard: embeddable ? false : { action: 'sameorigin' },
      contentSecurityPolicy: {
        directives: {
          'frame-ancestors': embeddable ? ["'self'", 'http:', 'https:'] : ["'self'"],
          'script-src': ["'self'"],
          'worker-src': ["'self'", 'blob:'],
          'img-src': ["'self'", 'data:', 'blob:'],
          'upgrade-insecure-requests': config.secureCookies ? [] : null,
        },
      },
    });
  const publicHeaders = securityHeaders(true),
    workspaceHeaders = securityHeaders(false);
  app.use((req: express.Request, res: express.Response, next: express.NextFunction) =>
    (/^\/book\/[^/]+\/?$/.test(req.path) ? publicHeaders : workspaceHeaders)(req, res, next),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(
    '/api',
    rateLimit({ windowMs: 60000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false }),
  );
  app.use('/api', (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.get('origin');
      if (origin && origin !== (config.publicOrigin ?? `${req.protocol}://${req.get('host')}`)) {
        res.status(403).json({ message: 'Cross-origin requests are not allowed' });
        return;
      }
    }
    next();
  });

  const assets = express.static(resolve('dist/web'));
  app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (/^\/api(?:\/|$)/i.test(req.path)) return next();
    assets(req, res, next);
  });
  app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (/^\/api(?:\/|$)/i.test(req.path)) return next();
    if (req.method === 'GET' && req.accepts('html')) res.sendFile(resolve('dist/web/index.html'));
    else next();
  });
  try {
    await app.init();
  } catch (error) {
    await app.close();
    throw error;
  }
  return app;
}
