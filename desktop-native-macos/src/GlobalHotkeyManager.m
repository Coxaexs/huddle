#import "GlobalHotkeyManager.h"

#define HOFFLE_HOTKEY_SIGNATURE 'HOFF'
#define HOFFLE_HOTKEY_MUTE_ID   1
#define HOFFLE_HOTKEY_DEAFEN_ID 2

#ifndef kVK_ANSI_M
#define kVK_ANSI_M 0x2E
#endif

#ifndef kVK_ANSI_D
#define kVK_ANSI_D 0x02
#endif

static OSStatus HotKeyHandler(EventHandlerCallRef nextHandler, EventRef theEvent, void *userData) {
    EventHotKeyID hkID;
    OSStatus status = GetEventParameter(theEvent,
                                       kEventParamDirectObject,
                                       typeEventHotKeyID,
                                       NULL,
                                       sizeof(hkID),
                                       NULL,
                                       &hkID);
    if (status != noErr) {
        return CallNextEventHandler(nextHandler, theEvent);
    }
    
    GlobalHotkeyManager *manager = (__bridge GlobalHotkeyManager *)userData;
    if (hkID.id == HOFFLE_HOTKEY_MUTE_ID) {
        dispatch_async(dispatch_get_main_queue(), ^{
            [manager.delegate hotkeyDidTriggerMuteToggle];
        });
        return noErr;
    } else if (hkID.id == HOFFLE_HOTKEY_DEAFEN_ID) {
        dispatch_async(dispatch_get_main_queue(), ^{
            [manager.delegate hotkeyDidTriggerDeafenToggle];
        });
        return noErr;
    }
    
    return CallNextEventHandler(nextHandler, theEvent);
}

@interface GlobalHotkeyManager () {
    EventHotKeyRef _muteHotKeyRef;
    EventHotKeyRef _deafenHotKeyRef;
    EventHandlerRef _eventHandlerRef;
}
@end

@implementation GlobalHotkeyManager

+ (instancetype)sharedManager {
    static GlobalHotkeyManager *instance = nil;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        instance = [[GlobalHotkeyManager alloc] init];
    });
    return instance;
}

- (void)ensureEventHandlerInstalled {
    if (_eventHandlerRef) return;
    
    EventTypeSpec eventTypes[1];
    eventTypes[0].eventClass = kEventClassKeyboard;
    eventTypes[0].eventKind = kEventHotKeyPressed;
    
    InstallApplicationEventHandler(&HotKeyHandler,
                                   1,
                                   eventTypes,
                                   (__bridge void *)self,
                                   &_eventHandlerRef);
}

- (void)registerGlobalHotkeys {
    [self ensureEventHandlerInstalled];
    [self bindMuteHotkey:@"CommandOrControl+Shift+M"];
    
    // Default Cmd+Shift+D for Deafen
    if (!_deafenHotKeyRef) {
        EventHotKeyID deafenID;
        deafenID.signature = HOFFLE_HOTKEY_SIGNATURE;
        deafenID.id = HOFFLE_HOTKEY_DEAFEN_ID;
        RegisterEventHotKey(kVK_ANSI_D,
                           cmdKey | shiftKey,
                           deafenID,
                           GetApplicationEventTarget(),
                           0,
                           &_deafenHotKeyRef);
    }
}

- (void)bindMuteHotkey:(NSString *)accelerator {
    [self ensureEventHandlerInstalled];
    
    if (_muteHotKeyRef) {
        UnregisterEventHotKey(_muteHotKeyRef);
        _muteHotKeyRef = NULL;
    }
    
    if (!accelerator || accelerator.length == 0) return;
    
    NSArray *parts = [accelerator componentsSeparatedByString:@"+"];
    UInt32 modifiers = 0;
    UInt32 keyCode = kVK_ANSI_M;
    
    for (NSString *rawPart in parts) {
        NSString *part = [rawPart stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceCharacterSet]].lowercaseString;
        if ([part isEqualToString:@"commandorcontrol"] || [part isEqualToString:@"cmdorctrl"] ||
            [part isEqualToString:@"command"] || [part isEqualToString:@"cmd"]) {
            modifiers |= cmdKey;
        } else if ([part isEqualToString:@"shift"]) {
            modifiers |= shiftKey;
        } else if ([part isEqualToString:@"alt"] || [part isEqualToString:@"option"]) {
            modifiers |= optionKey;
        } else if ([part isEqualToString:@"control"] || [part isEqualToString:@"ctrl"]) {
            modifiers |= controlKey;
        } else if (part.length == 1) {
            char c = [part characterAtIndex:0];
            if (c >= 'a' && c <= 'z') {
                static const UInt32 keyCodes[26] = {
                    0, 11, 8, 2, 14, 3, 5, 4, 34, 38, 40, 37, 46,
                    45, 31, 35, 12, 15, 1, 17, 32, 9, 13, 7, 16, 6
                };
                keyCode = keyCodes[c - 'a'];
            }
        }
    }
    
    if (modifiers == 0) {
        // Require at least one modifier
        modifiers = cmdKey | shiftKey;
    }
    
    EventHotKeyID muteID;
    muteID.signature = HOFFLE_HOTKEY_SIGNATURE;
    muteID.id = HOFFLE_HOTKEY_MUTE_ID;
    
    OSStatus err = RegisterEventHotKey(keyCode,
                                       modifiers,
                                       muteID,
                                       GetApplicationEventTarget(),
                                       0,
                                       &_muteHotKeyRef);
    if (err == noErr) {
        NSLog(@"[Hoffle] Bound global mute hotkey to '%@'", accelerator);
    }
}

- (void)unregisterGlobalHotkeys {
    if (_muteHotKeyRef) {
        UnregisterEventHotKey(_muteHotKeyRef);
        _muteHotKeyRef = NULL;
    }
    if (_deafenHotKeyRef) {
        UnregisterEventHotKey(_deafenHotKeyRef);
        _deafenHotKeyRef = NULL;
    }
    if (_eventHandlerRef) {
        RemoveEventHandler(_eventHandlerRef);
        _eventHandlerRef = NULL;
    }
}

- (void)dealloc {
    [self unregisterGlobalHotkeys];
}

@end
