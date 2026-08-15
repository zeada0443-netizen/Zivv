/* ═════════════════════════════════════════════════════════
   ⚡ zivv — home.js (النسخة الاحترافية)
   - فحص الجلسة من السيرفر + تسجيل الخروج
   - رسم الفيد (منشورات تجريبية + إعجاب/تعليق)
   - الدردشة (قائمة محادثات + رسائل تفاعلية)
   - الحالات (قصص) + التنقل بين الأقسام + النشر
   ═════════════════════════════════════════════════════════ */
'use strict';

const $ = id => document.getElementById(id);

/* ═══════════ الجلسة ═══════════ */
let session = null;
try { session = JSON.parse(localStorage.getItem('zivv_session') || 'null'); } catch (e) {}

const myName = session ? session.name : 'مستخدم zivv';
const myFirst = myName.split(' ')[0] || 'م';
const myAvatarChar = myFirst.charAt(0);

document.querySelectorAll('.avatar').forEach(el => { el.textContent = myAvatarChar; });
$('profileAvatar').textContent = myAvatarChar;
$('profileName').textContent = myName;
$('profileEmail').textContent = session ? session.email : '—';

/* ═══════════ بيانات تجريبية ═══════════ */
const POSTS = [
  { id: 1, name: 'محمود الشناوي', gold: true, time: 'منذ ساعتين', avatar: 'م', color: '#0e7490',
    text: 'أول لبنة في zivv اتبنت النهارده 🚀 الواجهة بقت احترافية بجد! من هنا هنكمل لحد ما التطبيق كله يشتغل.',
    media: '🌆', mediaBg: 'linear-gradient(135deg,#0e7490,#1d4ed8)', likes: 342, comments: 18, liked: false },
  { id: 2, name: 'سارة عادل', gold: false, time: 'منذ 5 ساعات', avatar: 'س', color: '#4c1d95',
    text: 'غروب من شغل النهاردة 🌇 ليلة سعيدة يا zivv',
    media: '🌅', mediaBg: 'linear-gradient(135deg,#9a3412,#4c1d95)', likes: 201, comments: 9, liked: false },
  { id: 3, name: 'نور هشام', gold: true, time: 'منذ 8 ساعات', avatar: 'ن', color: '#9a3412',
    text: 'المساعد الذكي جربته النهارده... جامد بجد 🤖✨',
    media: null, mediaBg: '', likes: 128, comments: 24, liked: false },
  { id: 4, name: 'أحمد فتحي', gold: false, time: 'منذ يوم', avatar: 'أ', color: '#14532d',
    text: 'مين جرب الـ Shorts الجديدة؟ رأيكم إيه؟ 🎬',
    media: '🎬', mediaBg: 'linear-gradient(160deg,#1d4ed8,#4c1d95,#0e7490)', likes: 95, comments: 31, liked: false }
];

const STORIES = [
  { owner: 'محمود', content: '🌆', caption: 'غروب اليوم' },
  { owner: 'سارة', content: '☕', caption: 'قهوة الصبح' },
  { owner: 'نور', content: '🎧', caption: 'أغنية جديدة' },
  { owner: 'أحمد', content: '⚽', caption: 'الماتش' },
  { owner: 'يوسف', content: '💻', caption: 'كود جديد' }
];

const CHATS = [
  { id: 1, name: 'سارة عادل', avatar: 'س', color: '#4c1d95', last: 'تمام، اتفقنا 🤝', time: 'الآن', online: true, msgs: [
      { me: false, text: 'ازيك؟ شغال في إيه النهارده؟' },
      { me: true, text: 'تمام الحمد لله، بشتغل على zivv 🔥' },
      { me: false, text: 'تمام، اتفقنا 🤝' }] },
  { id: 2, name: 'محمود الشناوي', avatar: 'م', color: '#0e7490', last: 'الزعيم وصل 👹', time: 'قبل 5 د', online: true, msgs: [
      { me: false, text: 'الزعيم وصل 👹 جهز نفسك' }] },
  { id: 3, name: 'نور هشام', avatar: 'ن', color: '#9a3412', last: 'شكراً يا بطل 💙', time: 'أمس', online: false, msgs: [
      { me: false, text: 'شكراً يا بطل 💙' }] },
  { id: 4, name: 'أحمد فتحي', avatar: 'أ', color: '#14532d', last: 'معاك حق', time: 'أمس', online: false, msgs: [
      { me: false, text: 'معاك حق' }] }
];

