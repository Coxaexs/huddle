#import <Cocoa/Cocoa.h>

NS_ASSUME_NONNULL_BEGIN

@interface ActivityScanner : NSObject

+ (instancetype)sharedScanner;

- (NSDictionary * _Nullable)scan;

@end

NS_ASSUME_NONNULL_END
