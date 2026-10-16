#import "TitleBarView.h"

// Sleek compact icon button (18x18 or 20x20)
@interface CompactTitleBarButton : NSButton
@property (nonatomic, assign) BOOL isHovered;
@property (nonatomic, strong) NSTrackingArea *trackingArea;
@end

@implementation CompactTitleBarButton

- (instancetype)initWithFrame:(NSRect)frameRect {
    self = [super initWithFrame:frameRect];
    if (self) {
        self.bordered = NO;
        self.buttonType = NSButtonTypeMomentaryChange;
        self.wantsLayer = YES;
        self.layer.cornerRadius = 4.0;
        self.layer.masksToBounds = YES;
    }
    return self;
}

- (void)updateTrackingAreas {
    [super updateTrackingAreas];
    if (self.trackingArea) {
        [self removeTrackingArea:self.trackingArea];
    }
    self.trackingArea = [[NSTrackingArea alloc] initWithRect:self.bounds
                                                     options:(NSTrackingMouseEnteredAndExited | NSTrackingActiveAlways)
                                                       owner:self
                                                    userInfo:nil];
    [self addTrackingArea:self.trackingArea];
}

- (void)mouseEntered:(NSEvent *)event {
    self.isHovered = YES;
    [self setNeedsDisplay:YES];
}

- (void)mouseExited:(NSEvent *)event {
    self.isHovered = NO;
    [self setNeedsDisplay:YES];
}

- (void)drawRect:(NSRect)dirtyRect {
    if (self.isEnabled && self.isHovered) {
        [[NSColor colorWithCalibratedWhite:1.0 alpha:0.12] setFill];
        [[NSBezierPath bezierPathWithRoundedRect:self.bounds xRadius:4 yRadius:4] fill];
    }
    [super drawRect:dirtyRect];
}

@end

@interface TitleBarView ()

@property (nonatomic, strong) CompactTitleBarButton *backBtn;
@property (nonatomic, strong) CompactTitleBarButton *forwardBtn;
@property (nonatomic, strong) NSTextField *titleField;
@property (nonatomic, strong) CompactTitleBarButton *searchBtn;
@property (nonatomic, strong) CompactTitleBarButton *inboxBtn;
@property (nonatomic, strong) CompactTitleBarButton *helpBtn;
@property (nonatomic, strong) CompactTitleBarButton *reloadBtn;
@property (nonatomic, strong) CompactTitleBarButton *prefsBtn;
@property (nonatomic, strong) NSColor *themeBgColor;

@end

@implementation TitleBarView

- (instancetype)initWithFrame:(NSRect)frameRect {
    self = [super initWithFrame:frameRect];
    if (self) {
        // Default deep wine-red / dark theme matching Hoffle
        _themeBgColor = [NSColor colorWithCalibratedRed:20/255.0 green:7/255.0 blue:10/255.0 alpha:1.0];
        self.wantsLayer = YES;
        self.layer.backgroundColor = _themeBgColor.CGColor;
        [self setupSubviews];
    }
    return self;
}

- (BOOL)isFlipped {
    return YES;
}

- (BOOL)mouseDownCanMoveWindow {
    return YES;
}

- (void)mouseDown:(NSEvent *)event {
    if (event.clickCount == 2) {
        [self.window zoom:nil];
        return;
    }
    [self.window performWindowDragWithEvent:event];
}

