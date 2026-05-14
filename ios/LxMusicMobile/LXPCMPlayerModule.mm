#import "LXPCMPlayerModule.h"

#import <AVFoundation/AVFoundation.h>
#import <QuartzCore/QuartzCore.h>
#import <React/RCTConvert.h>
#include <errno.h>
#include <stdint.h>
#include <string.h>
#include <mutex>
#include <vector>

#if __has_include(<libavformat/avformat.h>)
#define LX_HAS_FFMPEG 1
#define AVMediaType LXFFmpegAVMediaType
extern "C" {
#include <libavcodec/avcodec.h>
#include <libavformat/avformat.h>
#include <libavutil/avutil.h>
#include <libavutil/channel_layout.h>
#include <libavutil/opt.h>
#include <libavutil/samplefmt.h>
#include <libswresample/swresample.h>
}
#undef AVMediaType
#elif __has_include(<FFmpeg/libavformat/avformat.h>)
#define LX_HAS_FFMPEG 1
#define AVMediaType LXFFmpegAVMediaType
extern "C" {
#include <FFmpeg/libavcodec/avcodec.h>
#include <FFmpeg/libavformat/avformat.h>
#include <FFmpeg/libavutil/avutil.h>
#include <FFmpeg/libavutil/channel_layout.h>
#include <FFmpeg/libavutil/opt.h>
#include <FFmpeg/libavutil/samplefmt.h>
#include <FFmpeg/libswresample/swresample.h>
}
#undef AVMediaType
#else
#error "PCMPlayerModule requires ffmpeg-kit-ios-full headers. Run `cd ios && bundle exec pod install --repo-update` and ensure the Podfile post_install header preparation ran."
#endif

static NSString * const LXPCMPlayerEventName = @"pcm-player-event";

static NSError *LXPCMError(NSString *code, NSString *message) {
  return [NSError errorWithDomain:@"PCMPlayerModule" code:0 userInfo:@{
    NSLocalizedDescriptionKey: message ?: @"PCM player error",
    @"code": code ?: @"pcm_player_error",
  }];
}

static double LXPCMClampDouble(double value, double minValue, double maxValue) {
  if (value < minValue) return minValue;
  if (value > maxValue) return maxValue;
  return value;
}

@interface PCMPlayerModule () {
  std::mutex _pcmRingMutex;
  std::vector<float> _pcmRingBuffer;
  size_t _pcmRingCapacityFrames;
  size_t _pcmRingReadFrame;
  size_t _pcmRingWriteFrame;
  size_t _pcmRingAvailableFrames;
  size_t _pcmRingChannels;
  int _pcmRingSampleRate;
}
@property (nonatomic, assign) BOOL hasListeners;
@property (nonatomic, strong) dispatch_queue_t decodeQueue;
@property (nonatomic, strong) AVAudioEngine *engine;
@property (nonatomic, strong) AVAudioSourceNode *sourceNode;
@property (nonatomic, strong) AVAudioUnitTimePitch *timePitchNode;
@property (nonatomic, strong) AVAudioMixerNode *volumeMixerNode;
@property (nonatomic, strong) AVAudioFormat *pcmFormat;
@property (nonatomic, assign) NSUInteger generation;
@property (nonatomic, copy) NSString *trackId;
@property (nonatomic, copy) NSString *source;
@property (nonatomic, copy) NSString *userAgent;
@property (nonatomic, assign) BOOL isPlaying;
@property (nonatomic, assign) BOOL isLoaded;
@property (nonatomic, assign) BOOL isDecoding;
@property (nonatomic, assign) BOOL decodeEnded;
@property (nonatomic, assign) BOOL hasQueuedEndedEvent;
@property (nonatomic, assign) BOOL hasPendingSeek;
@property (nonatomic, assign) BOOL isApplyingSeek;
@property (nonatomic, assign) double pendingSeekPosition;
@property (nonatomic, assign) NSUInteger pendingSeekId;
@property (nonatomic, assign) CFTimeInterval pendingSeekRequestedAt;
@property (nonatomic, assign) BOOL hasSeekReadyLog;
@property (nonatomic, assign) NSUInteger seekReadyLogId;
@property (nonatomic, assign) CFTimeInterval seekReadyLogRequestedAt;
@property (nonatomic, assign) double seekReadyLogPosition;
@property (nonatomic, assign) double duration;
@property (nonatomic, assign) double positionBase;
@property (nonatomic, assign) CFTimeInterval positionBaseTime;
@property (nonatomic, assign) double bufferedPosition;
@property (nonatomic, assign) double rate;
@property (nonatomic, assign) float volume;
@property (nonatomic, assign) int outputSampleRate;
@property (nonatomic, assign) int outputChannels;
@property (nonatomic, assign) int64_t scheduledFrames;
@property (nonatomic, assign) BOOL wasPlayingBeforeInterruption;
- (BOOL)shouldInterruptDecodeForGeneration:(NSUInteger)generation;
- (BOOL)consumePendingSeekForGeneration:(NSUInteger)generation position:(double *)position seekId:(NSUInteger *)seekId requestedAt:(CFTimeInterval *)requestedAt;
- (void)clearPCMOutputSynchronously;
- (void)resetPCMBufferWithSampleRate:(int)sampleRate channels:(int)channels;
- (void)clearPCMBuffer;
- (size_t)availablePCMFrames;
- (BOOL)appendPCMFrames:(uint8_t **)convertedData samples:(int)samples sampleOffset:(int)sampleOffset channels:(int)channels;
- (void)renderPCMFrames:(AVAudioFrameCount)frameCount outputData:(AudioBufferList *)outputData isSilence:(BOOL *)isSilence;
- (void)updateBufferedFramesAfterRender:(AVAudioFrameCount)frames sampleRate:(int)sampleRate generation:(NSUInteger)generation;
@end

typedef struct {
  __unsafe_unretained PCMPlayerModule *player;
  NSUInteger generation;
} LXPCMInterruptContext;

static int LXPCMInterruptCallback(void *opaque) {
  LXPCMInterruptContext *context = (LXPCMInterruptContext *)opaque;
  if (context == NULL || context->player == nil) return 0;
  return [context->player shouldInterruptDecodeForGeneration:context->generation] ? 1 : 0;
}

static BOOL LXPCMIsHTTPInput(NSString *input) {
  NSString *lowerInput = [input lowercaseString];
  return [lowerInput hasPrefix:@"http://"] || [lowerInput hasPrefix:@"https://"];
}

