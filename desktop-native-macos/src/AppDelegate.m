#import "AppDelegate.h"
#import "ConfigManager.h"

@interface AppDelegate () {
    NSStatusItem *_statusItem;
    NSMenuItem *_trayServerMenuItem;
}
@property (nonatomic, strong) MainWindowController *mainWindowController;
@property (nonatomic, strong) PreferencesWindowController *preferencesController;
@end

@implementation AppDelegate

- (void)applicationDidFinishLaunching:(NSNotification *)aNotification {
    NSLog(@"[Hoffle] Application did finish launching (Native Apple Silicon arm64)");
    
    // 1. Setup Apple Event handler for custom URL scheme (hoffle://)
    [[NSAppleEventManager sharedAppleEventManager] setEventHandler:self
                                                       andSelector:@selector(handleGetURLEvent:withReplyEvent:)
                                                     forEventClass:kInternetEventClass
                                                        andEventID:kAEGetURL];
    
    // 2. Setup Menus
    [self setupMainMenu];
    
    // 3. Setup Status Item (Tray)
    [self setupStatusItem];
    
    // 4. Initialize Controllers
    _preferencesController = [[PreferencesWindowController alloc] initPreferencesWindow];
    _preferencesController.delegate = self;
    
    _mainWindowController = [[MainWindowController alloc] initMainWindow];
    
    // 5. Load configured server
    NSString *url = [ConfigManager sharedManager].serverURL;
    [_mainWindowController.webViewController loadServerURL:url];
    
    // 6. Show Window
    [_mainWindowController showAndFocus];
    
    // 7. Register Global Hotkeys
    [GlobalHotkeyManager sharedManager].delegate = self;
    [[GlobalHotkeyManager sharedManager] registerGlobalHotkeys];
}

- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)sender {
    // Keep app running in background/tray when window is closed
    return NO;
}

- (BOOL)applicationShouldHandleReopen:(NSApplication *)sender hasVisibleWindows:(BOOL)flag {
    [self.mainWindowController showAndFocus];
    return YES;
}

#pragma mark - Custom URL Scheme Handler

- (void)handleGetURLEvent:(NSAppleEventDescriptor *)event withReplyEvent:(NSAppleEventDescriptor *)replyEvent {
    NSString *urlStr = [[event paramDescriptorForKeyword:keyDirectObject] stringValue];
    if (urlStr) {
        NSLog(@"[Hoffle] Received custom URL: %@", urlStr);
        // If hoffle:// URL, navigate or pass to web app
        [self.mainWindowController showAndFocus];
    }
}

#pragma mark - Menu Bar Status Item (Tray)

- (void)setupStatusItem {
    _statusItem = [[NSStatusBar systemStatusBar] statusItemWithLength:NSSquareStatusItemLength];
    
    NSImage *icon = nil;
    NSString *iconPath = [[NSBundle mainBundle] pathForResource:@"StatusIcon" ofType:@"png"];
    if (iconPath) {
        icon = [[NSImage alloc] initWithContentsOfFile:iconPath];
    }
    if (!icon) {
        icon = [NSImage imageNamed:NSImageNameNetwork];
    }
    [icon setTemplate:YES];
    icon.size = NSMakeSize(18, 18);
    _statusItem.button.image = icon;
    _statusItem.button.toolTip = @"Hoffle";
    
    NSMenu *menu = [[NSMenu alloc] initWithTitle:@"Hoffle Status"];
    
    [menu addItemWithTitle:@"Show Hoffle" action:@selector(showMainWindow:) keyEquivalent:@""];
    [menu addItem:[NSMenuItem separatorItem]];
    
    NSMenuItem *muteItem = [menu addItemWithTitle:@"Toggle Mute" action:@selector(toggleMute:) keyEquivalent:@""];
    muteItem.target = self;
    
    NSMenuItem *deafenItem = [menu addItemWithTitle:@"Toggle Deafen" action:@selector(toggleDeafen:) keyEquivalent:@""];
    deafenItem.target = self;
    
    [menu addItem:[NSMenuItem separatorItem]];
    
    _trayServerMenuItem = [menu addItemWithTitle:[NSString stringWithFormat:@"Server: %@", [ConfigManager sharedManager].serverURL]
                                          action:nil
                                   keyEquivalent:@""];
    _trayServerMenuItem.enabled = NO;
    
    NSMenuItem *prefItem = [menu addItemWithTitle:@"Switch Server..." action:@selector(openPreferences:) keyEquivalent:@""];
    prefItem.target = self;
    
    [menu addItem:[NSMenuItem separatorItem]];
    [menu addItemWithTitle:@"About Hoffle" action:@selector(showAbout:) keyEquivalent:@""];
    [menu addItemWithTitle:@"Quit Hoffle" action:@selector(terminate:) keyEquivalent:@"q"];
    
    _statusItem.menu = menu;
}

