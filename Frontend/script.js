async function sendMessage() {
  const message = document.getElementById('messageInput').value;
  await fetch('https://chavosh.onrender.com/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message })
  });
  document.getElementById('messageInput').value = '';
  loadMessages();
}

async function uploadFile() {
  const file = document.getElementById('fileInput').files[0];
  const formData = new FormData();
  formData.append('file', file);
  await fetch('https://chavosh.onrender.com/upload', {
    method: 'POST',
    body: formData
  });
}

async function loadMessages() {
  const res = await fetch('https://chavosh.onrender.com/messages');
  const messages = await res.json();
  const list = document.getElementById('messagesList');
  list.innerHTML = '';
  messages.forEach(msg => {
    const li = document.createElement('li');
    li.textContent = msg;
    list.appendChild(li);
  });
}

loadMessages();
