/* ═════════════════════════════════════════════════════════
   ⚡ zivv — login.js (المرحلة 1 — نسخة السيرفر الحقيقي)
   منطق صفحة تسجيل الدخول — بيتكلم مع server.py:
   - POST /api/auth/request-otp  (إرسال رمز OTP عبر Resend)
   - POST /api/auth/verify-otp   (التحقق + جلسة)

   الواجهة بترسل الطلبات فقط — المفاتيح مش موجودة هنا أبدًا ✅
   ═════════════════════════════════════════════════════════ */
'use strict';

/* ═══════════ 1) عناصر الصفحة ═══════════ */
const $ = id => document.getElementById(id);

const tabs = { login: $('tabLogin'), signup: $('tabSignup') };
const forms = { login: $('loginForm'), signup: $('signupForm') };
const alertBox = $('alert');
const otpSection = $('otpSection');
const otpInputs = document.querySelectorAll('#otpBox input');
const devBadge = $('devBadge');
const devCode = $('devCode');

/* ═══════════ 2) أدوات مساعدة ═══════════ */
const isValidEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim());

function showAlert(msg, ok) {
  alertBox.textContent = msg;
  alertBox.classList.toggle('ok', !!ok);
  alertBox.hidden = false;
}
function hideAlert() { alertBox.hidden = true; }

async function api(url, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body || {})
  });
  let data = {};
  try { data = await res.json(); } catch (e) {}
  return { status: res.status, data };
}

/* رسائل الأخطاء من السيرفر → عربي واضح */
const ERRORS = {
  invalid_email: '✉️ اكتب بريد إلكتروني صحيح.',
  missing_name: '⚠️ اكتب الاسم الأول واسم العائلة.',
  invalid_age: '⚠️ العمر غير صالح.',
  underage: '⛔ zivv مخصص للأعمار 18 سنة فأكثر فقط.',
  exists: '⚠️ الحساب ده موجود بالفعل — استخدم "تسجيل الدخول".',
  not_found: '❌ مفيش حساب بالبريد ده. اعمل حساب جديد الأول.',
  locked: '🔒 المحاولات كتيرة — اتقفل مؤقتًا. جرب بعد شوية.',
  cooldown: '⏳ استنى شوية قبل ما تطلب رمز جديد.',
  expired: '⏰ انتهت صلاحية الرمز — اطلب واحد جديد.',
  wrong_code: '❌ الرمز غلط.',
  no_otp: '⚠️ مفيش رمز مرسل للبريد ده — اطلب واحد جديد.',
  send_failed: '😵 عجزنا نبعت الإيميل. تأكد من مفتاح Resend على السيرفر.',
  invalid_input: '⚠️ بيانات غير صالحة.',
  network: '📡 مشكلة في الاتصال بالسيرفر. تأكد إنه شغال.'
};

function errMsg(key, fallback) {
  return ERRORS[key] || fallback || 'حدث خطأ غير متوقع.';
}

/* ═══════════ 3) التبويبات ═══════════ */
let currentTab = 'login';

function switchTab(tab) {
  currentTab = tab;
  tabs.login.classList.toggle('active', tab === 'login');
  tabs.signup.classList.toggle('active', tab === 'signup');
  tabs.login.setAttribute('aria-selected', tab === 'login');
  tabs.signup.setAttribute('aria-selected', tab === 'signup');
  forms.login.hidden = tab !== 'login';
  forms.signup.hidden = tab !== 'signup';
  hideAlert();
  $('ageBlock').hidden = true;
  resetOtpState();
}
tabs.login.addEventListener('click', () => switchTab('login'));
tabs.signup.addEventListener('click', () => switchTab('signup'));

/* ═══════════ 4) حالة OTP ═══════════ */
let otpEmail = null;          // الإيميل اللي اتبعتله الرمز
let cooldownUntil = 0;        // وقت نهاية كولداون إعادة الإرسال
let expiresAt = 0;            // وقت انتهاء صلاحية الرمز
let lockUntil = 0;            // وقت نهاية القفل
let timers = [];

function clearTimers() {
  timers.forEach(clearInterval);
  timers = [];
}

function resetOtpState() {
  otpEmail = null; cooldownUntil = 0; expiresAt = 0; lockUntil = 0;
  clearTimers();
  otpSection.hidden = true;
  devBadge.hidden = true;
  $('lockMsg').hidden = true;
  $('resendBtn').disabled = false;
  $('resendTimer').textContent = '';
  clearOtpInputs();
}

function clearOtpInputs() {
  otpInputs.forEach(i => { i.value = ''; i.classList.remove('filled', 'invalid'); });
  otpInputs[0].focus();
}