let activeChatId = null;

/* ═══════════ رسم الفيد ═══════════ */
function renderPosts() {
  const list = $('postsList');
  list.innerHTML = '';
  POSTS.forEach(p => {
    const post = document.createElement('article');
    post.className = 'card post';
    post.innerHTML = `
      <div class="post-head">
        <div class="avatar" style="background:${p.color};">${p.avatar}</div>
        <div class="meta">
          <div class="name">${p.name} ${p.gold ? '<span class="gold-badge">⭐</span>' : ''}</div>
          <div class="sub"><span>🕐 ${p.time}</span><span>🌍 عام</span></div>
        </div>
        <button class="post-menu">⋮</button>
      </div>
      <p class="post-text">${p.text}</p>
      ${p.media ? `<div class="post-media" style="background:${p.mediaBg};">${p.media}</div>` : ''}
      <div class="post-stats">
        <span>❤️ <b>${p.likes}</b> إعجاب</span>
        <span>💬 <b>${p.comments}</b> تعليق</span>
        <span>👁️ 1.2K مشاهدة</span>
      </div>
      <div class="post-actions">
        <button class="action ${p.liked ? 'liked' : ''}" onclick="toggleLike(${p.id}, this)">
          <span>❤️</span> إعجاب
        </button>
        <button class="action" onclick="toggleComments(${p.id}, this)"><span>💬</span> تعليق</button>
        <button class="action" onclick="sharePost(${p.id})"><span>↗️</span> مشاركة</button>
        <button class="action ai" onclick="aiComment(${p.id})"><span>🤖</span> تعليق ذكي</button>
      </div>
    `;
    list.appendChild(post);
  });
}

function toggleLike(id, btn) {
  const p = POSTS.find(x => x.id === id);
  if (!p) return;
  p.liked = !p.liked;
  p.likes += p.liked ? 1 : -1;
  btn.classList.toggle('liked', p.liked);
  const stat = btn.closest('.post').querySelector('.post-stats b');
  stat.textContent = p.likes;
}

function toggleComments(id, btn) {
  const p = POSTS.find(x => x.id === id);
  if (!p) return;
  const comment = prompt('اكتب تعليقك:');
  if (comment && comment.trim()) {
    p.comments++;
    btn.closest('.post').querySelectorAll('.post-stats b')[1].textContent = p.comments;
    alert('تم نشر تعليقك 💬');
  }
}

function sharePost(id) {
  if (navigator.share) {
    navigator.share({ title: 'zivv', text: 'منشور على zivv' }).catch(() => {});
  } else {
    alert('تم نسخ رابط المشاركة ↗️');
  }
}

function aiComment(id) {
  const p = POSTS.find(x => x.id === id);
  if (!p) return;
  const aiTexts = [
    'تعليق رائع! 💡 المنشور ده جامد بجد',
    'كلام سليم 100% 👏 اتفق معاك تماماً',
    'أول مرة أشوف منشور بمستوى ده على zivv 🔥',
    'بصراحة، ده يستاهل يتروج ❤️'
  ];
  p.comments++;
  const el = document.querySelectorAll('.post-actions b')[0];
  if (el) el.textContent = p.comments;
  alert('🤖 المساعد الذكي: ' + aiTexts[Math.floor(Math.random() * aiTexts.length)]);
}

/* ═══════════ الحالات ═══════════ */
function openStory(idx) {
  const s = STORIES[idx];
  $('storyOwner').textContent = s.owner;
  $('storyContent').textContent = s.content;
  $('storyCaption').textContent = s.caption;
  $('storyModal').classList.add('open');
}

function closeStory() {
  $('storyModal').classList.remove('open');
}

/* ═══════════ الدردشة ═══════════ */
function renderChats() {
  const list = $('chatList');
  list.innerHTML = '';
  CHATS.forEach(c => {
    const item = document.createElement('div');
    item.className = 'chat-item';
    item.innerHTML = `
      <div class="avatar" style="background:${c.color};">${c.avatar}</div>
      <div class="chat-inf"><b>${c.name} ${c.online ? '🟢' : ''}</b><span>${c.last}</span></div>
      <span class="chat-time">${c.time}</span>
    `;
    item.addEventListener('click', () => openChat(c.id));
    list.appendChild(item);
  });
}