static int LXPCMSeekAudioStream(AVFormatContext *formatContext,
                                AVStream *stream,
                                int streamIndex,
                                int64_t streamStartTime,
                                double position,
                                int flags) {
  if (formatContext == NULL || stream == NULL) return AVERROR(EINVAL);
  double target = MAX(position, 0);
  int64_t seekTarget = streamStartTime + av_rescale_q((int64_t)(target * AV_TIME_BASE), AV_TIME_BASE_Q, stream->time_base);
  int64_t seekWindow = av_rescale_q(2 * AV_TIME_BASE, AV_TIME_BASE_Q, stream->time_base);
  int64_t minTarget = seekTarget > INT64_MIN + seekWindow ? seekTarget - seekWindow : INT64_MIN;
  int64_t maxTarget = seekTarget < INT64_MAX - seekWindow ? seekTarget + seekWindow : INT64_MAX;
  int result = avformat_seek_file(formatContext, streamIndex, minTarget, seekTarget, maxTarget, flags);
  if (result < 0) result = av_seek_frame(formatContext, streamIndex, seekTarget, flags);
  if (result < 0) result = av_seek_frame(formatContext, streamIndex, seekTarget, flags | AVSEEK_FLAG_ANY);
  return result;
}

@implementation PCMPlayerModule

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup {
  return YES;
}

- (instancetype)init {
  self = [super init];
  if (self != nil) {
    _decodeQueue = dispatch_queue_create("cn.toside.music.mobile.pcm.decode", DISPATCH_QUEUE_SERIAL);
    _engine = [[AVAudioEngine alloc] init];
    _timePitchNode = [[AVAudioUnitTimePitch alloc] init];
    _volumeMixerNode = [[AVAudioMixerNode alloc] init];
    _rate = 1.0;
    _volume = 1.0f;
    _outputSampleRate = 44100;
    _outputChannels = 2;
    _pcmRingCapacityFrames = 0;
    _pcmRingReadFrame = 0;
    _pcmRingWriteFrame = 0;
    _pcmRingAvailableFrames = 0;
    _pcmRingChannels = 2;
    _pcmRingSampleRate = 44100;
    [_engine attachNode:_timePitchNode];
    [_engine attachNode:_volumeMixerNode];
    [[NSNotificationCenter defaultCenter] addObserver:self
                                             selector:@selector(handleAudioSessionInterruption:)
                                                 name:AVAudioSessionInterruptionNotification
                                               object:[AVAudioSession sharedInstance]];
  }
  return self;
}

- (void)dealloc {
  [[NSNotificationCenter defaultCenter] removeObserver:self];
}

- (NSArray<NSString *> *)supportedEvents {
  return @[ LXPCMPlayerEventName ];
}

- (void)startObserving {
  self.hasListeners = YES;
}

- (void)stopObserving {
  self.hasListeners = NO;
}

- (NSDictionary *)constantsToExport {
  return @{
    @"isAvailable": @(LX_HAS_FFMPEG),
  };
}

- (double)currentPositionLocked {
  double position = self.positionBase;
  if (self.isPlaying) {
    CFTimeInterval elapsed = CACurrentMediaTime() - self.positionBaseTime;
    position += elapsed * MAX(self.rate, 0.0);
  }
  if (self.duration > 0) position = MIN(position, self.duration);
  return MAX(position, 0);
}

- (double)currentPosition {
  @synchronized (self) {
    return [self currentPositionLocked];
  }
}

- (NSDictionary *)baseEventBodyWithType:(NSString *)type {
  double position = 0;
  double duration = 0;
  NSString *trackId = @"";
  @synchronized (self) {
    position = [self currentPositionLocked];
    duration = self.duration;
    trackId = self.trackId ?: @"";
  }
  return @{
    @"type": type ?: @"state",
    @"driver": @"pcmPlayer",
    @"trackId": trackId,
    @"position": @(position),
    @"duration": @(duration),
  };
}

- (void)emitEvent:(NSDictionary *)body {
  if (!self.hasListeners || body == nil) return;
  dispatch_async(dispatch_get_main_queue(), ^{
    if (!self.hasListeners) return;
    [self sendEventWithName:LXPCMPlayerEventName body:body];
  });
}

- (void)emitState:(NSString *)state {
  NSMutableDictionary *body = [[self baseEventBodyWithType:@"state"] mutableCopy];
  body[@"state"] = state ?: @"idle";
  [self emitEvent:body];
}

- (void)emitError:(NSString *)message {
  NSMutableDictionary *body = [[self baseEventBodyWithType:@"error"] mutableCopy];
  body[@"error"] = message ?: @"PCM player error";
  [self emitEvent:body];
}

- (void)emitLog:(NSString *)level message:(NSString *)message details:(NSDictionary *)details {
  NSMutableDictionary *body = [[self baseEventBodyWithType:@"log"] mutableCopy];
  body[@"level"] = level ?: @"info";
  body[@"message"] = message ?: @"";
  if (details != nil) body[@"details"] = details;
  [self emitEvent:body];
}

- (void)emitInterruption:(NSString *)state shouldResume:(BOOL)shouldResume wasPlaying:(BOOL)wasPlaying {
  NSMutableDictionary *body = [[self baseEventBodyWithType:@"interruption"] mutableCopy];
  body[@"state"] = state ?: @"ended";
  body[@"shouldResume"] = @(shouldResume);
  body[@"wasPlaying"] = @(wasPlaying);
  [self emitEvent:body];
}

- (void)handleAudioSessionInterruption:(NSNotification *)notification {
  if (![NSThread isMainThread]) {
    dispatch_async(dispatch_get_main_queue(), ^{
      [self handleAudioSessionInterruption:notification];
    });
    return;
  }

  NSNumber *typeValue = notification.userInfo[AVAudioSessionInterruptionTypeKey];
  if (typeValue == nil) return;

  AVAudioSessionInterruptionType type = (AVAudioSessionInterruptionType)typeValue.unsignedIntegerValue;
  if (type == AVAudioSessionInterruptionTypeBegan) {
    BOOL wasPlaying = NO;
    @synchronized (self) {
      wasPlaying = self.isPlaying;
      self.wasPlayingBeforeInterruption = wasPlaying;
      if (self.isPlaying) {
        self.positionBase = [self currentPositionLocked];
        self.positionBaseTime = CACurrentMediaTime();
      }
      self.isPlaying = NO;
    }
    [self emitState:@"paused"];
    [self emitInterruption:@"began" shouldResume:NO wasPlaying:wasPlaying];
    return;
  }

  if (type == AVAudioSessionInterruptionTypeEnded) {
    AVAudioSessionInterruptionOptions options = 0;
    NSNumber *optionsValue = notification.userInfo[AVAudioSessionInterruptionOptionKey];
    if (optionsValue != nil) options = (AVAudioSessionInterruptionOptions)optionsValue.unsignedIntegerValue;

    BOOL wasPlaying = NO;
    @synchronized (self) {
      wasPlaying = self.wasPlayingBeforeInterruption;
      self.wasPlayingBeforeInterruption = NO;
    }
    BOOL shouldResume = wasPlaying && ((options & AVAudioSessionInterruptionOptionShouldResume) != 0);
    if (shouldResume) [self configureAudioSession];
    [self emitInterruption:@"ended" shouldResume:shouldResume wasPlaying:wasPlaying];
  }
}

