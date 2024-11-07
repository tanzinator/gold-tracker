require('dotenv').config();

const { Client, RemoteAuth } = require('whatsapp-web.js');
const express = require('express');
const app = express();
const { MongoClient } = require('mongodb');
const qrcode = require('qrcode');
const axios = require('axios');
const { Worker } = require('worker_threads');

const port = process.env.PORT || 3000;
const MAX_RETRIES = 5;
let retryCount = 0;
let qrCodeData = '';

// MongoDB connection setup
const MONGO_URI = process.env.MONGO_URI;

// Create a worker for handling scheduled tasks
const worker = new Worker(`
  const { parentPort } = require('worker_threads');
  
  function checkSchedule() {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    
    // Check if it's 10:00 AM
    if (hours === 13 && minutes === 52) {
      parentPort.postMessage('SEND_RATES');
    }
    
    // Check if it's 5:00 PM
    if (hours === 17 && minutes === 0) {
      parentPort.postMessage('SEND_RATES');
    }
  }
  
  // Check every minute
  setInterval(checkSchedule, 60000);
  
  // Initial check
  checkSchedule();
`, { eval: true });

// Handle messages from the worker
let whatsappClientInstance = null;
worker.on('message', async (message) => {
  if (message === 'SEND_RATES' && whatsappClientInstance) {
    await sendGoldRate(whatsappClientInstance);
  }
});

const phoneNumbers = [
  '919764026140@c.us'
 
];

async function connectToMongoDB() {
  try {
    console.log('Attempting to connect to MongoDB...');
    const client = new MongoClient(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    await client.connect();
    console.log('Connected to MongoDB successfully');
    retryCount = 0;
    return client;
  } catch (error) {
    console.error('Error connecting to MongoDB:', error.message);
    if (error.code === 'ECONNRESET' || error.syscall === 'read') {
      retryCount += 1;
      if (retryCount <= MAX_RETRIES) {
        const retryDelay = Math.pow(2, retryCount) * 1000;
        console.log(`Connection reset. Retrying in ${retryDelay / 1000} seconds... (${retryCount}/${MAX_RETRIES})`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        return connectToMongoDB();
      } else {
        console.error('Max retries reached. Could not reconnect to MongoDB.');
        process.exit(1);
      }
    } else {
      console.error('Unexpected error:', error);
      process.exit(1);
    }
  }
}

// Gold rate fetching functions remain the same
async function getAbharanGoldRate() {
  try {
    const response = await axios.get('https://services.abharan.com/api/v1/website/dailyrate');
    const goldRate = response.data.data.gold22;
    return goldRate;
  } catch (error) {
    console.error('Error fetching Abharan gold rate:', error);
    return null;
  }
}

async function getMalabarGoldRate() {
  try {
    const initialResponse = await axios.get('https://www.malabargoldanddiamonds.com/malabarprice/index/getrates/?country=IN&state=Maharashtra', {
      maxRedirects: 0,
      validateStatus: function (status) {
        return status >= 200 && status < 400;
      },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3',
      },
    });

    const setCookieHeader = initialResponse.headers['set-cookie'];
    if (setCookieHeader) {
      const cookies = setCookieHeader.join('; ');
      const finalResponse = await axios.get(initialResponse.headers.location, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3',
          'Cookie': cookies,
        },
      });

      return {
        twentytwogoldRate: finalResponse.data["22kt"],
        twentyFourgoldRate: finalResponse.data["24kt"]
      };
    }
    throw new Error('No cookies set by the server.');
  } catch (error) {
    console.error('Error fetching Malabar gold rate:', error);
    return null;
  }
}

async function getPngGoldRate() {
  try {
    const response = await axios.get('https://api-accounts.pngjewellers.com/accounts/cache/PNG_INDIA_METAL_PRICE');
    const goldRate = response.data.responseBody;
    const gold22K = goldRate.find(item => item.metalPurity === "22KT");
    const gold24K = goldRate.find(item => item.metalPurity === "24KT");
    if (gold22K && gold24K) {
      return {
        gold22price: gold22K.price,
        gold24price: gold24K.price
      };
    }
    return null;
  } catch (error) {
    console.error('Error fetching Png gold rate:', error);
    return null;
  }
}

async function sendGoldRate(whatsappClient) {
  try {
    const [abharanRate, malabarRates, pngRates] = await Promise.all([
      getAbharanGoldRate(),
      getMalabarGoldRate(),
      getPngGoldRate()
    ]);

    let message = "Automated message:\nToday's Gold Rates:\n";
    
    if (abharanRate) {
      message += `- Abharan 22K: ₹${abharanRate}/g\n`;
    } else {
      message += "- Abharan: Unable to fetch rate.\n";
    }
    
    if (malabarRates) {
      message += `- Malabar 22K: ₹${malabarRates.twentytwogoldRate}\n`;
      message += `- Malabar 24K: ₹${malabarRates.twentyFourgoldRate}\n`;
    } else {
      message += "- Malabar: Unable to fetch rates.\n";
    }
    
    if (pngRates) {
      message += `- Png 22K: ₹${pngRates.gold22price}\n`;
      message += `- Png 24K: ₹${pngRates.gold24price}\n`;
    } else {
      message += "- Png: Unable to fetch rates.\n";
    }

    await Promise.all(phoneNumbers.map(async (number) => {
      try {
        await whatsappClient.sendMessage(number, message);
        console.log(`Message sent to ${number} successfully!`);
      } catch (error) {
        console.error(`Error sending message to ${number}:`, error);
      }
    }));
  } catch (error) {
    console.error('Error in sendGoldRate:', error);
  }
}

