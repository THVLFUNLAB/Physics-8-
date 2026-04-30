const https = require('https');
const fs = require('fs');
https.get('https://raw.githubusercontent.com/google/fonts/main/ofl/roboto/Roboto-Regular.ttf', (res) => {
  let chunks = [];
  res.on('data', chunk => chunks.push(chunk));
  res.on('end', () => {
    const buffer = Buffer.concat(chunks);
    const base64 = buffer.toString('base64');
    fs.mkdirSync('src/utils', { recursive: true });
    fs.writeFileSync('src/utils/robotoFont.ts', 'export const robotoBase64 = "' + base64 + '";');
    console.log('Font downloaded and saved as base64');
  });
});
