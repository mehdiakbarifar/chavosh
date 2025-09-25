// backend/server.js
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const nodemailer = require('nodemailer');
const { OAuth2Client } = require('google-auth-library');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5500'; // Change to your deployed frontend
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID; // Required
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'akbarifar@gmail.com';

if (!GOOGLE_CLIENT_ID) {
  console.error('GOOGLE_CLIENT_ID is required in .env');
}

const client = new OAuth2Client(GOOGLE_CLIENT_ID);

// Storage paths
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const APPROVED_PATH = path.join(__dirname, 'approved.json');
const PENDING_PATH = path.join(__dirname, 'pending.json');

// Ensure folders/files exist
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(APPROVED_PATH)) fs.writeFileSync(APPROVED_PATH, JSON.stringify([]));
if (!fs.existsSync(PENDING_PATH)) fs.writeFileSync(PENDING_PATH, JSON.stringify([]));

// Helpers for persistence
function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return []; }
}
function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

let approvedUsers = readJson(APPROVED_PATH);
let pendingUsers = readJson(PENDING_PATH);

// In-memory messages
let messages = [];
const makeId = () => `${Date.now()}_${Math.random().toString(36).slice(2,8)}`;

// Multer storage
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

// Middleware
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(cors({ origin: FRONTEND_ORIGIN, credentials: true }));
app.use(express.json());

// Nodemailer transporter (use Gmail App Password)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.MAIL_USER,       // e.g. your Gmail address
    pass: process.env.MAIL_APP_PASS    // Gmail App Password
  }
});

// Send approval email to admin
async function sendApprovalEmail(email) {
  const approvalLink = `${process.env.SERVER_PUBLIC_URL || `http://localhost:${PORT}`}/approve?email=${encodeURIComponent(email)}`;

  const mail = {
    from: `"CHAVOSH Admin" <${process.env.MAIL_USER}>`,
    to: ADMIN_EMAIL,
    subject: 'New User Approval Needed',
    html: `
      <p>User <b>${email}</b> requested access to CHAVOSH Chat Box.</p>
      <p><a href="${approvalLink}">Click here to approve</a></p>
      <p>If you didn’t expect this, you can ignore this email.</p>
    `
  };

  try {
    await transporter.sendMail(mail);
    console.log('Approval email sent to admin for:', email);
  } catch (err) {
    console.error('Error sending approval email:', err);
  }
}

// Verify Google ID token and handle approval logic
app.post('/auth/google', async (req, res) => {
  const { token } = req.body || {};
  if (!token) return res.status(400).json({ error: 'Missing token' });

  let payload;
  try {
    const ticket = await client.verifyIdToken({ idToken: token, audience: GOOGLE_CLIENT_ID });
    payload = ticket.getPayload();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const email = payload.email;
  const name = payload.name || email;

  // Already approved
  if (approvedUsers.includes(email)) {
    return res.json({ status: 'approved', email, name });
  }

  // Not approved => add to pending and email admin
  if (!pendingUsers.includes(email)) {
    pendingUsers.push(email);
    writeJson(PENDING_PATH, pendingUsers);
    sendApprovalEmail(email);
  }

  return res.json({ status: 'pending' });
});

// Admin approval endpoint
app.get('/approve', (req, res) => {
  const email = req.query.email;
  if (!email) return res.status(400).send('Missing email');

  // Move from pending to approved
  if (!approvedUsers.includes(email)) {
    approvedUsers.push(email);
    writeJson(APPROVED_PATH, approvedUsers);
  }
  pendingUsers = pendingUsers.filter(e => e !== email);
  writeJson(PENDING_PATH, pendingUsers);

  res.send(`User ${email} approved. You may close this tab.`);
});

// Gate endpoints: require approved user via email header
function requireApproved(req, res, next) {
  const email = req.header('X-User-Email');
  if (!email || !approvedUsers.includes(email)) {
    return res.status(403).json({ error: 'Not authorized' });
  }
  req.userEmail = email;
  next();
}

/* -------- Chat endpoints (protected) -------- */

// Send text message
app.post('/messages', requireApproved, (req, res) => {
  const { author, html, message } = req.body || {};
  const content = html || (message && message.replace(/\n/g, '<br>'));
  if (!content) return res.status(400).send('Message required');
  messages.push({
    id: makeId(),
    author: author || req.userEmail,
    type: 'text',
    html: content,
    date: new Date().toISOString()
  });
  res.sendStatus(200);
});

// Get messages
app.get('/messages', requireApproved, (req, res) => res.json(messages));

// Delete all messages & files
app.delete('/messages', requireApproved, (req, res) => {
  messages.forEach(msg => {
    if (msg.type === 'file' && msg.fileUrl) {
      const filePath = path.join(__dirname, msg.fileUrl.replace(/^\/+/, ''));
      fs.unlink(filePath, () => {});
    }
  });
  messages = [];
  res.sendStatus(200);
});

// Delete one message by ID
app.delete('/messages/:id', requireApproved, (req, res) => {
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
app.post('/upload', requireApproved, upload.single('file'), (req, res) => {
  const author = req.body.author || req.userEmail;
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

/* ------------------------------------------ */

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
