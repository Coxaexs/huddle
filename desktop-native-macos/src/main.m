#import <Cocoa/Cocoa.h>
#import "AppDelegate.h"

@interface HoffleApplication : NSApplication
@end

@implementation HoffleApplication

- (void)noResponderFor:(SEL)selector {
    if (selector == @selector(keyDown:)) {
        // Silently swallow unhandled key events across the entire application
        // to prevent the macOS system alert beep (NSBeep())!
        return;
    }
    [super noResponderFor:selector];
}

- (void)sendEvent:(NSEvent *)event {
    if (event.type == NSEventTypeKeyDown) {
        NSEventModifierFlags flags = (event.modifierFlags & NSEventModifierFlagDeviceIndependentFlagsMask);
        if (flags == NSEventModifierFlagCommand) {
            NSString *chars = [event.charactersIgnoringModifiers lowercaseString];
            if ([chars isEqualToString:@"q"]) {
                [self terminate:nil];
                return;
            }
            if ([chars isEqualToString:@"w"]) {
                [[self keyWindow] performClose:nil];
                return;
            }
            if ([chars isEqualToString:@"m"]) {
                [[self keyWindow] miniaturize:nil];
                return;
            }
        }
    }
    [super sendEvent:event];
}

@end

int main(int argc, const char * argv[]) {
    @autoreleasepool {
        HoffleApplication *app = (HoffleApplication *)[HoffleApplication sharedApplication];
        [app setActivationPolicy:NSApplicationActivationPolicyRegular];
        
        AppDelegate *delegate = [[AppDelegate alloc] init];
        app.delegate = delegate;
        
        [app run];
    }
    return 0;
}

