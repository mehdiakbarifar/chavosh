const backendURL = 'https://chavosh.onrender.com';

// DOM
const chatEl = document.getElementById('chat');
const inputEl = document.getElementById('input');
const sendBtn = document.getElementById('sendBtn');
const attachBtn = document.getElementById('attachBtn');
const fileInput = document.getElementById('fileInput');
const clearBtn = document.getElementById('clearBtn');
const subtitleEl = document.getElementById('subtitle');

const progressRow = document.getElementById('progressRow');
const progressBar = document.getElementById('progressBar');
const progressPct = document.getElementById('progressPct');

const nameModal = document.getElementById('nameModal');
const nameInput = document.getElementById('nameInput');
const nameSave = document.getElementById('nameSave');
const nameCancel = document.getElementById('nameCancel');

let myName = null;
let pollTimer = null;

/* ---------------- Utils ---------------- */
function setCookie(name, value, days = 365) {
  const d = new Date();
  d.setTime(d.getTime() + (days * 24 * 60 * 60 * 1000));
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; expires=${d.toUTCString()}; path=/; SameSite=Lax`;
}
function getCookie(name) {
  const m = document.cookie.match('(^|;)\\s*' + encodeURIComponent(name) + '\\s*=\\s*([^;]+)');
  return m ? decodeURIComponent(m.pop()) : null;
}
function escapeHTML(str = '') {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function textToHtml(text = '') {
  return escapeHTML(text).replace(/\r\n|\r|\n/g, '<br>');
}
function formatDate(iso) {
  try { return new Date(iso).toLocaleString(); } catch { return iso || ''; }
}
function formatSize(bytes) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0, num = +bytes || 0;
  while (num >= 1024 && i < units.length - 1) { num /= 1024; i++; }
  return `${num.toFixed(num >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

/* -------------- Identity --------------- */
function ensureName() {
  const existing = getCookie('chat_name');
  if (existing) {
    myName = existing;
    subtitleEl.textContent = `Signed in as ${myName}`;
    return Promise.resolve(myName);
  }
  return new Promise((resolve) => {
    nameModal.style.display = 'flex';
    nameInput.focus();

    const done = (name) => {
      myName = name && name.trim() ? name.trim().slice(0, 50) : 'Guest';
      setCookie('chat_name', myName);
      subtitleEl.textContent = `Signed in as ${myName}`;
      nameModal.style.display = 'none';
      resolve(myName);
    };

    nameSave.onclick = () => done(nameInput.value);
    nameCancel.onclick = () => done('Guest');
    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); done(nameInput.value); }
    });
  });
}

/* --------- Paste: keep safe styling -------- */
function stripScripts(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  div.querySelectorAll('script, style').forEach(n => n.remove());
  div.querySelectorAll('*').forEach(el => {
    [...el.attributes].forEach(attr => {
      if (/^on/i.test(attr.name)) el.removeAttribute(attr.name);
      if (attr.name === 'style') {
        const s = el.getAttribute('style') || '';
        const safe = s.split(';').filter(rule => {
          const [prop, val] = rule.split(':').map(x => x && x.trim());
          if (!prop || !val) return false;
          return ['text-align', 'font-weight', 'font-style', 'text-decoration', 'direction']
            .includes(prop.toLowerCase());
        }).join('; ');
        if (safe) el.setAttribute('style', safe);
        else el.removeAttribute('style');
      }
    });
  });
  return div.innerHTML;
}

inputEl.addEventListener('paste', (e) => {
  e.preventDefault();
  const html = e.clipboardData.getData('text/html') || '';
  const text = e.clipboardData.getData('text/plain') || '';
  const insert = html ? stripScripts(html) : textToHtml(text);
  // Insert at caret
  document.execCommand('insertHTML', false, insert);
});

/* --------------- Compose ---------------- */
inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});
sendBtn.addEventListener('click', sendMessage);
attachBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', uploadFile);
clearBtn.addEventListener('click', async () => {
  try {
    await fetch(`${backendURL}/messages`, { method: 'DELETE' });
    await loadMessages(true);
  } catch (e) {
    console.error(e);
  }
});

/* -------------- Actions ----------------- */
async function sendMessage() {
  // Ensure we have a name before sending
  if (!myName) await ensureName();

  const html = inputEl.innerHTML.trim();
  // Consider <br> and &nbsp; empties as empty
  const tmp = html.replace(/<br\s*\/?>/gi, '').replace(/&nbsp;/g, '').trim();
  if (!html || !tmp) return;

  // Plain text fallback for legacy backends
  const plainText = inputEl.innerText;

  try {
    const res = await fetch(`${backendURL}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Send all variants so both new and old backends work
      body: JSON.stringify({ author: myName, html, message: plainText })
    });
    if (!res.ok) {
      // Try legacy body if first attempt fails
      const res2 = await fetch(`${backendURL}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: plainText })
      });
      if (!res2.ok) throw new Error('Sending failed');
    }
  } catch (err) {
    alert('Could not send message. Please try again.');
    console.error(err);
    return;
  }

  inputEl.innerHTML = '';
  loadMessages(true);
}

