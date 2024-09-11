const axios = require('axios');
const fs = require('fs');
const express = require('express');
const puppeteer = require('puppeteer');
const qrcode = require('qrcode-terminal');
const { Client, RemoteAuth } = require('whatsapp-web.js');
const { MongoClient } = require('mongodb');
const cron = require('node-cron');
const app = express();
const fetch = require('node-fetch');


const port = 3000;

app.use(express.static('public'));


class MongoStore {
  constructor(collection) {
    this.collection = collection; // MongoDB collection to store sessions
  }

  async save(id, data) {
    await this.collection.updateOne(
      { _id: id },
      { $set: { _id: id, data: data } },
      { upsert: true }
    );
  }

  // Extract session data (for RemoteAuth)
  async extract(id) {
    const session = await this.load(id);
    return session ? session : null; // Return session data or null if not found
  }

  // Remove session data from the MongoDB collection
  async remove(id) {
      await this.collection.deleteOne({ _id: id });
  }

  // Load session data from the MongoDB collection
  async load(id) {
    const session = await this.collection.findOne({ _id: id });
    return session ? session.data : null;
  }

  // Check if a session exists in the MongoDB collection
  async sessionExists(id) {
    const session = await this.collection.findOne({ _id: id });
    return !!session;
  }

  // Get a session from the MongoDB collection
  async getSession(id) {
    const session = await this.collection.findOne({ _id: id });
    return session ? session.data : null;
  }

  // Set or update a session in the MongoDB collection
  async setSession(id, data) {
    await this.collection.updateOne(
      { _id: id },
      { $set: { _id: id, data: data } },
      { upsert: true }
    );
  }

  // Remove a session from the MongoDB collection
  async removeSession(id) {
    await this.collection.deleteOne({ _id: id });
  }
}

// Function to schedule two cron jobs
function scheduleCronJobs(whatsappClient) {
  // Schedule the first job at 10:00 AM every day
  cron.schedule('0 12 * * *', () => {
    console.log('Running cron job at 10:00 AM');
    sendGoldRate(whatsappClient);
  });

  cron.schedule('45 11 * * *', () => {
    console.log('Running cron job at 10:00 AM');
    sendGoldRate(whatsappClient);
  });

  // Schedule the second job at 3:00 PM every day
  cron.schedule('30 17 * * *', () => {
    console.log('Running cron job at 3:00 PM');
    sendGoldRate(whatsappClient);
  });

  console.log('Cron jobs scheduled: 10:00 AM and 3:00 PM');
}


// MongoDB connection setup
const MONGO_URI = 'mongodb+srv://mongo:mongo123@cluster0.icfu6.mongodb.net/whatsapp?retryWrites=true&w=majority&appName=Cluster0'; // Replace with your connection string

const client = new MongoClient(MONGO_URI);

async function startWhatsApp() {
  try {
    
    await client.connect();
    const db = client.db('whatsapp');
    const sessionCollection = db.collection('sessions');
    console.log('Connected to MongoDB successfully.');

    // Create a custom MongoStore using the MongoDB collection
    const mongoStore = new MongoStore(sessionCollection);

    // RemoteAuth strategy using MongoDB to store session data
    const authStrategy = new RemoteAuth({
      store: mongoStore,  // MongoDB collection to store session dat        // MongoClient instance
      backupSyncIntervalMs: 60000
    });

    // Initialize WhatsApp client with RemoteAuth strategy
    const whatsappClient = new Client({
      authStrategy,              // Use RemoteAuth to store session
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

      scheduleCronJobs(whatsappClient);
      
      // Call the sendGoldRates function once the client is ready
      //sendGoldRate(whatsappClient); // Send gold rates after authentication
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
  catch (error) {
    console.error('Error starting WhatsApp client:', error);
  }

}


/*let sessionData;

if (fs.existsSync(SESSION_FILE_PATH)) {
  try {
    sessionData = require(SESSION_FILE_PATH); // Load session data
    console.log('Session data loaded:', sessionData);

  }
  catch (error) {
    console.error('Error loading session data:', error);
    sessionData = null; // Set to null if loading fails
  }
}


// Initialize WhatsApp client
const client = new Client({
  puppeteer: { headless: true }, // Set to false if you want to see the browser
  session: sessionData,
});

setInterval(() => {
  fetch('http://localhost:3000/health')
    .then(res => res.text())
    .then(body => {
      console.log('Keep-alive ping successful:', body);
    })
    .catch(err => {
      console.error('Error in keep-alive ping:', err);
    });
}, 5 * 60 * 1000); // Ping every 5 minutes (300000 milliseconds)


// Schedule to run every day at 10 AM
cron.schedule('00 12 * * *', () => {
  console.log('Fetching gold rate and sending WhatsApp message...');
  sendGoldRate();
});

// Schedule to run every day at 5:30 PM
cron.schedule('30 18 * * *', () => {
  console.log('Fetching gold rate and sending WhatsApp message...');
  sendGoldRate();
});




client.on('qr',  (qr) => {
  // Generate and scan this QR code with your phone's WhatsApp
  //qrcode.generate(qr, { small: true });
  console.log('QR code received. Scan it with your WhatsApp app.');
  qrcode.generate(qr, { small: true }); // This will display the QR code in your terminal
});

// Save session data after successful authentication
client.on('authenticated', (session) => {
  console.log('Authenticated successfully!');
  try {
    fs.writeFileSync(SESSION_FILE_PATH, JSON.stringify(session));
    console.log('Session data saved successfully.');
  } catch (error) {
    console.error('Error writing session data to file:', error);
  }
});


client.on('ready',  () => {
  console.log('WhatsApp client is ready!');
  // Fetch gold rate and send the message
  sendGoldRate();
  console.log('Gold rates have been sent!');
});

// Initialize the WhatsApp client
client.initialize();*/

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

// Start the WhatsApp client with MongoDB RemoteAuth
startWhatsApp();

// Endpoint to display the WhatsApp QR code in an HTML page
app.get('/whatsapp-login', (req, res) => {
  if (!qrCodeString) {
    res.send('<h1>Waiting for WhatsApp QR Code...</h1>');
  } else {
    res.send(`
      <html>
        <body>
          <h1>Scan this QR Code to log in to WhatsApp</h1>
          <img src="${qrCodeString}" alt="WhatsApp QR Code"/>
        </body>
      </html>
    `);
  }
});

app.get('/health', (req, res) => {
  res.status(200).send('Alive'); // Respond with 'Alive' or 'OK'
});



app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
