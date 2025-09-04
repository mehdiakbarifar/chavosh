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

const contextMenu = document.getElementById('contextMenu');
let contextTarget = null;
let myName = null;
let pollTimer = null;

/* Cookie helpers */
function setCookie(name, value, days = 365) {
  const d = new Date();
  d.setTime(d.getTime() + (days * 864e5));
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; expires=${d.toUTCString()}; path=/; SameSite=Lax`;
}
function getCookie(name) {
  const m = document.cookie.match('(^|;)\\s*' + encodeURIComponent(name) + '\\s*=\\s*([^;]+)');
  return m ? decodeURIComponent(m.pop()) : null;
}

/* Formatters */
const formatDate = iso => new Date(iso).toLocaleString();
function formatSize(bytes) {
  const units = ['B','KB','MB','GB'];
  let i=0, num=bytes;
  while(num>=1024 && i<units.length-1){ num/=1024; i++; }
  return `${num.toFixed(num>=10||i===0?0:1)} ${units[i]}`;
}

/* Name prompt */
function ensureName() {
  const existing = getCookie('chat_name');
  if (existing) {
    myName = existing;
    subtitleEl.textContent = `Signed in as ${myName}`;
    return Promise.resolve();
  }
  return new Promise(res => {
    nameModal.style.display = 'flex';
    nameSave.onclick = () => {
      myName = nameInput.value.trim() || 'Guest';
      setCookie('chat_name', myName);
      subtitleEl.textContent = `Signed in as ${myName}`;
      nameModal.style.display = 'none';
      res();
    };
    nameCancel.onclick = () => {
      myName = 'Guest';
      setCookie('chat_name', myName);
      subtitleEl.textContent = `Signed in as ${myName}`;
      nameModal.style.display = 'none';
      res();
    };
  });
}

/* Paste handler */
inputEl.addEventListener('paste', e => {
  e.preventDefault();
  const html = e.clipboardData.getData('text/html') || '';
  const text = e.clipboardData.getData('text/plain') || '';
  document.execCommand('insertHTML', false, html || text.replace(/\n/g, '<br>'));
});

/* Send on Enter */
inputEl.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});
sendBtn.onclick = sendMessage;
attachBtn.onclick = () => fileInput.click();
fileInput.onchange = uploadFile;
clearBtn.onclick = async () => {
  await fetch(`${backendURL}/messages`, { method: 'DELETE' });
  loadMessages();
};

/* Context menu */
chatEl.addEventListener('contextmenu', e => {
  const msgEl = e.target.closest('.message-wrapper');
  if (!msgEl) return;
  e.preventDefault();
  contextTarget = {
    id: msgEl.dataset.id,
    isFile: msgEl.dataset.type === 'file',
    element: msgEl
  };
  contextMenu.querySelector('[data-action="save"]').style.display = contextTarget.isFile ? 'block' : 'none';
  contextMenu.style.top = `${e.pageY}px`;
  contextMenu.style.left = `${e.pageX}px`;
  contextMenu.style.display = 'block';
});
document.addEventListener('click', () => {
  contextMenu.style.display = 'none';
});
contextMenu.addEventListener('click', async e => {
  const action = e.target.dataset.action;
  if (!action || !contextTarget) return;

  if (action === 'delete') {
    await fetch(`${backendURL}/messages/${contextTarget.id}`, { method: 'DELETE' });
    loadMessages();
  }
  if (action === 'copy') {
    const bubble = contextTarget.element.querySelector('.message');
    await navigator.clipboard.writeText(bubble.innerText);
    alert('Message copied to clipboard');
  }
  if (action === 'save' && contextTarget.isFile) {
    const link = contextTarget.element.querySelector('.file-name a');
    if (link) {
      const a = document.createElement('a');
      a.href = link.href;
      a.download = link.textContent;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  }
  contextMenu.style.display = 'none';
});

/* Send message */
async function sendMessage() {
  if (!myName) await ensureName();
  const html = inputEl.innerHTML.trim();
  const plain = inputEl.innerText.trim();
  if (!plain) return;

  await fetch(`${backendURL}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ author: myName, html, message: plain })
  });
  inputEl.innerHTML = '';
  loadMessages(true);
}

/* Upload file */
function uploadFile() {
  const file = fileInput.files[0];
  if (!file) return;

  const form = new FormData();
  form.append('file', file);
  form.append('author', myName || 'Guest');

  progressRow.style.display = 'flex';
  progressBar.style.width = '0%';
  progressPct.textContent = '0%';

  const xhr = new XMLHttpRequest();
  xhr.open('POST', `${backendURL}/upload`, true);

  xhr.upload.onprogress = e => {
    if (e.lengthComputable) {
      const pct = Math.round((e.loaded / e.total) * 100);
      progressBar.style.width = `${pct}%`;
      progressPct.textContent = `${pct}%`;
    }
  };
  xhr.onload = () => {
    fileInput.value = '';
    setTimeout(() => {
      progressRow.style.display = 'none';
      progressBar.style.width = '0%';
      progressPct.textContent = '0%';
    }, 500);
    loadMessages(true);
  };
  xhr.onerror = () => {
    progressRow.style.display = 'none';
    alert('Upload failed.');
  };
  xhr.send(form);
}

/* Load messages */
async function loadMessages(scrollToEnd = false) {
  const res = await fetch(`${backendURL}/messages`);
  const data = await res.json();
  chatEl.innerHTML = '';

  data.forEach(msg => {
    const wrap = document.createElement('div');
    wrap.className = 'message-wrapper ' + (msg.author === myName ? 'me' : 'other');
    wrap.dataset.id = msg.id;
    wrap.dataset.type = msg.type || 'text';

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
      link.textContent = msg.fileName || 'Download';
      link.setAttribute('download', '');
      link.target = '_blank';
      const size = document.createElement('div');
      size.className = 'file-size';
      size.textContent = formatSize(msg.fileSize);
      name.appendChild(link);
      info.appendChild(name);
      info.appendChild(size);
      chip.appendChild(icon);
      chip.appendChild(info);
      bubble.appendChild(chip);
    } else {
      // For text messages, insert the HTML content (already sanitized server-side)
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

  if (scrollToEnd) {
    chatEl.scrollTop = chatEl.scrollHeight;
  }
}

/* ---------------- Initialize ---------------- */
async function init() {
  await ensureName();
  await loadMessages(true);
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(loadMessages, 3000);
}

init();
