import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.join(__dirname, '../.env') });
console.log('OPENAI_API_KEY:', process.env.OPENAI_API_KEY);
console.log('GROK_API_KEY:', process.env.GROK_API_KEY);
