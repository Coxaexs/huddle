#import "PreferencesWindowController.h"
#import "ConfigManager.h"

@interface PreferencesWindowController ()
@property (nonatomic, strong) NSTextField *urlInputField;
@property (nonatomic, strong) NSTextField *statusLabel;
@property (nonatomic, strong) NSProgressIndicator *spinner;
@end

@implementation PreferencesWindowController

- (instancetype)initPreferencesWindow {
    NSRect frame = NSMakeRect(0, 0, 520, 320);
    NSWindowStyleMask style = NSWindowStyleMaskTitled | NSWindowStyleMaskClosable;
    NSWindow *window = [[NSWindow alloc] initWithContentRect:frame
                                                   styleMask:style
                                                     backing:NSBackingStoreBuffered
                                                       defer:NO];
    self = [super initWithWindow:window];
    if (self) {
        window.title = @"Hoffle Server Preferences";
        window.backgroundColor = [NSColor colorWithCalibratedRed:32/255.0 green:32/255.0 blue:38/255.0 alpha:1.0];
        [self setupUI];
    }
    return self;
}

- (void)setupUI {
    NSView *content = self.window.contentView;
    
    // Header
    NSTextField *titleLabel = [NSTextField labelWithString:@"Connect to Hoffle Server"];
    titleLabel.font = [NSFont systemFontOfSize:18 weight:NSFontWeightBold];
    titleLabel.textColor = [NSColor whiteColor];
    titleLabel.frame = NSMakeRect(24, 260, 472, 28);
    [content addSubview:titleLabel];
    
    NSTextField *descLabel = [NSTextField labelWithString:@"Enter your self-hosted Hoffle URL or select a preset below:"];
    descLabel.font = [NSFont systemFontOfSize:13 weight:NSFontWeightRegular];
    descLabel.textColor = [NSColor colorWithCalibratedWhite:0.75 alpha:1.0];
    descLabel.frame = NSMakeRect(24, 235, 472, 20);
    [content addSubview:descLabel];
    
    // Input
    NSTextField *inputPrompt = [NSTextField labelWithString:@"Server Address:"];
    inputPrompt.font = [NSFont systemFontOfSize:13 weight:NSFontWeightMedium];
    inputPrompt.textColor = [NSColor whiteColor];
    inputPrompt.frame = NSMakeRect(24, 195, 472, 20);
    [content addSubview:inputPrompt];
    
    _urlInputField = [[NSTextField alloc] initWithFrame:NSMakeRect(24, 160, 472, 28)];
    _urlInputField.stringValue = [ConfigManager sharedManager].serverURL;
    _urlInputField.font = [NSFont systemFontOfSize:14];
    _urlInputField.placeholderString = @"https://chat.hoffle.online/hangout or http://localhost:8730";
    [content addSubview:_urlInputField];
    
    // Presets
    NSButton *btnOfficial = [NSButton buttonWithTitle:@"Use Official Server" target:self action:@selector(selectOfficial)];
    btnOfficial.bezelStyle = NSBezelStyleInline;
    btnOfficial.frame = NSMakeRect(24, 125, 140, 24);
    [content addSubview:btnOfficial];
    
    NSButton *btnLocal = [NSButton buttonWithTitle:@"Use Localhost (8730)" target:self action:@selector(selectLocal)];
    btnLocal.bezelStyle = NSBezelStyleInline;
    btnLocal.frame = NSMakeRect(172, 125, 150, 24);
    [content addSubview:btnLocal];
    
    // Status & Spinner
    _statusLabel = [NSTextField labelWithString:@""];
    _statusLabel.font = [NSFont systemFontOfSize:12];
    _statusLabel.frame = NSMakeRect(24, 85, 340, 22);
    [content addSubview:_statusLabel];
    
    _spinner = [[NSProgressIndicator alloc] initWithFrame:NSMakeRect(370, 85, 20, 20)];
    _spinner.style = NSProgressIndicatorStyleSpinning;
    _spinner.controlSize = NSControlSizeSmall;
    _spinner.displayedWhenStopped = NO;
    [content addSubview:_spinner];
    
    // Bottom Buttons
    NSButton *btnTest = [NSButton buttonWithTitle:@"Test Connection" target:self action:@selector(testConnection)];
    btnTest.bezelStyle = NSBezelStyleRounded;
    btnTest.frame = NSMakeRect(24, 24, 130, 32);
    [content addSubview:btnTest];
    
    NSButton *btnCancel = [NSButton buttonWithTitle:@"Cancel" target:self action:@selector(cancel)];
    btnCancel.bezelStyle = NSBezelStyleRounded;
    btnCancel.frame = NSMakeRect(300, 24, 90, 32);
    [content addSubview:btnCancel];
    
    NSButton *btnSave = [NSButton buttonWithTitle:@"Save & Connect" target:self action:@selector(saveAndConnect)];
    btnSave.bezelStyle = NSBezelStyleRounded;
    btnSave.keyEquivalent = @"\r"; // Enter key
    btnSave.frame = NSMakeRect(395, 24, 110, 32);
    [content addSubview:btnSave];
}

