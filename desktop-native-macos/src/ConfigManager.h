#import <Cocoa/Cocoa.h>

NS_ASSUME_NONNULL_BEGIN

@interface ConfigManager : NSObject

+ (instancetype)sharedManager;

@property (nonatomic, copy) NSString *serverURL;

- (NSString *)resolveAppURL;
- (void)saveServerURL:(NSString *)url;
- (NSString *)normalizeServerURL:(NSString *)rawInput;
- (BOOL)isAppURL:(NSURL *)url;

- (NSRect)loadWindowBounds;
- (void)saveWindowBounds:(NSRect)bounds;

@end

NS_ASSUME_NONNULL_END
