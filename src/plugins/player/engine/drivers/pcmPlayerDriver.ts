import {
  getPCMPlayerState,
  isPCMPlayerSupported,
  onPCMPlayerEvent,
} from '@/utils/nativeModules/pcmPlayer'
import type { UnifiedPlaybackState } from '../types'
import type { UnifiedPlayerEventBus } from '../EventBus'

const mapPCMPlayerState = (state: string): UnifiedPlaybackState => {
  switch (state) {
    case 'loading':
      return 'loading'
    case 'buffering':
      return 'buffering'
    case 'playing':
      return 'playing'
    case 'paused':
      return 'paused'
    case 'stopped':
      return 'stopped'
    case 'idle':
    default:
      return 'idle'
  }
}

export const createPCMPlayerDriver = (bus: UnifiedPlayerEventBus) => {
  let isInitialized = false

  const init = () => {
    if (isInitialized || !isPCMPlayerSupported) return

    onPCMPlayerEvent((event) => {
      switch (event.type) {
        case 'state':
          bus.emit({
            type: 'state',
            driver: 'pcmPlayer',
            state: mapPCMPlayerState(event.state),
            position: event.position,
            duration: event.duration,
          })
          break
        case 'error':
          bus.emit({
            type: 'error',
            driver: 'pcmPlayer',
            error: event.error,
          })
          break
        case 'seek':
          break
        case 'interruption':
          bus.emit({
            type: 'interruption',
            driver: 'pcmPlayer',
            state: event.state,
            shouldResume: event.shouldResume,
            wasPlaying: event.wasPlaying,
            position: event.position,
            duration: event.duration,
          })
          break
        case 'trackChanged':
          bus.emit({
            type: 'trackChanged',
            driver: 'pcmPlayer',
            info: event.info,
            trackId: event.trackId,
          })
          break
        case 'ended':
          bus.emit({
            type: 'ended',
            driver: 'pcmPlayer',
            position: event.position,
            duration: event.duration,
            success: event.success,
          })
          break
      }
    })

    isInitialized = true
  }

  const getState = async() => {
    if (!isPCMPlayerSupported) return 'idle' as UnifiedPlaybackState
    return mapPCMPlayerState(await getPCMPlayerState().catch(() => 'idle'))
  }

  return { init, getState }
}
