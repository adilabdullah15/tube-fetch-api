# --- Runtime: Node 20 slim -------------------------------------------
FROM node:20-slim

# --- System deps: python3 + pip so we can install yt-dlp ---------------
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip ffmpeg \
  && rm -rf /var/lib/apt/lists/*

# Install yt-dlp (the download engine)
RUN pip3 install --no-cache-dir --break-system-packages yt-dlp

# --- App ---------------------------------------------------------------
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY . .

ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
