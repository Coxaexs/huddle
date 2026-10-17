import { isGameKind, type GameKind } from "@/lib/games";
import { parseWhisper } from "@/lib/whisper";
import type { MusicSettings } from "../../components/music-cards";
import { type Message } from "../../lib/chat/types";
import { formatClientDateTime } from "../../lib/chat/format";
import { runSpeechCommand, SPEECH_COMMANDS, type SpeechCommand } from "../../lib/chat/speech-commands";
import { runLookupCommand } from "../../lib/chat/commands/lookup";
import { runMusicCommand } from "../../lib/chat/commands/music";
import { runWatchCommand } from "../../lib/chat/commands/watch";
import { runRecordCommand } from "../../lib/chat/commands/record";
import { ROLL_COMMANDS, runRollCommand } from "../../lib/chat/commands/roll";
import { type TtsLanguage } from "../../lib/tts/client";
import { apiFetch } from "../../lib/client";
import { COMMAND_ALIASES, DISCORD_ONLY_COMMANDS, DND_LINK_COMMANDS, LOOKUP_COMMANDS, MUSIC_COMMANDS } from "../../lib/commands";
import type { useShellActions } from "./use-shell-actions";

/** ChatShell, part 7 of 9. Slash commands: runCommand and the bot, music and TTS helpers it uses. */
export function useShellCommands(s: ReturnType<typeof useShellActions>) {
  const {
    activeChannelId, activeChannelRef, botCommands, channelTitle, dialogDismissRef, dndOnline,
    dndUrl, features, hub, inDmHome, lastDiceRollSeedRef, members, openMusicDashboard,
    pendingCommandRef, player, postBotMessage, runCommandRef, sendText, setDialogCallback,
    setDialogCancel, setDialogOptions, setDiceRoll, setMarkdownModalOpen, setNotice,
    setRoomActivity, setStageChannelId, showCustomConfirm, startGame, user, voice, voiceChannels,
    whisperNamesRef,
  } = s;

  async function runCommand(raw: string) {
    const [rawName, ...parts] = raw.trim().split(/\s+/);
    const bare = rawName.replace(/^\//, "").toLowerCase();
    const name = COMMAND_ALIASES[bare] || bare;
    const value = parts.join(" ").trim();

    // Remember who ran what, so the bot's reply can show it instead of us
    // posting the raw slash text as its own message.
    pendingCommandRef.current = user
      ? { text: raw.trim().slice(0, 200), by: user.displayName }
      : null;

    if (name === "w") {
      const channel = activeChannelRef.current;
      if (!channel || !user) return;
      const result = parseWhisper(
        value,
        members.map((member) => ({ id: member.id, username: member.username, displayName: member.displayName })),
        user.id,
      );
      if (!result.ok) {
        setNotice(result.error);
        return;
      }
      const id = crypto.randomUUID();
      whisperNamesRef.current.set(id, result.people.map((person) => person.displayName).join(", "));
      hub.send({ t: "text-whisper", channelId: channel, toUserIds: result.people.map((person) => person.id), text: result.text, id });
      return;
    }

    if (name === "markdown") {
      setMarkdownModalOpen((prev) => !prev);
      setNotice("Markdown enabled! Use ```cpp for code blocks, **bold**, *italic*.");
      return;
    }

    // /game tictactoe | connect4 | rps | mines | rota [solo]
    if (name === "game") {
      const [pick = "", mode = ""] = value.split(/\s+/);
      const solo = /^(solo|alone|tek)$/i.test(mode);
      const aliases: Record<string, GameKind> = {
        ttt: "tictactoe",
        "tic-tac-toe": "tictactoe",
        four: "connect4",
        "connect-4": "connect4",
        minesweeper: "mines",
        flags: "mines",
        route: "rota",
        countries: "rota",
      };
      const kind = aliases[pick.toLowerCase()] ?? pick.toLowerCase();
      if (!isGameKind(kind)) {
        setNotice("Try: /game tictactoe, /game connect4, /game rps, /game mines or /game rota");
        return;
      }
      await startGame(kind, solo);
      return;
    }

    // /purge <count>
    if (name === "purge") {
      pendingCommandRef.current = null;
      if (!activeChannelId || inDmHome) {
        setNotice("You can only purge messages in a server channel.");
        return;
      }
      const count = parseInt(value.trim(), 10);
      if (!Number.isFinite(count) || count < 1 || count > 100) {
        setNotice("Try: /purge 25 (deletes between 1 and 100 recent messages)");
        return;
      }
      try {
        const res = await apiFetch<{ deleted: number }>("/api/messages/purge", {
          method: "POST",
          body: JSON.stringify({ channelId: activeChannelId, count }),
        });
        setNotice(`Purged ${res.deleted} message${res.deleted === 1 ? "" : "s"}.`);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "Could not purge messages.");
      }
      return;
    }

    // /poll Question? | option | option
    if (name === "poll") {
      const [question, ...options] = value.split("|").map((part) => part.trim());
      if (!question || options.filter(Boolean).length < 2) {
        setNotice("Try: /poll Pizza or burger? | Pizza | Burger");
        return;
      }
      try {
        await apiFetch("/api/polls", {
          method: "POST",
          body: JSON.stringify({
            channelId: activeChannelId,
            question,
            options: options.filter(Boolean),
          }),
        });
      } catch (error) {
        setNotice(
          error instanceof Error ? error.message : "Could not create the poll.",
        );
      }
      return;
    }

    // /ask_gm belongs to the D&D bot; while it isn't connected here, the
    // built-in AI answers instead of a link to the companion.
    const gmFallback =
      name === "ask_gm" && !botCommands.some((command) => command.name === "ask_gm");
    if (name === "ask" || gmFallback) {
      // The server posts the answer itself (with the "/ask ..." header), so
      // nothing here should pick up the pending invocation.
      pendingCommandRef.current = null;
      if (!value) {
        setNotice("Try: /ask how do spell slots work? (start with web: to force a web search)");
        return;
      }
      if (!activeChannelId) return;
      setNotice("✦ Huddle AI is thinking…");
      try {
        await apiFetch("/api/ai/ask", {
          method: "POST",
          body: JSON.stringify({
            channelId: activeChannelId,
            question: gmFallback ? `noweb: As a D&D 5e Game Master: ${value}` : value,
          }),
        });
        setNotice("");
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "The AI did not answer.");
      }
      return;
    }

    if (name === "summarize" || name === "catchup" || name === "tldr") {
      pendingCommandRef.current = null;
      if (!activeChannelId) return;
      setNotice("✦ Reading the channel…");
      try {
        const data = await apiFetch<{ summary: string; count: number }>("/api/ai/summarize", {
          method: "POST",
          body: JSON.stringify({ channelId: activeChannelId }),
        });
        setNotice("");
        // Shown to you only; nothing is posted to the channel.
        setDialogOptions({
          type: "alert",
          title: `Catch-up · last ${data.count} messages`,
          message: data.summary,
          confirmText: "Got it",
        });
        setDialogCallback(null);
        setDialogCancel(null);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "The summary did not come back.");
      }
      return;
    }

    if (name === "remind") {
      pendingCommandRef.current = null;
      try {
        const data = await apiFetch<{ dueAt: string }>("/api/reminders", {
          method: "POST",
          body: JSON.stringify({
            spec: value,
            channelId: activeChannelId,
            timezoneOffset: new Date().getTimezoneOffset(),
          }),
        });
        setNotice(`⏰ Reminder set for ${formatClientDateTime(data.dueAt)}.`);
      } catch (error) {
        setNotice(
          error instanceof Error ? error.message : "Try: /remind 20m take the pizza out",
        );
      }
      return;
    }

    if (name === "recap" && /^(start|stop|end)\b/i.test(value.trim())) {
      pendingCommandRef.current = null;
      const start = /^start\b/i.test(value.trim());
      try {
        await apiFetch("/api/recap", {
          method: "POST",
          body: JSON.stringify({ channelId: activeChannelId, voiceChannelId: voice.channelId, action: start ? "start" : "stop" }),
        });
        setNotice(
          start
            ? "📜 Session notes on. Captions people share in the call are kept, and the recap lands here when you /recap stop or everyone leaves."
            : "📜 Session notes stopped; the recap is on its way.",
        );
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "Session notes did not start.");
      }
      return;
    }

    if (name === "recap") {
      pendingCommandRef.current = null;
      const weekly = /^weekly\b/i.test(value);
      try {
        const data = await apiFetch<{ posted?: boolean; weekly?: boolean; nextAt?: string }>("/api/recap", {
          method: "POST",
          body: JSON.stringify({ channelId: activeChannelId, action: weekly ? "weekly" : "now" }),
        });
        if (weekly) {
          setNotice(
            data.weekly
              ? `📊 Weekly recap on: next one ${formatClientDateTime(data.nextAt || "")} in this channel. /recap weekly again turns it off.`
              : "📊 Weekly recap turned off.",
          );
        } else if (!data.posted) {
          setNotice("Nothing to recap: no messages here in the last week.");
        }
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "The recap did not work.");
      }
      return;
    }

    if (name === "schedule") {
      pendingCommandRef.current = null;
      // Keep the message's own line breaks: everything after "/schedule ".
      const spec = raw.trim().replace(/^\/?\S+[ \t]*/, "");
      try {
        if (!spec || /^(list|cancel)\b/i.test(spec)) {
          const data = await apiFetch<{
            scheduled: Array<{ id: string; channelName: string | null; text: string; dueAt: string }>;
          }>("/api/scheduled");
          const cancel = spec.match(/^cancel\s+(\d+)/i);
          if (cancel) {
            const item = data.scheduled[Number(cancel[1]) - 1];
            if (!item) {
              setNotice("There is no scheduled message with that number. /schedule lists them.");
              return;
            }
            await apiFetch(`/api/scheduled?id=${encodeURIComponent(item.id)}`, { method: "DELETE" });
            setNotice(`Cancelled: “${item.text.slice(0, 60)}”`);
            return;
          }
          setDialogOptions({
            type: "alert",
            title: "Scheduled messages",
            message: data.scheduled.length
              ? data.scheduled
                  .map(
                    (item, index) =>
                      `${index + 1}. ${formatClientDateTime(item.dueAt)} · #${item.channelName || "?"}\n   ${item.text.slice(0, 120)}`,
                  )
                  .join("\n\n") + "\n\nCancel one with /schedule cancel <number>."
              : "Nothing scheduled. Try /schedule 20:00 Doors are open!",
            confirmText: "OK",
          });
          setDialogCallback(null);
          setDialogCancel(null);
          return;
        }
        const data = await apiFetch<{ dueAt: string }>("/api/scheduled", {
          method: "POST",
          body: JSON.stringify({
            spec,
            channelId: activeChannelId,
            timezoneOffset: new Date().getTimezoneOffset(),
          }),
        });
        setNotice(`🕒 Scheduled for ${formatClientDateTime(data.dueAt)}. /schedule lists or cancels it.`);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "Try: /schedule 20:00 Doors are open!");
      }
      return;
    }

    if (name === "record") {
      await runRecordCommand(value, {
        enabled: features.recordSessions,
        voiceChannelId: voice.channelId,
        recordings: hub.recordings,
        notify: setNotice,
        openStage: setStageChannelId,
      });
      return;
    }

    if (MUSIC_COMMANDS.has(name)) {
      await runMusicCommand(name, value, raw, {
        voiceChannelId: voice.channelId,
        voiceChannels,
        players: hub.players,
        activeChannelId,
        userName: user?.displayName,
        primePlayer: () => player.prime(),
        notify: setNotice,
      });
      return;
    }

    if (name === "join" && voice.channelId) {
      // In Huddle the bot has no idle seat: it joins the room by itself
      // whenever something plays and leaves when the queue ends.
      await postBotMessage(
        "I'll hop into this voice room as soon as something plays. Use `/play <song>` or play a playlist from `/web`.",
      );
      return;
    }

    if (DISCORD_ONLY_COMMANDS.has(name)) {
      // These drive the bot's Discord voice connection, not Huddle playback.
      try {
        const data = await apiFetch<{
          text?: string;
          kind?: string;
          payload?: Message["payload"];
        }>(
          "/api/integrations/musicwatch/command",
          {
            method: "POST",
            body: JSON.stringify({ command: `/${name} ${value}`.trim() }),
          },
        );
        await postBotMessage(data.text || "Done on Discord.");
      } catch (error) {
        await postBotMessage(
          error instanceof Error
            ? error.message
            : "The Discord music bot could not do that.",
        );
      }
      return;
    }

    if (name === "watch" || name === "reels") {
      await runWatchCommand(name, {
        voiceChannelId: voice.channelId,
        channelTitle,
        postBotMessage,
        onActivity: (activity, channelId) => {
          setRoomActivity(activity);
          setStageChannelId(channelId);
        },
      });
      return;
    }

    if (name === "music" || name === "web") {
      await openMusicDashboard();
      return;
    }

    if (name === "dj") {
      await openMusicDashboard("dj");
      return;
    }

    if (ROLL_COMMANDS.has(name)) {
      await runRollCommand(raw, {
        voiceChannelId: voice.channelId,
        textChannelId: activeChannelRef.current,
        postBotMessage,
        onRoll: (roll) => {
          lastDiceRollSeedRef.current = roll.animationSeed;
          setDiceRoll(roll);
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("huddle-dice-rolled", { detail: roll }),
            );
          }
        },
      });
      return;
    }

    if (LOOKUP_COMMANDS.has(name)) {
      await runLookupCommand(name, value, { channelId: activeChannelRef.current, postBotMessage, notify: setNotice });
      return;
    }

    // A connected D&D bot (running on this Hoffle through the Discord
    // gateway) does these for real, so it wins over the link-out stub.
    if (DND_LINK_COMMANDS.has(name) && botCommands.some((command) => command.name === bare)) {
      if (await runBotSlashCommand(bare, value)) return;
    }

    if (DND_LINK_COMMANDS.has(name)) {
      await postBotMessage(
        dndOnline
          ? "Character sheets, inventory and the GM panel live in the D&D companion — open it here."
          : "The D&D companion looks offline right now.",
        {
          ...(dndUrl ? { link: dndUrl, actionLabel: "Open D&D companion" } : {}),
          author: "D&D Bot",
          avatar: "⚔",
        },
      );
      return;
    }

    if (name === "flip" || name === "coinflip") {
      await postBotMessage(Math.random() > 0.5 ? "Heads." : "Tails.");
      return;
    }

    if (name === "shrug") {
      await sendText("¯\\_(ツ)_/¯");
      return;
    }

    if (SPEECH_COMMANDS.has(name)) {
      await runSpeechCommand(name as SpeechCommand, value, {
        activeChannelId,
        voiceChannelId: voice.channelId,
        serverMuted: Boolean(user && hub.forcedMutes.has(user.id)),
        voice,
        notify: setNotice,
        askLanguage: askTtsLanguage,
      });
      return;
    }

    if (name === "help") {
      await postBotMessage(
        "Type / in the box to see every command with its arguments. Music commands need you to be in a voice channel; a few still run on Discord and say so.",
      );
      return;
    }

    // Last: a command a connected bot registered. The server tells us whether
    // it owns the name, so an unknown one still gets the message below.
    if (await runBotSlashCommand(bare, value)) return;

    setNotice(`I don't know /${bare}. Type / to see what I do know.`);
  }

  runCommandRef.current = runCommand;

  /** Asks which language to read `text` in; null when the question is closed. */
  function askTtsLanguage(text: string): Promise<TtsLanguage | null> {
    return new Promise((resolve) => {
      showCustomConfirm({
        title: "Which language?",
        message: `Read “${text.length > 80 ? `${text.slice(0, 80)}…` : text}” in Turkish or English?`,
        confirmText: "Türkçe",
        cancelText: "English",
        onConfirm: () => resolve("tr"),
        onCancel: () => resolve("en"),
      });
      // Closing the dialog without choosing sends nothing.
      dialogDismissRef.current = () => resolve(null);
    });
  }

  /** Runs a bot-registered command; false when no connected bot owns it. */
  async function runBotSlashCommand(bare: string, value: string): Promise<boolean> {
    if (!activeChannelId) return false;
    try {
      const result = await apiFetch<{ ok: boolean; reason: string | null; message?: string }>(
        "/api/commands",
        {
          method: "POST",
          body: JSON.stringify({
            channelId: activeChannelId,
            name: bare,
            args: value,
          }),
        },
      );
      if (result.ok) return true;
      if (result.reason === "usage") {
        setNotice(result.message || `Check the arguments for /${bare}.`);
        return true;
      }
      if (result.reason === "offline") {
        setNotice(`The bot that owns /${bare} is not connected right now.`);
        return true;
      }
    } catch {
      // Treated as unknown: the caller falls back.
    }
    return false;
  }

  async function runMusicUiCommand(
    raw: string,
    roomHint?: string,
  ): Promise<MusicSettings | void> {
    const targetVoiceChannelId =
      roomHint ||
      voice.channelId ||
      voiceChannels.find((channel) => hub.players[channel.id]?.track)?.id ||
      voiceChannels[0]?.id;
    if (!targetVoiceChannelId) {
      setNotice("This server does not have a voice room yet.");
      return;
    }
    const name = raw.trim().split(/\s+/)[0].replace(/^\//, "");
    const silent = new Set([
      "autoplay",
      "automix",
      "artistdiversity",
      "vibematch",
      "automixblend",
      "crossfade",
      "filter",
    ]).has(name);
    try {
      const data = await apiFetch<{ state?: MusicSettings }>(
        "/api/music/command",
        {
          method: "POST",
          body: JSON.stringify({
            command: raw,
            voiceChannelId: targetVoiceChannelId,
            textChannelId: activeChannelId,
            silent,
          }),
        },
      );
      return data.state;
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "That music control failed.",
      );
    }
  }

  return {
    ...s,
    runCommand, askTtsLanguage, runBotSlashCommand, runMusicUiCommand,
  };
}
