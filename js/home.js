/* ═════════════════════════════════════════════════════════
   ⚡ zivv — home.js (المرحلة 2 — مؤقت)
   فحص الجلسة من السيرفر (GET /api/auth/me) + تسجيل الخروج
   ═════════════════════════════════════════════════════════ */
'use strict';

const sessionEl = document.getElementById('sessionInfo');
const logoutBtn = document.getElementById('logoutBtn');

/* قراءة الجلسة المحفوظة */
let session = null;
try {
  session = JSON.parse(localStorage.getItem('zivv_session') || 'null');
} catch (e) { session = null; }

if (!session || !session.token) {
  sessionEl.textContent = '⚠️ مفيش جلسة — هتتحول لتسجيل الدخول...';
  setTimeout(() => { window.location.href = 'index.html'; }, 1500);
} else {
  /* التحقق من الجلسة عند السيرفر */
  fetch('/api/auth/me', {
    headers: { 'Authorization': 'Bearer ' + session.token }
  })
    .then(r => r.json())
    .then(data => {
      if (data.ok) {
        sessionEl.textContent = '👤 مسجل دخول: ' + data.user.full_name + ' (' + data.user.email + ')';
      } else {
        localStorage.removeItem('zivv_session');
        sessionEl.textContent = '⚠️ الجلسة انتهت — هتتحول لتسجيل الدخول...';
        setTimeout(() => { window.location.href = 'index.html'; }, 1500);
      }
    })
    .catch(() => {
      sessionEl.textContent = '📡 السيرفر مش شغال؟ شغّل server.py الأول.';
    });
}

/* تسجيل الخروج */
logoutBtn.addEventListener('click', async () => {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + session.token }
    });
  } catch (e) {}
  localStorage.removeItem('zivv_session');
  window.location.href = 'index.html';
});
