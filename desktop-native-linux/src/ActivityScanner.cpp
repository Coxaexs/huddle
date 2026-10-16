#include "ActivityScanner.h"
#include <dirent.h>
#include <unistd.h>
#include <algorithm>
#include <cctype>
#include <fstream>
#include <map>
#include <sstream>
#include <string>
#include <vector>

ActivityScanner& ActivityScanner::Instance() {
    static ActivityScanner scanner;
    return scanner;
}

static std::string ToLower(const std::string& str) {
    std::string s = str;
    std::transform(s.begin(), s.end(), s.begin(), [](unsigned char c) {
        return std::tolower(c);
    });
    return s;
}

std::string ActivityScanner::ScanRunningActivitiesJson() {
    static const std::map<std::string, std::string> knownGames = {
        {"cs2", "Counter-Strike 2"},
        {"csgo_linux64", "Counter-Strike: Global Offensive"},
        {"dota2", "Dota 2"},
        {"hl2_linux", "Half-Life 2 / Team Fortress 2"},
        {"minecraft", "Minecraft"},
        {"factorio", "Factorio"},
        {"valheim.x86_64", "Valheim"},
        {"valheim", "Valheim"},
        {"osu!", "osu!"},
        {"osu", "osu!"},
        {"retroarch", "RetroArch"},
        {"cyberpunk2077", "Cyberpunk 2077"},
        {"eldenring", "Elden Ring"},
        {"apexlegends", "Apex Legends"},
        {"terraria", "Terraria"},
        {"stardewvalley.b", "Stardew Valley"},
        {"stardew", "Stardew Valley"},
        {"rust", "Rust"},
        {"rocketleague", "Rocket League"},
        {"overwatch", "Overwatch 2"},
        {"leagueclient", "League of Legends"},
        {"league", "League of Legends"},
        {"steam", "Steam"},
        {"lutris", "Lutris"},
        {"heroic", "Heroic Games Launcher"},
        {"discord", "Discord"},
        {"spotify", "Spotify"},
        {"godot", "Godot Engine"},
        {"blender", "Blender"},
        {"obs", "OBS Studio"},
        {"vlc", "VLC Media Player"}
    };

    DIR* procDir = opendir("/proc");
    if (!procDir) {
        return "null";
    }

    struct dirent* entry;
    while ((entry = readdir(procDir)) != nullptr) {
        if (entry->d_type != DT_DIR && entry->d_type != DT_UNKNOWN) {
            continue;
        }

        // Must be a PID (all digits)
        char* endPtr = nullptr;
        long pid = strtol(entry->d_name, &endPtr, 10);
        if (pid <= 0 || *endPtr != '\0') {
            continue;
        }

        // Read /proc/<pid>/comm
        std::string commPath = std::string("/proc/") + entry->d_name + "/comm";
        std::ifstream commFile(commPath);
        if (commFile.is_open()) {
            std::string comm;
            if (std::getline(commFile, comm)) {
                // Strip trailing newline / carriage return
                while (!comm.empty() && (comm.back() == '\n' || comm.back() == '\r')) {
                    comm.pop_back();
                }

                std::string lowerComm = ToLower(comm);
                for (const auto& kv : knownGames) {
                    if (lowerComm.find(kv.first) != std::string::npos) {
                        closedir(procDir);
                        std::ostringstream ss;
                        ss << "[{\"name\":\"" << kv.second << "\",\"type\":\"game\",\"details\":\"Playing " << kv.second << "\"}]";
                        return ss.str();
                    }
                }
            }
        }
    }

    closedir(procDir);
    return "null";
}
