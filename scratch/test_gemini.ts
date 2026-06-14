import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

async function run(): Promise<void> {
  try {
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || 'AIzaSyA');
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContentStream('Say hello in 3 words');
    for await (const _chunk of result.stream) {
      /* drain stream */
    }
    const response = await result.response;
    console.log('Usage metadata:', response.usageMetadata);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.log('Error:', message);
  }
}

void run();
