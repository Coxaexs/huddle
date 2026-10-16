#import <Cocoa/Cocoa.h>

@protocol TitleBarDelegate <NSObject>
@optional
- (void)titleBarDidClickBack;
- (void)titleBarDidClickForward;
- (void)titleBarDidClickSearch;
- (void)titleBarDidClickInbox;
- (void)titleBarDidClickHelp;
- (void)titleBarDidClickReload;
- (void)titleBarDidClickPreferences;
@end

@interface TitleBarView : NSView

@property (nonatomic, weak) id<TitleBarDelegate> delegate;

- (void)setCanGoBack:(BOOL)canGoBack;
- (void)setCanGoForward:(BOOL)canGoForward;
- (void)setTitleText:(NSString *)title;
- (void)setThemeBackgroundColor:(NSColor *)color;

@end