- (void)emitEndedForGeneration:(NSUInteger)generation {
  BOOL shouldEmit = NO;
  double position = 0;
  double duration = 0;
  NSString *trackId = @"";
  @synchronized (self) {
    if (generation != self.generation || !self.isLoaded) return;
    self.isPlaying = NO;
    self.decodeEnded = YES;
    self.scheduledFrames = 0;
    self.positionBase = self.duration > 0 ? self.duration : [self currentPositionLocked];
    self.bufferedPosition = self.positionBase;
    position = self.positionBase;
    duration = self.duration;
    trackId = self.trackId ?: @"";
    shouldEmit = YES;
  }
  if (!shouldEmit) return;
  [self clearPCMBuffer];
  [self emitEvent:@{
    @"type": @"ended",
    @"driver": @"pcmPlayer",
    @"trackId": trackId,
    @"position": @(position),
    @"duration": @(duration),
    @"success": @YES,
  }];
}

- (void)configureAudioSession {
  AVAudioSession *session = [AVAudioSession sharedInstance];
  NSError *error = nil;
  [session setCategory:AVAudioSessionCategoryPlayback
           withOptions:AVAudioSessionCategoryOptionAllowBluetooth | AVAudioSessionCategoryOptionAllowAirPlay
                 error:&error];
  if (error != nil) NSLog(@"PCMPlayer audio session category failed: %@", error.localizedDescription);
  error = nil;
  [session setActive:YES error:&error];
  if (error != nil) NSLog(@"PCMPlayer audio session active failed: %@", error.localizedDescription);
}

- (BOOL)ensureEngineWithSampleRate:(double)sampleRate channels:(AVAudioChannelCount)channels error:(NSError **)error {
  if (sampleRate <= 0) sampleRate = 44100;
  if (channels == 0) channels = 2;

  BOOL needsReconnect = self.pcmFormat == nil ||
    fabs(self.pcmFormat.sampleRate - sampleRate) > 0.1 ||
    self.pcmFormat.channelCount != channels;

  if (needsReconnect) {
    if (self.engine.isRunning) [self.engine stop];
    if (self.sourceNode != nil) {
      [self.engine detachNode:self.sourceNode];
      self.sourceNode = nil;
    }
    [self.engine disconnectNodeOutput:self.timePitchNode];
    [self.engine disconnectNodeOutput:self.volumeMixerNode];
    self.pcmFormat = [[AVAudioFormat alloc] initWithCommonFormat:AVAudioPCMFormatFloat32
                                                      sampleRate:sampleRate
                                                        channels:channels
                                                     interleaved:NO];
    __weak PCMPlayerModule *weakSelf = self;
    self.sourceNode = [[AVAudioSourceNode alloc] initWithRenderBlock:^OSStatus(BOOL *isSilence,
                                                                               const AudioTimeStamp *timestamp,
                                                                               AVAudioFrameCount frameCount,
                                                                               AudioBufferList *outputData) {
      PCMPlayerModule *strongSelf = weakSelf;
      if (strongSelf == nil) {
        if (isSilence != NULL) *isSilence = YES;
        return noErr;
      }
      [strongSelf renderPCMFrames:frameCount outputData:outputData isSilence:isSilence];
      return noErr;
    }];
    [self.engine attachNode:self.sourceNode];
    [self.engine connect:self.sourceNode to:self.timePitchNode format:self.pcmFormat];
    [self.engine connect:self.timePitchNode to:self.volumeMixerNode format:self.pcmFormat];
    [self.engine connect:self.volumeMixerNode to:self.engine.mainMixerNode format:self.pcmFormat];
    [self resetPCMBufferWithSampleRate:(int)sampleRate channels:(int)channels];
  }

  self.volumeMixerNode.outputVolume = self.volume;
  self.timePitchNode.rate = self.rate;
  if (!self.engine.isRunning && ![self.engine startAndReturnError:error]) return NO;
  return YES;
}

- (NSString *)ensureEngineErrorMessageWithSampleRate:(double)sampleRate channels:(AVAudioChannelCount)channels {
  __block NSString *errorMessage = nil;
  void (^ensureEngine)(void) = ^{
    NSError *engineError = nil;
    if (![self ensureEngineWithSampleRate:sampleRate channels:channels error:&engineError]) {
      errorMessage = engineError.localizedDescription ?: @"Failed to start PCM output engine";
    }
  };

  if ([NSThread isMainThread]) {
    ensureEngine();
  } else {
    dispatch_sync(dispatch_get_main_queue(), ensureEngine);
  }
  return errorMessage;
}

- (void)resetPCMBufferWithSampleRate:(int)sampleRate channels:(int)channels {
  if (sampleRate <= 0) sampleRate = 44100;
  if (channels <= 0) channels = 2;
  size_t capacityFrames = (size_t)sampleRate * 12;
  std::lock_guard<std::mutex> lock(_pcmRingMutex);
  _pcmRingSampleRate = sampleRate;
  _pcmRingChannels = (size_t)channels;
  _pcmRingCapacityFrames = capacityFrames;
  _pcmRingBuffer.assign(capacityFrames * (size_t)channels, 0.0f);
  _pcmRingReadFrame = 0;
  _pcmRingWriteFrame = 0;
  _pcmRingAvailableFrames = 0;
}

- (void)clearPCMBuffer {
  std::lock_guard<std::mutex> lock(_pcmRingMutex);
  _pcmRingReadFrame = 0;
  _pcmRingWriteFrame = 0;
  _pcmRingAvailableFrames = 0;
}

- (size_t)availablePCMFrames {
  std::lock_guard<std::mutex> lock(_pcmRingMutex);
  return _pcmRingAvailableFrames;
}

- (BOOL)appendPCMFrames:(uint8_t **)convertedData samples:(int)samples sampleOffset:(int)sampleOffset channels:(int)channels {
  if (convertedData == NULL || samples <= 0 || sampleOffset < 0 || channels <= 0) return YES;
  std::lock_guard<std::mutex> lock(_pcmRingMutex);
  if (_pcmRingCapacityFrames == 0 || _pcmRingChannels != (size_t)channels) return NO;
  size_t framesToWrite = (size_t)samples;
  size_t freeFrames = _pcmRingCapacityFrames - _pcmRingAvailableFrames;
  if (framesToWrite > freeFrames) return NO;
  for (size_t frame = 0; frame < framesToWrite; frame += 1) {
    size_t targetFrame = (_pcmRingWriteFrame + frame) % _pcmRingCapacityFrames;
    size_t targetOffset = targetFrame * _pcmRingChannels;
    for (int channel = 0; channel < channels; channel += 1) {
      const float *sourceSamples = ((const float *)convertedData[channel]) + sampleOffset;
      _pcmRingBuffer[targetOffset + (size_t)channel] = sourceSamples[frame];
    }
  }
  _pcmRingWriteFrame = (_pcmRingWriteFrame + framesToWrite) % _pcmRingCapacityFrames;
  _pcmRingAvailableFrames += framesToWrite;
  return YES;
}

