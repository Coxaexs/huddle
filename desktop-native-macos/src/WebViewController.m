#import "WebViewController.h"
#import "ConfigManager.h"
#import "ActivityScanner.h"
#import "GlobalHotkeyManager.h"
#import "PushToTalkManager.h"

static NSTouchBarItemIdentifier const kTouchBarItemMute = @"online.deeppixel.huddle.touchbar.mute";
static NSTouchBarItemIdentifier const kTouchBarItemDeafen = @"online.deeppixel.huddle.touchbar.deafen";
static NSTouchBarItemIdentifier const kTouchBarItemPrefs = @"online.deeppixel.huddle.touchbar.prefs";
static NSTouchBarItemIdentifier const kTouchBarItemReload = @"online.deeppixel.huddle.touchbar.reload";

@interface HoffleWebView : WKWebView
@end

@implementation HoffleWebView

- (void)noResponderFor:(SEL)selector {
    if (selector == @selector(keyDown:)) {
        // Silently swallow unhandled key events (e.g. WASD keys in living room)
        // to prevent the macOS system alert beep (NSBeep())!
        return;
    }
    [super noResponderFor:selector];
}

@end

@interface WebViewController () {
    id<NSObject> _callActivityToken;
}
@property (nonatomic, strong) WKWebView *webView;
@property (nonatomic, strong) NSView *errorView;
@property (nonatomic, strong) NSTextField *errorLabel;
@property (nonatomic, assign) CGFloat currentZoom;
@end

@implementation WebViewController

- (void)loadView {
    self.view = [[NSView alloc] initWithFrame:NSMakeRect(0, 0, 1280, 820)];
    self.view.wantsLayer = YES;
    self.view.layer.backgroundColor = [NSColor colorWithCalibratedRed:20/255.0 green:7/255.0 blue:10/255.0 alpha:1.0].CGColor;
    self.currentZoom = 1.0;
    
    // Configure WebKit
    WKWebViewConfiguration *config = [[WKWebViewConfiguration alloc] init];
    config.preferences.javaScriptCanOpenWindowsAutomatically = YES;
    
    // Enable Metal acceleration, WebRTC and HTML5 full-screen
    @try {
        [config.preferences setValue:@YES forKey:@"developerExtrasEnabled"];
        [config.preferences setValue:@YES forKey:@"fullScreenEnabled"];
    } @catch (NSException *e) {}
    
    config.mediaTypesRequiringUserActionForPlayback = WKAudiovisualMediaTypeNone;
    
    // Load injected bridge script
    NSString *bridgePath = [[NSBundle mainBundle] pathForResource:@"web-bridge" ofType:@"js"];
    NSString *bridgeSource = nil;
    if (bridgePath && [[NSFileManager defaultManager] fileExistsAtPath:bridgePath]) {
        bridgeSource = [NSString stringWithContentsOfFile:bridgePath encoding:NSUTF8StringEncoding error:nil];
    }
    if (!bridgeSource) {
        bridgeSource = @"window.huddle = { desktop: true, native: true, platform: 'darwin', arch: 'arm64' };";
    }
    
    WKUserScript *bridgeScript = [[WKUserScript alloc] initWithSource:bridgeSource
                                                        injectionTime:WKUserScriptInjectionTimeAtDocumentStart
                                                     forMainFrameOnly:NO];
    [config.userContentController addUserScript:bridgeScript];
    [config.userContentController addScriptMessageHandler:self name:@"hoffleNative"];
    
    // The webview fills 100% of the window seamlessly (no separate artificial bar)
    _webView = [[HoffleWebView alloc] initWithFrame:self.view.bounds configuration:config];
    _webView.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    _webView.UIDelegate = self;
    _webView.navigationDelegate = self;
    _webView.wantsLayer = YES;
    _webView.layer.backgroundColor = [NSColor colorWithCalibratedRed:20/255.0 green:7/255.0 blue:10/255.0 alpha:1.0].CGColor;
    
    [self.view addSubview:_webView];
    
    [self setupErrorView];
    [self setupNotifications];
    
    // Setup Push to talk delegate
    [PushToTalkManager sharedManager].delegate = self;
}

