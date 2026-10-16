#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <windowsx.h>
#include <shellapi.h>
#include <shlobj.h>
#include <dwmapi.h>
#include <wrl/client.h>
#include <string>
#include <sstream>
#include <vector>
#include <fstream>

#include "WebView2.h"
#include "ConfigManager.h"
#include "ActivityScanner.h"

using Microsoft::WRL::ComPtr;

// Tray icon definitions
#define WM_TRAYICON (WM_USER + 101)
#define ID_TRAY_SHOW 1001
#define ID_TRAY_MUTE 1002
#define ID_TRAY_DEAFEN 1003
#define ID_TRAY_SERVER 1004
#define ID_TRAY_QUIT 1005

#define HOTKEY_ID_MUTE 1
#define HOTKEY_ID_DEAFEN 2

// Global handles
static HINSTANCE g_hInstance = NULL;
static HWND g_hWnd = NULL;
static NOTIFYICONDATAW g_nid = { sizeof(NOTIFYICONDATAW) };
static ComPtr<ICoreWebView2Controller> g_controller;
static ComPtr<ICoreWebView2> g_webView;
static HHOOK g_pttHook = NULL;
static std::string g_pttKeyCode = "";
static bool g_pttKeyDown = false;

// Function pointers for dynamic WebView2Loader
typedef HRESULT (STDAPICALLTYPE *CreateCoreWebView2EnvironmentWithOptionsFunc)(
    PCWSTR browserExecutableFolder,
    PCWSTR userDataFolder,
    ICoreWebView2EnvironmentOptions* environmentOptions,
    ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler* environment_created_handler
);

static CreateCoreWebView2EnvironmentWithOptionsFunc pfnCreateEnvironment = nullptr;

// Post a JS string / code into WebView2
void ExecuteScript(const std::wstring& script) {
    if (g_webView) {
        g_webView->ExecuteScript(script.c_str(), nullptr);
    }
}

// Low-level keyboard hook for Push-To-Talk
LRESULT CALLBACK LowLevelKeyboardProc(int nCode, WPARAM wParam, LPARAM lParam) {
    if (nCode == HC_ACTION && !g_pttKeyCode.empty()) {
        KBDLLHOOKSTRUCT* kbd = (KBDLLHOOKSTRUCT*)lParam;
        bool isDown = (wParam == WM_KEYDOWN || wParam == WM_SYSKEYDOWN);
        bool isUp = (wParam == WM_KEYUP || wParam == WM_SYSKEYUP);

        if (isDown && !g_pttKeyDown) {
            g_pttKeyDown = true;
            ExecuteScript(L"if (window.__hofflePttDown) window.__hofflePttDown();");
        } else if (isUp && g_pttKeyDown) {
            g_pttKeyDown = false;
            ExecuteScript(L"if (window.__hofflePttUp) window.__hofflePttUp();");
        }
    }
    return CallNextHookEx(g_pttHook, nCode, wParam, lParam);
}

// Setup System Tray Icon
void SetupTrayIcon(HWND hWnd) {
    g_nid.hWnd = hWnd;
    g_nid.uID = 1;
    g_nid.uFlags = NIF_ICON | NIF_MESSAGE | NIF_TIP;
    g_nid.uCallbackMessage = WM_TRAYICON;
    g_nid.hIcon = LoadIconW(g_hInstance, MAKEINTRESOURCEW(1));
    if (!g_nid.hIcon) {
        g_nid.hIcon = LoadIconW(NULL, (LPCWSTR)IDI_APPLICATION);
    }
    wcscpy_s(g_nid.szTip, L"Hoffle");
    Shell_NotifyIconW(NIM_ADD, &g_nid);
}

void RemoveTrayIcon() {
    Shell_NotifyIconW(NIM_DELETE, &g_nid);
}

void ShowTrayMenu(HWND hWnd) {
    POINT pt;
    GetCursorPos(&pt);
    HMENU hMenu = CreatePopupMenu();
    InsertMenuW(hMenu, 0, MF_BYPOSITION | MF_STRING, ID_TRAY_SHOW, L"Show Hoffle");
    InsertMenuW(hMenu, 1, MF_BYPOSITION | MF_SEPARATOR, 0, NULL);
    InsertMenuW(hMenu, 2, MF_BYPOSITION | MF_STRING, ID_TRAY_MUTE, L"Toggle Mute (Ctrl+Shift+M)");
    InsertMenuW(hMenu, 3, MF_BYPOSITION | MF_STRING, ID_TRAY_DEAFEN, L"Toggle Deafen (Ctrl+Shift+D)");
    InsertMenuW(hMenu, 4, MF_BYPOSITION | MF_SEPARATOR, 0, NULL);
    InsertMenuW(hMenu, 5, MF_BYPOSITION | MF_STRING, ID_TRAY_SERVER, L"Switch Server...");
    InsertMenuW(hMenu, 6, MF_BYPOSITION | MF_STRING, ID_TRAY_QUIT, L"Quit Hoffle");

    SetForegroundWindow(hWnd);
    TrackPopupMenu(hMenu, TPM_RIGHTBUTTON, pt.x, pt.y, 0, hWnd, NULL);
    DestroyMenu(hMenu);
}