// Custom MongoStore class for handling sessions in MongoDB
class MongoStore {
  constructor(collection) {
    this.collection = collection; // MongoDB collection to store sessions
  }

  // Save session data in the MongoDB collection
  async save(id, data) {
    const sessionId = this._ensureIdIsString(id);
    console.log('Saving session ID:', sessionId);
    await this.collection.updateOne(
      { _id: sessionId },
      { $set: { _id: sessionId, data: data } },
      { upsert: true }
    );
  }

  // Load session data from the MongoDB collection
  async load(id) {
    try {
      const sessionId = new String(id);
      console.log(`Loading session for ID: ${sessionId}`);
      const session = await this.collection.findOne({ _id: sessionId });
      if (!session) {
        console.log(`No session found for ID: ${sessionId}`);
        return null;
      }
      return session.data || null;
    } catch (error) {
      console.error(`Failed to load session for ID: ${id}`, error);
      return null;  // Return null in case of error
    }
  }

  // Extract session data (for RemoteAuth)
  async extract(id) {
    const sessionId = new String(id);
    console.log(`Extracting session for ID: ${sessionId}`);
    const session = await this.load(sessionId);
    if (!session) {
      console.log(`No valid session found for ID: ${sessionId}`);
    }
    return session;  // Return session or null if not found
  }

  // Remove session data from the MongoDB collection
  async remove(id) {
    const sessionId = String(id);
    await this.collection.deleteOne({ _id: sessionId });
  }

   // Check if a session exists in the MongoDB collection
   async sessionExists(id) {
    const sessionId = String(id);
    const session = await this.collection.findOne({ _id: sessionId });
    return !!session;
  }

  // Get a session from the MongoDB collection
  async getSession(id) {
    const sessionId = String(id);
    const session = await this.collection.findOne({ _id: sessionId });
    return session ? session.data : null;
  }

  // Set or update a session in the MongoDB collection
  async setSession(id, data) {
    await this.collection.updateOne(
      { _id: id },
      { $set: { _id: id} },
      { upsert: true }
    );
  }

  // Remove a session from the MongoDB collection
  async removeSession(id) {
    await this.collection.deleteOne({ _id: id });
  }

  // Helper method to ensure the ID is always a string
  _ensureIdIsString(id) {
    if (typeof id !== 'string') {
      try {
        return JSON.stringify(id); // Convert object to string if needed
      } catch (error) {
        console.error('Failed to stringify ID:', id, error);
        return String(id); // Fallback to standard string conversion
      }
    }
    return id;
  }
}

async function startWhatsApp() {
  try {
    const client = await connectToMongoDB();
    if (client) {
      const db = client.db('whatsapp');
      const sessionCollection = db.collection('sessions');
      console.log('Connected to MongoDB successfully.');

      const mongoStore = new MongoStore(sessionCollection);
      const whatsappClient = new Client({
        authStrategy: new RemoteAuth({
          store: mongoStore,
          backupSyncIntervalMs: 60000,
        }),
        puppeteer: { 
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu'
          ]
        }
      });

      whatsappClient.on('qr', async (qr) => {
        console.log('QR code received, scan it with your WhatsApp app.');
        qrCodeData = await qrcode.toDataURL(qr);
      });

      whatsappClient.on('ready', () => {
        console.log('Client is ready to use WhatsApp.');
        whatsappClientInstance = whatsappClient;
      });

      whatsappClient.on('disconnected', (reason) => {
        console.log('Client was logged out or disconnected:', reason);
        whatsappClientInstance = null;
        console.log('Re-authenticating...');
        whatsappClient.initialize();
      });

      whatsappClient.initialize();
    } else {
      console.log('Failed to establish a database connection.');
    }
  } catch (error) {
    console.error('Error starting WhatsApp client:', error);
  }
}

// Start the WhatsApp client
startWhatsApp();

// Express routes
app.get('/', (req, res) => {
  if (qrCodeData) {
    res.send(`
      <html>
        <head>
          <title>WhatsApp QR Code</title>
        </head>
        <body style="text-align: center; padding-top: 50px;">
          <h1>Scan the QR Code with your WhatsApp app</h1>
          <img src="${qrCodeData}" alt="QR Code" />
        </body>
      </html>
    `);
  } else {
    res.send(`
      <html>
        <head>
          <title>WhatsApp QR Code</title>
        </head>
        <body style="text-align: center; padding-top: 50px;">
          <h1>Waiting for QR code...</h1>
        </body>
      </html>
    `);
  }
});

// Add a health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK' });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

// Handle process termination
process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Cleaning up...');
  if (worker) {
    await worker.terminate();
  }
  process.exit(0);
});