- (void)setupErrorView {
    _errorView = [[NSView alloc] initWithFrame:self.view.bounds];
    _errorView.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    _errorView.wantsLayer = YES;
    _errorView.layer.backgroundColor = [NSColor colorWithCalibratedRed:20/255.0 green:7/255.0 blue:10/255.0 alpha:1.0].CGColor;
    _errorView.hidden = YES;
    
    NSStackView *stack = [[NSStackView alloc] init];
    stack.orientation = NSUserInterfaceLayoutOrientationVertical;
    stack.alignment = NSLayoutAttributeCenterX;
    stack.spacing = 16.0;
    stack.translatesAutoresizingMaskIntoConstraints = NO;
    
    NSTextField *title = [NSTextField labelWithString:@"Cannot Connect to Hoffle Server"];
    title.font = [NSFont systemFontOfSize:22 weight:NSFontWeightBold];
    title.textColor = [NSColor whiteColor];
    title.alignment = NSTextAlignmentCenter;
    
    _errorLabel = [NSTextField labelWithString:@"Please check your internet connection or verify the server address."];
    _errorLabel.font = [NSFont systemFontOfSize:14 weight:NSFontWeightRegular];
    _errorLabel.textColor = [NSColor colorWithCalibratedWhite:0.75 alpha:1.0];
    _errorLabel.alignment = NSTextAlignmentCenter;
    
    NSButton *retryBtn = [NSButton buttonWithTitle:@"Retry Connection" target:self action:@selector(reload)];
    retryBtn.bezelStyle = NSBezelStyleRounded;
    
    NSButton *changeServerBtn = [NSButton buttonWithTitle:@"Change Server..." target:[NSApplication sharedApplication].delegate action:NSSelectorFromString(@"openPreferences:")];
    changeServerBtn.bezelStyle = NSBezelStyleRounded;
    
    [stack addArrangedSubview:title];
    [stack addArrangedSubview:_errorLabel];
    [stack addArrangedSubview:retryBtn];
    [stack addArrangedSubview:changeServerBtn];
    
    [_errorView addSubview:stack];
    [self.view addSubview:_errorView];
    
    [NSLayoutConstraint activateConstraints:@[
        [stack.centerXAnchor constraintEqualToAnchor:_errorView.centerXAnchor],
        [stack.centerYAnchor constraintEqualToAnchor:_errorView.centerYAnchor]
    ]];
}

- (void)setupNotifications {
    UNUserNotificationCenter *center = [UNUserNotificationCenter currentNotificationCenter];
    center.delegate = self;
    [center requestAuthorizationWithOptions:(UNAuthorizationOptionAlert | UNAuthorizationOptionSound | UNAuthorizationOptionBadge)
                          completionHandler:^(BOOL granted, NSError * _Nullable error) {
        if (granted) {
            NSLog(@"[Hoffle] Notification permission granted");
        }
    }];
}

- (void)updateInCallActivity:(BOOL)inCall {
    if (inCall && !_callActivityToken) {
        _callActivityToken = [[NSProcessInfo processInfo] beginActivityWithOptions:NSActivityUserInitiatedAllowingIdleSystemSleep
                                                                            reason:@"Hoffle active voice/video call"];
    } else if (!inCall && _callActivityToken) {
        [[NSProcessInfo processInfo] endActivity:_callActivityToken];
        _callActivityToken = nil;
    }
}

- (void)loadServerURL:(NSString *)urlString {
    self.errorView.hidden = YES;
    NSURL *url = [NSURL URLWithString:urlString];
    if (!url || !url.scheme) {
        url = [NSURL URLWithString:[@"https://" stringByAppendingString:urlString]];
    }
    NSMutableURLRequest *req = [NSMutableURLRequest requestWithURL:url
                                                       cachePolicy:NSURLRequestUseProtocolCachePolicy
                                                   timeoutInterval:30.0];
    [self.webView loadRequest:req];
}