- (void)renderPCMFrames:(AVAudioFrameCount)frameCount outputData:(AudioBufferList *)outputData isSilence:(BOOL *)isSilence {
  if (outputData == NULL) return;
  for (UInt32 bufferIndex = 0; bufferIndex < outputData->mNumberBuffers; bufferIndex += 1) {
    AudioBuffer *buffer = &outputData->mBuffers[bufferIndex];
    if (buffer->mData != NULL) memset(buffer->mData, 0, buffer->mDataByteSize);
  }

  NSUInteger generation = 0;
  BOOL shouldRender = NO;
  int sampleRate = 44100;
  @synchronized (self) {
    generation = self.generation;
    shouldRender = self.isPlaying && self.isLoaded;
    sampleRate = self.outputSampleRate;
  }
  if (!shouldRender) {
    if (isSilence != NULL) *isSilence = YES;
    return;
  }

  size_t framesRead = 0;
  {
    std::lock_guard<std::mutex> lock(_pcmRingMutex);
    size_t framesToRead = MIN((size_t)frameCount, _pcmRingAvailableFrames);
    size_t outputBuffers = (size_t)outputData->mNumberBuffers;
    for (size_t frame = 0; frame < framesToRead; frame += 1) {
      size_t sourceFrame = (_pcmRingReadFrame + frame) % _pcmRingCapacityFrames;
      size_t sourceOffset = sourceFrame * _pcmRingChannels;
      for (size_t channel = 0; channel < outputBuffers; channel += 1) {
        AudioBuffer *buffer = &outputData->mBuffers[channel];
        if (buffer->mData == NULL) continue;
        float *target = (float *)buffer->mData;
        size_t sourceChannel = MIN(channel, _pcmRingChannels - 1);
        target[frame] = _pcmRingBuffer[sourceOffset + sourceChannel];
      }
    }
    _pcmRingReadFrame = (_pcmRingReadFrame + framesToRead) % MAX(_pcmRingCapacityFrames, (size_t)1);
    _pcmRingAvailableFrames -= framesToRead;
    framesRead = framesToRead;
  }

  if (isSilence != NULL) *isSilence = framesRead == 0;
  if (framesRead > 0) [self updateBufferedFramesAfterRender:(AVAudioFrameCount)framesRead sampleRate:sampleRate generation:generation];
  BOOL shouldEmitEnded = NO;
  @synchronized (self) {
    if (generation == self.generation && self.decodeEnded && self.scheduledFrames <= 0 && !self.hasQueuedEndedEvent) {
      self.hasQueuedEndedEvent = YES;
      shouldEmitEnded = YES;
    }
  }
  if (shouldEmitEnded) {
    dispatch_async(dispatch_get_main_queue(), ^{
      [self emitEndedForGeneration:generation];
    });
  }
}

- (void)resetPlaybackStateForTrack:(NSString *)trackId source:(NSString *)source userAgent:(NSString *)userAgent position:(double)position generation:(NSUInteger *)generation {
  @synchronized (self) {
    self.generation += 1;
    if (generation != NULL) *generation = self.generation;
    self.trackId = trackId ?: @"";
    self.source = source ?: @"";
    self.userAgent = userAgent ?: @"";
    self.isPlaying = NO;
    self.isLoaded = NO;
    self.isDecoding = NO;
    self.decodeEnded = NO;
    self.hasQueuedEndedEvent = NO;
    self.hasPendingSeek = NO;
    self.isApplyingSeek = NO;
    self.pendingSeekPosition = 0;
    self.pendingSeekId = 0;
    self.pendingSeekRequestedAt = 0;
    self.hasSeekReadyLog = NO;
    self.seekReadyLogId = 0;
    self.seekReadyLogRequestedAt = 0;
    self.seekReadyLogPosition = 0;
    self.duration = 0;
    self.positionBase = MAX(position, 0);
    self.positionBaseTime = CACurrentMediaTime();
    self.bufferedPosition = MAX(position, 0);
    self.scheduledFrames = 0;
  }
  [self clearPCMBuffer];
}

- (void)invalidatePlayback {
  @synchronized (self) {
    self.generation += 1;
    self.trackId = @"";
    self.source = @"";
    self.userAgent = @"";
    self.isPlaying = NO;
    self.isLoaded = NO;
    self.isDecoding = NO;
    self.decodeEnded = YES;
    self.hasQueuedEndedEvent = NO;
    self.hasPendingSeek = NO;
    self.isApplyingSeek = NO;
    self.pendingSeekPosition = 0;
    self.pendingSeekId = 0;
    self.pendingSeekRequestedAt = 0;
    self.hasSeekReadyLog = NO;
    self.seekReadyLogId = 0;
    self.seekReadyLogRequestedAt = 0;
    self.seekReadyLogPosition = 0;
    self.duration = 0;
    self.positionBase = 0;
    self.positionBaseTime = CACurrentMediaTime();
    self.bufferedPosition = 0;
    self.scheduledFrames = 0;
  }
  [self clearPCMBuffer];
}

- (BOOL)isGenerationActive:(NSUInteger)generation {
  @synchronized (self) {
    return generation == self.generation;
  }
}

- (BOOL)shouldInterruptDecodeForGeneration:(NSUInteger)generation {
  @synchronized (self) {
    return generation != self.generation || self.hasPendingSeek;
  }
}

- (BOOL)consumePendingSeekForGeneration:(NSUInteger)generation position:(double *)position seekId:(NSUInteger *)seekId requestedAt:(CFTimeInterval *)requestedAt {
  @synchronized (self) {
    if (generation != self.generation || !self.hasPendingSeek) return NO;
    if (position != NULL) *position = self.pendingSeekPosition;
    if (seekId != NULL) *seekId = self.pendingSeekId;
    if (requestedAt != NULL) *requestedAt = self.pendingSeekRequestedAt;
    self.hasPendingSeek = NO;
    return YES;
  }
}

- (void)clearPCMOutputSynchronously {
  [self clearPCMBuffer];
}

- (BOOL)shouldThrottleDecodeForGeneration:(NSUInteger)generation sampleRate:(int)sampleRate {
  @synchronized (self) {
    if (generation != self.generation) return NO;
    if (self.hasPendingSeek) return NO;
    int64_t maxAheadFrames = (int64_t)sampleRate * 4;
    self.scheduledFrames = (int64_t)[self availablePCMFrames];
    return self.scheduledFrames > maxAheadFrames;
  }
}

- (void)markLoadedForGeneration:(NSUInteger)generation duration:(double)duration sampleRate:(int)sampleRate channels:(int)channels {
  @synchronized (self) {
    if (generation != self.generation) return;
    self.isLoaded = YES;
    self.duration = MAX(duration, 0);
    self.outputSampleRate = sampleRate;
    self.outputChannels = channels;
  }
}

- (void)markDecodedFrames:(AVAudioFrameCount)frames sampleRate:(int)sampleRate generation:(NSUInteger)generation {
  @synchronized (self) {
    if (generation != self.generation) return;
    double currentPosition = [self currentPositionLocked];
    self.positionBase = currentPosition;
    self.positionBaseTime = CACurrentMediaTime();
    self.scheduledFrames = (int64_t)[self availablePCMFrames];
    double nextBuffered = self.positionBase + ((double)self.scheduledFrames / MAX(sampleRate, 1));
    self.bufferedPosition = self.duration > 0 ? MIN(MAX(self.bufferedPosition, nextBuffered), self.duration) : MAX(self.bufferedPosition, nextBuffered);
  }
}

