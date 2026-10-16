#import "PushToTalkManager.h"

@interface PushToTalkManager () {
    id _globalMonitorKeyDown;
    id _globalMonitorKeyUp;
    id _globalMonitorFlagsChanged;
    id _localMonitorKeyDown;
    id _localMonitorKeyUp;
    id _localMonitorFlagsChanged;
}
@property (nonatomic, copy) NSString *currentKey;
@property (nonatomic, assign) NSInteger targetKeyCode;
@property (nonatomic, assign) NSEventModifierFlags targetModifierMask;
@property (nonatomic, assign) BOOL isModifierKey;
@property (nonatomic, assign) BOOL isHeld;
@end

@implementation PushToTalkManager

+ (instancetype)sharedManager {
    static PushToTalkManager *instance = nil;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        instance = [[PushToTalkManager alloc] init];
    });
    return instance;
}

- (instancetype)init {
    self = [super init];
    if (self) {
        _targetKeyCode = -1;
        _isHeld = NO;
    }
    return self;
}

- (NSInteger)keyCodeForDOMCode:(NSString *)code {
    if (!code || code.length == 0) return -1;
    
    static NSDictionary<NSString *, NSNumber *> *map = nil;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        map = @{
            @"KeyA": @0, @"KeyS": @1, @"KeyD": @2, @"KeyF": @3, @"KeyH": @4,
            @"KeyG": @5, @"KeyZ": @6, @"KeyX": @7, @"KeyC": @8, @"KeyV": @9,
            @"KeyB": @11, @"KeyQ": @12, @"KeyW": @13, @"KeyE": @14, @"KeyR": @15,
            @"KeyY": @16, @"KeyT": @17, @"Digit1": @18, @"Digit2": @19, @"Digit3": @20,
            @"Digit4": @21, @"Digit6": @22, @"Digit5": @23, @"Equal": @24, @"Digit9": @25,
            @"Digit7": @26, @"Minus": @27, @"Digit8": @28, @"Digit0": @29, @"BracketRight": @30,
            @"KeyO": @31, @"KeyU": @32, @"BracketLeft": @33, @"KeyI": @34, @"KeyP": @35,
            @"Return": @36, @"KeyL": @37, @"KeyJ": @38, @"Quote": @39, @"KeyK": @40,
            @"Semicolon": @41, @"Backslash": @42, @"Comma": @43, @"Slash": @44, @"KeyN": @45,
            @"KeyM": @46, @"Period": @47, @"Tab": @48, @"Space": @49, @"Backquote": @50,
            @"Delete": @51, @"Escape": @53,
            @"ShiftLeft": @56, @"ShiftRight": @60,
            @"ControlLeft": @59, @"ControlRight": @62,
            @"AltLeft": @58, @"AltRight": @61,
            @"MetaLeft": @55, @"MetaRight": @54,
            @"CapsLock": @57,
            @"F1": @122, @"F2": @120, @"F3": @99, @"F4": @118,
            @"F5": @96, @"F6": @97, @"F7": @98, @"F8": @100,
            @"F9": @101, @"F10": @109, @"F11": @103, @"F12": @111
        };
    });
    
    NSNumber *num = map[code];
    return num ? num.integerValue : -1;
}

