import { updateMetaDataImmediately } from './playList'
import { initUnifiedPlayerEngine, onUnifiedPlayerEvent } from './engine'
import { clearPCMPlaybackTrack } from './pcmPlayerCore'
import { isTempId } from './utils'
import { exitApp } from '@/core/common'
import playerState from '@/store/player/state'
import type { UnifiedPlayerEvent } from './engine/types'

let isInitialized = false

const handleExitApp = async(reason: string) => {
  global.lx.isPlayedStop = false
  exitApp(reason)
}

export const initUnifiedPlayerController = () => {
  if (isInitialized) return
  initUnifiedPlayerEngine()

  let pendingEvents: UnifiedPlayerEvent[] = []
  let pendingFlushTimeout: ReturnType<typeof setTimeout> | null = null

  const clearPendingFlushTimeout = () => {
    if (!pendingFlushTimeout) return
    clearTimeout(pendingFlushTimeout)
    pendingFlushTimeout = null
  }

  const clearPendingEvents = () => {
    clearPendingFlushTimeout()
    pendingEvents = []
  }

  const queuePendingEvent = (event: UnifiedPlayerEvent) => {
    pendingEvents.push(event)
    if (pendingEvents.length > 8) pendingEvents.shift()
    if (pendingFlushTimeout) return
    pendingFlushTimeout = setTimeout(() => {
      pendingFlushTimeout = null
      void flushPendingEvents()
    }, 50)
  }

  const flushPendingEvents = async() => {
    if (global.lx.gettingUrlId) {
      pendingFlushTimeout = setTimeout(() => {
        pendingFlushTimeout = null
        void flushPendingEvents()
      }, 50)
      return
    }
    const events = pendingEvents
    pendingEvents = []
    for (const event of events) {
      await handleEvent(event)
    }
  }

  const handleEvent = async(event: UnifiedPlayerEvent) => {
    if (event.type == 'trackChanged') global.lx.playerTrackId = event.trackId
    if (global.lx.gettingUrlId) {
      queuePendingEvent(event)
      return
    }
    if (isTempId()) return
    switch (event.type) {
      case 'state':
        switch (event.state) {
          case 'loading':
            global.app_event.playerLoadstart()
            break
          case 'buffering':
            global.app_event.pause()
            global.app_event.playerWaiting()
            break
          case 'playing':
            if (playerState.musicInfo.id) {
              void updateMetaDataImmediately(playerState.musicInfo, true, playerState.lastLyric)
            }
            global.app_event.playerPlaying()
            global.app_event.play()
            break
          case 'paused':
          // fallthrough
          case 'stopped':
          case 'idle':
            global.app_event.playerPause()
            global.app_event.pause()
            break
        }
        if (global.lx.isPlayedStop) void handleExitApp('Timeout Exit')
        break
      case 'error':
        console.log('playback-error', event.error)
        global.app_event.error()
        global.app_event.playerError()
        break
      case 'trackChanged':
        if (event.info?.track == null) return
        if (global.lx.isPlayedStop) return handleExitApp('Timeout Exit')
        break
      case 'ended':
        clearPCMPlaybackTrack()
        global.app_event.playerPause()
        global.app_event.pause()
        global.app_event.playerEnded()
        global.app_event.playerEmptied()
        break
    }
  }

  onUnifiedPlayerEvent((event) => {
    void handleEvent(event)
  })

  global.app_event.on('musicToggled', clearPendingEvents)
  isInitialized = true
}
