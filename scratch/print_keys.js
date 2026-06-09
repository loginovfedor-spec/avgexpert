const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
console.log("OPENAI_API_KEY:", process.env.OPENAI_API_KEY);
console.log("GROK_API_KEY:", process.env.GROK_API_KEY);
