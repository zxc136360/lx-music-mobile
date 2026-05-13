import { NativeEventEmitter, NativeModules, Platform } from 'react-native'

export type PCMPlayerState = 'idle' | 'loading' | 'buffering' | 'playing' | 'paused' | 'stopped'

export interface PCMPlayerSource {
  trackId: string
  url: string
  userAgent?: string
  position?: number
}

export type PCMPlayerEvent =
  | {
    type: 'state'
    driver: 'pcmPlayer'
    state: PCMPlayerState
    trackId?: string
    position?: number
    duration?: number
  }
  | {
    type: 'error'
    driver: 'pcmPlayer'
    error: any
    trackId?: string
    position?: number
    duration?: number
  }
  | {
    type: 'ended'
    driver: 'pcmPlayer'
    trackId?: string
    position?: number
    duration?: number
    success?: boolean
  }
  | {
    type: 'trackChanged'
    driver: 'pcmPlayer'
    info: any
    trackId: string
    position?: number
    duration?: number
  }
  | {
    type: 'seek'
    driver: 'pcmPlayer'
    trackId?: string
    position?: number
    duration?: number
  }
  | {
    type: 'interruption'
    driver: 'pcmPlayer'
    state: 'began' | 'ended'
    shouldResume?: boolean
    wasPlaying?: boolean
    trackId?: string
    position?: number
    duration?: number
  }

interface NativePCMPlayerModule {
  isAvailable?: boolean | number
  setup?: (config?: Record<string, unknown>) => Promise<void>
  load?: (source: PCMPlayerSource) => Promise<{ trackId: string, duration: number, cancelled?: boolean }>
  play?: () => Promise<void>
  pause?: () => Promise<void>
  stop?: () => Promise<void>
  destroy?: () => Promise<void>
  seekTo?: (position: number) => Promise<number>
  getPosition?: () => Promise<number>
  getDuration?: () => Promise<number>
  getBufferedPosition?: () => Promise<number>
  getState?: () => Promise<PCMPlayerState>
  setVolume?: (volume: number) => Promise<void>
  setRate?: (rate: number) => Promise<void>
  addListener?: (eventName: string) => void
  removeListeners?: (count: number) => void
}

const PCMPlayerModule = NativeModules.PCMPlayerModule as NativePCMPlayerModule | undefined

const getPCMPlayerSupportDetail = () => ({
  platform: Platform.OS,
  hasModule: PCMPlayerModule != null,
  isAvailable: PCMPlayerModule?.isAvailable,
  hasSetup: typeof PCMPlayerModule?.setup == 'function',
  hasLoad: typeof PCMPlayerModule?.load == 'function',
  nativeModules: Object.keys(NativeModules).filter(name => name.includes('PCM') || name.includes('Player')),
})

const isNativePCMPlayerAvailable = PCMPlayerModule?.isAvailable === true || PCMPlayerModule?.isAvailable === 1

export const isPCMPlayerSupported = Platform.OS == 'ios' &&
  isNativePCMPlayerAvailable &&
  typeof PCMPlayerModule?.setup == 'function' &&
  typeof PCMPlayerModule?.load == 'function'

const unsupportedError = () => new Error(`PCMPlayerModule is not supported: ${JSON.stringify(getPCMPlayerSupportDetail())}`)

const getModule = () => {
  if (!isPCMPlayerSupported || !PCMPlayerModule) throw unsupportedError()
  return PCMPlayerModule
}

export const setupPCMPlayer = async(config: Record<string, unknown> = {}) => {
  return getModule().setup?.(config)
}

export const loadPCMPlayerSource = async(source: PCMPlayerSource) => {
  return getModule().load?.(source)
}

export const playPCMPlayer = async() => getModule().play?.()
export const pausePCMPlayer = async() => getModule().pause?.()
export const stopPCMPlayer = async() => getModule().stop?.()
export const destroyPCMPlayer = async() => getModule().destroy?.()
export const seekPCMPlayer = async(position: number) => getModule().seekTo?.(position) ?? position
export const getPCMPlayerPosition = async() => getModule().getPosition?.() ?? 0
export const getPCMPlayerDuration = async() => getModule().getDuration?.() ?? 0
export const getPCMPlayerBufferedPosition = async() => getModule().getBufferedPosition?.() ?? 0
export const getPCMPlayerState = async() => getModule().getState?.() ?? 'idle'
export const setPCMPlayerVolume = async(volume: number) => getModule().setVolume?.(volume)
export const setPCMPlayerRate = async(rate: number) => getModule().setRate?.(rate)

export const onPCMPlayerEvent = (listener: (event: PCMPlayerEvent) => void) => {
  if (!isPCMPlayerSupported || !PCMPlayerModule?.addListener || !PCMPlayerModule?.removeListeners) return () => {}
  const emitter = new NativeEventEmitter(PCMPlayerModule as Required<Pick<NativePCMPlayerModule, 'addListener' | 'removeListeners'>>)
  const subscription = emitter.addListener('pcm-player-event', listener)
  return () => {
    subscription.remove()
  }
}
