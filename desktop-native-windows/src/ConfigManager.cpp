#include "ConfigManager.h"
#include <shlobj.h>
#include <fstream>
#include <sstream>

static const wchar_t* kDefaultURL = L"https://chat.hoffle.online/hangout";

ConfigManager& ConfigManager::Instance() {
    static ConfigManager s_instance;
    return s_instance;
}

ConfigManager::ConfigManager() {
    m_serverUrl = kDefaultURL;

    std::wstring path = GetConfigPath();
    std::ifstream f(path);
    if (f.is_open()) {
        std::string line;
        while (std::getline(f, line)) {
            size_t pos = line.find("\"serverUrl\":");
            if (pos != std::string::npos) {
                size_t start = line.find('"', pos + 12);
                size_t end = line.find('"', start + 1);
                if (start != std::string::npos && end != std::string::npos) {
                    std::string u = line.substr(start + 1, end - start - 1);
                    if (!u.empty()) {
                        int wlen = MultiByteToWideChar(CP_UTF8, 0, u.c_str(), -1, NULL, 0);
                        if (wlen > 1) {
                            std::wstring wu(wlen - 1, 0);
                            MultiByteToWideChar(CP_UTF8, 0, u.c_str(), -1, &wu[0], wlen);
                            m_serverUrl = wu;
                        }
                    }
                }
            }
        }
    }
}

std::wstring ConfigManager::GetConfigPath() {
    wchar_t appData[MAX_PATH];
    if (SUCCEEDED(SHGetFolderPathW(NULL, CSIDL_APPDATA, NULL, 0, appData))) {
        std::wstring dir = std::wstring(appData) + L"\\Hoffle";
        CreateDirectoryW(dir.c_str(), NULL);
        return dir + L"\\config.json";
    }
    return L"config.json";
}

std::wstring ConfigManager::GetServerURL() {
    return m_serverUrl;
}

void ConfigManager::SetServerURL(const std::wstring& url) {
    m_serverUrl = url;
    std::wstring path = GetConfigPath();
    
    char u8[1024] = {0};
    WideCharToMultiByte(CP_UTF8, 0, url.c_str(), -1, u8, sizeof(u8) - 1, NULL, NULL);

    std::ofstream f(path);
    if (f.is_open()) {
        f << "{\n  \"serverUrl\": \"" << u8 << "\"\n}\n";
    }
}

void ConfigManager::LoadWindowPlacement(int& x, int& y, int& width, int& height, bool& maximized) {
    x = CW_USEDEFAULT;
    y = CW_USEDEFAULT;
    width = 1280;
    height = 820;
    maximized = false;
}

void ConfigManager::SaveWindowPlacement(int x, int y, int width, int height, bool maximized) {
    // Window placement persistence
}
