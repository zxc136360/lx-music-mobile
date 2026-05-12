import TrackPlayer, { State } from 'react-native-track-player'
import { UnifiedPlayerEventBus } from './EventBus'
import { createTrackPlayerDriver } from './drivers/trackPlayerDriver'
import type { UnifiedPlaybackState, UnifiedPlayerEvent } from './types'

const bus = new UnifiedPlayerEventBus()

const shouldIgnoreTrackPlayerLifecycle = () => {
  return global.lx.playerStatus.ignoreTrackPlayerLifecycle
}

const trackPlayerDriver = createTrackPlayerDriver(bus, shouldIgnoreTrackPlayerLifecycle)

let isInitialized = false

export const initUnifiedPlayerEngine = () => {
  if (isInitialized) return
  trackPlayerDriver.init()
  isInitialized = true
}

export const onUnifiedPlayerEvent = (listener: (event: UnifiedPlayerEvent) => void) => {
  initUnifiedPlayerEngine()
  return bus.on(listener)
}

export const getUnifiedPlaybackState = async(): Promise<UnifiedPlaybackState> => {
  initUnifiedPlayerEngine()
  const state = await TrackPlayer.getState().catch(() => State.None)
  switch (state) {
    case State.Playing:
      return 'playing'
    case State.Buffering:
      return 'buffering'
    case State.Connecting:
      return 'loading'
    case State.Paused:
      return 'paused'
    case State.Stopped:
      return 'stopped'
    case State.Ready:
      return 'paused'
    case State.None:
    default:
      return 'idle'
  }
}
