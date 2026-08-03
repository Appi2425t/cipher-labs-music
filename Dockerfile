# =============================================================
# F-SOCIETY MUSIC BOT - DOCKERFILE
# =============================================================

FROM python:3.11-slim

# Install Node.js, FFmpeg, and dependencies
RUN apt-get update && apt-get install -y \
    curl \
    ffmpeg \
    && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Install Node dependencies
COPY package.json .
RUN npm install

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create Brave profile directory
RUN mkdir -p /app/brave-data

# Expose ports
EXPOSE 3000 8080

# Start the bot
CMD ["python3", "bot.py"]
