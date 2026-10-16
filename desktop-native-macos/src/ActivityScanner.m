#import "ActivityScanner.h"

@interface ActivityScanner ()
@property (nonatomic, strong) NSArray<NSDictionary *> *knownApps;
@end

@implementation ActivityScanner

+ (instancetype)sharedScanner {
    static ActivityScanner *instance = nil;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        instance = [[ActivityScanner alloc] init];
    });
    return instance;
}

- (instancetype)init {
    self = [super init];
    if (self) {
        // [Pattern regex or exact string, label, kind, priority]
        _knownApps = @[
            // Games (Priority 0)
            @{@"match": @"minecraft", @"label": @"Minecraft", @"kind": @"playing", @"prio": @0},
            @{@"match": @"league", @"label": @"League of Legends", @"kind": @"playing", @"prio": @0},
            @{@"match": @"roblox", @"label": @"Roblox", @"kind": @"playing", @"prio": @0},
            @{@"match": @"final fantasy xiv", @"label": @"Final Fantasy XIV", @"kind": @"playing", @"prio": @0},
            @{@"match": @"world of warcraft", @"label": @"World of Warcraft", @"kind": @"playing", @"prio": @0},
            @{@"match": @"counter-strike", @"label": @"Counter-Strike 2", @"kind": @"playing", @"prio": @0},
            @{@"match": @"cs2", @"label": @"Counter-Strike 2", @"kind": @"playing", @"prio": @0},
            @{@"match": @"dota", @"label": @"Dota 2", @"kind": @"playing", @"prio": @0},
            @{@"match": @"terraria", @"label": @"Terraria", @"kind": @"playing", @"prio": @0},
            @{@"match": @"stardew", @"label": @"Stardew Valley", @"kind": @"playing", @"prio": @0},
            @{@"match": @"hades", @"label": @"Hades", @"kind": @"playing", @"prio": @0},
            @{@"match": @"elden ring", @"label": @"Elden Ring", @"kind": @"playing", @"prio": @0},
            @{@"match": @"baldur", @"label": @"Baldur's Gate 3", @"kind": @"playing", @"prio": @0},
            @{@"match": @"genshin", @"label": @"Genshin Impact", @"kind": @"playing", @"prio": @0},
            @{@"match": @"factorio", @"label": @"Factorio", @"kind": @"playing", @"prio": @0},
            @{@"match": @"rimworld", @"label": @"RimWorld", @"kind": @"playing", @"prio": @0},
            @{@"match": @"steam_app", @"label": @"a Steam game", @"kind": @"playing", @"prio": @0},
            
            // Streaming (Priority 1)
            @{@"match": @"obs", @"label": @"OBS Studio", @"kind": @"streaming", @"prio": @1},
            
            // Coding (Priority 2)
            @{@"match": @"visual studio code", @"label": @"Visual Studio Code", @"kind": @"coding", @"prio": @2},
            @{@"match": @"code", @"label": @"Visual Studio Code", @"kind": @"coding", @"prio": @2},
            @{@"match": @"cursor", @"label": @"Cursor", @"kind": @"coding", @"prio": @2},
            @{@"match": @"zed", @"label": @"Zed", @"kind": @"coding", @"prio": @2},
            @{@"match": @"xcode", @"label": @"Xcode", @"kind": @"coding", @"prio": @2},
            @{@"match": @"intellij", @"label": @"IntelliJ IDEA", @"kind": @"coding", @"prio": @2},
            @{@"match": @"pycharm", @"label": @"PyCharm", @"kind": @"coding", @"prio": @2},
            @{@"match": @"webstorm", @"label": @"WebStorm", @"kind": @"coding", @"prio": @2},
            @{@"match": @"unity", @"label": @"Unity", @"kind": @"coding", @"prio": @2},
            @{@"match": @"godot", @"label": @"Godot Engine", @"kind": @"coding", @"prio": @2},
            
            // Creative Apps (Priority 3)
            @{@"match": @"blender", @"label": @"Blender", @"kind": @"app", @"prio": @3},
            @{@"match": @"figma", @"label": @"Figma", @"kind": @"app", @"prio": @3},
            @{@"match": @"photoshop", @"label": @"Photoshop", @"kind": @"app", @"prio": @3},
            @{@"match": @"aseprite", @"label": @"Aseprite", @"kind": @"app", @"prio": @3},
            @{@"match": @"krita", @"label": @"Krita", @"kind": @"app", @"prio": @3}
        ];
    }
    return self;
}

