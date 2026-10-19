// hoffle-app-audio for macOS: the audio for a screen share, captured per
// application with Core Audio process taps (macOS 14.2 and later).
//
// The Mac counterpart of app-audio.cpp, with the same contract. Capturing the
// whole output would include Hoffle's own playback, so the room would hear
// itself; a tap takes chosen processes instead:
//
//   --window <CGWindowID> [--self <pid>]   the app that owns the shared window,
//                                          and its helper processes
//   --all-except <pid>                     every app playing sound, except
//                                          Hoffle (<pid> and its helpers)
//
// Output on stdout: interleaved stereo float32 at 48 kHz, in 10 ms chunks.
// "ready" on stderr once capture works; exit code 2 if this Mac cannot tap
// processes. It exits when stdin closes, so it never outlives Hoffle.

#import <Foundation/Foundation.h>
#import <CoreAudio/CoreAudio.h>
#import <CoreGraphics/CoreGraphics.h>
#include <dlfcn.h>
#include <libproc.h>
#include <signal.h>
#include <sys/proc_info.h>
#include <unistd.h>

#if __has_include(<CoreAudio/CATapDescription.h>)
#import <CoreAudio/CATapDescription.h>
#import <CoreAudio/AudioHardwareTapping.h>
#else
// Older SDKs (the local cross-compile): what macOS 14.2's headers declare.
API_AVAILABLE(macos(14.2))
@interface CATapDescription : NSObject
- (instancetype)initStereoMixdownOfProcesses:(NSArray<NSNumber *> *)processes;
- (instancetype)initStereoGlobalTapButExcludeProcesses:(NSArray<NSNumber *> *)processes;
@property (atomic, strong) NSUUID *UUID;
@end
extern OSStatus AudioHardwareCreateProcessTap(CATapDescription *inDescription, AudioObjectID *outTapID)
    API_AVAILABLE(macos(14.2));
extern OSStatus AudioHardwareDestroyProcessTap(AudioObjectID inTapID) API_AVAILABLE(macos(14.2));
#endif

// Selectors from macOS 14's AudioHardware.h, spelled out so this also builds
// against older SDKs.
enum {
  kSelProcessObjectList = 'prs#',
  kSelProcessPID = 'ppid',
  kSelTapFormat = 'tfmt',
};

static const double kOutRate = 48000;
static const int kChunkFrames = 480;  // 10 ms

// ---------------------------------------------------------------------------
// Processes

/** The process that macOS holds responsible for `pid` (WebKit's GPU process
 * plays audio for Safari but is launched by launchd, not by Safari). */
static pid_t Responsible(pid_t pid) {
  static pid_t (*fn)(pid_t) = NULL;
  static BOOL looked = NO;
  if (!looked) {
    looked = YES;
    fn = (pid_t(*)(pid_t))dlsym(RTLD_DEFAULT, "responsibility_get_pid_responsible_for_pid");
  }
  return fn ? fn(pid) : pid;
}

static pid_t Parent(pid_t pid) {
  struct proc_bsdinfo info;
  if (proc_pidinfo(pid, PROC_PIDTBSDINFO, 0, &info, sizeof info) != (int)sizeof info) return 0;
  return (pid_t)info.pbi_ppid;
}

/** Whether `pid` is `root` or runs on its behalf (a child, or a service it is responsible for). */
static BOOL InTree(pid_t pid, pid_t root) {
  if (root <= 1) return NO;
  if (Responsible(pid) == root) return YES;
  for (int depth = 0; pid > 1 && depth < 64; depth++) {
    if (pid == root) return YES;
    pid = Parent(pid);
  }
  return NO;
}

static OSStatus GetGlobal(AudioObjectID object, AudioObjectPropertySelector selector, UInt32 *size, void *out) {
  AudioObjectPropertyAddress address = {selector, kAudioObjectPropertyScopeGlobal, kAudioObjectPropertyElementMain};
  return AudioObjectGetPropertyData(object, &address, 0, NULL, size, out);
}

