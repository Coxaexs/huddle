FROM node:20-alpine

WORKDIR /app

COPY package.json ./
# Zero external npm dependencies!
COPY src/ ./src/

ENV NODE_ENV=production
ENV HUDDLE_URL=http://hoffle:8730
ENV HUDDLE_BASE_PATH=/hangout

CMD ["node", "src/index.js"]
