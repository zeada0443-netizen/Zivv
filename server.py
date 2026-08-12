"""
═══════════════════════════════════════════════════════════
⚡ zivv — server.py (السيرفر الحقيقي)
═══════════════════════════════════════════════════════════
مبني حسب وثيقة متطلبات zivv:

- POST /api/auth/request-otp  → إرسال رمز OTP حقيقي عبر Resend
- POST /api/auth/verify-otp   → التحقق من الرمز + إنشاء جلسة
- GET  /api/auth/me           → فحص الجلسة (للمنزل)
- POST /api/auth/logout       → إنهاء الجلسة

الأمان:
- المفاتيح من Environment Variables مش من الكود
- رمز OTP بيتخزن كـ Hash (مش نص صريح)
- صلاحية الرمز: 10 دقائق
- حد أقصى 5 محاولات غلط → قفل 60 ثانية
- كولداون إعادة الإرسال: 60 ثانية
- قاعدة البيانات: SQLite (للتطوير) → PostgreSQL (للإطلاق)

التشغيل المحلي:  python3 server.py   ثم  http://localhost:3000
═══════════════════════════════════════════════════════════
"""
import os
import re
import sqlite3
import hashlib
import secrets
from datetime import datetime, timedelta

from flask import Flask, request, jsonify, send_from_directory
import requests

# ═══════════ الإعدادات ═══════════
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "zivv.db")

# تحميل المتغيرات السرية من ملف .env (لو موجود)
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(BASE_DIR, ".env"))
except ImportError:
    pass

RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
RESEND_FROM = os.environ.get("RESEND_FROM", "zivv <onboarding@resend.dev>")
OTP_SALT = os.environ.get("OTP_SALT", "zivv-dev-salt-change-me")
PORT = int(os.environ.get("PORT", 3000))

# 🆕 دعم Brevo — يبعت OTP لأي إيميل في الدنيا من غير دومين
BREVO_API_KEY = os.environ.get("BREVO_API_KEY", "")
BREVO_FROM_EMAIL = os.environ.get("BREVO_FROM_EMAIL", "")
BREVO_FROM_NAME = os.environ.get("BREVO_FROM_NAME", "zivv")

OTP_EXPIRY_MINUTES = 10
MAX_ATTEMPTS = 5
LOCK_SECONDS = 60
RESEND_COOLDOWN_SECONDS = 60
SESSION_DAYS = 30

app = Flask(__name__, static_folder=None)  # نعطل السيرفر الافتراضي عشان نحكم الحماية بنفسنا

# منع تحميل الملفات الحساسة من المتصفح
BLOCKED_FILES = {"zivv.db", ".env", "server.py", "requirements.txt", "render.yaml"}


