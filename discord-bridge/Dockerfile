FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY src/ ./src/

# Which message is which, the webhooks it made, and where each channel got to.
VOLUME /app/state
ENV BRIDGE_STATE_DIR=/app/state

CMD ["node", "--no-warnings=ExperimentalWarning", "src/index.js"]
