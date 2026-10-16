#import <Cocoa/Cocoa.h>

NS_ASSUME_NONNULL_BEGIN

@protocol PreferencesDelegate <NSObject>
- (void)preferencesDidUpdateServerURL:(NSString *)newURL;
@end

@interface PreferencesWindowController : NSWindowController

@property (nonatomic, weak) id<PreferencesDelegate> delegate;

- (instancetype)initPreferencesWindow;
- (void)showWindowAndCenter;

@end

NS_ASSUME_NONNULL_END
