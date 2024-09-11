const { Client, RemoteAuth } = require('whatsapp-web.js');
const { MongoClient } = require('mongodb');
const MAX_RETRIES = 5;
let retryCount = 0;
const qrcode = require('qrcode-terminal');
const axios = require('axios');
const cron = require('node-cron');

// MongoDB connection setup (Replace <username>, <password>, and <cluster-url> with your MongoDB details)
const MONGO_URI = 'mongodb+srv://mongo:mongo123@cluster0.icfu6.mongodb.net/whatsapp?retryWrites=true&w=majority&appName=Cluster0'; // Replace with your connection string

//const client = new MongoClient(MONGO_URI);

async function connectToMongoDB() {
  try {
    console.log('Attempting to connect to MongoDB...');
    const client = new MongoClient(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    await client.connect();
    console.log('Connected to MongoDB successfully');

    // Reset retry counter on success
    retryCount = 0;
    return client;

  } catch (error) {
    console.error('Error connecting to MongoDB:', error.message);

    if (error.code === 'ECONNRESET' || error.syscall === 'read') {
      retryCount += 1;
      if (retryCount <= MAX_RETRIES) {
        const retryDelay = Math.pow(2, retryCount) * 1000; // Exponential backoff
        console.log(`Connection reset. Retrying in ${retryDelay / 1000} seconds... (${retryCount}/${MAX_RETRIES})`);
        
        // Wait and then retry the connection
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        return connectToMongoDB(); // Retry the connection
      } else {
        console.error('Max retries reached. Could not reconnect to MongoDB.');
        process.exit(1); // Exit after maximum retries
      }
    } else {
      console.error('Unexpected error:', error);
      process.exit(1);
    }
  }
}

async function startWhatsApp() {
  try {
    // Connect to MongoDB
    const client = await connectToMongoDB();
    if(client) {
      const db = client.db('whatsapp');
      const sessionCollection = db.collection('sessions');
      console.log('Connected to MongoDB successfully.');
  
      // Create a custom MongoStore using the MongoDB collection
      const mongoStore = new MongoStore(sessionCollection);
  
      
  
      // Initialize WhatsApp client with RemoteAuth strategy
      const whatsappClient = new Client({
        authStrategy: new RemoteAuth({
          store: mongoStore,  // Use MongoDB for session management
          backupSyncIntervalMs: 60000,  // Sync every 1 minute
        }),
        puppeteer: { headless: true }  // Set to false if you want to see the browser for debugging
      });
  
      // Display QR code in terminal if required
      whatsappClient.on('qr', (qr) => {
        console.log('QR code received, scan it with your WhatsApp app.');
        qrcode.generate(qr, { small: true }); // Display the QR code in terminal
      });
  
      // Handle successful authentication and session persistence in MongoDB
      whatsappClient.on('ready', () => {
        console.log('Client is ready to use WhatsApp.');
        
        // Schedule the cron jobs once the client is ready
        scheduleCronJobs(whatsappClient);
      });
  
      // Handle client disconnection and re-authentication if needed
      whatsappClient.on('disconnected', (reason) => {
        console.log('Client was logged out or disconnected:', reason);
        console.log('Re-authenticating...');
        whatsappClient.initialize();
      });
  
      // Initialize the WhatsApp client
      whatsappClient.initialize();
    }
    else {
      console.log('Failed to establish a database connection.');

    }
    


  } catch (error) {
    console.error('Error starting WhatsApp client:', error);
  }
}

const phoneNumbers = [
  '919823519523@c.us',
  '919764026140@c.us',
  
  ];
  
  // Fetch the gold rate from the API
  async function getAbharanGoldRate() {
    try {
      const response = await axios.get('https://services.abharan.com/api/v1/website/dailyrate');
      const goldRate = response.data.data.gold22; // Adjust based on API response
      return goldRate;
    } catch (error) {
      console.error('Error fetching Abharan gold rate:', error);
    }
  }
  
  async function getMalabarGoldRate() {
    try {
      const response = await axios.get('https://www.malabargoldanddiamonds.com/malabarprice/index/getrates/?country=IN&state=Maharashtra');
      const goldRate = response.data["22kt"]; // Adjust based on API response
      return goldRate;
    } catch (error) {
      console.error('Error fetching Malabar gold rate:', error);
    }
  }
  
  async function getPngGoldRate() {
    try {
      const response = await axios.get('https://api-accounts.pngjewellers.com/accounts/cache/PNG_INDIA_METAL_PRICE');
      const goldRate = response.data.responseBody; // Adjust based on API response
    const gold22K = goldRate.find(item => item.metalPurity === "22KT");
    if(gold22K) {
      return gold22K.price;
    } else {
      return null;
    }
    } catch (error) {
      console.error('Error fetching Png gold rate:', error);
    }
  }
  
  // Send gold rate via WhatsApp
  async function sendGoldRate(whatsappClient) {
     const abharanRate = await getAbharanGoldRate();
     const malabarRate = await getMalabarGoldRate();
     const pngRate = await getPngGoldRate();
     
     let message = "Today's Gold Rates:\n";
     
     if (abharanRate) {
      message += `- Abharan: ₹${abharanRate}/g\n`;
    } else {
      message += "- Abharan: Unable to fetch rate.\n";
    }
    
    if (malabarRate) {
      message += `- Malabar: ₹${malabarRate}\n`;
    } else {
      message += "- Malabar: Unable to fetch rates.\n";
    }
    
    if (pngRate) {
      message += `- Png: ₹${pngRate}\n`;
    } else {
      message += "- Png: Unable to fetch rates.\n";
    }
  
      phoneNumbers.forEach(async (number) => {
        try {
          await whatsappClient.sendMessage(number, message);
          console.log(`Message sent to ${number} successfully!`);
        } catch (error) {
          console.error(`Error sending message to ${number}:`, error);
        }
    });
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

// Function to schedule two cron jobs
function scheduleCronJobs(whatsappClient) {
  // Schedule the first job at 10:00 AM every day
  cron.schedule('0 10 * * *', () => {
    console.log('Running cron job at 10:00 AM');
    sendGoldRate(whatsappClient);
  });

  // Schedule the second job at 3:00 PM every day
  cron.schedule('07 17 * * *', () => {
    console.log('Running cron job at 5:00 PM');
    sendGoldRate(whatsappClient);
  });

  cron.schedule('00 17 * * *', () => {
    console.log('Running cron job at 3:00 PM');
    sendGoldRate(whatsappClient);
  });

  console.log('Cron jobs scheduled: 10:00 AM and 5:00 PM');
}

// Start the WhatsApp client with MongoDB RemoteAuth
startWhatsApp();
