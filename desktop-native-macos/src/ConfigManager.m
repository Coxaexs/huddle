#import "ConfigManager.h"

static NSString * const kDefaultURL = @"https://chat.hoffle.online/hangout";
static NSString * const kServerURLKey = @"serverUrl";
static NSString * const kWindowBoundsKey = @"windowBounds";

@interface ConfigManager ()
@property (nonatomic, copy) NSString *appSupportDir;
@end

@implementation ConfigManager

+ (instancetype)sharedManager {
    static ConfigManager *instance = nil;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        instance = [[ConfigManager alloc] init];
    });
    return instance;
}

- (instancetype)init {
    self = [super init];
    if (self) {
        NSArray *paths = NSSearchPathForDirectoriesInDomains(NSApplicationSupportDirectory, NSUserDomainMask, YES);
        NSString *baseDir = paths.firstObject ?: NSTemporaryDirectory();
        _appSupportDir = [baseDir stringByAppendingPathComponent:@"Huddle"];
        
        NSFileManager *fm = [NSFileManager defaultManager];
        if (![fm fileExistsAtPath:_appSupportDir]) {
            [fm createDirectoryAtPath:_appSupportDir withIntermediateDirectories:YES attributes:nil error:nil];
        }
        
        _serverURL = [self resolveAppURL];
    }
    return self;
}

- (NSString *)normalizeServerURL:(NSString *)rawInput {
    NSString *trimmed = [rawInput stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
    if (!trimmed || trimmed.length == 0) {
        return @"";
    }
    if (![trimmed hasPrefix:@"http://"] && ![trimmed hasPrefix:@"https://"]) {
        trimmed = [@"https://" stringByAppendingString:trimmed];
    }
    while ([trimmed hasSuffix:@"/"]) {
        trimmed = [trimmed substringToIndex:trimmed.length - 1];
    }
    return trimmed;
}

- (NSString *)loadConfigJSONServer {
    NSString *cfgPath = [_appSupportDir stringByAppendingPathComponent:@"config.json"];
    NSData *data = [NSData dataWithContentsOfFile:cfgPath];
    if (data) {
        NSDictionary *json = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
        if ([json isKindOfClass:[NSDictionary class]] && json[@"serverUrl"]) {
            return [self normalizeServerURL:json[@"serverUrl"]];
        }
    }
    return @"";
}

- (NSString *)resolveAppURL {
    // 1. Command-line flag --server=...
    NSArray *args = [[NSProcessInfo processInfo] arguments];
    for (NSString *arg in args) {
        if ([arg hasPrefix:@"--server="]) {
            NSString *val = [arg substringFromIndex:@"--server=".length];
            NSString *norm = [self normalizeServerURL:val];
            if (norm.length > 0) return norm;
        }
    }
    
    // 2. HUDDLE_URL environment variable
    NSDictionary *env = [[NSProcessInfo processInfo] environment];
    if (env[@"HUDDLE_URL"]) {
        NSString *norm = [self normalizeServerURL:env[@"HUDDLE_URL"]];
        if (norm.length > 0) return norm;
    }
    
    // 3. NSUserDefaults
    NSString *stored = [[NSUserDefaults standardUserDefaults] stringForKey:kServerURLKey];
    if (stored && stored.length > 0) {
        NSString *norm = [self normalizeServerURL:stored];
        if (norm.length > 0) return norm;
    }
    
    // 4. config.json
    NSString *fromJSON = [self loadConfigJSONServer];
    if (fromJSON.length > 0) return fromJSON;
    
    // 5. Default URL
    return kDefaultURL;
}

- (void)saveServerURL:(NSString *)url {
    NSString *normalized = [self normalizeServerURL:url];
    if (normalized.length == 0) return;
    
    self.serverURL = normalized;
    [[NSUserDefaults standardUserDefaults] setObject:normalized forKey:kServerURLKey];
    [[NSUserDefaults standardUserDefaults] synchronize];
    
    // Also write to config.json for compatibility with other shells
    NSString *cfgPath = [_appSupportDir stringByAppendingPathComponent:@"config.json"];
    NSMutableDictionary *dict = [NSMutableDictionary dictionary];
    NSData *existing = [NSData dataWithContentsOfFile:cfgPath];
    if (existing) {
        NSDictionary *parsed = [NSJSONSerialization JSONObjectWithData:existing options:0 error:nil];
        if ([parsed isKindOfClass:[NSDictionary class]]) {
            [dict addEntriesFromDictionary:parsed];
        }
    }
    dict[@"serverUrl"] = normalized;
    NSData *outData = [NSJSONSerialization dataWithJSONObject:dict options:NSJSONWritingPrettyPrinted error:nil];
    if (outData) {
        [outData writeToFile:cfgPath atomically:YES];
    }
}

- (BOOL)isAppURL:(NSURL *)url {
    if (!url || !url.host) return NO;
    NSURL *current = [NSURL URLWithString:self.serverURL];
    if (!current || !current.host) return NO;
    return [url.host.lowercaseString isEqualToString:current.host.lowercaseString];
}

- (NSRect)loadWindowBounds {
    NSString *saved = [[NSUserDefaults standardUserDefaults] stringForKey:kWindowBoundsKey];
    if (saved && saved.length > 0) {
        NSRect r = NSRectFromString(saved);
        if (r.size.width >= 940 && r.size.height >= 600) {
            return r;
        }
    }
    
    // Default window geometry
    NSScreen *screen = [NSScreen mainScreen] ?: [NSScreen screens].firstObject;
    NSRect screenRect = screen ? screen.visibleFrame : NSMakeRect(0, 0, 1440, 900);
    CGFloat width = 1280.0;
    CGFloat height = 820.0;
    CGFloat x = screenRect.origin.x + (screenRect.size.width - width) / 2.0;
    CGFloat y = screenRect.origin.y + (screenRect.size.height - height) / 2.0;
    return NSMakeRect(x, y, width, height);
}

- (void)saveWindowBounds:(NSRect)bounds {
    NSString *str = NSStringFromRect(bounds);
    [[NSUserDefaults standardUserDefaults] setObject:str forKey:kWindowBoundsKey];
    
    // Also save window-bounds.json for cross-compatibility
    NSString *boundsPath = [_appSupportDir stringByAppendingPathComponent:@"window-bounds.json"];
    NSDictionary *bDict = @{
        @"x": @((int)bounds.origin.x),
        @"y": @((int)bounds.origin.y),
        @"width": @((int)bounds.size.width),
        @"height": @((int)bounds.size.height)
    };
    NSData *data = [NSJSONSerialization dataWithJSONObject:bDict options:NSJSONWritingPrettyPrinted error:nil];
    if (data) {
        [data writeToFile:boundsPath atomically:YES];
    }
}

@end
