/**
 * EcoRoute Fleet - Local & Container Express + Vite Middleware Server
 * Runs on Port 3000 (DEFAULT_APP_PORT)
 */

import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createApiApp } from './src/server/app';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = createApiApp();
  const isProd = process.env.NODE_ENV === 'production';
  const port = process.env.DEFAULT_APP_PORT
    ? parseInt(process.env.DEFAULT_APP_PORT, 10)
    : !isProd
      ? 3000
      : process.env.PORT
        ? parseInt(process.env.PORT, 10)
        : 3000;

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`[EcoRoute] Server active on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('[EcoRoute] Failed to start server:', err);
  process.exit(1);
});