- (void)markSeekAudioReadyIfNeededForGeneration:(NSUInteger)generation {
  BOOL shouldLog = NO;
  NSUInteger seekId = 0;
  double position = 0;
  CFTimeInterval requestedAt = 0;
  @synchronized (self) {
    if (generation != self.generation || !self.hasSeekReadyLog) return;
    self.hasSeekReadyLog = NO;
    shouldLog = YES;
    seekId = self.seekReadyLogId;
    position = self.seekReadyLogPosition;
    requestedAt = self.seekReadyLogRequestedAt;
  }
  if (!shouldLog || requestedAt <= 0) return;
  double elapsedMs = (CACurrentMediaTime() - requestedAt) * 1000;
  if (elapsedMs <= 1000) return;
  [self emitLog:@"warn" message:@"pcm seek audio ready slow" details:@{
    @"seekId": @(seekId),
    @"position": @(position),
    @"elapsedMs": @((NSInteger)round(elapsedMs)),
  }];
}

- (void)updateBufferedFramesAfterRender:(AVAudioFrameCount)frames sampleRate:(int)sampleRate generation:(NSUInteger)generation {
  @synchronized (self) {
    if (generation != self.generation) return;
    self.scheduledFrames = (int64_t)[self availablePCMFrames];
  }
}

#if LX_HAS_FFMPEG
- (BOOL)scheduleConvertedAudio:(uint8_t **)convertedData
                       samples:(int)samples
                  sampleOffset:(int)sampleOffset
                    sampleRate:(int)sampleRate
                      channels:(int)channels
                    generation:(NSUInteger)generation {
  if (samples <= 0 || channels <= 0) return YES;
  if (sampleOffset < 0) return NO;
  if (![self isGenerationActive:generation]) return NO;

  AVAudioFormat *format = self.pcmFormat;
  if (format == nil || format.channelCount != channels || fabs(format.sampleRate - sampleRate) > 0.1) return NO;

  while ([self isGenerationActive:generation]) {
    if ([self appendPCMFrames:convertedData samples:samples sampleOffset:sampleOffset channels:channels]) {
      [self markDecodedFrames:(AVAudioFrameCount)samples sampleRate:sampleRate generation:generation];
      return YES;
    }
    if ([self shouldInterruptDecodeForGeneration:generation]) return NO;
    [NSThread sleepForTimeInterval:0.01];
  }
  return NO;
}

