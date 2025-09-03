const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sanitizeHtml = require('sanitize-html');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure uploads directory exists
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Serve uploaded files
app.use('/uploads', express.static(UPLOAD_DIR, {
  setHeaders: (res) => {
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
  }
}));

app.use(cors());
app.use(express.json());

// Multer storage to keep original extension and unique filename
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/[^\p{L}\p{N}\-_ ]/gu, '').slice(0, 60);
    const safeBase = base || 'file';
    const unique = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    cb(null, `${safeBase}-${unique}${ext}`);
  }
});
const upload = multer({ storage });

// In-memory messages
// type: 'text' | 'file'
// { id, author, type, html?, fileUrl?, fileName?, fileSize?, mime?, date }
let messages = [];

// HTML sanitizer config to preserve common styles safely
const sanitizeConfig = {
  allowedTags: [
    'b','i','em','strong','u','s','sup','sub','br','p','div','span','blockquote','pre','code','ul','ol','li','a'
  ],
  allowedAttributes: {
    a: ['href', 'name', 'target', 'rel'],
    '*': ['dir', 'lang']
  },
  // Limit styles to text emphasis and alignment; block dangerous CSS
  allowedStyles: {
    '*': {
      'text-align': [/^left$|^right$|^center$|^justify$/i],
      'font-weight': [/^bold$|^700$|^600$/i],
      'font-style': [/^italic$/i],
      'text-decoration': [/^underline$|^line-through$/i],
      'direction': [/^rtl$|^ltr$/i]
    }
  },
  transformTags: {
    'a': (tagName, attribs) => {
      const href = attribs.href || '#';
      // Force safe links
      if (!/^https?:\/\//i.test(href)) {
        return { tagName: 'span', attribs: {}, text: attribs.href || '' };
      }
      return {
        tagName: 'a',
        attribs: { href, target: '_blank', rel: 'noopener noreferrer' }
      };
    }
  },
  disallowedTagsMode: 'discard'
};

// Helpers
const makeId = () => `${Date.now()}_${Math.random().toString(36).slice(2,8)}`;

// Send a text message (HTML allowed, sanitized)
app.post('/messages', (req, res) => {
  const { author, html } = req.body || {};
  if (!author || typeof author !== 'string' || !html) {
    return res.status(400).json({ error: 'author and html are required' });
  }
  const clean = sanitizeHtml(html, sanitizeConfig).trim();
  if (!clean) {
    return res.status(400).json({ error: 'Message content is empty after sanitization' });
  }
  const msg = {
    id: makeId(),
    author: author.slice(0, 50),
    type: 'text',
    html: clean,
    date: new Date().toISOString()
  };
  messages.push(msg);
  res.status(200).json({ ok: true, id: msg.id });
});

// Get all messages
app.get('/messages', (req, res) => {
  res.json(messages);
});

// Clear all messages (history)
app.delete('/messages', (req, res) => {
  messages = [];
  res.sendStatus(200);
});

// Upload a file and post a file message
app.post('/upload', upload.single('file'), (req, res) => {
  const author = (req.body.author || '').slice(0, 50);
  if (!author) return res.status(400).json({ error: 'author is required' });
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const fileUrl = `/uploads/${req.file.filename}`;
  const msg = {
    id: makeId(),
    author,
    type: 'file',
    fileUrl,
    fileName: req.file.originalname,
    fileSize: req.file.size,
    mime: req.file.mimetype,
    date: new Date().toISOString()
  };
  messages.push(msg);

  res.status(200).json({
    ok: true,
    url: fileUrl,
    originalName: req.file.originalname,
    size: req.file.size,
    mime: req.file.mimetype
  });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
