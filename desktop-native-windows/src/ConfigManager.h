#pragma once
#include <windows.h>
#include <string>

class ConfigManager {
public:
    static ConfigManager& Instance();

    std::wstring GetServerURL();
    void SetServerURL(const std::wstring& url);

    void LoadWindowPlacement(int& x, int& y, int& width, int& height, bool& maximized);
    void SaveWindowPlacement(int x, int y, int width, int height, bool maximized);

private:
    ConfigManager();
    std::wstring GetConfigPath();
    std::wstring m_serverUrl;
};