- (void)decodeSource:(NSString *)source
             trackId:(NSString *)trackId
          userAgent:(NSString *)userAgent
            position:(double)position
          generation:(NSUInteger)generation
             resolve:(RCTPromiseResolveBlock)resolve
              reject:(RCTPromiseRejectBlock)reject {
  AVFormatContext *formatContext = NULL;
  AVCodecContext *codecContext = NULL;
  SwrContext *swrContext = NULL;
  AVPacket *packet = NULL;
  AVFrame *frame = NULL;
  uint8_t **convertedData = NULL;
  AVDictionary *options = NULL;
  AVChannelLayout sourceLayout;
  AVChannelLayout outputLayout;
  memset(&sourceLayout, 0, sizeof(sourceLayout));
  memset(&outputLayout, 0, sizeof(outputLayout));
  __block BOOL promiseSettled = NO;
  BOOL emittedTrackChanged = NO;
  BOOL inputEnded = NO;
  BOOL needsStateAfterSeek = NO;
  int streamIndex = -1;
  int result = 0;
  AVStream *stream = NULL;
  const AVCodec *codec = NULL;
  int sampleRate = 44100;
  int sourceChannels = 2;
  int outputChannels = 2;
  int64_t streamStartTime = 0;
  double duration = 0;
  NSString *engineErrorMessage = nil;
  BOOL shouldTrimDecodedAudio = position > 0;
  BOOL (^seekDecodeContext)(double, NSUInteger, CFTimeInterval) = nil;
  LXPCMInterruptContext interruptContext = { self, generation };

  @synchronized (self) {
    if (generation == self.generation) self.isDecoding = YES;
  }

  void (^finishReject)(NSString *, NSString *) = ^(NSString *code, NSString *message) {
    if (promiseSettled) {
      [self emitError:message];
      return;
    }
    promiseSettled = YES;
    reject(code ?: @"pcm_decode_error", message ?: @"PCM decode failed", LXPCMError(code, message));
  };

  void (^finishResolve)(void) = ^{
    if (promiseSettled) return;
    promiseSettled = YES;
    resolve(@{
      @"trackId": trackId ?: @"",
      @"duration": @(self.duration),
    });
  };

  avformat_network_init();

  NSString *input = source ?: @"";
  if ([input hasPrefix:@"file://"]) {
    NSURL *fileURL = [NSURL URLWithString:input];
    if (fileURL.path.length) input = fileURL.path;
  }
  BOOL isHTTPInput = LXPCMIsHTTPInput(input);

  formatContext = avformat_alloc_context();
  if (formatContext == NULL) {
    finishReject(@"format_context_failed", @"Failed to create FFmpeg format context");
    goto cleanup;
  }
  formatContext->interrupt_callback.callback = LXPCMInterruptCallback;
  formatContext->interrupt_callback.opaque = &interruptContext;

  if (userAgent.length) av_dict_set(&options, "user_agent", userAgent.UTF8String, 0);
  av_dict_set(&options, "reconnect", "1", 0);
  av_dict_set(&options, "reconnect_streamed", "1", 0);
  av_dict_set(&options, "reconnect_delay_max", "5", 0);
  av_dict_set(&options, "rw_timeout", "15000000", 0);
  if (isHTTPInput) {
    av_dict_set(&options, "multiple_requests", "1", 0);
    av_dict_set(&options, "seekable", "1", 0);
    av_dict_set(&options, "short_seek_size", "1048576", 0);
  }

  result = avformat_open_input(&formatContext, input.UTF8String, NULL, &options);
  av_dict_free(&options);
  if (result < 0 || formatContext == NULL) {
    finishReject(@"open_source_failed", @"FFmpeg failed to open audio source");
    goto cleanup;
  }

  result = avformat_find_stream_info(formatContext, NULL);
  if (result < 0) {
    finishReject(@"read_stream_failed", @"FFmpeg failed to read stream info");
    goto cleanup;
  }

  streamIndex = av_find_best_stream(formatContext, AVMEDIA_TYPE_AUDIO, -1, -1, NULL, 0);
  if (streamIndex < 0) {
    finishReject(@"audio_stream_not_found", @"No audio stream found");
    goto cleanup;
  }

  stream = formatContext->streams[streamIndex];
  codec = avcodec_find_decoder(stream->codecpar->codec_id);
  if (codec == NULL) {
    finishReject(@"decoder_not_found", @"No FFmpeg decoder found for audio stream");
    goto cleanup;
  }

  codecContext = avcodec_alloc_context3(codec);
  if (codecContext == NULL || avcodec_parameters_to_context(codecContext, stream->codecpar) < 0) {
    finishReject(@"decoder_context_failed", @"Failed to create FFmpeg decoder context");
    goto cleanup;
  }

  if (avcodec_open2(codecContext, codec, NULL) < 0) {
    finishReject(@"decoder_open_failed", @"Failed to open FFmpeg decoder");
    goto cleanup;
  }

  sampleRate = codecContext->sample_rate > 0 ? codecContext->sample_rate : 44100;
  sourceChannels = codecContext->ch_layout.nb_channels > 0 ? codecContext->ch_layout.nb_channels : 2;
  outputChannels = MIN(MAX(sourceChannels, 1), 2);
  if (codecContext->ch_layout.nb_channels > 0 && av_channel_layout_check(&codecContext->ch_layout)) {
    av_channel_layout_copy(&sourceLayout, &codecContext->ch_layout);
  } else {
    av_channel_layout_default(&sourceLayout, sourceChannels);
  }
  av_channel_layout_default(&outputLayout, outputChannels);
  streamStartTime = stream->start_time != AV_NOPTS_VALUE ? stream->start_time : 0;
  if (formatContext->duration > 0) duration = (double)formatContext->duration / AV_TIME_BASE;
  else if (stream->duration > 0) duration = (double)stream->duration * av_q2d(stream->time_base);

  result = swr_alloc_set_opts2(&swrContext,
                               &outputLayout,
                               AV_SAMPLE_FMT_FLTP,
                               sampleRate,
                               &sourceLayout,
                               codecContext->sample_fmt,
                               sampleRate,
                               0,
                               NULL);
  if (result < 0 || swrContext == NULL || swr_init(swrContext) < 0) {
    finishReject(@"resampler_failed", @"Failed to initialize FFmpeg resampler");
    goto cleanup;
  }

  engineErrorMessage = [self ensureEngineErrorMessageWithSampleRate:sampleRate channels:(AVAudioChannelCount)outputChannels];
  if (engineErrorMessage.length) {
    finishReject(@"engine_start_failed", engineErrorMessage);
    goto cleanup;
  }

  [self markLoadedForGeneration:generation duration:duration sampleRate:sampleRate channels:outputChannels];
  if (position > 0) {
    if (LXPCMSeekAudioStream(formatContext, stream, streamIndex, streamStartTime, position, AVSEEK_FLAG_BACKWARD) >= 0) {
      avcodec_flush_buffers(codecContext);
    }
  }

  packet = av_packet_alloc();
  frame = av_frame_alloc();
  if (packet == NULL || frame == NULL) {
    finishReject(@"decode_alloc_failed", @"Failed to allocate FFmpeg decode buffers");
    goto cleanup;
  }

  [self emitState:@"buffering"];

  seekDecodeContext = ^BOOL(double seekPosition, NSUInteger seekId, CFTimeInterval requestedAt) {
    double target = MAX(seekPosition, 0);
    CFTimeInterval seekStartedAt = CACurrentMediaTime();
    @synchronized (self) {
      if (generation == self.generation) self.isApplyingSeek = YES;
    }
    int seekResult = LXPCMSeekAudioStream(formatContext, stream, streamIndex, streamStartTime, target, AVSEEK_FLAG_BACKWARD);
    BOOL wasSuperseded = NO;
    @synchronized (self) {
      if (generation == self.generation) {
        self.isApplyingSeek = NO;
        wasSuperseded = self.hasPendingSeek && self.pendingSeekId != seekId;
      }
    }
    double seekElapsedMs = (CACurrentMediaTime() - seekStartedAt) * 1000;
    if (seekResult < 0) {
      if (wasSuperseded) {
        return YES;
      }
      [self emitLog:@"error" message:@"pcm seek failed" details:@{
        @"seekId": @(seekId),
        @"position": @(target),
        @"result": @(seekResult),
        @"elapsedMs": @((NSInteger)round(seekElapsedMs)),
      }];
      return NO;
    }
    if (wasSuperseded) return YES;
    if (seekElapsedMs > 800) {
      [self emitLog:@"warn" message:@"pcm seek slow" details:@{
        @"seekId": @(seekId),
        @"position": @(target),
        @"elapsedMs": @((NSInteger)round(seekElapsedMs)),
      }];
    }
    avcodec_flush_buffers(codecContext);
    if (swrContext != NULL) {
      swr_close(swrContext);
      if (swr_init(swrContext) < 0) return NO;
    }
    av_packet_unref(packet);
    av_frame_unref(frame);
    [self clearPCMOutputSynchronously];
    @synchronized (self) {
      if (generation != self.generation) return NO;
      self.decodeEnded = NO;
      self.hasQueuedEndedEvent = NO;
      self.positionBase = target;
      self.positionBaseTime = CACurrentMediaTime();
      self.bufferedPosition = target;
      self.scheduledFrames = 0;
      self.hasSeekReadyLog = requestedAt > 0 && !wasSuperseded;
      self.seekReadyLogId = seekId;
      self.seekReadyLogRequestedAt = requestedAt;
      self.seekReadyLogPosition = target;
    }
    return YES;
  };

  while ([self isGenerationActive:generation]) {
    double pendingSeekPosition = 0;
    NSUInteger pendingSeekId = 0;
    CFTimeInterval pendingSeekRequestedAt = 0;
    if ([self consumePendingSeekForGeneration:generation position:&pendingSeekPosition seekId:&pendingSeekId requestedAt:&pendingSeekRequestedAt]) {
      inputEnded = NO;
      position = pendingSeekPosition;
      shouldTrimDecodedAudio = position > 0;
      if (!seekDecodeContext(position, pendingSeekId, pendingSeekRequestedAt)) {
        if (![self isGenerationActive:generation]) goto cleanup;
        finishReject(@"seek_failed", @"FFmpeg failed to seek audio stream");
        goto cleanup;
      }
      needsStateAfterSeek = emittedTrackChanged;
      continue;
    }

    while ([self shouldThrottleDecodeForGeneration:generation sampleRate:sampleRate]) {
      [NSThread sleepForTimeInterval:0.02];
      if (![self isGenerationActive:generation]) goto cleanup;
    }

    result = av_read_frame(formatContext, packet);
    if (![self isGenerationActive:generation]) goto cleanup;
    if ([self consumePendingSeekForGeneration:generation position:&pendingSeekPosition seekId:&pendingSeekId requestedAt:&pendingSeekRequestedAt]) {
      inputEnded = NO;
      position = pendingSeekPosition;
      shouldTrimDecodedAudio = position > 0;
      if (!seekDecodeContext(position, pendingSeekId, pendingSeekRequestedAt)) {
        if (![self isGenerationActive:generation]) goto cleanup;
        finishReject(@"seek_failed", @"FFmpeg failed to seek audio stream");
        goto cleanup;
      }
      needsStateAfterSeek = emittedTrackChanged;
      continue;
    }
    if (result < 0) {
      inputEnded = YES;
      avcodec_send_packet(codecContext, NULL);
    } else if (packet->stream_index == streamIndex) {
      result = avcodec_send_packet(codecContext, packet);
    }
    av_packet_unref(packet);

    if (result < 0 && result != AVERROR_EOF) {
      finishReject(@"decode_packet_failed", @"FFmpeg failed to decode audio packet");
      goto cleanup;
    }

    while ([self isGenerationActive:generation]) {
      if ([self consumePendingSeekForGeneration:generation position:&pendingSeekPosition seekId:&pendingSeekId requestedAt:&pendingSeekRequestedAt]) {
        inputEnded = NO;
        position = pendingSeekPosition;
        shouldTrimDecodedAudio = position > 0;
        if (!seekDecodeContext(position, pendingSeekId, pendingSeekRequestedAt)) {
          if (![self isGenerationActive:generation]) goto cleanup;
          finishReject(@"seek_failed", @"FFmpeg failed to seek audio stream");
          goto cleanup;
        }
        needsStateAfterSeek = emittedTrackChanged;
        break;
      }

      result = avcodec_receive_frame(codecContext, frame);
      if (result == AVERROR(EAGAIN) || result == AVERROR_EOF) break;
      if (result < 0) {
        finishReject(@"decode_frame_failed", @"FFmpeg failed to decode audio frame");
        goto cleanup;
      }

      int destinationSamples = (int)av_rescale_rnd(swr_get_delay(swrContext, sampleRate) + frame->nb_samples, sampleRate, sampleRate, AV_ROUND_UP);
      if (destinationSamples <= 0) {
        av_frame_unref(frame);
        continue;
      }

      if (convertedData != NULL) {
        av_freep(&convertedData[0]);
        av_freep(&convertedData);
      }
      if (av_samples_alloc_array_and_samples(&convertedData, NULL, outputChannels, destinationSamples, AV_SAMPLE_FMT_FLTP, 0) < 0) {
        finishReject(@"resample_alloc_failed", @"Failed to allocate PCM conversion buffer");
        goto cleanup;
      }

      int64_t frameTimestamp = frame->best_effort_timestamp != AV_NOPTS_VALUE ? frame->best_effort_timestamp : frame->pts;
      BOOL hasFramePosition = frameTimestamp != AV_NOPTS_VALUE;
      double framePosition = 0;
      if (hasFramePosition) {
        framePosition = (double)(frameTimestamp - streamStartTime) * av_q2d(stream->time_base);
      }

      int convertedSamples = swr_convert(swrContext, convertedData, destinationSamples, (const uint8_t **)frame->extended_data, frame->nb_samples);
      av_frame_unref(frame);
      if (convertedSamples < 0) {
        finishReject(@"resample_failed", @"FFmpeg failed to convert decoded audio to PCM");
        goto cleanup;
      }

      int sampleOffset = 0;
      int samplesToSchedule = convertedSamples;
      if (shouldTrimDecodedAudio) {
        if (hasFramePosition) {
          double trimSeconds = position - framePosition;
          if (trimSeconds > 0) {
            int trimSamples = (int)(trimSeconds * sampleRate + 0.5);
            if (trimSamples >= convertedSamples) {
              continue;
            }
            if (trimSamples > 0) {
              sampleOffset = trimSamples;
              samplesToSchedule = convertedSamples - trimSamples;
            }
          }
        }
        shouldTrimDecodedAudio = NO;
      }

      if (![self scheduleConvertedAudio:convertedData samples:samplesToSchedule sampleOffset:sampleOffset sampleRate:sampleRate channels:outputChannels generation:generation]) {
        goto cleanup;
      }
      [self markSeekAudioReadyIfNeededForGeneration:generation];

      if (needsStateAfterSeek) {
        needsStateAfterSeek = NO;
        [self emitState:self.isPlaying ? @"playing" : @"paused"];
      }

      if (!emittedTrackChanged) {
        emittedTrackChanged = YES;
        [self emitEvent:@{
          @"type": @"trackChanged",
          @"driver": @"pcmPlayer",
          @"trackId": trackId ?: @"",
          @"info": @{ @"track": trackId ?: @"" },
          @"position": @(position),
          @"duration": @(duration),
        }];
        [self emitState:self.isPlaying ? @"playing" : @"paused"];
        finishResolve();
      }
    }

    if (inputEnded) break;
  }

  if ([self isGenerationActive:generation]) {
    BOOL shouldEnd = NO;
    @synchronized (self) {
      if (generation == self.generation) {
        self.decodeEnded = YES;
        self.scheduledFrames = (int64_t)[self availablePCMFrames];
        shouldEnd = self.scheduledFrames <= 0;
      }
    }
    if (!promiseSettled && emittedTrackChanged) finishResolve();
    if (!promiseSettled) finishReject(@"decode_empty", @"No audio frame decoded");
    if (shouldEnd) [self emitEndedForGeneration:generation];
  }

cleanup:
  @synchronized (self) {
    if (generation == self.generation) {
      self.isDecoding = NO;
      self.isApplyingSeek = NO;
    }
  }
  if (!promiseSettled) {
    if ([self isGenerationActive:generation]) {
      finishReject(@"decode_interrupted", @"PCM decoding stopped before audio became ready");
    } else {
      promiseSettled = YES;
      resolve(@{
        @"trackId": trackId ?: @"",
        @"duration": @(duration),
        @"cancelled": @YES,
      });
    }
  }
  if (convertedData != NULL) {
    av_freep(&convertedData[0]);
    av_freep(&convertedData);
  }
  if (frame != NULL) av_frame_free(&frame);
  if (packet != NULL) av_packet_free(&packet);
  if (swrContext != NULL) swr_free(&swrContext);
  if (codecContext != NULL) avcodec_free_context(&codecContext);
  if (formatContext != NULL) avformat_close_input(&formatContext);
  av_channel_layout_uninit(&sourceLayout);
  av_channel_layout_uninit(&outputLayout);
}
#endif

