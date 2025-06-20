FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    postgresql-client \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first (for better caching)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy project files
COPY . .

# Create staticfiles directory
RUN mkdir -p zerodhatrader/static/zerodhatrader/css/
RUN mkdir -p zerodhatrader/static/zerodhatrader/js/

# Collect static files (may fail initially, that's OK)
RUN python manage.py collectstatic --noinput --verbosity=2 || true

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:8000/ || exit 1

# Start application with Daphne for WebSocket support
CMD ["sh", "-c", "python manage.py migrate && daphne -b 0.0.0.0 -p 8000 tradingapp.asgi:application"]