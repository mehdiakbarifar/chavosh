const backendURL = 'https://chavosh.onrender.com';

async function sendMessage() {
  const message = document.getElementById('messageInput').value;
  if (!message.trim()) return;
  await fetch(`${backendURL}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message })
  });
  document.getElementById('messageInput').value = '';
  loadMessages();
}

function uploadFile() {
  const file = document.getElementById('fileInput').files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('file', file);

  const xhr = new XMLHttpRequest();
  xhr.open('POST', `${backendURL}/upload`, true);

  xhr.upload.onprogress = function (e) {
    if (e.lengthComputable) {
      const percent = Math.round((e.loaded / e.total) * 100);
      document.getElementById('uploadStatus').textContent = `Uploading: ${percent}%`;
    }
  };

  xhr.onload = function () {
    if (xhr.status === 200) {
      document.getElementById('uploadStatus').textContent = 'Upload complete!';
      loadMessages();
    } else {
      document.getElementById('uploadStatus').textContent = 'Upload failed.';
    }
  };

  xhr.send(formData);
}

async function clearHistory() {
  await fetch(`${backendURL}/messages`, { method: 'DELETE' });
  loadMessages();
}

async function loadMessages() {
  const res = await fetch(`${backendURL}/messages`);
  const messages = await res.json();
  const chat = document.getElementById('chat');
  chat.innerHTML = '';
  messages.forEach(msg => {
    const div = document.createElement('div');
    div.className = 'message';
    div.setAttribute('data-date', new Date(msg.date).toLocaleString());
    div.innerHTML = msg.text.replace(/\n/g, '<br>');
    chat.appendChild(div);
  });
  chat.scrollTop = chat.scrollHeight;
}

loadMessages();
setInterval(loadMessages, 3000);
