const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

async function run() {
  try {
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || 'AIzaSyA');
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContentStream("Say hello in 3 words");
    let text = '';
    for await (const chunk of result.stream) {
      text += chunk.text();
    }
    const response = await result.response;
    console.log("Usage metadata:", response.usageMetadata);
  } catch(e) {
    console.log("Error:", e.message);
  }
}
run();
