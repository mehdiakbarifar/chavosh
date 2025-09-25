const backendURL = 'https://chavosh.onrender.com';

const chatEl = document.getElementById('chat');
const inputEl = document.getElementById('input');
const sendBtn = document.getElementById('sendBtn');
const attachBtn = document.getElementById('attachBtn');
const fileInput = document.getElementById('fileInput');
const clearBtn = document.getElementById('clearBtn');
const subtitleEl = document.getElementById('subtitle');
const adminArea = document.getElementById('adminArea');

const progressRow = document.getElementById('progressRow');
const progressBar = document.getElementById('progressBar');
const progressPct = document.getElementById('progressPct');

const contextMenu = document.getElementById('contextMenu');
const blankOverlay = document.getElementById('blankOverlay');
const loginBox = document.getElementById('loginBox');

let contextTarget = null;
let myName = null;
let myEmail = null;
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
  let i=0, num=bytes || 0;
  while(num>=1024 && i<units.length-1){ num/=1024; i++; }
  return `${num.toFixed(num>=10||i===0?0:1)} ${units[i]}`;
}

/* Google login callback */
window.handleGoogleLogin = async (response) => {
  const idToken = response.credential;
  try {
    const res = await fetch(`${backendURL}/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: idToken })
    });
    const data = await res.json();
    handleAuthResponse(data, data.email);
  } catch {
    alert('Google login failed. Please try again.');
  }
};

/* Local login */
async function register() {
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value.trim();
  if (!username || !password) return alert('Please enter both username and password');

  const res = await fetch(`${backendURL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const data = await res.json();
  handleAuthResponse(data, username);
}

async function login() {
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value.trim();
  if (!username || !password) return alert('Please enter both username and password');

  const res = await fetch(`${backendURL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const data = await res.json();
  handleAuthResponse(data, username);
}

function handleAuthResponse(data, username) {
  if (data.status === 'approved') {
    myName = data.name || username;
    myEmail = data.email || username;
    setCookie('chat_name', myName);
    setCookie('chat_email', myEmail);
    subtitleEl.textContent = `Signed in as ${myName}`;
    blankOverlay.style.display = 'none';
    loginBox.style.display = 'none';
    document.getElementById('chatContainer').style.display = 'block';

    if ((myEmail || '').toLowerCase() === 'akbarifar@gmail.com') {
      const adminLink = document.createElement('a');
      adminLink.href = './admin.html';
      adminLink.textContent = 'Admin page';
      adminArea.innerHTML = '';
      adminArea.appendChild(adminLink);
    } else {
      adminArea.innerHTML = '';
    }

    initChat();
  } else {
    blankOverlay.style.display = 'flex';
    loginBox.style.display = 'none';
    subtitleEl.textContent = 'Awaiting admin approval';
    adminArea.innerHTML = '';
    document.getElementById('chatContainer').style.display = 'none';
  }
}


/* Auth header helper */
function authHeaders() {
  const email = myEmail || getCookie('chat_email');
  return email ? { 'X-User-Email': email } : {};
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
  await fetch(`${backendURL}/messages`, { method: 'DELETE', headers: { ...authHeaders(), 'Content-Type': 'application/json' }});
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
    await fetch(`${backendURL}/messages/${contextTarget.id}`, { method: 'DELETE', headers: authHeaders() });
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
  const html = inputEl.innerHTML.trim();
  const plain = inputEl.innerText.trim();
  if (!plain) return;

  await fetch(`${backendURL}/messages`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
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
  xhr.setRequestHeader('X-User-Email', myEmail || getCookie('chat_email') || '');

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
  const res = await fetch(`${backendURL}/messages`, { headers: authHeaders() });
  if (!res.ok) {
    blankOverlay.style.display = 'flex';
    return;
  }
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

/* Initialize chat (after approval) */
function initChat() {
  blankOverlay.style.display = 'none';
  loadMessages(true);
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(loadMessages, 3000);
}

/* Restore session if already approved */
(function restoreSession() {
  document.getElementById('chatContainer').style.display = 'block';

  const savedEmail = getCookie('chat_email');
  const savedName = getCookie('chat_name');
  if (savedEmail && savedName) {
    myEmail = savedEmail;
    myName = savedName;
    subtitleEl.textContent = `Signed in as ${myName}`;

    if ((savedEmail || '').toLowerCase() === 'akbarifar@gmail.com') {
      const adminLink = document.createElement('a');
      adminLink.href = './admin.html';
      adminLink.textContent = 'Admin page';
      adminArea.innerHTML = '';
      adminArea.appendChild(adminLink);
    } else {
      adminArea.innerHTML = '';
    }

    loginBox.style.display = 'none';
    initChat();
  }
})();