RCT_REMAP_METHOD(setup, setup:(NSDictionary *)config resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  if (!LX_HAS_FFMPEG) {
    reject(@"ffmpeg_unavailable", @"FFmpeg headers/libraries are unavailable", LXPCMError(@"ffmpeg_unavailable", @"FFmpeg headers/libraries are unavailable"));
    return;
  }

  dispatch_async(dispatch_get_main_queue(), ^{
    [self configureAudioSession];
    NSError *error = nil;
    [self ensureEngineWithSampleRate:self.outputSampleRate channels:(AVAudioChannelCount)self.outputChannels error:&error];
    if (error != nil) {
      reject(@"setup_failed", error.localizedDescription ?: @"Failed to setup PCM player", error);
      return;
    }
    resolve(nil);
  });
}

RCT_REMAP_METHOD(load, load:(NSDictionary *)sourceInfo resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
#if LX_HAS_FFMPEG
  NSString *source = [RCTConvert NSString:sourceInfo[@"url"]];
  NSString *trackId = [RCTConvert NSString:sourceInfo[@"trackId"]];
  NSString *userAgent = [RCTConvert NSString:sourceInfo[@"userAgent"]];
  double position = [RCTConvert double:sourceInfo[@"position"]];
  if (!source.length) {
    reject(@"source_empty", @"Missing audio source", LXPCMError(@"source_empty", @"Missing audio source"));
    return;
  }

  NSUInteger generation = 0;
  [self resetPlaybackStateForTrack:trackId source:source userAgent:userAgent position:position generation:&generation];
  [self emitState:@"loading"];
  dispatch_async(self.decodeQueue, ^{
    [self decodeSource:source trackId:trackId userAgent:userAgent position:position generation:generation resolve:resolve reject:reject];
  });
#else
  reject(@"ffmpeg_unavailable", @"FFmpeg headers/libraries are unavailable", LXPCMError(@"ffmpeg_unavailable", @"FFmpeg headers/libraries are unavailable"));
#endif
}