- (void)showMainWindow:(id)sender {
    [self.mainWindowController showAndFocus];
}

- (void)showAbout:(id)sender {
    [NSApp orderFrontStandardAboutPanel:nil];
    [NSApp activateIgnoringOtherApps:YES];
}

#pragma mark - Main Menu

- (void)setupMainMenu {
    NSMenu *mainMenu = [[NSMenu alloc] init];
    
    // 1. Application Menu (Hoffle)
    NSMenuItem *appMenuItem = [[NSMenuItem alloc] init];
    NSMenu *appMenu = [[NSMenu alloc] initWithTitle:@"Hoffle"];
    
    [appMenu addItemWithTitle:@"About Hoffle" action:@selector(showAbout:) keyEquivalent:@""];
    [appMenu addItem:[NSMenuItem separatorItem]];
    
    NSMenuItem *prefs = [appMenu addItemWithTitle:@"Preferences..." action:@selector(openPreferences:) keyEquivalent:@","];
    prefs.target = self;
    
    [appMenu addItem:[NSMenuItem separatorItem]];
    
    NSMenuItem *services = [appMenu addItemWithTitle:@"Services" action:nil keyEquivalent:@""];
    NSMenu *servicesMenu = [[NSMenu alloc] initWithTitle:@"Services"];
    services.submenu = servicesMenu;
    [NSApp setServicesMenu:servicesMenu];
    
    [appMenu addItem:[NSMenuItem separatorItem]];
    [appMenu addItemWithTitle:@"Hide Hoffle" action:@selector(hide:) keyEquivalent:@"h"];
    
    NSMenuItem *hideOthers = [appMenu addItemWithTitle:@"Hide Others" action:@selector(hideOtherApplications:) keyEquivalent:@"h"];
    hideOthers.keyEquivalentModifierMask = NSEventModifierFlagCommand | NSEventModifierFlagOption;
    
    [appMenu addItemWithTitle:@"Show All" action:@selector(unhideAllApplications:) keyEquivalent:@""];
    [appMenu addItem:[NSMenuItem separatorItem]];
    [appMenu addItemWithTitle:@"Quit Hoffle" action:@selector(terminate:) keyEquivalent:@"q"];
    
    appMenuItem.submenu = appMenu;
    [mainMenu addItem:appMenuItem];
    
    // 2. File Menu
    NSMenuItem *fileMenuItem = [[NSMenuItem alloc] init];
    NSMenu *fileMenu = [[NSMenu alloc] initWithTitle:@"File"];
    
    NSMenuItem *switchItem = [fileMenu addItemWithTitle:@"Switch Server..." action:@selector(openPreferences:) keyEquivalent:@"S"];
    switchItem.keyEquivalentModifierMask = NSEventModifierFlagCommand | NSEventModifierFlagShift;
    switchItem.target = self;
    
    [fileMenu addItem:[NSMenuItem separatorItem]];
    [fileMenu addItemWithTitle:@"Close Window" action:@selector(performClose:) keyEquivalent:@"w"];
    
    fileMenuItem.submenu = fileMenu;
    [mainMenu addItem:fileMenuItem];
    
    // 3. Edit Menu (Standard macOS clipboard shortcuts)
    NSMenuItem *editMenuItem = [[NSMenuItem alloc] init];
    NSMenu *editMenu = [[NSMenu alloc] initWithTitle:@"Edit"];
    
    [editMenu addItemWithTitle:@"Undo" action:@selector(undo:) keyEquivalent:@"z"];
    
    NSMenuItem *redo = [editMenu addItemWithTitle:@"Redo" action:@selector(redo:) keyEquivalent:@"Z"];
    redo.keyEquivalentModifierMask = NSEventModifierFlagCommand | NSEventModifierFlagShift;
    
    [editMenu addItem:[NSMenuItem separatorItem]];
    [editMenu addItemWithTitle:@"Cut" action:@selector(cut:) keyEquivalent:@"x"];
    [editMenu addItemWithTitle:@"Copy" action:@selector(copy:) keyEquivalent:@"c"];
    [editMenu addItemWithTitle:@"Paste" action:@selector(paste:) keyEquivalent:@"v"];
    [editMenu addItemWithTitle:@"Select All" action:@selector(selectAll:) keyEquivalent:@"a"];
    
    editMenuItem.submenu = editMenu;
    [mainMenu addItem:editMenuItem];
    
    // 4. View Menu
    NSMenuItem *viewMenuItem = [[NSMenuItem alloc] init];
    NSMenu *viewMenu = [[NSMenu alloc] initWithTitle:@"View"];
    
    [viewMenu addItemWithTitle:@"Reload" action:@selector(menuReload:) keyEquivalent:@"r"];
    
    NSMenuItem *forceReload = [viewMenu addItemWithTitle:@"Force Reload" action:@selector(menuForceReload:) keyEquivalent:@"R"];
    forceReload.keyEquivalentModifierMask = NSEventModifierFlagCommand | NSEventModifierFlagShift;
    
    [viewMenu addItem:[NSMenuItem separatorItem]];
    [viewMenu addItemWithTitle:@"Actual Size" action:@selector(menuResetZoom:) keyEquivalent:@"0"];
    [viewMenu addItemWithTitle:@"Zoom In" action:@selector(menuZoomIn:) keyEquivalent:@"+"];
    [viewMenu addItemWithTitle:@"Zoom Out" action:@selector(menuZoomOut:) keyEquivalent:@"-"];
    
    [viewMenu addItem:[NSMenuItem separatorItem]];
    
    NSMenuItem *fullScreen = [viewMenu addItemWithTitle:@"Toggle Full Screen" action:@selector(toggleFullScreen:) keyEquivalent:@"f"];
    fullScreen.keyEquivalentModifierMask = NSEventModifierFlagCommand | NSEventModifierFlagControl;
    
    viewMenuItem.submenu = viewMenu;
    [mainMenu addItem:viewMenuItem];
    
    // 5. History Menu
    NSMenuItem *historyMenuItem = [[NSMenuItem alloc] init];
    NSMenu *historyMenu = [[NSMenu alloc] initWithTitle:@"History"];
    
    [historyMenu addItemWithTitle:@"Back" action:@selector(menuGoBack:) keyEquivalent:@"["];
    [historyMenu addItemWithTitle:@"Forward" action:@selector(menuGoForward:) keyEquivalent:@"]"];
    
    historyMenuItem.submenu = historyMenu;
    [mainMenu addItem:historyMenuItem];
    
    // 5. Voice Menu
    NSMenuItem *voiceMenuItem = [[NSMenuItem alloc] init];
    NSMenu *voiceMenu = [[NSMenu alloc] initWithTitle:@"Voice"];
    
    NSMenuItem *vMute = [voiceMenu addItemWithTitle:@"Toggle Microphone Mute" action:@selector(toggleMute:) keyEquivalent:@"M"];
    vMute.keyEquivalentModifierMask = NSEventModifierFlagCommand | NSEventModifierFlagShift;
    vMute.target = self;
    
    NSMenuItem *vDeafen = [voiceMenu addItemWithTitle:@"Toggle Deafen" action:@selector(toggleDeafen:) keyEquivalent:@"D"];
    vDeafen.keyEquivalentModifierMask = NSEventModifierFlagCommand | NSEventModifierFlagShift;
    vDeafen.target = self;
    
    voiceMenuItem.submenu = voiceMenu;
    [mainMenu addItem:voiceMenuItem];
    
    // 6. Window Menu
    NSMenuItem *windowMenuItem = [[NSMenuItem alloc] init];
    NSMenu *windowMenu = [[NSMenu alloc] initWithTitle:@"Window"];
    
    [windowMenu addItemWithTitle:@"Minimize" action:@selector(performMiniaturize:) keyEquivalent:@"m"];
    [windowMenu addItemWithTitle:@"Zoom" action:@selector(performZoom:) keyEquivalent:@""];
    [windowMenu addItem:[NSMenuItem separatorItem]];
    [windowMenu addItemWithTitle:@"Bring All to Front" action:@selector(arrangeInFront:) keyEquivalent:@""];
    
    [NSApp setWindowsMenu:windowMenu];
    windowMenuItem.submenu = windowMenu;
    [mainMenu addItem:windowMenuItem];
    
    // 7. Help Menu
    NSMenuItem *helpMenuItem = [[NSMenuItem alloc] init];
    NSMenu *helpMenu = [[NSMenu alloc] initWithTitle:@"Help"];
    
    [helpMenu addItemWithTitle:@"Hoffle Documentation" action:@selector(openDocs:) keyEquivalent:@"?"];
    [helpMenu addItemWithTitle:@"GitHub Repository" action:@selector(openGitHub:) keyEquivalent:@""];
    
    [NSApp setHelpMenu:helpMenu];
    helpMenuItem.submenu = helpMenu;
    [mainMenu addItem:helpMenuItem];
    
    [NSApp setMainMenu:mainMenu];
}