function uploadFile() {
  const file = fileInput.files[0];
  if (!file) return;

  const form = new FormData();
  form.append('file', file);
  // Works with new backend; old backend just ignores it
  form.append('author', myName || getCookie('chat_name') || 'Guest');

  progressRow.classList.remove('hidden');
  progressBar.style.width = '0%';
  progressPct.textContent = '0%';

  const xhr = new XMLHttpRequest();
  xhr.open('POST', `${backendURL}/upload`, true);

  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) {
      const pct = Math.round((e.loaded / e.total) * 100);
      progressBar.style.width = `${pct}%`;
      progressPct.textContent = `${pct}%`;
    }
  };

  xhr.onload = () => {
    fileInput.value = '';
    setTimeout(() => {
      progressRow.classList.add('hidden');
      progressBar.style.width = '0%';
      progressPct.textContent = '0%';
    }, 350);
    loadMessages(true);
  };
  xhr.onerror = () => {
    progressRow.classList.add('hidden');
    alert('Upload failed. Please try again.');
  };

  xhr.send(form);
}

/* ------------- Rendering ---------------- */
function renderFileBubble(msg, isMine) {
  const bubble = document.createElement('div');
  bubble.className = 'message ' + (isMine ? 'me' : 'other');
  bubble.setAttribute('dir', 'auto');

  const chip = document.createElement('div');
  chip.className = 'file-chip';

  const icon = document.createElement('div');
  icon.className = 'file-icon';
  icon.textContent = '⤓';

  const info = document.createElement('div');

  const name = document.createElement('div');
  name.className = 'file-name';

  const size = document.createElement('div');
  size.className = 'file-size';
  size.textContent = msg.fileSize ? formatSize(msg.fileSize) : '';

  // Prefer downloadable link when available (new backend)
  if (msg.fileUrl) {
    const link = document.createElement('a');
    link.href = backendURL + msg.fileUrl;
    link.textContent = msg.fileName || 'Download file';
    link.setAttribute('download', '');
    link.target = '_blank';
    name.appendChild(link);
  } else {
    // Legacy fallback: just show the name
    name.textContent = msg.fileName || 'File uploaded';
  }

  info.appendChild(name);
  info.appendChild(size);
  chip.appendChild(icon);
  chip.appendChild(info);
  bubble.appendChild(chip);

  return bubble;
}

function renderTextBubble(html, isMine) {
  const bubble = document.createElement('div');
  bubble.className = 'message ' + (isMine ? 'me' : 'other');
  bubble.setAttribute('dir', 'auto');
  bubble.innerHTML = html;
  return bubble;
}

async function loadMessages(scrollToEnd = false) {
  let res;
  try {
    res = await fetch(`${backendURL}/messages`);
  } catch (e) {
    console.error(e);
    return;
  }
  if (!res.ok) return;
  let data;
  try { data = await res.json(); } catch { data = []; }

  chatEl.innerHTML = '';

  data.forEach(raw => {
    // Normalize various backend shapes:
    // - string
    // - { text, date }
    // - { author, type, html, date }
    // - { author, type:'file', fileUrl, fileName, fileSize, date }
    let author = 'Unknown';
    let date = new Date().toISOString();
    let type = 'text';
    let html = '';
    let fileUrl, fileName, fileSize;

    if (typeof raw === 'string') {
      html = textToHtml(raw);
    } else if (raw && typeof raw === 'object') {
      author = raw.author || author;
      date = raw.date || date;

      if (raw.type === 'file' || (raw.fileUrl || raw.fileName)) {
        type = 'file';
        fileUrl = raw.fileUrl || null;
        fileName = raw.fileName || 'File';
        fileSize = raw.fileSize || 0;
      } else if (raw.html) {
        html = raw.html;
      } else if (raw.text) {
        html = textToHtml(raw.text);
      } else {
        html = textToHtml(JSON.stringify(raw));
      }
    }

    const isMine = author === myName;

    const wrap = document.createElement('div');
    wrap.className = 'message-wrapper ' + (isMine ? 'me' : 'other');

    const authorEl = document.createElement('div');
    authorEl.className = 'author';
    authorEl.textContent = author;

    let bubble;
    if (type === 'file') {
      bubble = renderFileBubble({ fileUrl, fileName, fileSize }, isMine);
    } else {
      bubble = renderTextBubble(html, isMine);
    }

    const meta = document.createElement('div');
    meta.className = 'message-meta';
    meta.textContent = formatDate(date);

    wrap.appendChild(authorEl);
    wrap.appendChild(bubble);
    wrap.appendChild(meta);
    chatEl.appendChild(wrap);
  });

  // Auto-scroll: only if requested or near bottom
  const nearBottom = (chatEl.scrollHeight - chatEl.scrollTop - chatEl.clientHeight) < 80;
  if (scrollToEnd || nearBottom) {
    chatEl.scrollTop = chatEl.scrollHeight;
  }
}

/* --------------- Boot ------------------- */
async function init() {
  await ensureName();
  await loadMessages(true);
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(loadMessages, 3000);
}
init();