/** Core Audio's process objects (every process that has opened audio), as pid -> object. */
static NSDictionary<NSNumber *, NSNumber *> *AudioProcesses(void) {
  AudioObjectPropertyAddress address = {kSelProcessObjectList, kAudioObjectPropertyScopeGlobal,
                                        kAudioObjectPropertyElementMain};
  UInt32 size = 0;
  if (AudioObjectGetPropertyDataSize(kAudioObjectSystemObject, &address, 0, NULL, &size) != noErr) return @{};
  UInt32 count = size / sizeof(AudioObjectID);
  AudioObjectID *objects = calloc(count ? count : 1, sizeof(AudioObjectID));
  NSMutableDictionary *result = [NSMutableDictionary dictionary];
  if (AudioObjectGetPropertyData(kAudioObjectSystemObject, &address, 0, NULL, &size, objects) == noErr) {
    count = size / sizeof(AudioObjectID);
    for (UInt32 i = 0; i < count; i++) {
      pid_t pid = -1;
      UInt32 pidSize = sizeof pid;
      if (GetGlobal(objects[i], kSelProcessPID, &pidSize, &pid) == noErr && pid > 0) {
        result[@(pid)] = @(objects[i]);
      }
    }
  }
  free(objects);
  return result;
}

static pid_t WindowOwner(CGWindowID window) {
  CFArrayRef list = CGWindowListCopyWindowInfo(kCGWindowListOptionIncludingWindow, window);
  pid_t pid = 0;
  if (list && CFArrayGetCount(list) > 0) {
    NSDictionary *info = (__bridge NSDictionary *)CFArrayGetValueAtIndex(list, 0);
    pid = [info[(__bridge NSString *)kCGWindowOwnerPID] intValue];
  }
  if (list) CFRelease(list);
  return pid;
}

// ---------------------------------------------------------------------------
// Output: resampled to 48 kHz, written in whole 10 ms chunks

static double gStep = 1;  // input frames per output frame
static double gPhase = 0;
static float gPrev[2] = {0, 0};
static float gChunk[kChunkFrames * 2];
static int gFill = 0;

static void Emit(float left, float right) {
  gChunk[gFill * 2] = left;
  gChunk[gFill * 2 + 1] = right;
  if (++gFill < kChunkFrames) return;
  gFill = 0;
  const char *bytes = (const char *)gChunk;
  size_t left_ = sizeof gChunk;
  while (left_ > 0) {
    ssize_t wrote = write(STDOUT_FILENO, bytes, left_);
    if (wrote <= 0) exit(0);  // Hoffle is gone
    bytes += wrote;
    left_ -= (size_t)wrote;
  }
}

/** One input frame; linear interpolation between it and the one before. */
static void Push(float left, float right) {
  while (gPhase < 1.0) {
    Emit(gPrev[0] + (left - gPrev[0]) * (float)gPhase, gPrev[1] + (right - gPrev[1]) * (float)gPhase);
    gPhase += gStep;
  }
  gPhase -= 1.0;
  gPrev[0] = left;
  gPrev[1] = right;
}

// ---------------------------------------------------------------------------
// The tap, and the private aggregate device it is read through

static dispatch_queue_t gAudioQueue;
static AudioObjectID gTap = kAudioObjectUnknown;
static AudioObjectID gAggregate = kAudioObjectUnknown;
static AudioDeviceIOProcID gProc = NULL;
static NSSet<NSNumber *> *gTapped = nil;  // the process objects the tap was made for
static AudioStreamBasicDescription gFormat;

static void Teardown(void) API_AVAILABLE(macos(14.2)) {
  if (gAggregate != kAudioObjectUnknown) {
    if (gProc) {
      AudioDeviceStop(gAggregate, gProc);
      AudioDeviceDestroyIOProcID(gAggregate, gProc);
    }
    AudioHardwareDestroyAggregateDevice(gAggregate);
  }
  if (gTap != kAudioObjectUnknown) AudioHardwareDestroyProcessTap(gTap);
  gTap = gAggregate = kAudioObjectUnknown;
  gProc = NULL;
  gTapped = nil;
}

