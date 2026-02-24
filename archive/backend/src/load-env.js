/**
 * Load .env from repo root before any other modules (e.g. postgres) read process.env.
 * Must be the first import in index.js.
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
