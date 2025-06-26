const { Client, LocalAuth, MessageMedia, Poll } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Create Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// WhatsApp client setup
const client = new Client({
    puppeteer: {
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        // Uncomment and set the path to Chrome for video/GIF support
        // executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    },
    authStrategy: new LocalAuth({
        dataPath: 'franky45'
    })
});

// Client status variable
let clientReady = false;

client.on('ready', () => {
    console.log('Client is ready!');
    clientReady = true;
});

// Listening to all incoming messages
client.on('message_create', async (message) => {
    console.log(message);
    console.log(message.to);
    console.log(message.from);
    console.log(message.body);

    // Example of downloading media from incoming messages
    if (message.hasMedia) {
        try {
            const media = await message.downloadMedia();
            if (media) {
                console.log('Media downloaded successfully');
                console.log('Mime type:', media.mimetype);
                console.log('Filename:', media.filename);
                // You can save or process the media here
            } else {
                console.log('Failed to download media');
            }
        } catch (error) {
            console.error('Error downloading media:', error);
        }
    }

    if (message.from === '120363401688020574@g.us' && !message.id.fromMe) {

        // Generate current timestamp in ISO format
        const timestamp = new Date().toISOString();

        // Prepare query params
        const params = {
            message: message.body,
            from: message.from,
            chatId: '120363401688020574@g.us',
            timestamp: timestamp,
            messageType: 'text'
        };

        console.log('http://localhost:5678/webhook/barber-salon-booking?message=' + encodeURIComponent(message.body) + '&from=' + encodeURIComponent(message.from) + '&chatId=120363401688020574@g.us' + '&timestamp=' + encodeURIComponent(timestamp) + '&messageType=text');

        // Send GET request
        axios.get('http://localhost:5678/webhook/barber-salon-booking?message=' + encodeURIComponent(message.body) + '&from=' + encodeURIComponent(message.from) + '&chatId=120363401688020574@g.us' + '&timestamp=' + encodeURIComponent(timestamp) + '&messageType=text')
            .then(response => {
                console.log('Response Status:', response.status);
                console.log('Response Data:', response.data);
            })
            .catch(error => {
                console.error('Error:', error.message);
            });

    }


    if (message.body === '!ping') {
        const poll = new Poll(
            'What’s your favorite color?',
            ['Red', 'Green', 'Blue', 'Yellow'],
            { allowMultipleAnswers: false } // single-answer poll
        );
        await client.sendMessage("120363401688020574@g.us", poll);
        // send back "pong" to the chat the message was sent in
        message.reply('pong');
        client.sendMessage("120363401688020574@g.us", 'pong');
    }
});

// Add this variable to store the latest QR code
let latestQrCode = '';

// Modify the existing QR event handler to store the QR code
client.on('qr', qr => {
    // Store the QR code for API access
    latestQrCode = qr;
    // Still display in terminal as before
    qrcode.generate(qr, { small: true });
});

client.initialize();

// API Routes

// Health check endpoint
app.get('/api/status', (req, res) => {
    res.json({
        status: 'online',
        clientReady: clientReady
    });
});

// Send text message endpoint
app.post('/api/send-message', async (req, res) => {
    try {
        if (!clientReady) {
            return res.status(503).json({ success: false, message: 'WhatsApp client not ready' });
        }

        const { chatId, message } = req.body; 

        if (!chatId || !message) {
            return res.status(400).json({ success: false, message: 'chatId and message are required' });
        }

        const sentMessage = await client.sendMessage(chatId, message);

        // Wait for a short time to allow ack status to update (optional)
        await new Promise(resolve => setTimeout(resolve, 1000));
        console.log("sentMessagesentMessagesentMessagesentMessage");
        console.log(sentMessage);
        

        res.json({
            success: true,
            message:  'Message sent successfully' ,
            messageId: sentMessage.id._serialized,
            
        });
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send message',
            error: error.message
        });
    }
});


// Send media from local file endpoint
app.post('/api/send-media-from-file', upload.single('file'), async (req, res) => {
    try {
        if (!clientReady) {
            return res.status(503).json({ success: false, message: 'WhatsApp client not ready' });
        }

        const { chatId } = req.body;

        if (!chatId) {
            return res.status(400).json({ success: false, message: 'chatId is required' });
        }

        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }

        const filePath = req.file.path;
        const caption = req.body.caption || '';

        // Using the fromFilePath helper as mentioned in the documentation
        const media = MessageMedia.fromFilePath(filePath);
        const sentMessage = await client.sendMessage(chatId, media, { caption });

        // Optionally remove the file after sending
        fs.unlinkSync(filePath);

        res.json({
            success: true,
            message: 'Media sent successfully',
            messageId: sentMessage.id._serialized
        });
    } catch (error) {
        console.error('Error sending media:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send media',
            error: error.message
        });
    }
});

// Send media from URL endpoint
app.post('/api/send-media-from-url', async (req, res) => {
    try {
        if (!clientReady) {
            return res.status(503).json({ success: false, message: 'WhatsApp client not ready' });
        }

        const { chatId, url, caption } = req.body;

        if (!chatId || !url) {
            return res.status(400).json({ success: false, message: 'chatId and url are required' });
        }

        // Using the fromUrl helper as mentioned in the documentation
        const media = await MessageMedia.fromUrl(url, { unsafeMime: true });
        const sentMessage = await client.sendMessage(chatId, media, { caption });

        res.json({
            success: true,
            message: 'Media from URL sent successfully',
            messageId: sentMessage.id._serialized
        });
    } catch (error) {
        console.error('Error sending media from URL:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send media from URL',
            error: error.message
        });
    }
});

// Send media from base64 data endpoint
app.post('/api/send-media-from-data', async (req, res) => {
    try {
        if (!clientReady) {
            return res.status(503).json({ success: false, message: 'WhatsApp client not ready' });
        }

        const { chatId, mimetype, data, filename, caption } = req.body;

        if (!chatId || !mimetype || !data) {
            return res.status(400).json({
                success: false,
                message: 'chatId, mimetype, and data are required'
            });
        }

        // Creating a MessageMedia object directly as shown in the documentation
        const media = new MessageMedia(mimetype, data, filename);
        const sentMessage = await client.sendMessage(chatId, media, { caption });

        res.json({
            success: true,
            message: 'Media from data sent successfully',
            messageId: sentMessage.id._serialized
        });
    } catch (error) {
        console.error('Error sending media from data:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send media from data',
            error: error.message
        });
    }
});

// Add this new API route before app.listen
// Get QR code endpoint
app.get('/api/qrcode', (req, res) => {
    if (latestQrCode) {
        res.json({
            success: true,
            qrCode: latestQrCode
        });
    } else {
        res.status(404).json({
            success: false,
            message: 'QR code not available. Client might be already authenticated.'
        });
    }
});

// Start the server
app.get('/qrcode', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.listen(PORT, () => {
    console.log(`WhatsApp API server running on port ${PORT}`);
});