- (BOOL)setPushToTalkKey:(NSString *)code {
    [self stopMonitoring];
    self.currentKey = code;
    self.isHeld = NO;
    
    if (!code || code.length == 0) {
        return YES;
    }
    
    _targetKeyCode = [self keyCodeForDOMCode:code];
    _isModifierKey = [code containsString:@"Shift"] ||
                     [code containsString:@"Control"] ||
                     [code containsString:@"Alt"] ||
                     [code containsString:@"Meta"] ||
                     [code containsString:@"Caps"];
    
    if (_isModifierKey) {
        if ([code containsString:@"Shift"]) _targetModifierMask = NSEventModifierFlagShift;
        else if ([code containsString:@"Control"]) _targetModifierMask = NSEventModifierFlagControl;
        else if ([code containsString:@"Alt"]) _targetModifierMask = NSEventModifierFlagOption;
        else if ([code containsString:@"Meta"]) _targetModifierMask = NSEventModifierFlagCommand;
    }
    
    if (_targetKeyCode < 0) {
        return NO;
    }
    
    __weak typeof(self) weakSelf = self;
    
    // Global monitors (when app is in background or gaming)
    if (_isModifierKey) {
        _globalMonitorFlagsChanged = [NSEvent addGlobalMonitorForEventsMatchingMask:NSEventMaskFlagsChanged
                                                                            handler:^(NSEvent *event) {
            [weakSelf handleFlagsChanged:event];
        }];
        _localMonitorFlagsChanged = [NSEvent addLocalMonitorForEventsMatchingMask:NSEventMaskFlagsChanged
                                                                          handler:^NSEvent * (NSEvent *event) {
            [weakSelf handleFlagsChanged:event];
            return event;
        }];
    } else {
        _globalMonitorKeyDown = [NSEvent addGlobalMonitorForEventsMatchingMask:NSEventMaskKeyDown
                                                                       handler:^(NSEvent *event) {
            [weakSelf handleKeyDown:event];
        }];
        _globalMonitorKeyUp = [NSEvent addGlobalMonitorForEventsMatchingMask:NSEventMaskKeyUp
                                                                     handler:^(NSEvent *event) {
            [weakSelf handleKeyUp:event];
        }];
        _localMonitorKeyDown = [NSEvent addLocalMonitorForEventsMatchingMask:NSEventMaskKeyDown
                                                                     handler:^NSEvent * (NSEvent *event) {
            [weakSelf handleKeyDown:event];
            return event;
        }];
        _localMonitorKeyUp = [NSEvent addLocalMonitorForEventsMatchingMask:NSEventMaskKeyUp
                                                                   handler:^NSEvent * (NSEvent *event) {
            [weakSelf handleKeyUp:event];
            return event;
        }];
    }
    
    NSLog(@"[Hoffle] Push-to-Talk monitoring key '%@' (code %ld)", code, (long)_targetKeyCode);
    return YES;
}

- (void)handleKeyDown:(NSEvent *)event {
    if (event.keyCode == self.targetKeyCode && !self.isHeld) {
        self.isHeld = YES;
        dispatch_async(dispatch_get_main_queue(), ^{
            [self.delegate pushToTalkDidPressDown];
        });
    }
}

- (void)handleKeyUp:(NSEvent *)event {
    if (event.keyCode == self.targetKeyCode && self.isHeld) {
        self.isHeld = NO;
        dispatch_async(dispatch_get_main_queue(), ^{
            [self.delegate pushToTalkDidReleaseUp];
        });
    }
}

- (void)handleFlagsChanged:(NSEvent *)event {
    BOOL matches = (event.modifierFlags & self.targetModifierMask) != 0;
    if (matches && !self.isHeld) {
        self.isHeld = YES;
        dispatch_async(dispatch_get_main_queue(), ^{
            [self.delegate pushToTalkDidPressDown];
        });
    } else if (!matches && self.isHeld) {
        self.isHeld = NO;
        dispatch_async(dispatch_get_main_queue(), ^{
            [self.delegate pushToTalkDidReleaseUp];
        });
    }
}

- (void)stopMonitoring {
    if (_globalMonitorKeyDown) [NSEvent removeMonitor:_globalMonitorKeyDown];
    if (_globalMonitorKeyUp) [NSEvent removeMonitor:_globalMonitorKeyUp];
    if (_globalMonitorFlagsChanged) [NSEvent removeMonitor:_globalMonitorFlagsChanged];
    if (_localMonitorKeyDown) [NSEvent removeMonitor:_localMonitorKeyDown];
    if (_localMonitorKeyUp) [NSEvent removeMonitor:_localMonitorKeyUp];
    if (_localMonitorFlagsChanged) [NSEvent removeMonitor:_localMonitorFlagsChanged];
    
    _globalMonitorKeyDown = nil;
    _globalMonitorKeyUp = nil;
    _globalMonitorFlagsChanged = nil;
    _localMonitorKeyDown = nil;
    _localMonitorKeyUp = nil;
    _localMonitorFlagsChanged = nil;
    
    _isHeld = NO;
}

- (void)dealloc {
    [self stopMonitoring];
}

@end
