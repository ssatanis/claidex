// Load environment variables from repo root before all tests
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Set test env so config.ts skips the pgUrl check
process.env['NODE_ENV'] = 'test';