- (NSDictionary * _Nullable)detectCurrentActivity {
    NSArray<NSRunningApplication *> *apps = [[NSWorkspace sharedWorkspace] runningApplications];
    
    NSDictionary *best = nil;
    NSInteger bestPriority = 999;
    
    for (NSRunningApplication *app in apps) {
        if (app.activationPolicy != NSApplicationActivationPolicyRegular) continue;
        
        NSString *name = (app.localizedName ?: @"").lowercaseString;
        NSString *bundleId = (app.bundleIdentifier ?: @"").lowercaseString;
        
        for (NSDictionary *rule in self.knownApps) {
            NSString *pattern = rule[@"match"];
            NSInteger prio = [rule[@"prio"] integerValue];
            
            if ([name containsString:pattern] || [bundleId containsString:pattern]) {
                if (prio < bestPriority) {
                    bestPriority = prio;
                    best = @{
                        @"name": rule[@"label"],
                        @"kind": rule[@"kind"]
                    };
                }
                break;
            }
        }
    }
    
    return best;
}

- (NSDictionary * _Nullable)detectSpotifyNowPlaying {
    // Check if Spotify is running first to avoid launching it
    NSArray *spotifyApps = [NSRunningApplication runningApplicationsWithBundleIdentifier:@"com.spotify.client"];
    if (spotifyApps.count == 0) {
        return nil;
    }
    
    NSString *source =
        @"tell application \"Spotify\"\n"
        @"  if player state is playing then\n"
        @"    return (artist of current track) & (character id 1) & (name of current track) & (character id 1) & (artwork url of current track) & (character id 1) & (spotify url of current track)\n"
        @"  end if\n"
        @"end tell";
    
    NSAppleScript *appleScript = [[NSAppleScript alloc] initWithSource:source];
    NSDictionary *err = nil;
    NSAppleEventDescriptor *res = [appleScript executeAndReturnError:&err];
    
    if (err || !res) return nil;
    
    NSString *str = [res stringValue];
    if (!str || str.length == 0) return nil;
    
    NSString *delimiter = [NSString stringWithFormat:@"%C", (unichar)1];
    NSArray *parts = [str componentsSeparatedByString:delimiter];
    if (parts.count >= 2) {
        NSString *artist = parts[0];
        NSString *song = parts[1];
        NSString *art = parts.count > 2 ? parts[2] : @"";
        NSString *url = parts.count > 3 ? parts[3] : @"";
        
        if (song.length == 0) return nil;
        
        NSMutableDictionary *dict = [NSMutableDictionary dictionary];
        dict[@"song"] = song;
        dict[@"artist"] = artist.length > 0 ? artist : @"Spotify";
        if ([art hasPrefix:@"http://"] || [art hasPrefix:@"https://"]) {
            dict[@"albumArt"] = art;
        }
        if ([url hasPrefix:@"http://"] || [url hasPrefix:@"https://"] || [url hasPrefix:@"spotify:"]) {
            dict[@"url"] = url;
        }
        return dict;
    }
    
    return nil;
}

- (NSDictionary * _Nullable)scan {
    NSDictionary *activity = [self detectCurrentActivity];
    NSDictionary *music = [self detectSpotifyNowPlaying];
    
    NSMutableDictionary *result = [NSMutableDictionary dictionary];
    result[@"activity"] = activity ?: [NSNull null];
    result[@"music"] = music ?: [NSNull null];
    return result;
}

@end
