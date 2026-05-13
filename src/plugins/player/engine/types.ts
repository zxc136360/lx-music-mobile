export type UnifiedPlaybackState =
  | 'idle'
  | 'loading'
  | 'buffering'
  | 'playing'
  | 'paused'
  | 'stopped'

export type UnifiedDriverName = 'pcmPlayer'

export type UnifiedPlayerEvent =
  | {
    type: 'state'
    driver: UnifiedDriverName
    state: UnifiedPlaybackState
    position?: number
    duration?: number
  }
  | {
    type: 'error'
    driver: UnifiedDriverName
    error: any
  }
  | {
    type: 'ended'
    driver: UnifiedDriverName
    position?: number
    duration?: number
    success?: boolean
  }
  | {
    type: 'trackChanged'
    driver: UnifiedDriverName
    info: any
    trackId: string
  }
  | {
    type: 'interruption'
    driver: UnifiedDriverName
    state: 'began' | 'ended'
    shouldResume?: boolean
    wasPlaying?: boolean
    position?: number
    duration?: number
  }
