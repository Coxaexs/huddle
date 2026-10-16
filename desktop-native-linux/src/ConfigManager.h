#pragma once

#include <string>

class ConfigManager {
public:
    static ConfigManager& Instance();

    std::string GetServerURL();
    void SetServerURL(const std::string& url);

    void LoadWindowPlacement(int& width, int& height, bool& maximized);
    void SaveWindowPlacement(int width, int height, bool maximized);

private:
    ConfigManager();
    std::string GetConfigPath();
    std::string m_serverUrl;
};
