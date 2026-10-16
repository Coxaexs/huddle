#include "ConfigManager.h"
#include <glib.h>
#include <sys/stat.h>
#include <fstream>
#include <sstream>

ConfigManager& ConfigManager::Instance() {
    static ConfigManager instance;
    return instance;
}

ConfigManager::ConfigManager() {
    m_serverUrl = "https://chat.hoffle.online";

    std::string path = GetConfigPath();
    std::ifstream file(path);
    if (file.is_open()) {
        std::string line;
        while (std::getline(file, line)) {
            size_t pos = line.find("\"serverUrl\":");
            if (pos != std::string::npos) {
                size_t start = line.find('"', pos + 12);
                if (start != std::string::npos) {
                    size_t end = line.find('"', start + 1);
                    if (end != std::string::npos) {
                        m_serverUrl = line.substr(start + 1, end - start - 1);
                    }
                }
            }
        }
    }
}

std::string ConfigManager::GetConfigPath() {
    const char* configDir = g_get_user_config_dir();
    std::string dir = std::string(configDir) + "/hoffle";
    g_mkdir_with_parents(dir.c_str(), 0755);
    return dir + "/config.json";
}

std::string ConfigManager::GetServerURL() {
    return m_serverUrl;
}

void ConfigManager::SetServerURL(const std::string& url) {
    m_serverUrl = url;
    int w = 1280, h = 820;
    bool max = false;
    LoadWindowPlacement(w, h, max);
    SaveWindowPlacement(w, h, max);
}

void ConfigManager::LoadWindowPlacement(int& width, int& height, bool& maximized) {
    width = 1280;
    height = 820;
    maximized = false;

    std::string path = GetConfigPath();
    std::ifstream file(path);
    if (file.is_open()) {
        std::string line;
        while (std::getline(file, line)) {
            size_t posW = line.find("\"width\":");
            if (posW != std::string::npos) {
                width = std::stoi(line.substr(posW + 8));
            }
            size_t posH = line.find("\"height\":");
            if (posH != std::string::npos) {
                height = std::stoi(line.substr(posH + 9));
            }
            size_t posM = line.find("\"maximized\":");
            if (posM != std::string::npos) {
                maximized = (line.find("true", posM) != std::string::npos);
            }
        }
    }
}

void ConfigManager::SaveWindowPlacement(int width, int height, bool maximized) {
    std::string path = GetConfigPath();
    std::ofstream file(path);
    if (file.is_open()) {
        file << "{\n";
        file << "  \"serverUrl\": \"" << m_serverUrl << "\",\n";
        file << "  \"width\": " << width << ",\n";
        file << "  \"height\": " << height << ",\n";
        file << "  \"maximized\": " << (maximized ? "true" : "false") << "\n";
        file << "}\n";
    }
}
