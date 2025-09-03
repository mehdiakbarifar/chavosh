const backendURL = 'https://chavosh.onrender.com';

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

// Cookie helpers
function setCookie(name, value, days=365) {
  const d = new Date();
  d.setTime(d.getTime() + (days*24*60*60*1000));
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; expires=${d.toUTCString()}; path=/; SameSite=Lax`;
}
function getCookie(name) {
  const m = document.cookie.match('(^|;)\\s*' + encodeURIComponent(name) + '\\s*=\\s*([^;]+)');
  return m ? decodeURIComponent(m.pop()) : null;
}

// Formatters
function formatDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch { return iso; }
}
function formatSize(bytes) {
  const units = ['B','KB','MB','GB','TB'];
  let i = 0, num = bytes;
  while (num >= 1024 && i < units.length-1) { num /= 1024; i++; }
  return `${num.toFixed(num >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

// Ensure name (ask once)
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

    function done(name) {
      if (name && name.trim()) {
        myName = name.trim().slice(0, 50);
        setCookie('chat_name', myName);
        subtitleEl.textContent = `Signed in as ${myName}`;
      } else {
        myName = 'Guest';
        setCookie('chat_name', myName);
        subtitleEl.textContent = `Signed in as ${myName}`;
      }
      nameModal.style.display = 'none';
      resolve(myName);
    }

    nameSave.onclick = () => done(nameInput.value);
    nameCancel.onclick = () => done('Guest');
    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); done(nameInput.value); }
    }, { once: false });
  });
}

// Basic client-side cleaner (server will sanitize strictly)
function stripScripts(html) {
  // Remove script/style tags and on* attributes
  const div = document.createElement('div');
  div.innerHTML = html;
  const scripts = div.querySelectorAll('script, style');
  scripts.forEach(n => n.remove());
  div.querySelectorAll('*').forEach(el => {
    [...el.attributes].forEach(attr => {
      if (/^on/i.test(attr.name)) el.removeAttribute(attr.name);
      if (attr.name === 'style') {
        // Keep only safe styles
        const s = el.getAttribute('style');
        const safe = (s || '').split(';').filter(rule => {
          const [prop, val] = rule.split(':').map(x => x && x.trim());
          if (!prop || !val) return false;
          return ['text-align','font-weight','font-style','text-decoration','direction']
            .includes(prop.toLowerCase());
        }).join('; ');
        if (safe) el.setAttribute('style', safe);
        else el.removeAttribute('style');
      }
    });
  });
  return div.innerHTML;
}

// Paste handler to preserve HTML styles (Persian-friendly)
inputEl.addEventListener('paste', (e) => {
  e.preventDefault();
  const html = e.clipboardData.getData('text/html') || '';
  const text = e.clipboardData.getData('text/plain') || '';
  const insert = html ? stripScripts(html) : text.replace(/\n/g, '<br>');
  document.execCommand('insertHTML', false, insert);
});

// Enter to send, Shift+Enter for newline
inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// Buttons
sendBtn.addEventListener('click', sendMessage);
attachBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', uploadFile);
clearBtn.addEventListener('click', async () => {
  await fetch(`${backendURL}/messages`, { method: 'DELETE' });
  await loadMessages();
});

// Send message
async function sendMessage() {
  const html = inputEl.innerHTML.trim();
  // Ignore empty (treat <br> spam as empty)
  const tmp = html.replace(/<br\s*\/?>/gi, '').replace(/&nbsp;/g, '').trim();
  if (!html || !tmp) return;

  await fetch(`${backendURL}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ author: myName, html })
  }).catch(() => {});
  inputEl.innerHTML = '';
  loadMessages(true);
}

// Upload file with progress + author
function uploadFile() {
  const file = fileInput.files[0];
  if (!file) return;

  const form = new FormData();
  form.append('file', file);
  form.append('author', myName);

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

// Render messages
async function loadMessages(scrollToEnd = false) {
  const res = await fetch(`${backendURL}/messages`).catch(() => null);
  if (!res) return;
  const data = await res.json();

  chatEl.innerHTML = '';
  data.forEach(msg => {
    const wrap = document.createElement('div');
    wrap.className = 'message-wrapper ' + (msg.author === myName ? 'me' : 'other');

    const author = document.createElement('div');
    author.className = 'author';
    author.textContent = msg.author || 'Unknown';

    const bubble = document.createElement('div');
    bubble.className = 'message ' + (msg.author === myName ? 'me' : 'other');
    bubble.setAttribute('dir', 'auto');

    if (msg.type === 'file') {
      const chip = document.createElement('div');
      chip.className = 'file-chip';
      const icon = document.createElement('div');
      icon.className = 'file-icon';
      icon.textContent = '⤓';
      const info = document.createElement('div');
      const name = document.createElement('div');
      name.className = 'file-name';
      const link = document.createElement('a');
      link.href = backendURL + msg.fileUrl;
      link.textContent = msg.fileName || 'Download file';
      link.setAttribute('download', '');
      link.target = '_blank';
      const size = document.createElement('div');
      size.className = 'file-size';
      size.textContent = msg.fileSize ? formatSize(msg.fileSize) : '';
      name.appendChild(link);
      info.appendChild(name);
      info.appendChild(size);
      chip.appendChild(icon);
      chip.appendChild(info);
      bubble.appendChild(chip);
    } else {
      // Text message: safe HTML from server
      bubble.innerHTML = msg.html || '';
    }

    const meta = document.createElement('div');
    meta.className = 'message-meta';
    meta.textContent = formatDate(msg.date);

    wrap.appendChild(author);
    wrap.appendChild(bubble);
    wrap.appendChild(meta);
    chatEl.appendChild(wrap);
  });

  if (scrollToEnd) chatEl.scrollTop = chatEl.scrollHeight;
}

//