/* ═══════════ 5) طلب رمز (بيتكلم مع السيرفر) ═══════════ */
async function requestOtp(email, extra) {
  setBtnLoading(true);
  hideAlert();
  try {
    const { status, data } = await api('/api/auth/request-otp', {
      email,
      ...extra
    });

    if (!data.ok) {
      const wait = data.wait || 0;
      if (data.error === 'locked' || data.error === 'cooldown') {
        cooldownUntil = Date.now() + wait * 1000;
        startResendCd(wait);
        showAlert(errMsg(data.error) + (wait ? ` (${wait} ثانية)` : ''), false);
      } else if (data.error === 'underage') {
        $('ageBlock').hidden = false;
        showAlert(errMsg('underage'), false);
      } else {
        showAlert(errMsg(data.error), false);
      }
      return;
    }

    // ✅ اتبعت — نشغل قسم OTP
    otpEmail = email;
    expiresAt = Date.now() + data.expires_in * 1000;
    cooldownUntil = Date.now() + data.cooldown * 1000;

    $('otpEmail').textContent = email;
    otpSection.hidden = false;
    $('lockMsg').hidden = true;
    $('attemptsLeft').textContent = data.max_attempts;

    // 🧪 وضع التطوير: لو السيرفر رجع الرمز (مفيش مفتاح Resend)
    if (data.dev_mode && data.code) {
      devCode.textContent = data.code;
      devBadge.hidden = false;
    } else {
      devBadge.hidden = true;
    }

    clearOtpInputs();
    startOtpTimer();
    startResendCd(data.cooldown);
    showAlert('📨 رمز التحقق اتبعت لإيميلك!', true);
  } catch (e) {
    showAlert(errMsg('network'), false);
  } finally {
    setBtnLoading(false);
  }
}

function setBtnLoading(loading) {
  $('sendOtpBtn').disabled = loading;
  $('signupBtn').disabled = loading;
  ['sendOtpBtn', 'signupBtn'].forEach(id => {
    $(id).querySelector('.spinner').hidden = !loading;
  });
  $('sendOtpBtn').querySelector('.btn-txt').textContent = loading
    ? 'جاري الإرسال...'
    : 'إرسال رمز التحقق';
  $('signupBtn').querySelector('.btn-txt').textContent = loading
    ? 'جاري الإرسال...'
    : 'إنشاء الحساب وإرسال الرمز';
}

/* ═══════════ 6) المؤقتات ═══════════ */
function startOtpTimer() {
  clearTimers();
  const t = setInterval(() => {
    const left = Math.max(0, expiresAt - Date.now());
    const m = Math.floor(left / 60000);
    const s = Math.floor((left % 60000) / 1000);
    const el = $('otpTimer');
    el.textContent = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    el.classList.toggle('warn', left < 5 * 60 * 1000);
    el.classList.toggle('danger', left < 60 * 1000);

    if (left <= 0) {
      clearInterval(t);
      otpSection.hidden = true;
      devBadge.hidden = true;
      otpEmail = null;
      showAlert('⏰ انتهت صلاحية الرمز — اطلب رمز جديد.', false);
    }
  }, 500);
  timers.push(t);
}

function startResendCd(seconds) {
  $('resendBtn').disabled = true;
  let left = seconds;
  $('resendTimer').textContent = '(' + left + ')';
  const t = setInterval(() => {
    left--;
    if (left <= 0) {
      clearInterval(t);
      $('resendBtn').disabled = false;
      $('resendTimer').textContent = '';
    } else {
      $('resendTimer').textContent = '(' + left + ')';
    }
  }, 1000);
  timers.push(t);
}

/* ═══════════ 7) خانات الرمز ═══════════ */
otpInputs.forEach((input, idx) => {
  input.addEventListener('input', () => {
    input.value = input.value.replace(/\D/g, '').slice(0, 1);
    input.classList.remove('invalid');
    input.classList.toggle('filled', input.value !== '');
    if (input.value && idx < otpInputs.length - 1) otpInputs[idx + 1].focus();
    if (getOtpValue().length === 6) verifyOtp();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace' && !input.value && idx > 0) otpInputs[idx - 1].focus();
  });
  input.addEventListener('focus', () => input.select());
});

function getOtpValue() {
  let v = '';
  otpInputs.forEach(i => v += i.value);
  return v;
}

