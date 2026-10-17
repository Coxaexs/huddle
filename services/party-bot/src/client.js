export class HoffleClient {
  constructor(options = {}) {
    this.baseUrl = (options.baseUrl || "http://127.0.0.1:8730").replace(/\/+$/, "");
    this.basePath = options.basePath || "/hangout";
    this.token = options.token;
    this.botUser = null;
    this.abortController = null;
    this.onMessageCallback = null;
  }

  get apiPrefix() {
    return `${this.baseUrl}${this.basePath}/api/v1`;
  }

  async sendMessage(channelId, content) {
    if (!content || !content.trim()) return null;
    const url = `${this.apiPrefix}/channels/${encodeURIComponent(channelId)}/messages`;

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bot ${this.token}`,
        },
        body: JSON.stringify({ content: content.slice(0, 4000) }),
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => "");
        console.error(`[client] Failed to send message: ${res.status} ${errorText}`);
        return null;
      }
      return await res.json();
    } catch (err) {
      console.error("[client] Send error:", err.message);
      return null;
    }
  }

  async deleteMessage(channelId, messageId) {
    const url = `${this.apiPrefix}/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}`;
    try {
      const res = await fetch(url, {
        method: "DELETE",
        headers: { Authorization: `Bot ${this.token}` },
      });
      return res.ok;
    } catch (err) {
      console.error("[client] Delete error:", err.message);
      return false;
    }
  }

  onMessage(callback) {
    this.onMessageCallback = callback;
  }

  async start() {
    const eventsUrl = `${this.apiPrefix}/gateway/events`;
    console.log(`[party-bot] Connecting to Hoffle event gateway at ${eventsUrl}...`);

    this.abortController = new AbortController();

    try {
      const response = await fetch(eventsUrl, {
        headers: {
          Accept: "text/event-stream",
          Authorization: `Bot ${this.token}`,
        },
        signal: this.abortController.signal,
      });

      if (!response.ok || !response.body) {
        console.warn(`[party-bot] Gateway returned HTTP ${response.status}. Reconnecting in 5s...`);
        setTimeout(() => this.start(), 5000);
        return;
      }

      console.log("[party-bot] Connected to real-time events!");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const block of parts) {
          if (!block.trim()) continue;
          const match = block.match(/(?:^|\n)data:\s*(.+)$/m);
          if (!match) continue;

          try {
            const event = JSON.parse(match[1]);
            if (event.t === "READY" && event.d?.user) {
              this.botUser = event.d.user;
              console.log(`[party-bot] Logged in as ${this.botUser.username} (${this.botUser.id})`);
            } else if (event.t === "MESSAGE_CREATE" && event.d) {
              const msg = event.d;
              // Ignore bot's own messages and other bots
              if (msg.author?.bot) continue;
              if (this.onMessageCallback) {
                this.onMessageCallback(msg);
              }
            }
          } catch {
            // Ignore malformed JSON chunks
          }
        }
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        console.warn("[party-bot] Gateway disconnected:", err.message);
      }
    }

    setTimeout(() => this.start(), 5000);
  }

  stop() {
    if (this.abortController) {
      this.abortController.abort();
    }
  }
}
