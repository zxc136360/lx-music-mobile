import TrackPlayer, { State } from 'react-native-track-player'
import { UnifiedPlayerEventBus } from './EventBus'
import { createPCMPlayerDriver } from './drivers/pcmPlayerDriver'
import { createTrackPlayerDriver } from './drivers/trackPlayerDriver'
import { shouldUsePCMPlayerEngine } from './platform'
import type { UnifiedPlaybackState, UnifiedPlayerEvent } from './types'

const bus = new UnifiedPlayerEventBus()

const shouldIgnoreTrackPlayerLifecycle = () => {
  return global.lx.playerStatus.ignoreTrackPlayerLifecycle
}

const trackPlayerDriver = createTrackPlayerDriver(bus, shouldIgnoreTrackPlayerLifecycle)
const pcmPlayerDriver = createPCMPlayerDriver(bus)

let isInitialized = false

export const initUnifiedPlayerEngine = () => {
  if (isInitialized) return
  pcmPlayerDriver.init()
  trackPlayerDriver.init()
  isInitialized = true
}

export const onUnifiedPlayerEvent = (listener: (event: UnifiedPlayerEvent) => void) => {
  initUnifiedPlayerEngine()
  return bus.on(listener)
}

export const getUnifiedPlaybackState = async(): Promise<UnifiedPlaybackState> => {
  initUnifiedPlayerEngine()
  if (shouldUsePCMPlayerEngine()) return pcmPlayerDriver.getState()
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
