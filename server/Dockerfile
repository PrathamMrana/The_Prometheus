# 🛡️ PROMETHEUS BACKEND DOCKERFILE
FROM node:18-bullseye-slim

WORKDIR /app

# Install system dependencies for better-sqlite3
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --omit=dev

COPY requirements.txt ./
RUN pip3 install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 3001

CMD ["node", "index.js"]
