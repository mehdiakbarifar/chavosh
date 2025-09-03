const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const upload = multer({ dest: 'uploads/' });

// Store messages in memory for now
let messages = [];

// Send a message
app.post('/messages', (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).send('Message is required');
  messages.push({
    text: message,
    date: new Date().toISOString()
  });
  res.sendStatus(200);
});

// Get all messages
app.get('/messages', (req, res) => {
  res.json(messages);
});

// Clear all messages
app.delete('/messages', (req, res) => {
  messages = [];
  res.sendStatus(200);
});

// Upload a file
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).send('No file uploaded');
  messages.push({
    text: `📎 File uploaded: ${req.file.originalname}`,
    date: new Date().toISOString()
  });
  res.sendStatus(200);
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
