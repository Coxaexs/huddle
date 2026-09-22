// AirPods head-orientation bridge.
//
// CoreMotion's CMHeadphoneMotionManager is the only way to read the head pose
// Apple's spatial-audio headphones report; it is unavailable to web content, so
// the desktop shell reads it here and forwards it to the webview.
//
// Written as Objective-C rather than through a Rust binding so the CoreMotion
// availability checks are the ones Apple documents.

#import <Foundation/Foundation.h>

typedef void (*HuddleHeadPoseCallback)(double yaw, double pitch, double roll, double timestamp);

#if defined(__APPLE__) && __has_include(<CoreMotion/CMHeadphoneMotionManager.h>)

#import <CoreMotion/CoreMotion.h>

static CMHeadphoneMotionManager *gManager = nil;
static NSOperationQueue *gQueue = nil;
static HuddleHeadPoseCallback gCallback = NULL;

/// 0 unavailable, 1 available, 2 available but the user has denied motion access.
int huddle_head_tracking_available(void) {
  if (@available(macOS 14.0, iOS 14.0, *)) {
    if (![CMHeadphoneMotionManager isDeviceMotionAvailable]) return 0;
    if ([CMHeadphoneMotionManager authorizationStatus] == CMAuthorizationStatusDenied ||
        [CMHeadphoneMotionManager authorizationStatus] == CMAuthorizationStatusRestricted) {
      return 2;
    }
    return 1;
  }
  return 0;
}

int huddle_head_tracking_start(HuddleHeadPoseCallback callback) {
  if (@available(macOS 14.0, iOS 14.0, *)) {
    if (![CMHeadphoneMotionManager isDeviceMotionAvailable] || callback == NULL) return 0;
    @synchronized ([CMHeadphoneMotionManager class]) {
      gCallback = callback;
      if (gManager == nil) {
        gManager = [[CMHeadphoneMotionManager alloc] init];
        gQueue = [[NSOperationQueue alloc] init];
        // Poses are consumed by the audio graph, so keep them ordered and off the main thread.
        gQueue.maxConcurrentOperationCount = 1;
        gQueue.qualityOfService = NSQualityOfServiceUserInteractive;
      }
      if (gManager.deviceMotionActive) return 1;
      [gManager startDeviceMotionUpdatesToQueue:gQueue
                                   withHandler:^(CMDeviceMotion *motion, NSError *error) {
        if (error != nil || motion == nil) return;
        HuddleHeadPoseCallback sink = gCallback;
        if (sink == NULL) return;
        CMAttitude *attitude = motion.attitude;
        sink(attitude.yaw, attitude.pitch, attitude.roll, motion.timestamp);
      }];
    }
    return 1;
  }
  return 0;
}

void huddle_head_tracking_stop(void) {
  if (@available(macOS 14.0, iOS 14.0, *)) {
    @synchronized ([CMHeadphoneMotionManager class]) {
      gCallback = NULL;
      if (gManager != nil && gManager.deviceMotionActive) [gManager stopDeviceMotionUpdates];
    }
  }
}

#else

// Older SDKs (and non-Apple targets that still compile this file) have no headphone motion.
int huddle_head_tracking_available(void) { return 0; }
int huddle_head_tracking_start(HuddleHeadPoseCallback callback) { (void)callback; return 0; }
void huddle_head_tracking_stop(void) {}

#endif