# ═══════════ قاعدة البيانات ═══════════
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_db() as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                first_name TEXT NOT NULL,
                last_name TEXT NOT NULL,
                full_name TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                age INTEGER NOT NULL,
                role TEXT DEFAULT 'user',
                is_gold INTEGER DEFAULT 0,
                gold_status TEXT DEFAULT 'none',
                is_banned INTEGER DEFAULT 0,
                privacy_posts TEXT DEFAULT 'public',
                privacy_status TEXT DEFAULT 'friends',
                show_online INTEGER DEFAULT 1,
                created_at TEXT DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS otps (
                email TEXT PRIMARY KEY,
                code_hash TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                attempts INTEGER DEFAULT 0,
                lock_until TEXT DEFAULT '',
                sent_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                expires_at TEXT NOT NULL
            );
            """
        )


# ═══════════ أدوات مساعدة ═══════════
def parse_dt(s):
    if not s:
        return None
    try:
        return datetime.fromisoformat(s)
    except Exception:
        return None


def now_iso():
    return datetime.utcnow().isoformat()


def future_iso(seconds):
    return (datetime.utcnow() + timedelta(seconds=seconds)).isoformat()


def hash_code(code, email):
    """تخزين الرمز كـ Hash — مفيش نص صريح في القاعدة"""
    return hashlib.sha256(f"{code}:{email}:{OTP_SALT}".encode()).hexdigest()


def valid_email(s):
    return bool(re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$", s or ""))


# ═══════════ إرسال الإيميل عبر Resend ═══════════
def otp_html(code):
    return f"""
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <body style="margin:0;padding:0;background:#05080c;font-family:'Segoe UI',Tahoma,Arial,sans-serif;">
      <div style="max-width:440px;margin:0 auto;padding:30px 20px;">
        <div style="text-align:center;font-size:34px;font-weight:900;color:#2dd4bf;letter-spacing:2px;">zivv</div>
        <div style="background:#0b1017;border:1px solid #1c2836;border-radius:18px;padding:28px 22px;margin-top:18px;text-align:center;">
          <p style="color:#e6edf3;font-size:16px;margin:0 0 6px;">أهلاً بك في <b style="color:#2dd4bf;">zivv</b> 🔒</p>
          <p style="color:#9fb0c3;font-size:13px;margin:0 0 18px;">رمز التحقق بتاعك:</p>
          <div style="display:inline-block;background:#0d141d;border:1px solid #2dd4bf;border-radius:14px;padding:16px 34px;">
            <span style="font-size:34px;font-weight:900;letter-spacing:8px;color:#2dd4bf;direction:ltr;display:inline-block;">{code}</span>
          </div>
          <p style="color:#7c8ea3;font-size:12px;margin:18px 0 0;">الرمز صالح لمدة <b style="color:#2dd4bf;">10 دقائق</b> — لو مطلعتش استخدمته، اطلب واحد جديد.</p>
          <p style="color:#4d5f73;font-size:11px;margin:10px 0 0;">لو إنت مطلبتش الرمز ده، تجاهل الإيميل.</p>
        </div>
        <p style="text-align:center;color:#4d5f73;font-size:11px;margin-top:16px;">© 2026 zivv — تواصل اجتماعي بذكاء وخصوصية</p>
      </div>
    </body>
    </html>
    """


def send_otp_email(email, code):
    if not RESEND_API_KEY:
        return False

    try:
        r = requests.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {RESEND_API_KEY}",
                "Content-Type": "application/json",
            },
            json={"from": RESEND_FROM, "to": [email], "subject": "🔐 رمز التحقق — zivv", "html": otp_html(code)},
            timeout=15,
        )
        return r.status_code < 300
    except Exception:
        return False


# ═══════════ إرسال الإيميل عبر Brevo (من غير دومين!) ═══════════
def send_otp_email_brevo(email, code):
    """Brevo بيبعت لأي إيميل في الدنيا — بس محتاج تأكيد الإيميل المرسل مرة واحدة"""
    if not BREVO_API_KEY or not BREVO_FROM_EMAIL:
        return False
    try:
        r = requests.post(
            "https://api.brevo.com/v3/smtp/email",
            headers={"api-key": BREVO_API_KEY, "Content-Type": "application/json"},
            json={
                "sender": {"email": BREVO_FROM_EMAIL, "name": BREVO_FROM_NAME},
                "to": [{"email": email}],
                "subject": "🔐 رمز التحقق — zivv",
                "htmlContent": otp_html(code),
            },
            timeout=15,
        )
        return r.status_code < 300
    except Exception:
        return False


# ═══════════ 1) طلب رمز التحقق ═══════════
@app.post("/api/auth/request-otp")
def request_otp():
    data = request.get_json(force=True, silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    first = (data.get("first_name") or "").strip()
    last = (data.get("last_name") or "").strip()
    age = data.get("age")
    is_new = bool(first or last or age is not None)

    # ── التحقق من الإيميل ──
    if not valid_email(email):
        return jsonify(ok=False, error="invalid_email"), 400

    # ── وضع إنشاء حساب جديد ──
    if is_new:
        if not first or not last:
            return jsonify(ok=False, error="missing_name"), 400
        try:
            age = int(age)
        except (TypeError, ValueError):
            return jsonify(ok=False, error="invalid_age"), 400
        if age > 120 or age < 1:
            return jsonify(ok=False, error="invalid_age"), 400
        if age < 18:
            return jsonify(ok=False, error="underage"), 403

        with get_db() as db:
            existing = db.execute("SELECT id FROM users WHERE email=?", (email,)).fetchone()
            if existing:
                return jsonify(ok=False, error="exists"), 409
            # هنستنى نجاح الإيميل الأول وبعدين ننشئ الحساب
            # (عشان منخلّيش حسابات على الفاضي لو الإيميل فشل)
    else:
        # ── وضع تسجيل دخول: لازم الحساب موجود ──
        with get_db() as db:
            existing = db.execute("SELECT id FROM users WHERE email=?", (email,)).fetchone()
            if not existing:
                return jsonify(ok=False, error="not_found"), 404

    # ── منع السبام: قفل + كولداون ──
    with get_db() as db:
        row = db.execute("SELECT lock_until, sent_at FROM otps WHERE email=?", (email,)).fetchone()
        now = datetime.utcnow()

        if row:
            lock = parse_dt(row["lock_until"])
            if lock and lock > now:
                wait = max(1, int((lock - now).total_seconds()))
                return jsonify(ok=False, error="locked", wait=wait), 429

            sent = parse_dt(row["sent_at"])
            if sent and (now - sent).total_seconds() < RESEND_COOLDOWN_SECONDS:
                wait = RESEND_COOLDOWN_SECONDS - int((now - sent).total_seconds())
                return jsonify(ok=False, error="cooldown", wait=wait), 429

    # ── توليد الرمز (6 أرقام) ──
    code = f"{secrets.randbelow(1000000):06d}"

    # اختيار مزوّد الإيميل: Brevo أولًا (من غير دومين) ← Resend ← وضع التطوير
    dev_mode = True
    if BREVO_API_KEY:
        ok = send_otp_email_brevo(email, code)
        dev_mode = False if ok else True
        if not ok and os.environ.get("DEV_FALLBACK", "0") != "1":
            return jsonify(ok=False, error="send_failed"), 502
    elif RESEND_API_KEY:
        ok = send_otp_email(email, code)
        dev_mode = False if ok else True
        if not ok and os.environ.get("DEV_FALLBACK", "0") != "1":
            return jsonify(ok=False, error="send_failed"), 502

    # ✅ الإيميل اتبعت بنجاح → دلوقتي ننشئ الحساب (لو وضع إنشاء جديد)
    if is_new:
        with get_db() as db:
            db.execute(
                "INSERT INTO users (first_name, last_name, full_name, email, age) VALUES (?,?,?,?,?)",
                (first, last, f"{first} {last}", email, age),
            )

    with get_db() as db:
        db.execute(
            """INSERT INTO otps (email, code_hash, expires_at, attempts, lock_until, sent_at)
               VALUES (?,?,?,0,'',?)
               ON CONFLICT(email) DO UPDATE SET
                 code_hash=excluded.code_hash,
                 expires_at=excluded.expires_at,
                 attempts=0,
                 lock_until='',
                 sent_at=excluded.sent_at""",
            (email, hash_code(code, email), future_iso(OTP_EXPIRY_MINUTES * 60), now_iso()),
        )

    resp = {
        "ok": True,
        "dev_mode": dev_mode,
        "expires_in": OTP_EXPIRY_MINUTES * 60,
        "max_attempts": MAX_ATTEMPTS,
        "cooldown": RESEND_COOLDOWN_SECONDS,
    }
    if dev_mode:
        resp["code"] = code  # 🧪 للاختبار المحلي فقط — مش هيتحط في الإنتاج
    return jsonify(resp)


# ═══════════ 2) التحقق من الرمز ═══════════
@app.post("/api/auth/verify-otp")
def verify_otp():
    data = request.get_json(force=True, silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    code = str(data.get("code") or "").strip()

    if not valid_email(email) or not re.match(r"^\d{6}$", code):
        return jsonify(ok=False, error="invalid_input"), 400

    with get_db() as db:
        row = db.execute("SELECT * FROM otps WHERE email=?", (email,)).fetchone()
        if not row:
            return jsonify(ok=False, error="no_otp"), 400

        now = datetime.utcnow()

        # قفل مؤقت؟
        lock = parse_dt(row["lock_until"])
        if lock and lock > now:
            wait = max(1, int((lock - now).total_seconds()))
            return jsonify(ok=False, error="locked", wait=wait), 429

        # انتهت الصلاحية؟
        exp = parse_dt(row["expires_at"])
        if not exp or exp < now:
            db.execute("DELETE FROM otps WHERE email=?", (email,))
            return jsonify(ok=False, error="expired"), 410

        # الرمز غلط؟
        if row["attempts"] >= MAX_ATTEMPTS:
            db.execute("UPDATE otps SET lock_until=? WHERE email=?", (future_iso(LOCK_SECONDS), email))
            return jsonify(ok=False, error="locked", wait=LOCK_SECONDS), 429

        if hash_code(code, email) != row["code_hash"]:
            new_attempts = row["attempts"] + 1
            if new_attempts >= MAX_ATTEMPTS:
                db.execute("UPDATE otps SET attempts=?, lock_until=? WHERE email=?",
                           (new_attempts, future_iso(LOCK_SECONDS), email))
                return jsonify(ok=False, error="locked", wait=LOCK_SECONDS), 429
            db.execute("UPDATE otps SET attempts=? WHERE email=?", (new_attempts, email))
            return jsonify(ok=False, error="wrong_code", attempts_left=MAX_ATTEMPTS - new_attempts), 400

        # ✅ الرمز صح — إنشاء الجلسة
        user = db.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
        if not user:
            return jsonify(ok=False, error="not_found"), 404

        token = secrets.token_hex(32)
        db.execute("INSERT INTO sessions (token, user_id, expires_at) VALUES (?,?,?)",
                   (token, user["id"], future_iso(SESSION_DAYS * 86400)))
        db.execute("DELETE FROM otps WHERE email=?", (email,))

        return jsonify(ok=True, token=token, user={
            "id": user["id"],
            "email": user["email"],
            "first_name": user["first_name"],
            "last_name": user["last_name"],
            "full_name": user["full_name"],
            "age": user["age"],
            "is_gold": bool(user["is_gold"]),
            "role": user["role"],
        })


# ═══════════ 3) فحص الجلسة ═══════════
def get_session_user():
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    token = auth[7:].strip()
    with get_db() as db:
        row = db.execute(
            """SELECT s.token, s.expires_at, u.* FROM sessions s
               JOIN users u ON u.id = s.user_id
               WHERE s.token=?""",
            (token,),
        ).fetchone()
        if not row:
            return None
        exp = parse_dt(row["expires_at"])
        if not exp or exp < datetime.utcnow():
            db.execute("DELETE FROM sessions WHERE token=?", (token,))
            return None
        return row


@app.get("/api/auth/me")
def me():
    user = get_session_user()
    if not user:
        return jsonify(ok=False, error="unauthorized"), 401
    return jsonify(ok=True, user={
        "id": user["id"],
        "email": user["email"],
        "first_name": user["first_name"],
        "last_name": user["last_name"],
        "full_name": user["full_name"],
        "age": user["age"],
        "is_gold": bool(user["is_gold"]),
        "role": user["role"],
    })


# ═══════════ 4) تسجيل الخروج ═══════════
@app.post("/api/auth/logout")
def logout():
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        token = auth[7:].strip()
        with get_db() as db:
            db.execute("DELETE FROM sessions WHERE token=?", (token,))
    return jsonify(ok=True)


# ═══════════ 5) الملفات الثابتة (الواجهة) ═══════════
@app.route("/")
def index():
    return send_from_directory(BASE_DIR, "index.html")


@app.route("/<path:path>")
def static_files(path):
    if path in BLOCKED_FILES or path.startswith("api/"):
        return jsonify(ok=False, error="forbidden"), 403
    return send_from_directory(BASE_DIR, path)


# ═══════════ التشغيل ═══════════
if __name__ == "__main__":
    init_db()
    print("⚡ zivv server running on http://localhost:%d" % PORT)
    if not RESEND_API_KEY:
        print("🧪 وضع التطوير: مفيش RESEND_API_KEY — الرمز هيرجع في الرد (dev_mode)")
    app.run(host="0.0.0.0", port=PORT, debug=False)
