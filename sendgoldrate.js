const { sendGoldRate, client } = require('./server');  // Import from server.js

async function main() {
  if (!client) {
    console.error('Failed to connect to WhatsApp client.');
    return;
  }
  await sendGoldRate(client);
  console.log('Scheduled gold rate message sent successfully.');
}

main().catch(console.error);