- (void)showWindowAndCenter {
    self.urlInputField.stringValue = [ConfigManager sharedManager].serverURL;
    self.statusLabel.stringValue = @"";
    [self.window center];
    [self showWindow:nil];
    [self.window makeKeyAndOrderFront:nil];
    [NSApp activateIgnoringOtherApps:YES];
}

- (void)selectOfficial {
    self.urlInputField.stringValue = @"https://chat.hoffle.online/hangout";
    self.statusLabel.stringValue = @"";
}

- (void)selectLocal {
    self.urlInputField.stringValue = @"http://localhost:8730/hangout";
    self.statusLabel.stringValue = @"";
}

- (void)testConnection {
    NSString *raw = self.urlInputField.stringValue;
    NSString *norm = [[ConfigManager sharedManager] normalizeServerURL:raw];
    if (norm.length == 0) {
        self.statusLabel.stringValue = @"Please enter a valid URL.";
        self.statusLabel.textColor = [NSColor systemRedColor];
        return;
    }
    
    NSURL *url = [NSURL URLWithString:norm];
    if (!url) {
        self.statusLabel.stringValue = @"Malformed URL.";
        self.statusLabel.textColor = [NSColor systemRedColor];
        return;
    }
    
    self.statusLabel.stringValue = @"Checking connection...";
    self.statusLabel.textColor = [NSColor colorWithCalibratedWhite:0.8 alpha:1.0];
    [self.spinner startAnimation:nil];
    
    NSMutableURLRequest *req = [NSMutableURLRequest requestWithURL:url
                                                       cachePolicy:NSURLRequestReloadIgnoringLocalCacheData
                                                   timeoutInterval:8.0];
    req.HTTPMethod = @"GET";
    
    NSURLSessionDataTask *task = [[NSURLSession sharedSession] dataTaskWithRequest:req
                                                                 completionHandler:^(NSData * _Nullable data, NSURLResponse * _Nullable response, NSError * _Nullable error) {
        dispatch_async(dispatch_get_main_queue(), ^{
            [self.spinner stopAnimation:nil];
            if (error) {
                self.statusLabel.stringValue = [NSString stringWithFormat:@"Failed: %@", error.localizedDescription];
                self.statusLabel.textColor = [NSColor systemRedColor];
            } else {
                NSHTTPURLResponse *http = (NSHTTPURLResponse *)response;
                self.statusLabel.stringValue = [NSString stringWithFormat:@"Connected! HTTP %ld", (long)http.statusCode];
                self.statusLabel.textColor = [NSColor systemGreenColor];
            }
        });
    }];
    [task resume];
}

- (void)saveAndConnect {
    NSString *raw = self.urlInputField.stringValue;
    NSString *norm = [[ConfigManager sharedManager] normalizeServerURL:raw];
    if (norm.length == 0) {
        self.statusLabel.stringValue = @"Please enter a valid URL.";
        self.statusLabel.textColor = [NSColor systemRedColor];
        return;
    }
    
    [[ConfigManager sharedManager] saveServerURL:norm];
    [self.delegate preferencesDidUpdateServerURL:norm];
    [self.window close];
}

- (void)cancel {
    [self.window close];
}

@end
