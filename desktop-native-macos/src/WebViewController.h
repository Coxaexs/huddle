#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>
#import <UserNotifications/UserNotifications.h>
#import "PushToTalkManager.h"

NS_ASSUME_NONNULL_BEGIN

@interface WebViewController : NSViewController <WKUIDelegate, WKNavigationDelegate, WKScriptMessageHandler, UNUserNotificationCenterDelegate, PushToTalkDelegate, NSTouchBarDelegate>

@property (nonatomic, strong, readonly) WKWebView *webView;

- (void)loadServerURL:(NSString *)urlString;
- (void)toggleMute;
- (void)toggleDeafen;
- (void)reload;
- (void)forceReload;
- (void)zoomIn;
- (void)zoomOut;
- (void)resetZoom;
- (void)goBack;
- (void)goForward;

@end

NS_ASSUME_NONNULL_END