- (void)setupSubviews {
    // 1. Navigation buttons right beside traffic lights (x=70)
    _backBtn = [[CompactTitleBarButton alloc] initWithFrame:NSMakeRect(70, 3, 18, 18)];
    _backBtn.attributedTitle = [self makeButtonTitle:@"‹" size:15 weight:NSFontWeightMedium color:[NSColor colorWithCalibratedWhite:0.80 alpha:1.0]];
    _backBtn.toolTip = @"Back (⌘[)";
    _backBtn.target = self;
    _backBtn.action = @selector(backAction:);
    _backBtn.enabled = NO;
    _backBtn.alphaValue = 0.35;
    [self addSubview:_backBtn];
    
    _forwardBtn = [[CompactTitleBarButton alloc] initWithFrame:NSMakeRect(90, 3, 18, 18)];
    _forwardBtn.attributedTitle = [self makeButtonTitle:@"›" size:15 weight:NSFontWeightMedium color:[NSColor colorWithCalibratedWhite:0.80 alpha:1.0]];
    _forwardBtn.toolTip = @"Forward (⌘])";
    _forwardBtn.target = self;
    _forwardBtn.action = @selector(forwardAction:);
    _forwardBtn.enabled = NO;
    _forwardBtn.alphaValue = 0.35;
    [self addSubview:_forwardBtn];
    
    // 2. Compact Title Label
    _titleField = [NSTextField labelWithString:@"Hoffle"];
    _titleField.font = [NSFont systemFontOfSize:11 weight:NSFontWeightMedium];
    _titleField.textColor = [NSColor colorWithCalibratedWhite:0.75 alpha:1.0];
    _titleField.alignment = NSTextAlignmentCenter;
    _titleField.lineBreakMode = NSLineBreakByTruncatingMiddle;
    [self addSubview:_titleField];
    
    // 3. Compact Right Tools (20x20)
    _searchBtn = [[CompactTitleBarButton alloc] initWithFrame:NSMakeRect(0, 2, 20, 20)];
    _searchBtn.attributedTitle = [self makeButtonTitle:@"🔍" size:11 weight:NSFontWeightRegular color:[NSColor colorWithCalibratedWhite:0.80 alpha:1.0]];
    _searchBtn.toolTip = @"Quick Switcher / Search (⌘K)";
    _searchBtn.target = self;
    _searchBtn.action = @selector(searchAction:);
    [self addSubview:_searchBtn];
    
    _inboxBtn = [[CompactTitleBarButton alloc] initWithFrame:NSMakeRect(0, 2, 20, 20)];
    _inboxBtn.attributedTitle = [self makeButtonTitle:@"📥" size:11 weight:NSFontWeightRegular color:[NSColor colorWithCalibratedWhite:0.80 alpha:1.0]];
    _inboxBtn.toolTip = @"Inbox & Mentions (⌘I)";
    _inboxBtn.target = self;
    _inboxBtn.action = @selector(inboxAction:);
    [self addSubview:_inboxBtn];
    
    _helpBtn = [[CompactTitleBarButton alloc] initWithFrame:NSMakeRect(0, 2, 20, 20)];
    _helpBtn.attributedTitle = [self makeButtonTitle:@"?" size:12 weight:NSFontWeightBold color:[NSColor colorWithCalibratedWhite:0.75 alpha:1.0]];
    _helpBtn.toolTip = @"Help & Shortcuts (⌘/)";
    _helpBtn.target = self;
    _helpBtn.action = @selector(helpAction:);
    [self addSubview:_helpBtn];
    
    _reloadBtn = [[CompactTitleBarButton alloc] initWithFrame:NSMakeRect(0, 2, 20, 20)];
    _reloadBtn.attributedTitle = [self makeButtonTitle:@"⟳" size:13 weight:NSFontWeightRegular color:[NSColor colorWithCalibratedWhite:0.75 alpha:1.0]];
    _reloadBtn.toolTip = @"Reload Page (⌘R)";
    _reloadBtn.target = self;
    _reloadBtn.action = @selector(reloadAction:);
    [self addSubview:_reloadBtn];
    
    _prefsBtn = [[CompactTitleBarButton alloc] initWithFrame:NSMakeRect(0, 2, 20, 20)];
    _prefsBtn.attributedTitle = [self makeButtonTitle:@"⚙" size:12 weight:NSFontWeightRegular color:[NSColor colorWithCalibratedWhite:0.75 alpha:1.0]];
    _prefsBtn.toolTip = @"Settings & Server (⌘,)";
    _prefsBtn.target = self;
    _prefsBtn.action = @selector(prefsAction:);
    [self addSubview:_prefsBtn];
}

- (NSAttributedString *)makeButtonTitle:(NSString *)glyph size:(CGFloat)size weight:(NSFontWeight)weight color:(NSColor *)color {
    NSMutableParagraphStyle *pStyle = [[NSMutableParagraphStyle alloc] init];
    pStyle.alignment = NSTextAlignmentCenter;
    NSDictionary *attrs = @{
        NSFontAttributeName: [NSFont systemFontOfSize:size weight:weight],
        NSForegroundColorAttributeName: color,
        NSParagraphStyleAttributeName: pStyle
    };
    return [[NSAttributedString alloc] initWithString:glyph attributes:attrs];
}