// Message handler for WebMessageReceived
void HandleWebMessage(const std::wstring& msg) {
    if (msg.find(L"\"startWindowDrag\"") != std::wstring::npos) {
        ReleaseCapture();
        SendMessageW(g_hWnd, WM_NCLBUTTONDOWN, HTCAPTION, 0);
        return;
    }
    if (msg.find(L"\"windowZoom\"") != std::wstring::npos) {
        if (IsZoomed(g_hWnd)) {
            ShowWindow(g_hWnd, SW_RESTORE);
        } else {
            ShowWindow(g_hWnd, SW_MAXIMIZE);
        }
        return;
    }
    // The retro themes' title-bar buttons (TeamSpeak 2, MSN Messenger).
    if (msg.find(L"\"windowMinimize\"") != std::wstring::npos) {
        ShowWindow(g_hWnd, SW_MINIMIZE);
        return;
    }
    if (msg.find(L"\"windowClose\"") != std::wstring::npos) {
        PostMessageW(g_hWnd, WM_CLOSE, 0, 0);
        return;
    }
    if (msg.find(L"\"scanActivity\"") != std::wstring::npos) {
        size_t idPos = msg.find(L"\"callbackId\":");
        int cbId = 0;
        if (idPos != std::wstring::npos) {
            cbId = _wtoi(msg.c_str() + idPos + 13);
        }
        std::string actJson = ActivityScanner::Instance().ScanRunningActivitiesJson();
        std::wstring wAct(actJson.begin(), actJson.end());
        std::wostringstream ss;
        ss << L"if (window.__hoffleNativeReply) window.__hoffleNativeReply(" << cbId << L", " << wAct << L");";
        ExecuteScript(ss.str());
        return;
    }
    if (msg.find(L"\"setPushToTalkKey\"") != std::wstring::npos) {
        if (!g_pttHook) {
            g_pttHook = SetWindowsHookExW(WH_KEYBOARD_LL, LowLevelKeyboardProc, g_hInstance, 0);
        }
        return;
    }
}

// Standard COM Event Handlers
class WebMessageReceivedHandler : public ICoreWebView2WebMessageReceivedEventHandler {
public:
    ULONG STDMETHODCALLTYPE AddRef() override { return 1; }
    ULONG STDMETHODCALLTYPE Release() override { return 1; }
    HRESULT STDMETHODCALLTYPE QueryInterface(REFIID riid, void** ppv) override {
        if (riid == IID_IUnknown || riid == IID_ICoreWebView2WebMessageReceivedEventHandler) {
            *ppv = this;
            return S_OK;
        }
        *ppv = nullptr;
        return E_NOINTERFACE;
    }
    HRESULT STDMETHODCALLTYPE Invoke(ICoreWebView2* sender, ICoreWebView2WebMessageReceivedEventArgs* args) override {
        LPWSTR messageRaw = nullptr;
        args->TryGetWebMessageAsString(&messageRaw);
        if (messageRaw) {
            HandleWebMessage(messageRaw);
            CoTaskMemFree(messageRaw);
        }
        return S_OK;
    }
};

static WebMessageReceivedHandler s_webMessageHandler;

class ControllerCompletedHandler : public ICoreWebView2CreateCoreWebView2ControllerCompletedHandler {
public:
    HWND m_hWnd;
    ControllerCompletedHandler(HWND hWnd) : m_hWnd(hWnd) {}
    ULONG STDMETHODCALLTYPE AddRef() override { return 1; }
    ULONG STDMETHODCALLTYPE Release() override { return 1; }
    HRESULT STDMETHODCALLTYPE QueryInterface(REFIID riid, void** ppv) override {
        if (riid == IID_IUnknown || riid == IID_ICoreWebView2CreateCoreWebView2ControllerCompletedHandler) {
            *ppv = this;
            return S_OK;
        }
        *ppv = nullptr;
        return E_NOINTERFACE;
    }
    HRESULT STDMETHODCALLTYPE Invoke(HRESULT result, ICoreWebView2Controller* controller) override {
        if (FAILED(result) || !controller) {
            return result;
        }

        g_controller = controller;
        g_controller->get_CoreWebView2(&g_webView);

        RECT bounds;
        GetClientRect(m_hWnd, &bounds);
        g_controller->put_Bounds(bounds);

        ComPtr<ICoreWebView2Settings> settings;
        g_webView->get_Settings(&settings);
        if (settings) {
            settings->put_IsScriptEnabled(TRUE);
            settings->put_AreDefaultScriptDialogsEnabled(TRUE);
            settings->put_IsWebMessageEnabled(TRUE);
        }

        // Bridge JS
        std::wstring bridgeScript = L"window.huddle = { desktop: true, native: true, platform: 'win32', arch: 'x64' };";

        EventRegistrationToken token;
        g_webView->add_WebMessageReceived(&s_webMessageHandler, &token);

        g_webView->AddScriptToExecuteOnDocumentCreated(bridgeScript.c_str(), nullptr);

        std::wstring serverUrl = ConfigManager::Instance().GetServerURL();
        g_webView->Navigate(serverUrl.c_str());

        return S_OK;
    }
};

