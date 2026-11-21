using System;
using System.Collections;
using System.IO;
using System.Text.Json;
using StardewModdingAPI;
using StardewModdingAPI.Events;
using StardewValley;
using StardewValley.Menus;
using StardewValley.Network;
using StardewValley.SDKs;

namespace HofflePlayTogether;

/// <summary>
/// Hoffle Play together for Stardew Valley. It only talks to the Hoffle
/// desktop app on this computer, through two small files in ~/.hoffle/play:
///
/// - stardew-host.json: while you host co-op, your invite code (and Steam
///   lobby, if on Steam). Hoffle hands it only to the friends you let in.
/// - stardew-join.json: Hoffle writes it when you're let into someone's farm;
///   on the title screen the mod joins that farm with its invite code, the
///   same as Co-op → Enter invite code.
///
/// No network access of its own, nothing else read or written.
/// </summary>
public sealed class ModEntry : Mod
{
    private const int ProtocolVersion = 1;
    /// <summary>A join request older than this is ignored (you clicked Join a while ago).</summary>
    private static readonly TimeSpan JoinTtl = TimeSpan.FromMinutes(3);
    /// <summary>The host file is rewritten at least this often, so Hoffle knows it is fresh.</summary>
    private static readonly TimeSpan Heartbeat = TimeSpan.FromSeconds(10);

    private string folder = "";
    private string lastHostJson = "";
    private DateTime lastHostWrite = DateTime.MinValue;
    private int titleTicks;

    public override void Entry(IModHelper helper)
    {
        folder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".hoffle", "play");
        try
        {
            Directory.CreateDirectory(folder);
            // Tells the Hoffle app this computer can join farms by itself.
            Write("stardew-mod.json", JsonSerializer.Serialize(new { v = ProtocolVersion, mod = ModManifest.Version.ToString() }));
        }
        catch (Exception ex)
        {
            Monitor.Log($"Can't use {folder}: {ex.Message}", LogLevel.Warn);
        }
        helper.Events.GameLoop.UpdateTicked += OnUpdateTicked;
        helper.Events.GameLoop.ReturnedToTitle += (_, _) => WriteHost(force: true);
    }

    private void OnUpdateTicked(object? sender, UpdateTickedEventArgs e)
    {
        titleTicks = Game1.activeClickableMenu is TitleMenu ? titleTicks + 1 : 0;
        if (!e.IsMultipleOf(60)) return; // about once a second
        WriteHost(force: false);
        TryJoin();
    }

    // ---- Hosting: tell Hoffle how to get in ----

    private void WriteHost(bool force)
    {
        string json;
        try
        {
            bool hosting = Context.IsWorldReady && Context.IsMainPlayer && Game1.IsServer && Game1.server != null;
            json = hosting
                ? JsonSerializer.Serialize(new
                {
                    v = ProtocolVersion,
                    hosting = true,
                    inviteCode = Game1.server!.getInviteCode(),
                    steamLobby = SteamLobby(),
                    steamId = SteamId(),
                    farm = Game1.player.farmName.Value,
                    players = Game1.getOnlineFarmers().Count,
                    maxPlayers = PlayerLimit(),
                })
                : JsonSerializer.Serialize(new { v = ProtocolVersion, hosting = false });
        }
        catch (Exception ex)
        {
            Monitor.LogOnce($"Couldn't read the co-op state: {ex.Message}", LogLevel.Trace);
            return;
        }
        if (!force && json == lastHostJson && DateTime.UtcNow - lastHostWrite < Heartbeat) return;
        lastHostJson = json;
        lastHostWrite = DateTime.UtcNow;
        // updatedAt goes in after the comparison so the heartbeat decides rewrites.
        Write("stardew-host.json", json.Insert(json.Length - 1, $",\"updatedAt\":{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}"));
    }

    /// <summary>How many players the farm takes (Game1.multiplayer is internal).</summary>
    private int? PlayerLimit()
    {
        try
        {
            object mp = Helper.Reflection.GetField<object>(typeof(Game1), "multiplayer").GetValue();
            return Helper.Reflection.GetField<int>(mp, "playerLimit").GetValue();
        }
        catch
        {
            return null;
        }
    }

    /// <summary>The Steam lobby this server sits in, for steam://joinlobby. Null off Steam.</summary>
    private string? SteamLobby()
    {
        try
        {
            if (Game1.server is not GameServer server) return null;
            var servers = Helper.Reflection.GetField<IList>(server, "servers").GetValue();
            foreach (object s in servers)
            {
                if (s.GetType().Name != "SteamNetServer") continue;
                object lobby = Helper.Reflection.GetField<object>(s, "Lobby").GetValue();
                object? id = lobby.GetType().GetField("m_SteamID")?.GetValue(lobby);
                return id is ulong value && value != 0 ? value.ToString() : null;
            }
        }
        catch
        {
            // Not on Steam, or the game changed: the invite code still works.
        }
        return null;
    }

    private static string? SteamId()
    {
        try
        {
            object? id = Type.GetType("Steamworks.SteamUser, Steamworks.NET")?.GetMethod("GetSteamID")?.Invoke(null, null);
            object? raw = id?.GetType().GetField("m_SteamID")?.GetValue(id);
            return raw is ulong value && value != 0 ? value.ToString() : null;
        }
        catch
        {
            return null;
        }
    }

    // ---- Joining: Hoffle let you into someone's farm ----

    private void TryJoin()
    {
        string path = Path.Combine(folder, "stardew-join.json");
        if (!File.Exists(path)) return;
        // Wait on the title screen until its intro has settled (about 2 s).
        if (Game1.activeClickableMenu is not TitleMenu || titleTicks < 120) return;
        if (TitleMenu.subMenu is not null and not CoopMenu) return;

        string? code = null;
        try
        {
            using var doc = JsonDocument.Parse(File.ReadAllText(path));
            var root = doc.RootElement;
            long at = root.TryGetProperty("at", out var a) && a.TryGetInt64(out long ms) ? ms : 0;
            if (DateTimeOffset.UtcNow - DateTimeOffset.FromUnixTimeMilliseconds(at) <= JoinTtl
                && root.TryGetProperty("inviteCode", out var c))
            {
                code = c.GetString();
            }
        }
        catch
        {
            // Half-written or broken: treat as consumed.
        }
        // One try per request, whatever happens.
        try { File.Delete(path); } catch { }
        if (string.IsNullOrWhiteSpace(code)) return;

        try
        {
            var sdk = Helper.Reflection.GetProperty<SDKHelper>(typeof(Program), "sdk").GetValue();
            var net = sdk.Networking;
            object? lobby = net?.SupportsInviteCodes() == true ? net.GetLobbyFromInviteCode(code) : null;
            Client? client = lobby is null ? null : net!.CreateClient(lobby);
            if (client is null)
            {
                Monitor.Log("Hoffle sent an invite code this game can't use.", LogLevel.Warn);
                return;
            }
            Monitor.Log("Joining the farm Hoffle let you into…", LogLevel.Info);
            TitleMenu.subMenu = new FarmhandMenu(client);
        }
        catch (Exception ex)
        {
            Monitor.Log($"Couldn't join: {ex.Message}", LogLevel.Warn);
        }
    }

    private void Write(string name, string json)
    {
        try
        {
            string path = Path.Combine(folder, name);
            string temp = path + ".tmp";
            File.WriteAllText(temp, json);
            File.Move(temp, path, overwrite: true);
        }
        catch (Exception ex)
        {
            Monitor.LogOnce($"Couldn't write {name}: {ex.Message}", LogLevel.Trace);
        }
    }
}
