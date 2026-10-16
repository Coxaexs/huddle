#import <Cocoa/Cocoa.h>
#import "WebViewController.h"

NS_ASSUME_NONNULL_BEGIN

@interface MainWindowController : NSWindowController <NSWindowDelegate>

@property (nonatomic, strong, readonly) WebViewController *webViewController;

- (instancetype)initMainWindow;
- (void)showAndFocus;

@end

NS_ASSUME_NONNULL_END