#pragma mark - Actions

- (IBAction)openPreferences:(id)sender {
    [self.preferencesController showWindowAndCenter];
}

- (IBAction)toggleMute:(id)sender {
    [self.mainWindowController.webViewController toggleMute];
}

- (IBAction)toggleDeafen:(id)sender {
    [self.mainWindowController.webViewController toggleDeafen];
}

- (void)menuReload:(id)sender {
    [self.mainWindowController.webViewController reload];
}

- (void)menuForceReload:(id)sender {
    [self.mainWindowController.webViewController forceReload];
}

- (void)menuGoBack:(id)sender {
    [self.mainWindowController.webViewController goBack];
}

- (void)menuGoForward:(id)sender {
    [self.mainWindowController.webViewController goForward];
}

- (void)menuZoomIn:(id)sender {
    [self.mainWindowController.webViewController zoomIn];
}

- (void)menuZoomOut:(id)sender {
    [self.mainWindowController.webViewController zoomOut];
}

- (void)menuResetZoom:(id)sender {
    [self.mainWindowController.webViewController resetZoom];
}

- (void)openDocs:(id)sender {
    [[NSWorkspace sharedWorkspace] openURL:[NSURL URLWithString:@"https://github.com/Coxaexs/huddle#readme"]];
}

- (void)openGitHub:(id)sender {
    [[NSWorkspace sharedWorkspace] openURL:[NSURL URLWithString:@"https://github.com/Coxaexs/huddle"]];
}

#pragma mark - PreferencesDelegate

- (void)preferencesDidUpdateServerURL:(NSString *)newURL {
    _trayServerMenuItem.title = [NSString stringWithFormat:@"Server: %@", newURL];
    [self.mainWindowController.webViewController loadServerURL:newURL];
    [self.mainWindowController showAndFocus];
}

#pragma mark - GlobalHotkeyDelegate

- (void)hotkeyDidTriggerMuteToggle {
    [self.mainWindowController.webViewController toggleMute];
}

- (void)hotkeyDidTriggerDeafenToggle {
    [self.mainWindowController.webViewController toggleDeafen];
}

@end