- (void)toggleMute {
    NSString *js = @"window.dispatchEvent(new CustomEvent('huddle-hotkey', { detail: 'toggle-mute' }));";
    [self.webView evaluateJavaScript:js completionHandler:nil];
}

- (void)toggleDeafen {
    NSString *js = @"window.dispatchEvent(new CustomEvent('huddle-hotkey', { detail: 'toggle-deafen' }));";
    [self.webView evaluateJavaScript:js completionHandler:nil];
}

- (void)reload {
    self.errorView.hidden = YES;
    [self.webView reload];
}

- (void)forceReload {
    self.errorView.hidden = YES;
    [self.webView reloadFromOrigin];
}

- (void)zoomIn {
    self.currentZoom = MIN(self.currentZoom + 0.1, 3.0);
    self.webView.pageZoom = self.currentZoom;
}

- (void)zoomOut {
    self.currentZoom = MAX(self.currentZoom - 0.1, 0.5);
    self.webView.pageZoom = self.currentZoom;
}

- (void)resetZoom {
    self.currentZoom = 1.0;
    self.webView.pageZoom = 1.0;
}

- (void)goBack {
    if (self.webView.canGoBack) {
        [self.webView goBack];
    }
}

- (void)goForward {
    if (self.webView.canGoForward) {
        [self.webView goForward];
    }
}

#pragma mark - PushToTalkDelegate

- (void)pushToTalkDidPressDown {
    NSString *js = @"window.dispatchEvent(new CustomEvent('huddle-hotkey', { detail: 'ptt-down' }));";
    [self.webView evaluateJavaScript:js completionHandler:nil];
}

- (void)pushToTalkDidReleaseUp {
    NSString *js = @"window.dispatchEvent(new CustomEvent('huddle-hotkey', { detail: 'ptt-up' }));";
    [self.webView evaluateJavaScript:js completionHandler:nil];
}

#pragma mark - WKScriptMessageHandler

- (void)userContentController:(WKUserContentController *)userContentController
      didReceiveScriptMessage:(WKScriptMessage *)message {
    if (![message.name isEqualToString:@"hoffleNative"]) return;
    
    NSDictionary *body = [message.body isKindOfClass:[NSDictionary class]] ? message.body : nil;
    if (!body) return;
    
    NSString *type = body[@"type"];
    if ([type isEqualToString:@"setBadge"]) {
        NSInteger count = [body[@"count"] integerValue];
        dispatch_async(dispatch_get_main_queue(), ^{
            if (count > 0) {
                [NSApp.dockTile setBadgeLabel:[NSString stringWithFormat:@"%ld", (long)count]];
            } else {
                [NSApp.dockTile setBadgeLabel:nil];
            }
        });
    } else if ([type isEqualToString:@"notify"]) {
        NSString *title = body[@"title"] ?: @"Hoffle";
        NSString *msgText = body[@"body"] ?: @"";
        
        UNMutableNotificationContent *content = [[UNMutableNotificationContent alloc] init];
        content.title = title;
        content.body = msgText;
        content.sound = [UNNotificationSound defaultSound];
        
        UNNotificationRequest *req = [UNNotificationRequest requestWithIdentifier:[[NSUUID UUID] UUIDString]
                                                                          content:content
                                                                          trigger:nil];
        [[UNUserNotificationCenter currentNotificationCenter] addNotificationRequest:req withCompletionHandler:nil];
    } else if ([type isEqualToString:@"setInCall"]) {
        BOOL inCall = [body[@"inCall"] boolValue];
        [self updateInCallActivity:inCall];
    } else if ([type isEqualToString:@"setMuteHotkey"]) {
        NSString *acc = body[@"accelerator"];
        [[GlobalHotkeyManager sharedManager] bindMuteHotkey:acc];
    } else if ([type isEqualToString:@"setPushToTalkKey"]) {
        NSString *code = body[@"code"];
        [[PushToTalkManager sharedManager] setPushToTalkKey:code];
    } else if ([type isEqualToString:@"startWindowDrag"]) {
        dispatch_async(dispatch_get_main_queue(), ^{
            NSEvent *curEvent = [NSApp currentEvent];
            if (curEvent) {
                [self.view.window performWindowDragWithEvent:curEvent];
            }
        });
    } else if ([type isEqualToString:@"windowZoom"]) {
        dispatch_async(dispatch_get_main_queue(), ^{
            [self.view.window zoom:nil];
        });
    } else if ([type isEqualToString:@"windowMinimize"]) {
        dispatch_async(dispatch_get_main_queue(), ^{
            [self.view.window miniaturize:nil];
        });
    } else if ([type isEqualToString:@"windowClose"]) {
        dispatch_async(dispatch_get_main_queue(), ^{
            [self.view.window performClose:nil];
        });
    } else if ([type isEqualToString:@"scanActivity"]) {
        NSInteger callbackId = [body[@"callbackId"] integerValue];
        dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
            NSDictionary *result = [[ActivityScanner sharedScanner] scan];
            NSData *data = result ? [NSJSONSerialization dataWithJSONObject:result options:0 error:nil] : nil;
            NSString *jsonStr = data ? [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding] : @"null";
            dispatch_async(dispatch_get_main_queue(), ^{
                NSString *js = [NSString stringWithFormat:@"window.__hoffleNativeReply(%ld, %@);", (long)callbackId, jsonStr];
                [self.webView evaluateJavaScript:js completionHandler:nil];
            });
        });
    }
}