static NSString *DefaultOutputUID(void) {
  AudioObjectID device = kAudioObjectUnknown;
  UInt32 size = sizeof device;
  if (GetGlobal(kAudioObjectSystemObject, kAudioHardwarePropertyDefaultOutputDevice, &size, &device) != noErr) return nil;
  CFStringRef uid = NULL;
  size = sizeof uid;
  if (GetGlobal(device, kAudioDevicePropertyDeviceUID, &size, &uid) != noErr || !uid) return nil;
  return (__bridge_transfer NSString *)uid;
}

/** The tap's channels sit after any inputs the output device has, so read the last buffers. */
static void Consume(const AudioBufferList *input) {
  BOOL planar = (gFormat.mFormatFlags & kAudioFormatFlagIsNonInterleaved) != 0;
  UInt32 channels = gFormat.mChannelsPerFrame ? gFormat.mChannelsPerFrame : 2;
  UInt32 buffers = planar ? channels : 1;
  if (input->mNumberBuffers < buffers) return;
  const AudioBuffer *first = &input->mBuffers[input->mNumberBuffers - buffers];
  if (planar) {
    const float *l = first[0].mData;
    const float *r = channels > 1 ? first[1].mData : l;
    if (!l || !r) return;
    UInt32 frames = first[0].mDataByteSize / sizeof(float);
    for (UInt32 i = 0; i < frames; i++) Push(l[i], r[i]);
  } else {
    const float *data = first[0].mData;
    UInt32 stride = first[0].mNumberChannels ? first[0].mNumberChannels : channels;
    if (!data || !stride) return;
    UInt32 frames = first[0].mDataByteSize / (sizeof(float) * stride);
    for (UInt32 i = 0; i < frames; i++) Push(data[i * stride], data[i * stride + (stride > 1 ? 1 : 0)]);
  }
}

static BOOL Build(NSArray<NSNumber *> *objects, BOOL exclude) API_AVAILABLE(macos(14.2)) {
  Teardown();
  CATapDescription *description = exclude ? [[CATapDescription alloc] initStereoGlobalTapButExcludeProcesses:objects]
                                          : [[CATapDescription alloc] initStereoMixdownOfProcesses:objects];
  AudioObjectID tap = kAudioObjectUnknown;
  if (AudioHardwareCreateProcessTap(description, &tap) != noErr || tap == kAudioObjectUnknown) return NO;
  gTap = tap;

  UInt32 size = sizeof gFormat;
  if (GetGlobal(tap, kSelTapFormat, &size, &gFormat) != noErr || !(gFormat.mFormatFlags & kAudioFormatFlagIsFloat) ||
      gFormat.mBitsPerChannel != 32 || gFormat.mSampleRate <= 0) {
    Teardown();
    return NO;
  }
  gStep = gFormat.mSampleRate / kOutRate;

  NSString *output = DefaultOutputUID();
  NSMutableDictionary *aggregate = [@{
    @"name" : @"Hoffle screen-share audio",
    @"uid" : [NSUUID UUID].UUIDString,
    @"private" : @YES,
    @"stacked" : @NO,
    @"tapautostart" : @YES,
    @"taps" : @[ @{@"uid" : description.UUID.UUIDString, @"drift" : @YES} ],
  } mutableCopy];
  if (output) {
    aggregate[@"master"] = output;
    aggregate[@"subdevices"] = @[ @{@"uid" : output} ];
  }
  AudioObjectID device = kAudioObjectUnknown;
  if (AudioHardwareCreateAggregateDevice((__bridge CFDictionaryRef)aggregate, &device) != noErr) {
    Teardown();
    return NO;
  }
  gAggregate = device;
  AudioDeviceIOProcID proc = NULL;
  OSStatus status = AudioDeviceCreateIOProcIDWithBlock(
      &proc, device, gAudioQueue,
      ^(const AudioTimeStamp *now, const AudioBufferList *input, const AudioTimeStamp *inputTime,
        AudioBufferList *outputData, const AudioTimeStamp *outputTime) {
        Consume(input);
      });
  if (status != noErr) {
    Teardown();
    return NO;
  }
  gProc = proc;
  if (AudioDeviceStart(device, proc) != noErr) {
    Teardown();
    return NO;
  }
  return YES;
}

// ---------------------------------------------------------------------------

