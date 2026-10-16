#include "ActivityScanner.h"
#include <windows.h>
#include <tlhelp32.h>
#include <algorithm>
#include <sstream>

struct GameDef {
    const wchar_t* exe;
    const char* name;
};

static const GameDef kKnownGames[] = {
    { L"valorant.exe", "VALORANT" },
    { L"leagueclient.exe", "League of Legends" },
    { L"cs2.exe", "Counter-Strike 2" },
    { L"dota2.exe", "Dota 2" },
    { L"overwatch.exe", "Overwatch 2" },
    { L"r5apex.exe", "Apex Legends" },
    { L"fortniteclient-win64-shipping.exe", "Fortnite" },
    { L"minecraft.exe", "Minecraft" },
    { L"javaw.exe", "Minecraft" },
    { L"robloxplayerbeta.exe", "Roblox" },
    { L"rocketleague.exe", "Rocket League" },
    { L"gta5.exe", "Grand Theft Auto V" },
    { L"eldenring.exe", "ELDEN RING" },
    { L"cyberpunk2077.exe", "Cyberpunk 2077" },
    { L"baldursgate3.exe", "Baldur's Gate 3" },
    { L"bg3.exe", "Baldur's Gate 3" },
    { L"spotify.exe", "Spotify" },
    { L"code.exe", "Visual Studio Code" },
    { L"devenv.exe", "Visual Studio" },
};

ActivityScanner& ActivityScanner::Instance() {
    static ActivityScanner s_instance;
    return s_instance;
}

std::string ActivityScanner::ScanRunningActivitiesJson() {
    HANDLE hSnap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    if (hSnap == INVALID_HANDLE_VALUE) {
        return "null";
    }

    PROCESSENTRY32W pe32;
    pe32.dwSize = sizeof(PROCESSENTRY32W);

    std::string detectedGame = "";

    if (Process32FirstW(hSnap, &pe32)) {
        do {
            std::wstring procName = pe32.szExeFile;
            std::transform(procName.begin(), procName.end(), procName.begin(), ::towlower);

            for (const auto& g : kKnownGames) {
                std::wstring gExe = g.exe;
                std::transform(gExe.begin(), gExe.end(), gExe.begin(), ::towlower);
                if (procName == gExe) {
                    detectedGame = g.name;
                    break;
                }
            }
            if (!detectedGame.empty()) break;
        } while (Process32NextW(hSnap, &pe32));
    }
    CloseHandle(hSnap);

    if (detectedGame.empty()) {
        return "null";
    }

    std::ostringstream ss;
    ss << "{\"name\":\"" << detectedGame << "\",\"type\":\"playing\"}";
    return ss.str();
}