#pragma mark - WKUIDelegate

- (void)webView:(WKWebView *)webView
requestMediaCapturePermissionForOrigin:(WKSecurityOrigin *)origin
initiatedByFrame:(WKFrameInfo *)frame
           type:(WKMediaCaptureType)type
decisionHandler:(void (^)(WKPermissionDecision))decisionHandler API_AVAILABLE(macos(12.0)) {
    decisionHandler(WKPermissionDecisionGrant);
}

- (nullable WKWebView *)webView:(WKWebView *)webView
 createWebViewWithConfiguration:(WKWebViewConfiguration *)configuration
            forNavigationAction:(WKNavigationAction *)navigationAction
                 windowFeatures:(WKWindowFeatures *)windowFeatures {
    NSURL *url = navigationAction.request.URL;
    if (url && [url.scheme.lowercaseString hasPrefix:@"http"]) {
        [[NSWorkspace sharedWorkspace] openURL:url];
    }
    return nil;
}

- (void)webView:(WKWebView *)webView
runJavaScriptAlertPanelWithMessage:(NSString *)message
initiatedByFrame:(WKFrameInfo *)frame
completionHandler:(void (^)(void))completionHandler {
    NSAlert *alert = [[NSAlert alloc] init];
    alert.messageText = @"Hoffle";
    alert.informativeText = message;
    [alert addButtonWithTitle:@"OK"];
    [alert runModal];
    completionHandler();
}

- (void)webView:(WKWebView *)webView
runJavaScriptConfirmPanelWithMessage:(NSString *)message
initiatedByFrame:(WKFrameInfo *)frame
completionHandler:(void (^)(BOOL result))completionHandler {
    NSAlert *alert = [[NSAlert alloc] init];
    alert.messageText = @"Hoffle";
    alert.informativeText = message;
    [alert addButtonWithTitle:@"OK"];
    [alert addButtonWithTitle:@"Cancel"];
    NSModalResponse resp = [alert runModal];
    completionHandler(resp == NSAlertFirstButtonReturn);
}

#pragma mark - WKNavigationDelegate

- (void)webView:(WKWebView *)webView
decidePolicyForNavigationAction:(WKNavigationAction *)navigationAction
decisionHandler:(void (^)(WKNavigationActionPolicy))decisionHandler {
    NSURL *url = navigationAction.request.URL;
    if (!url) {
        decisionHandler(WKNavigationActionPolicyAllow);
        return;
    }
    
    if (navigationAction.navigationType == WKNavigationTypeLinkActivated) {
        if (![[ConfigManager sharedManager] isAppURL:url] &&
            ([url.scheme.lowercaseString isEqualToString:@"http"] ||
             [url.scheme.lowercaseString isEqualToString:@"https"])) {
            [[NSWorkspace sharedWorkspace] openURL:url];
            decisionHandler(WKNavigationActionPolicyCancel);
            return;
        }
    }
    
    decisionHandler(WKNavigationActionPolicyAllow);
}