static pid_t gWindowPid = 0;
static pid_t gSelf = 0;
static BOOL gAll = NO;

/** Which process objects to tap (or, for --all-except, to leave out). */
static NSSet<NSNumber *> *Wanted(void) {
  NSMutableSet *wanted = [NSMutableSet set];
  pid_t me = getpid();
  [AudioProcesses() enumerateKeysAndObjectsUsingBlock:^(NSNumber *pidNumber, NSNumber *object, BOOL *stop) {
    pid_t pid = pidNumber.intValue;
    BOOL hoffle = pid == me || InTree(pid, gSelf);
    if (gAll ? hoffle : (!hoffle && InTree(pid, gWindowPid))) [wanted addObject:object];
  }];
  return wanted;
}

/** Rebuilds the tap when the set of processes changed; false if the tap cannot be made. */
static BOOL Refresh(BOOL force) API_AVAILABLE(macos(14.2)) {
  NSSet *wanted = Wanted();
  if (!force && gTapped && [wanted isEqualToSet:gTapped]) return YES;
  // Sharing Hoffle's own window, or an app that has not opened audio yet:
  // nothing to tap for now (the share stays silent until it does).
  if (!gAll && wanted.count == 0) {
    Teardown();
    gTapped = wanted;
    return YES;
  }
  BOOL ok = Build(wanted.allObjects, gAll);
  if (ok) gTapped = wanted;
  return ok;
}

static void Listen(AudioObjectPropertySelector selector, BOOL force) API_AVAILABLE(macos(14.2)) {
  AudioObjectPropertyAddress address = {selector, kAudioObjectPropertyScopeGlobal, kAudioObjectPropertyElementMain};
  AudioObjectAddPropertyListenerBlock(kAudioObjectSystemObject, &address, dispatch_get_main_queue(),
                                      ^(UInt32 count, const AudioObjectPropertyAddress *addresses) {
                                        // Debounced: apps open and close audio in bursts.
                                        static int generation = 0;
                                        int mine = ++generation;
                                        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 300 * NSEC_PER_MSEC),
                                                       dispatch_get_main_queue(), ^{
                                                         if (mine == generation) Refresh(force);
                                                       });
                                      });
}

int main(int argc, const char *argv[]) {
  @autoreleasepool {
    signal(SIGPIPE, SIG_IGN);
    CGWindowID window = 0;
    for (int i = 1; i + 1 < argc; i++) {
      if (strcmp(argv[i], "--window") == 0) {
        window = (CGWindowID)strtoul(argv[i + 1], NULL, 10);
      } else if (strcmp(argv[i], "--all-except") == 0) {
        gAll = YES;
        gSelf = (pid_t)strtol(argv[i + 1], NULL, 10);
      } else if (strcmp(argv[i], "--self") == 0) {
        gSelf = (pid_t)strtol(argv[i + 1], NULL, 10);
      }
    }
    if (!gAll) gWindowPid = window ? WindowOwner(window) : 0;
    if (!gAll && !gWindowPid) {
      fputs("usage: hoffle-app-audio --window <CGWindowID> [--self <pid>] | --all-except <pid>\n", stderr);
      return 1;
    }

    if (@available(macOS 14.2, *)) {
      gAudioQueue = dispatch_queue_create("online.hoffle.app-audio", DISPATCH_QUEUE_SERIAL);
      if (!Refresh(YES)) {
        fputs("unsupported\n", stderr);
        return 2;
      }
      // Apps that start playing later, and a change of output device.
      Listen(kSelProcessObjectList, NO);
      Listen(kAudioHardwarePropertyDefaultOutputDevice, YES);
      fputs("ready\n", stderr);
      fflush(stderr);

      [NSThread detachNewThreadWithBlock:^{
        char buf[256];
        while (read(STDIN_FILENO, buf, sizeof buf) > 0) {
        }
        dispatch_async(dispatch_get_main_queue(), ^{
          Teardown();
          exit(0);
        });
      }];
      dispatch_main();
    } else {
      fputs("unsupported: process taps need macOS 14.2\n", stderr);
      return 2;
    }
  }
  return 0;
}
