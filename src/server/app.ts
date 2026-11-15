/**
 * EcoRoute Fleet - Shared Express Application Factory
 * Used by both local Node/Vite server (server.ts) and Vercel Serverless Function (api/index.ts)
 */

import express, { Request, Response } from 'express';
import { apiRouter } from './api';

export function createApiApp() {
  const app = express();

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Public health check endpoint
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: 'ecoroute-fleet',
      runtime: process.env.VERCEL ? 'vercel-serverless' : 'node-express',
      timestamp: new Date().toISOString(),
    });
  });

  // Mount hardened REST API router
  app.use('/api', apiRouter);

  return app;
}
