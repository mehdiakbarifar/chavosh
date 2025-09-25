// frontend/admin.js
const backendURL = 'https://chavosh.onrender.com'; // Change to your backend URL

const statusEl = document.getElementById('status');
const pendingListEl = document.getElementById('pendingList');
const approvedListEl = document.getElementById('approvedList');

/* Cookie helpers */
function getCookie(name) {
  const m = document.cookie.match('(^|;)\\s*' + encodeURIComponent(name) + '\\s*=\\s*([^;]+)');
  return m ? decodeURIComponent(m.pop()) : null;
}
function authHeaders() {
  const email = getCookie('chat_email');
  return email ? { 'X-User-Email': email, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

/* Ensure admin */
const myEmail = (getCookie('chat_email') || '').toLowerCase();
if (myEmail !== 'akbarifar@gmail.com') {
  statusEl.innerHTML = 'Access denied. Only admin can view this page.';
  statusEl.classList.add('blocked');
} else {
  loadAdminData();
}

async function loadAdminData() {
  statusEl.textContent = 'Loading pending and approved users…';
  try {
    const [pendingRes, approvedRes] = await Promise.all([
      fetch(`${backendURL}/admin/pending`, { headers: authHeaders() }),
      fetch(`${backendURL}/admin/approved`, { headers: authHeaders() })
    ]);

    if (!pendingRes.ok || !approvedRes.ok) {
      statusEl.textContent = 'Authorization failed. Ensure you are logged in as admin.';
      statusEl.classList.add('blocked');
      return;
    }

    const pendingData = await pendingRes.json();
    const approvedData = await approvedRes.json();

    renderList(pendingListEl, pendingData.pending, true);
    renderList(approvedListEl, approvedData.approved, false);

    statusEl.textContent = 'Ready.';
  } catch {
    statusEl.textContent = 'Error loading data.';
    statusEl.classList.add('blocked');
  }
}

function renderList(container, items, isPending) {
  container.innerHTML = '';
  if (!items || items.length === 0) {
    container.innerHTML = '<div class="item"><em>None</em></div>';
    return;
  }
  items.forEach(email => {
    const row = document.createElement('div');
    row.className = 'item';
    const left = document.createElement('div');
    left.textContent = email;
    const right = document.createElement('div');

    if (isPending) {
      const approveBtn = document.createElement('button');
      approveBtn.className = 'btn approve';
      approveBtn.textContent = 'Approve';
      approveBtn.onclick = () => approve(email);

      const denyBtn = document.createElement('button');
      denyBtn.className = 'btn deny';
      denyBtn.textContent = 'Deny';
      denyBtn.onclick = () => deny(email);

      right.appendChild(approveBtn);
      right.appendChild(denyBtn);
    } else {
      const badge = document.createElement('span');
      badge.textContent = 'Approved';
      right.appendChild(badge);
    }

    row.appendChild(left);
    row.appendChild(right);
    container.appendChild(row);
  });
}

async function approve(email) {
  const res = await fetch(`${backendURL}/admin/approve`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ email })
  });
  if (res.ok) {
    loadAdminData();
  } else {
    alert('Approve failed.');
  }
}

async function deny(email) {
  const res = await fetch(`${backendURL}/admin/deny`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ email })
  });
  if (res.ok) {
    loadAdminData();
  } else {
    alert('Deny failed.');
  }
}

