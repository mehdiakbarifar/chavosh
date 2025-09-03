const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.use('/uploads', express.static(UPLOAD_DIR));
app.use(cors());
app.use(express.json());

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/[^\p{L}\p{N}\-_ ]/gu, '').slice(0, 60) || 'file';
    const unique = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    cb(null, `${base}-${unique}${ext}`);
  }
});
const upload = multer({ storage });

let messages = [];
const makeId = () => `${Date.now()}_${Math.random().toString(36).slice(2,8)}`;

// Send text message
app.post('/messages', (req, res) => {
  const { author, html, message } = req.body || {};
  const content = html || (message && message.replace(/\n/g, '<br>'));
  if (!content) return res.status(400).send('Message required');
  messages.push({
    id: makeId(),
    author: author || 'Guest',
    type: 'text',
    html: content,
    date: new Date().toISOString()
  });
  res.sendStatus(200);
});

// Get messages
app.get('/messages', (req, res) => res.json(messages));

// Delete all messages & files
app.delete('/messages', (req, res) => {
  messages.forEach(msg => {
    if (msg.type === 'file' && msg.fileUrl) {
      const filePath = path.join(__dirname, msg.fileUrl.replace(/^\/+/, ''));
      fs.unlink(filePath, () => {});
    }
  });
  messages = [];
  res.sendStatus(200);
});

// Delete one message
app.delete('/messages/:id', (req, res) => {
  const idx = messages.findIndex(m => m.id === req.params.id);
  if (idx === -1) return res.status(404).send('Not found');
  const msg = messages[idx];
  if (msg.type === 'file' && msg.fileUrl) {
    const filePath = path.join(__dirname, msg.fileUrl.replace(/^\/+/, ''));
    fs.unlink(filePath, () => {});
  }
  messages.splice(idx, 1);
  res.sendStatus(200);
});

// Upload file
app.post('/upload', upload.single('file'), (req, res) => {
  const author = req.body.author || 'Guest';
  if (!req.file) return res.status(400).send('No file');
  const fileUrl = `/uploads/${req.file.filename}`;
  messages.push({
    id: makeId(),
    author,
    type: 'file',
    fileUrl,
    fileName: req.file.originalname,
    fileSize: req.file.size,
    date: new Date().toISOString()
  });
  res.json({ ok: true });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
