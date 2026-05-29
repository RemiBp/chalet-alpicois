FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev

COPY backend/ ./backend/
COPY emails.db ./emails.db

ENV API_PORT=3001
EXPOSE 3001

CMD ["node", "backend/api-server.js"]
