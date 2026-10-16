#import <Cocoa/Cocoa.h>

NS_ASSUME_NONNULL_BEGIN

@protocol PushToTalkDelegate <NSObject>
- (void)pushToTalkDidPressDown;
- (void)pushToTalkDidReleaseUp;
@end

@interface PushToTalkManager : NSObject

+ (instancetype)sharedManager;

@property (nonatomic, weak) id<PushToTalkDelegate> delegate;
@property (nonatomic, copy, readonly) NSString *currentKey;
@property (nonatomic, assign, readonly) BOOL isHeld;

- (BOOL)setPushToTalkKey:(NSString *)code;
- (void)stopMonitoring;

@end

NS_ASSUME_NONNULL_END