function openChat(id) {
  const c = CHATS.find(x => x.id === id);
  if (!c) return;
  activeChatId = id;
  $('chatHead').innerHTML = `<div class="avatar" style="background:${c.color}; font-size:13px;">${c.avatar}</div> ${c.name} ${c.online ? '🟢 متصل الآن' : ''}`;
  $('chatRoom').hidden = false;
  renderMessages(c);
  $('chatInput').focus();
}

function renderMessages(c) {
  const body = $('chatBody');
  body.innerHTML = '';
  c.msgs.forEach(m => {
    const div = document.createElement('div');
    div.className = 'msg ' + (m.me ? 'mine' : 'theirs');
    div.textContent = m.text;
    body.appendChild(div);
  });
  body.scrollTop = body.scrollHeight;
}

function sendChat() {
  const input = $('chatInput');
  const text = input.value.trim();
  if (!text || !activeChatId) return;
  const c = CHATS.find(x => x.id === activeChatId);
  c.msgs.push({ me: true, text });
  c.last = text;
  c.time = 'الآن';
  renderMessages(c);
  input.value = '';
  // رد تلقائي (محاكاة)
  setTimeout(() => {
    const replies = ['تمام 👍', 'حلو أوي 😄', 'أنا معاك', 'نتكلم بعدين؟'];
    c.msgs.push({ me: false, text: replies[Math.floor(Math.random() * replies.length)] });
    c.last = c.msgs[c.msgs.length - 1].text;
    renderMessages(c);
  }, 1200);
}

/* ═══════════ التنقل ═══════════ */
function switchView(view) {
  const views = { feed: 'feedView', shorts: 'shortsView', chat: 'chatView', profile: 'profileView' };
  Object.entries(views).forEach(([key, id]) => {
    $(id).hidden = key !== view;
  });
  $('notifView').hidden = true;
  document.querySelectorAll('.nav-item').forEach(b => {
    b.classList.toggle('active', b.dataset.view === view);
  });
}

$('chatBtnHeader').addEventListener('click', () => switchView('chat'));
$('notifBtn').addEventListener('click', () => {
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  $('feedView').hidden = true;
  $('shortsView').hidden = true;
  $('chatView').hidden = true;
  $('profileView').hidden = true;
  $('notifView').hidden = false;
});
$('meChip').addEventListener('click', () => switchView('profile'));

/* ═══════════ النشر ═══════════ */
function publishPost() {
  const text = $('postText').value.trim();
  if (!text) { alert('اكتب حاجة الأول 😄'); return; }
  POSTS.unshift({
    id: Date.now(), name: myName, gold: false, time: 'الآن',
    avatar: myAvatarChar, color: '#0e9488', text,
    media: null, mediaBg: '', likes: 0, comments: 0, liked: false
  });
  $('postText').value = '';
  $('postModal').classList.remove('open');
  renderPosts();
  switchView('feed');
  alert('🚀 منشورك اتنشر!');
}

function likeShorts() {
  const el = $('shortsLikes');
  el.textContent = (parseInt(el.textContent.replace('K', '')) * 1000 + 1).toLocaleString();
}

/* ═══════════ الجلسة والخروج ═══════════ */
if (!session || !session.token) {
  setTimeout(() => { window.location.href = 'index.html'; }, 1500);
} else {
  fetch('/api/auth/me', { headers: { 'Authorization': 'Bearer ' + session.token } })
    .then(r => r.json())
    .then(data => {
      if (!data.ok) {
        localStorage.removeItem('zivv_session');
        setTimeout(() => { window.location.href = 'index.html'; }, 1500);
      }
    })
    .catch(() => {});
}

$('logoutBtn').addEventListener('click', async () => {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + session.token }
    });
  } catch (e) {}
  localStorage.removeItem('zivv_session');
  window.location.href = 'index.html';
});

/* ═══════════ تشغيل ═══════════ */
renderPosts();
renderChats();
