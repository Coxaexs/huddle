#import "MainWindowController.h"
#import "ConfigManager.h"

@interface HoffleWindow : NSWindow
@end

@implementation HoffleWindow

- (BOOL)performKeyEquivalent:(NSEvent *)event {
    NSEventModifierFlags flags = (event.modifierFlags & NSEventModifierFlagDeviceIndependentFlagsMask);
    if (flags == NSEventModifierFlagCommand) {
        NSString *chars = [event.charactersIgnoringModifiers lowercaseString];
        if ([chars isEqualToString:@"q"]) {
            [NSApp terminate:nil];
            return YES;
        }
        if ([chars isEqualToString:@"w"]) {
            [self orderOut:nil];
            return YES;
        }
        if ([chars isEqualToString:@"m"]) {
            [self miniaturize:nil];
            return YES;
        }
    }
    return [super performKeyEquivalent:event];
}

- (void)noResponderFor:(SEL)selector {
    if (selector == @selector(keyDown:)) {
        // Silently swallow unhandled key events (e.g. WASD keys in living room)
        // to prevent the macOS system alert beep (NSBeep())!
        return;
    }
    [super noResponderFor:selector];
}

- (void)keyDown:(NSEvent *)event {
    // Suppress system alert beep for unhandled keys
}

@end

@interface MainWindowController ()
@property (nonatomic, strong) WebViewController *webViewController;
@end

@implementation MainWindowController

- (instancetype)initMainWindow {
    NSRect bounds = [[ConfigManager sharedManager] loadWindowBounds];
    NSWindowStyleMask style = NSWindowStyleMaskTitled |
                              NSWindowStyleMaskClosable |
                              NSWindowStyleMaskMiniaturizable |
                              NSWindowStyleMaskResizable |
                              NSWindowStyleMaskFullSizeContentView;
    
    HoffleWindow *window = [[HoffleWindow alloc] initWithContentRect:bounds
                                                           styleMask:style
                                                             backing:NSBackingStoreBuffered
                                                               defer:NO];
    
    self = [super initWithWindow:window];
    if (self) {
        window.delegate = self;
        window.title = @"Hoffle";
        window.titlebarAppearsTransparent = YES;
        window.titleVisibility = NSWindowTitleHidden;
        window.minSize = NSMakeSize(940, 600);
        window.backgroundColor = [NSColor colorWithCalibratedRed:18/255.0 green:19/255.0 blue:22/255.0 alpha:1.0];
        window.appearance = [NSAppearance appearanceNamed:NSAppearanceNameDarkAqua];
        window.collectionBehavior = NSWindowCollectionBehaviorFullScreenPrimary;
        window.movableByWindowBackground = NO;
        
        _webViewController = [[WebViewController alloc] init];
        window.contentViewController = _webViewController;
    }
    return self;
}

- (void)showAndFocus {
    if (self.window.isMiniaturized) {
        [self.window deminiaturize:nil];
    }
    [self.window makeKeyAndOrderFront:nil];
    [NSApp activateIgnoringOtherApps:YES];
}

#pragma mark - NSWindowDelegate

- (BOOL)windowShouldClose:(NSWindow *)sender {
    // Hide window to background/tray instead of terminating
    [self.window orderOut:nil];
    return NO;
}

- (void)windowDidResize:(NSNotification *)notification {
    if (self.window.isVisible && !self.window.isMiniaturized) {
        [[ConfigManager sharedManager] saveWindowBounds:self.window.frame];
    }
}

- (void)windowDidMove:(NSNotification *)notification {
    if (self.window.isVisible && !self.window.isMiniaturized) {
        [[ConfigManager sharedManager] saveWindowBounds:self.window.frame];
    }
}

@end
