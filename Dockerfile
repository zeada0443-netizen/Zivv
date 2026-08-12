# ═══════════════════════════════════════════════════════
# ⚡ zivv — Dockerfile (تشغيل على أي منصة استضافة)
# بيدي الموقع قدرة يشتغل على: Koyeb / Zeabur / Fly.io / Render
# ═══════════════════════════════════════════════════════

FROM python:3.12-slim

# منع كتابة ملفات pyc وضمان أن الإخراج يظهر فورًا
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# نثبت المتطلبات الأول (أسرع في إعادة البناء)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ننسخ باقي المشروع
COPY . .

EXPOSE 3000

# التشغيل بـ gunicorn (خادم إنتاج حقيقي)
CMD ["gunicorn", "server:app", "--bind", "0.0.0.0:3000", "--workers", "1"]