- (void)layout {
    [super layout];
    
    CGFloat width = self.bounds.size.width;
    CGFloat height = self.bounds.size.height; // 24px
    
    // Position navigation buttons
    _backBtn.frame = NSMakeRect(70, (height - 18) / 2.0, 18, 18);
    _forwardBtn.frame = NSMakeRect(90, (height - 18) / 2.0, 18, 18);
    
    // Position right buttons from right to left
    CGFloat rightX = width - 8;
    
    rightX -= 20;
    _prefsBtn.frame = NSMakeRect(rightX, (height - 20) / 2.0, 20, 20);
    
    rightX -= (20 + 2);
    _reloadBtn.frame = NSMakeRect(rightX, (height - 20) / 2.0, 20, 20);
    
    rightX -= (20 + 2);
    _helpBtn.frame = NSMakeRect(rightX, (height - 20) / 2.0, 20, 20);
    
    rightX -= (20 + 2);
    _inboxBtn.frame = NSMakeRect(rightX, (height - 20) / 2.0, 20, 20);
    
    rightX -= (20 + 2);
    _searchBtn.frame = NSMakeRect(rightX, (height - 20) / 2.0, 20, 20);
    
    // Center title
    CGFloat leftLimit = 120;
    CGFloat rightLimit = rightX - 8;
    CGFloat availableWidth = rightLimit - leftLimit;
    if (availableWidth > 60) {
        CGFloat titleWidth = MIN(availableWidth, 240);
        CGFloat centerX = (width - titleWidth) / 2.0;
        if (centerX < leftLimit) centerX = leftLimit;
        if (centerX + titleWidth > rightLimit) centerX = rightLimit - titleWidth;
        _titleField.frame = NSMakeRect(centerX, (height - 16) / 2.0, titleWidth, 16);
        _titleField.hidden = NO;
    } else {
        _titleField.hidden = YES;
    }
}

- (void)drawRect:(NSRect)dirtyRect {
    [super drawRect:dirtyRect];
    
    // Seamless theme background
    [_themeBgColor setFill];
    NSRectFill(self.bounds);
    
    // Ultra-subtle bottom divider
    [[NSColor colorWithCalibratedWhite:1.0 alpha:0.04] setFill];
    NSRectFill(NSMakeRect(0, self.bounds.size.height - 1.0, self.bounds.size.width, 1.0));
}

#pragma mark - Public Setters

- (void)setCanGoBack:(BOOL)canGoBack {
    _backBtn.enabled = canGoBack;
    _backBtn.alphaValue = canGoBack ? 1.0 : 0.35;
}

- (void)setCanGoForward:(BOOL)canGoForward {
    _forwardBtn.enabled = canGoForward;
    _forwardBtn.alphaValue = canGoForward ? 1.0 : 0.35;
}

- (void)setTitleText:(NSString *)title {
    NSString *clean = [title stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
    if (!clean || clean.length == 0) clean = @"Hoffle";
    _titleField.stringValue = clean;
}

- (void)setThemeBackgroundColor:(NSColor *)color {
    if (color) {
        _themeBgColor = color;
        self.layer.backgroundColor = color.CGColor;
        [self setNeedsDisplay:YES];
    }
}

#pragma mark - Actions

- (void)backAction:(id)sender {
    if ([self.delegate respondsToSelector:@selector(titleBarDidClickBack)]) {
        [self.delegate titleBarDidClickBack];
    }
}

- (void)forwardAction:(id)sender {
    if ([self.delegate respondsToSelector:@selector(titleBarDidClickForward)]) {
        [self.delegate titleBarDidClickForward];
    }
}

- (void)searchAction:(id)sender {
    if ([self.delegate respondsToSelector:@selector(titleBarDidClickSearch)]) {
        [self.delegate titleBarDidClickSearch];
    }
}

- (void)inboxAction:(id)sender {
    if ([self.delegate respondsToSelector:@selector(titleBarDidClickInbox)]) {
        [self.delegate titleBarDidClickInbox];
    }
}

- (void)helpAction:(id)sender {
    if ([self.delegate respondsToSelector:@selector(titleBarDidClickHelp)]) {
        [self.delegate titleBarDidClickHelp];
    }
}

- (void)reloadAction:(id)sender {
    if ([self.delegate respondsToSelector:@selector(titleBarDidClickReload)]) {
        [self.delegate titleBarDidClickReload];
    }
}

- (void)prefsAction:(id)sender {
    if ([self.delegate respondsToSelector:@selector(titleBarDidClickPreferences)]) {
        [self.delegate titleBarDidClickPreferences];
    }
}

@end
