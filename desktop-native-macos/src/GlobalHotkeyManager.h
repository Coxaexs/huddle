#import <Foundation/Foundation.h>
#import <Carbon/Carbon.h>

NS_ASSUME_NONNULL_BEGIN

@protocol GlobalHotkeyDelegate <NSObject>
- (void)hotkeyDidTriggerMuteToggle;
- (void)hotkeyDidTriggerDeafenToggle;
@end

@interface GlobalHotkeyManager : NSObject

+ (instancetype)sharedManager;

@property (nonatomic, weak) id<GlobalHotkeyDelegate> delegate;

- (void)registerGlobalHotkeys;
- (void)bindMuteHotkey:(NSString *)accelerator;
- (void)unregisterGlobalHotkeys;

@end

NS_ASSUME_NONNULL_END
