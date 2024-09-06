const axios = require('axios');
const express = require('express');
const puppeteer = require('puppeteer');
const qrcode = require('qrcode');
const { Client } = require('whatsapp-web.js');
const cron = require('node-cron');
const app = express();
const fetch = require('node-fetch');

const port = 3000;

app.use(express.static('public'));


setInterval(() => {
  fetch('https://gold-tracker-gzku.onrender.com/health')
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



// Initialize WhatsApp client
const client = new Client({
  puppeteer: {
    headless: true, // Run in headless mode
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process', // <- this one doesn't work in Windows
      '--disable-gpu'
    ]
  }
});
let qrCodeString = ''; // Store the WhatsApp QR code

client.on('qr', async (qr) => {
  // Generate and scan this QR code with your phone's WhatsApp
  //qrcode.generate(qr, { small: true });
  console.log('Scan this QR code in WhatsApp to log in:');
  console.log(qr);
  qrCodeString =  await qrcode.toDataURL(qr);
});

client.on('ready', async () => {
  console.log('WhatsApp client is ready!');
  // Fetch gold rate and send the message
  await sendGoldRate();
  console.log('Gold rates have been sent!');
});

// Initialize the WhatsApp client
client.initialize();

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
async function sendGoldRate() {
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
        await client.sendMessage(number, message);
        console.log(`Message sent to ${number} successfully!`);
      } catch (error) {
        console.error(`Error sending message to ${number}:`, error);
      }
  });
}

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
