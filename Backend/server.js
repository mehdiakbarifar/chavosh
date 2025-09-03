const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const messages = [];
const upload = multer({ dest: 'uploads/' });

app.post('/messages', (req, res) => {
  messages.push(req.body.message);
  res.sendStatus(200);
});

app.get('/messages', (req, res) => {
  res.json(messages);
});

app.post('/upload', upload.single('file'), (req, res) => {
  console.log('File uploaded:', req.file.originalname);
  res.sendStatus(200);
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