RCT_REMAP_METHOD(play, playWithResolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  dispatch_async(dispatch_get_main_queue(), ^{
    NSError *error = nil;
    [self configureAudioSession];
    if (![self ensureEngineWithSampleRate:self.outputSampleRate channels:(AVAudioChannelCount)self.outputChannels error:&error]) {
      reject(@"play_failed", error.localizedDescription ?: @"Failed to start PCM player", error);
      return;
    }
    @synchronized (self) {
      if (!self.isPlaying) {
        self.positionBase = [self currentPositionLocked];
        self.positionBaseTime = CACurrentMediaTime();
        self.isPlaying = YES;
      }
    }
    [self emitState:@"playing"];
    resolve(nil);
  });
}

RCT_REMAP_METHOD(pause, pauseWithResolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  dispatch_async(dispatch_get_main_queue(), ^{
    @synchronized (self) {
      if (self.isPlaying) {
        self.positionBase = [self currentPositionLocked];
        self.positionBaseTime = CACurrentMediaTime();
      }
      self.isPlaying = NO;
    }
    [self emitState:@"paused"];
    resolve(nil);
  });
}

RCT_REMAP_METHOD(stop, stopWithResolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  dispatch_async(dispatch_get_main_queue(), ^{
    [self invalidatePlayback];
    [self emitState:@"stopped"];
    resolve(nil);
  });
}

RCT_REMAP_METHOD(destroy, destroyWithResolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  dispatch_async(dispatch_get_main_queue(), ^{
    [self invalidatePlayback];
    [self.engine stop];
    resolve(nil);
  });
}

RCT_REMAP_METHOD(seekTo, seekTo:(double)position resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
#if LX_HAS_FFMPEG
  NSString *source = @"";
  NSString *trackId = @"";
  NSString *userAgent = @"";
  BOOL shouldResume = NO;
  BOOL canSeekInPlace = NO;
  NSUInteger generation = 0;
  @synchronized (self) {
    source = self.source ?: @"";
    trackId = self.trackId ?: @"";
    userAgent = self.userAgent ?: @"";
    shouldResume = self.isPlaying;
    generation = self.generation;
    canSeekInPlace = self.isDecoding && self.isLoaded;
  }
  if (!source.length) {
    resolve(@0);
    return;
  }

  double target = MAX(position, 0);
  if (canSeekInPlace) {
    BOOL didQueueSeek = NO;
    BOOL shouldIgnoreSeek = NO;
    double duration = 0;
    @synchronized (self) {
      if (generation != self.generation) {
        shouldIgnoreSeek = YES;
      } else if (self.isDecoding && self.isLoaded) {
        didQueueSeek = YES;
        self.hasPendingSeek = YES;
        self.pendingSeekId += 1;
        self.pendingSeekPosition = target;
        self.pendingSeekRequestedAt = CACurrentMediaTime();
        self.decodeEnded = NO;
        self.hasQueuedEndedEvent = NO;
        self.positionBase = target;
        self.positionBaseTime = CACurrentMediaTime();
        self.bufferedPosition = target;
        self.scheduledFrames = 0;
        duration = self.duration;
        if (shouldResume) self.isPlaying = YES;
      }
    }
    if (shouldIgnoreSeek) {
      resolve(@(target));
      return;
    }
    if (didQueueSeek) {
      [self clearPCMOutputSynchronously];
      [self emitEvent:@{
        @"type": @"seek",
        @"driver": @"pcmPlayer",
        @"trackId": trackId ?: @"",
        @"position": @(target),
        @"duration": @(duration),
      }];
      if (!shouldResume) [self emitState:@"paused"];
      resolve(@(target));
      return;
    }
  }

  [self resetPlaybackStateForTrack:trackId source:source userAgent:userAgent position:target generation:&generation];
  if (shouldResume) {
    @synchronized (self) {
      self.isPlaying = YES;
      self.positionBaseTime = CACurrentMediaTime();
    }
  }
  [self emitEvent:@{
    @"type": @"seek",
    @"driver": @"pcmPlayer",
    @"trackId": trackId ?: @"",
    @"position": @(target),
    @"duration": @(self.duration),
  }];
  [self emitState:shouldResume ? @"buffering" : @"paused"];

  dispatch_async(self.decodeQueue, ^{
    [self decodeSource:source trackId:trackId userAgent:userAgent position:target generation:generation resolve:^(id result) {
      resolve(@(target));
    } reject:reject];
  });
#else
  resolve(@0);
#endif
}

RCT_REMAP_METHOD(getPosition, getPositionWithResolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  resolve(@([self currentPosition]));
}

RCT_REMAP_METHOD(getDuration, getDurationWithResolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  @synchronized (self) {
    resolve(@(self.duration));
  }
}

RCT_REMAP_METHOD(getBufferedPosition, getBufferedPositionWithResolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  @synchronized (self) {
    resolve(@(self.bufferedPosition));
  }
}

RCT_REMAP_METHOD(getState, getStateWithResolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  @synchronized (self) {
    if (self.isPlaying) resolve(@"playing");
    else if (self.isLoaded) resolve(@"paused");
    else resolve(@"idle");
  }
}

RCT_REMAP_METHOD(setVolume, setVolume:(double)volume resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  dispatch_async(dispatch_get_main_queue(), ^{
    self.volume = (float)LXPCMClampDouble(volume, 0, 1);
    self.volumeMixerNode.outputVolume = self.volume;
    resolve(nil);
  });
}

RCT_REMAP_METHOD(setRate, setRate:(double)rate resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  dispatch_async(dispatch_get_main_queue(), ^{
    @synchronized (self) {
      if (self.isPlaying) {
        self.positionBase = [self currentPositionLocked];
        self.positionBaseTime = CACurrentMediaTime();
      }
      self.rate = LXPCMClampDouble(rate, 0.5, 2.0);
      self.timePitchNode.rate = self.rate;
    }
    resolve(nil);
  });
}

@end