- (void)webView:(WKWebView *)webView didFailProvisionalNavigation:(WKNavigation *)navigation withError:(NSError *)error {
    if (error.code == NSURLErrorCancelled) return;
    self.errorLabel.stringValue = [NSString stringWithFormat:@"Failed to load %@ (%@)",
                                   [ConfigManager sharedManager].serverURL, error.localizedDescription];
    self.errorView.hidden = NO;
}

- (void)webView:(WKWebView *)webView didFailNavigation:(WKNavigation *)navigation withError:(NSError *)error {
    if (error.code == NSURLErrorCancelled) return;
    self.errorLabel.stringValue = [NSString stringWithFormat:@"Connection lost: %@", error.localizedDescription];
    self.errorView.hidden = NO;
}

- (void)webView:(WKWebView *)webView didFinishNavigation:(WKNavigation *)navigation {
    self.errorView.hidden = YES;
}

#pragma mark - UNUserNotificationCenterDelegate

- (void)userNotificationCenter:(UNUserNotificationCenter *)center
       willPresentNotification:(UNNotification *)notification
         withCompletionHandler:(void (^)(UNNotificationPresentationOptions))completionHandler {
    completionHandler(UNNotificationPresentationOptionBanner | UNNotificationPresentationOptionSound);
}

- (void)userNotificationCenter:(UNUserNotificationCenter *)center
didReceiveNotificationResponse:(UNNotificationResponse *)response
         withCompletionHandler:(void (^)(void))completionHandler {
    [NSApp activateIgnoringOtherApps:YES];
    [self.view.window makeKeyAndOrderFront:nil];
    completionHandler();
}

#pragma mark - NSTouchBarDelegate

- (NSTouchBar *)makeTouchBar {
    NSTouchBar *bar = [[NSTouchBar alloc] init];
    bar.delegate = self;
    bar.defaultItemIdentifiers = @[
        kTouchBarItemMute,
        kTouchBarItemDeafen,
        NSTouchBarItemIdentifierFixedSpaceSmall,
        kTouchBarItemReload,
        kTouchBarItemPrefs
    ];
    return bar;
}

- (nullable NSTouchBarItem *)touchBar:(NSTouchBar *)touchBar makeItemForIdentifier:(NSTouchBarItemIdentifier)identifier {
    if ([identifier isEqualToString:kTouchBarItemMute]) {
        NSCustomTouchBarItem *item = [[NSCustomTouchBarItem alloc] initWithIdentifier:identifier];
        NSButton *btn = [NSButton buttonWithTitle:@"🎙️ Mute" target:self action:@selector(toggleMute)];
        item.view = btn;
        return item;
    } else if ([identifier isEqualToString:kTouchBarItemDeafen]) {
        NSCustomTouchBarItem *item = [[NSCustomTouchBarItem alloc] initWithIdentifier:identifier];
        NSButton *btn = [NSButton buttonWithTitle:@"🎧 Deafen" target:self action:@selector(toggleDeafen)];
        item.view = btn;
        return item;
    } else if ([identifier isEqualToString:kTouchBarItemReload]) {
        NSCustomTouchBarItem *item = [[NSCustomTouchBarItem alloc] initWithIdentifier:identifier];
        NSButton *btn = [NSButton buttonWithTitle:@"🔄 Reload" target:self action:@selector(reload)];
        item.view = btn;
        return item;
    } else if ([identifier isEqualToString:kTouchBarItemPrefs]) {
        NSCustomTouchBarItem *item = [[NSCustomTouchBarItem alloc] initWithIdentifier:identifier];
        NSButton *btn = [NSButton buttonWithTitle:@"⚙️ Server" target:[NSApplication sharedApplication].delegate action:NSSelectorFromString(@"openPreferences:")];
        item.view = btn;
        return item;
    }
    return nil;
}

@end
