/**
 * EcoRoute Fleet - Vercel Serverless Function Entry Point
 * Automatically handles all /api/* requests on Vercel via vercel.json rewrites.
 */

import { createApiApp } from '../src/server/app';

const app = createApiApp();

export default app;
