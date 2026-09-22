// AirPods head-orientation bridge.
//
// CoreMotion's CMHeadphoneMotionManager is the only way to read the head pose
// Apple's spatial-audio headphones report; it is unavailable to web content, so
// the desktop shell reads it here and forwards it to the webview.
//
// Written as Objective-C rather than through a Rust binding so the CoreMotion
// availability checks are the ones Apple documents. The deployment target is far
// older than the API, so every use sits behind @available and every declaration
// that names the class carries a matching availability attribute.

#import <Foundation/Foundation.h>

typedef void (*HuddleHeadPoseCallback)(double yaw, double pitch, double roll, double timestamp);

#if defined(__APPLE__) && __has_include(<CoreMotion/CMHeadphoneMotionManager.h>)

#import <CoreMotion/CoreMotion.h>

API_AVAILABLE(macos(14.0), ios(14.0))
static CMHeadphoneMotionManager *gManager = nil;
static NSOperationQueue *gQueue = nil;
static HuddleHeadPoseCallback gCallback = NULL;

/// Guards the manager. A plain token, so the lock itself needs no availability.
static NSObject *lock(void) {
  static NSObject *token = nil;
  static dispatch_once_t once;
  dispatch_once(&once, ^{ token = [[NSObject alloc] init]; });
  return token;
}

/// Availability is an instance property, so asking the question needs a manager.
API_AVAILABLE(macos(14.0), ios(14.0))
static CMHeadphoneMotionManager *manager(void) {
  if (gManager == nil) {
    gManager = [[CMHeadphoneMotionManager alloc] init];
    gQueue = [[NSOperationQueue alloc] init];
    // Poses are consumed by the audio graph, so keep them ordered and off the main thread.
    gQueue.maxConcurrentOperationCount = 1;
    gQueue.qualityOfService = NSQualityOfServiceUserInteractive;
  }
  return gManager;
}

/// 0 unavailable, 1 available, 2 available but the user has denied motion access.
int huddle_head_tracking_available(void) {
  if (@available(macOS 14.0, iOS 14.0, *)) {
    @synchronized (lock()) {
      if (!manager().deviceMotionAvailable) return 0;
    }
    CMAuthorizationStatus status = [CMHeadphoneMotionManager authorizationStatus];
    if (status == CMAuthorizationStatusDenied || status == CMAuthorizationStatusRestricted) return 2;
    return 1;
  }
  return 0;
}

int huddle_head_tracking_start(HuddleHeadPoseCallback callback) {
  if (@available(macOS 14.0, iOS 14.0, *)) {
    if (callback == NULL) return 0;
    @synchronized (lock()) {
      CMHeadphoneMotionManager *headphones = manager();
      if (!headphones.deviceMotionAvailable) return 0;
      gCallback = callback;
      if (headphones.deviceMotionActive) return 1;
      [headphones startDeviceMotionUpdatesToQueue:gQueue
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
    @synchronized (lock()) {
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