class EnvironmentCompletedHandler : public ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler {
public:
    HWND m_hWnd;
    EnvironmentCompletedHandler(HWND hWnd) : m_hWnd(hWnd) {}
    ULONG STDMETHODCALLTYPE AddRef() override { return 1; }
    ULONG STDMETHODCALLTYPE Release() override { return 1; }
    HRESULT STDMETHODCALLTYPE QueryInterface(REFIID riid, void** ppv) override {
        if (riid == IID_IUnknown || riid == IID_ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler) {
            *ppv = this;
            return S_OK;
        }
        *ppv = nullptr;
        return E_NOINTERFACE;
    }
    HRESULT STDMETHODCALLTYPE Invoke(HRESULT result, ICoreWebView2Environment* env) override {
        if (FAILED(result) || !env) {
            return result;
        }

        ControllerCompletedHandler* controllerHandler = new ControllerCompletedHandler(m_hWnd);
        env->CreateCoreWebView2Controller(m_hWnd, controllerHandler);
        return S_OK;
    }
};

// Forward declaration of Window Procedure
LRESULT CALLBACK WndProc(HWND hWnd, UINT message, WPARAM wParam, LPARAM lParam);

// Entry Point
int WINAPI WinMain(HINSTANCE hInstance, HINSTANCE hPrevInstance, LPSTR lpCmdLine, int nCmdShow) {
    g_hInstance = hInstance;

    // Load WebView2Loader.dll
    HMODULE hLoader = LoadLibraryW(L"WebView2Loader.dll");
    if (!hLoader) {
        wchar_t exePath[MAX_PATH];
        GetModuleFileNameW(NULL, exePath, MAX_PATH);
        wchar_t* lastSlash = wcsrchr(exePath, L'\\');
        if (lastSlash) {
            *(lastSlash + 1) = L'\0';
            std::wstring dllPath = std::wstring(exePath) + L"WebView2Loader.dll";
            hLoader = LoadLibraryW(dllPath.c_str());
        }
    }

    if (hLoader) {
        pfnCreateEnvironment = (CreateCoreWebView2EnvironmentWithOptionsFunc)GetProcAddress(hLoader, "CreateCoreWebView2EnvironmentWithOptions");
    }

    // Register Window Class
    WNDCLASSEXW wcex = { sizeof(WNDCLASSEXW) };
    wcex.style = CS_HREDRAW | CS_VREDRAW;
    wcex.lpfnWndProc = WndProc;
    wcex.hInstance = hInstance;
    wcex.hIcon = LoadIconW(hInstance, MAKEINTRESOURCEW(1));
    wcex.hCursor = LoadCursorW(NULL, (LPCWSTR)IDC_ARROW);
    wcex.hbrBackground = CreateSolidBrush(RGB(20, 7, 10)); // Deep dark theme matching Hoffle
    wcex.lpszClassName = L"HoffleWindowClass";
    wcex.hIconSm = LoadIconW(hInstance, MAKEINTRESOURCEW(1));
    RegisterClassExW(&wcex);

    int winX = CW_USEDEFAULT, winY = CW_USEDEFAULT, winW = 1280, winH = 820;
    bool maximized = false;
    ConfigManager::Instance().LoadWindowPlacement(winX, winY, winW, winH, maximized);

    g_hWnd = CreateWindowExW(
        0,
        L"HoffleWindowClass",
        L"Hoffle",
        WS_OVERLAPPEDWINDOW,
        winX, winY, winW, winH,
        NULL, NULL, hInstance, NULL
    );

    if (!g_hWnd) {
        return FALSE;
    }

    // Set Windows 10/11 Dark Title Bar
    BOOL darkMode = TRUE;
    DwmSetWindowAttribute(g_hWnd, 20 /* DWMWA_USE_IMMERSIVE_DARK_MODE */, &darkMode, sizeof(darkMode));
    DwmSetWindowAttribute(g_hWnd, 19 /* DWMWA_USE_IMMERSIVE_DARK_MODE_BEFORE_20H1 */, &darkMode, sizeof(darkMode));

    // Register Global Hotkeys
    RegisterHotKey(g_hWnd, HOTKEY_ID_MUTE, MOD_CONTROL | MOD_SHIFT, 'M');
    RegisterHotKey(g_hWnd, HOTKEY_ID_DEAFEN, MOD_CONTROL | MOD_SHIFT, 'D');

    SetupTrayIcon(g_hWnd);

    ShowWindow(g_hWnd, nCmdShow);
    UpdateWindow(g_hWnd);

    // Initialize WebView2
    if (pfnCreateEnvironment) {
        wchar_t appData[MAX_PATH];
        std::wstring userDataDir = L"";
        if (SUCCEEDED(SHGetFolderPathW(NULL, CSIDL_LOCAL_APPDATA, NULL, 0, appData))) {
            userDataDir = std::wstring(appData) + L"\\Hoffle\\EBWebView";
        }

        EnvironmentCompletedHandler* envHandler = new EnvironmentCompletedHandler(g_hWnd);
        pfnCreateEnvironment(
            nullptr,
            userDataDir.empty() ? nullptr : userDataDir.c_str(),
            nullptr,
            envHandler
        );
    } else {
        MessageBoxW(g_hWnd,
            L"Microsoft Edge WebView2 Runtime is required to run Hoffle.\nPlease download and install it from Microsoft's website.",
            L"WebView2 Runtime Missing",
            MB_ICONEXCLAMATION | MB_OK);
    }

    // Main Message Loop
    MSG msg;
    while (GetMessageW(&msg, NULL, 0, 0)) {
        TranslateMessage(&msg);
        DispatchMessageW(&msg);
    }

    if (g_pttHook) {
        UnhookWindowsHookEx(g_pttHook);
    }

    UnregisterHotKey(g_hWnd, HOTKEY_ID_MUTE);
    UnregisterHotKey(g_hWnd, HOTKEY_ID_DEAFEN);
    RemoveTrayIcon();

    return (int)msg.wParam;
}