/* ═══════════ 8) التحقق من الرمز (بيتكلم مع السيرفر) ═══════════ */
async function verifyOtp() {
  if (!otpEmail) return;
  const code = getOtpValue();
  if (code.length !== 6) return;

  $('verifyBtn').disabled = true;
  $('verifyBtn').querySelector('.spinner').hidden = false;
  $('verifyBtn').querySelector('.btn-txt').textContent = 'جاري التحقق...';
  hideAlert();

  try {
    const { status, data } = await api('/api/auth/verify-otp', {
      email: otpEmail,
      code
    });

    if (data.ok && data.token) {
      // ✅ نجاح — حفظ الجلسة
      localStorage.setItem('zivv_session', JSON.stringify({
        token: data.token,
        email: data.user.email,
        name: data.user.full_name
      }));
      clearTimers();
      otpSection.hidden = true;
      devBadge.hidden = true;
      showAlert('✅ تم تسجيل الدخول! جاري التحويل...', true);
      setTimeout(() => { window.location.href = 'home.html'; }, 700);
      return;
    }

    // فشل
    if (data.error === 'locked' && data.wait) {
      showAlert('🔒 المحاولات خلصت — اتقفل لمدة ' + data.wait + ' ثانية.', false);
      otpSection.hidden = true;
      devBadge.hidden = true;
      $('lockMsg').hidden = false;
      startLockCountdown(data.wait);
    } else {
      showAlert(errMsg(data.error), false);
      if (data.error === 'wrong_code') {
        otpInputs.forEach(i => {
          i.classList.add('invalid');
          i.value = '';
          i.classList.remove('filled');
        });
        otpInputs[0].focus();
        if (data.attempts_left !== undefined) {
          $('attemptsLeft').textContent = data.attempts_left;
        }
      }
    }
  } catch (e) {
    showAlert(errMsg('network'), false);
  } finally {
    $('verifyBtn').disabled = false;
    $('verifyBtn').querySelector('.spinner').hidden = true;
    $('verifyBtn').querySelector('.btn-txt').textContent = 'تحقق ودخول 🚀';
  }
}

function startLockCountdown(seconds) {
  clearTimers();
  let left = seconds;
  const box = $('lockMsg');
  box.hidden = false;
  $('lockTimer').textContent = left;
  const t = setInterval(() => {
    left--;
    if (left <= 0) {
      clearInterval(t);
      box.hidden = true;
      $('attemptsLeft').textContent = '5';
      otpSection.hidden = false;
      devBadge.hidden = !devBadge.hidden || true;
      if (otpEmail) { /* نرجع نعرض القسم */ }
    } else {
      $('lockTimer').textContent = left;
    }
  }, 1000);
  timers.push(t);
}

/* ═══════════ 9) إرسال رمز (تسجيل دخول) ═══════════ */
$('loginForm').addEventListener('submit', (e) => {
  e.preventDefault();
  hideAlert();
  const emailInput = $('loginEmail');
  const email = emailInput.value.trim();

  if (!isValidEmail(email)) {
    emailInput.classList.add('invalid');
    showAlert('✉️ اكتب بريد إلكتروني صحيح.', false);
    return;
  }
  emailInput.classList.remove('invalid');

  requestOtp(email, {});
});

/* ═══════════ 10) إنشاء حساب + إرسال رمز ═══════════ */
$('signupForm').addEventListener('submit', (e) => {
  e.preventDefault();
  hideAlert();

  const first = $('suFirst').value.trim();
  const last = $('suLast').value.trim();
  const age = parseInt($('suAge').value, 10);
  const email = $('suEmail').value.trim();

  let valid = true;
  if (first.length < 2) { $('suFirst').classList.add('invalid'); valid = false; }
  else $('suFirst').classList.remove('invalid');

  if (last.length < 2) { $('suLast').classList.add('invalid'); valid = false; }
  else $('suLast').classList.remove('invalid');

  if (!age || age < 1 || age > 120) { $('suAge').classList.add('invalid'); valid = false; }
  else {
    $('suAge').classList.remove('invalid');
    if (age < 18) {
      $('ageBlock').hidden = false;    // ⛔ منع أقل من 18 (محليًا قبل السيرفر)
      valid = false;
    } else $('ageBlock').hidden = true;
  }

  if (!isValidEmail(email)) { $('suEmail').classList.add('invalid'); valid = false; }
  else $('suEmail').classList.remove('invalid');

  if (!valid) {
    showAlert('⚠️ راجع البيانات — وخلي بالك: zivv للأعمار 18+ فقط.', false);
    return;
  }

  requestOtp(email, { first_name: first, last_name: last, age });
});

/* ═══════════ 11) أزرار OTP ═══════════ */
$('verifyBtn').addEventListener('click', () => verifyOtp());

$('resendBtn').addEventListener('click', () => {
  if (!otpEmail) return;
  requestOtp(otpEmail, {});
});

$('changeEmailBtn').addEventListener('click', () => {
  resetOtpState();
  hideAlert();
  if (currentTab === 'login') $('loginEmail').focus();
  else $('suEmail').focus();
});

/* ═══════════ 12) تنظيف عند الكتابة ═══════════ */
['loginEmail', 'suFirst', 'suLast', 'suAge', 'suEmail'].forEach(id => {
  $(id).addEventListener('input', (e) => {
    e.target.classList.remove('invalid');
    hideAlert();
  });
});
