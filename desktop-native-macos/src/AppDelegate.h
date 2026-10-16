#import <Cocoa/Cocoa.h>
#import "MainWindowController.h"
#import "PreferencesWindowController.h"
#import "GlobalHotkeyManager.h"

NS_ASSUME_NONNULL_BEGIN

@interface AppDelegate : NSObject <NSApplicationDelegate, PreferencesDelegate, GlobalHotkeyDelegate>

@property (nonatomic, strong, readonly) MainWindowController *mainWindowController;
@property (nonatomic, strong, readonly) PreferencesWindowController *preferencesController;

- (IBAction)openPreferences:(id _Nullable)sender;
- (IBAction)toggleMute:(id _Nullable)sender;
- (IBAction)toggleDeafen:(id _Nullable)sender;

@end

NS_ASSUME_NONNULL_END