LRESULT CALLBACK WndProc(HWND hWnd, UINT message, WPARAM wParam, LPARAM lParam) {
    switch (message) {
    case WM_SIZE:
        if (g_controller != nullptr) {
            RECT bounds;
            GetClientRect(hWnd, &bounds);
            g_controller->put_Bounds(bounds);
        }
        break;

    case WM_HOTKEY:
        if (wParam == HOTKEY_ID_MUTE) {
            ExecuteScript(L"if (window.__hoffleToggleMute) window.__hoffleToggleMute();");
        } else if (wParam == HOTKEY_ID_DEAFEN) {
            ExecuteScript(L"if (window.__hoffleToggleDeafen) window.__hoffleToggleDeafen();");
        }
        break;

    case WM_TRAYICON:
        if (lParam == WM_LBUTTONUP) {
            if (IsWindowVisible(hWnd)) {
                ShowWindow(hWnd, SW_HIDE);
            } else {
                ShowWindow(hWnd, SW_SHOW);
                SetForegroundWindow(hWnd);
            }
        } else if (lParam == WM_RBUTTONUP) {
            ShowTrayMenu(hWnd);
        }
        break;

    case WM_COMMAND:
        switch (LOWORD(wParam)) {
        case ID_TRAY_SHOW:
            ShowWindow(hWnd, SW_SHOW);
            SetForegroundWindow(hWnd);
            break;
        case ID_TRAY_MUTE:
            ExecuteScript(L"if (window.__hoffleToggleMute) window.__hoffleToggleMute();");
            break;
        case ID_TRAY_DEAFEN:
            ExecuteScript(L"if (window.__hoffleToggleDeafen) window.__hoffleToggleDeafen();");
            break;
        case ID_TRAY_QUIT:
            DestroyWindow(hWnd);
            break;
        }
        break;

    case WM_GETMINMAXINFO: {
        LPMINMAXINFO lpMMI = (LPMINMAXINFO)lParam;
        lpMMI->ptMinTrackSize.x = 940;
        lpMMI->ptMinTrackSize.y = 600;
        return 0;
    }

    case WM_CLOSE:
        // Hide to tray instead of destroying
        ShowWindow(hWnd, SW_HIDE);
        return 0;

    case WM_DESTROY:
        PostQuitMessage(0);
        break;

    default:
        return DefWindowProcW(hWnd, message, wParam, lParam);
    }
    return 0;
}
