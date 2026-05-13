/* eslint-disable @typescript-eslint/no-misused-promises */
import { pause, play } from '@/core/player/player'
import { initUnifiedPlayerController } from './controller'
import { onUnifiedPlayerEvent } from './engine'
import { setVolume } from './utils'
import playerState from '@/store/player/state'
import settingState from '@/store/setting/state'

let isInitialized = false
let shouldResumeAfterDuck = false
let duckRecoveryTimeouts: Array<ReturnType<typeof setTimeout>> = []

const clearDuckRecoveryTimeouts = () => {
  for (const timeout of duckRecoveryTimeouts) clearTimeout(timeout)
  duckRecoveryTimeouts = []
}

const restoreConfiguredVolume = () => {
  clearDuckRecoveryTimeouts()

  const applyVolume = () => {
    void setVolume(settingState.setting['player.volume']).catch(() => {})
  }

  applyVolume()
  duckRecoveryTimeouts = [250, 1000].map(delay => setTimeout(applyVolume, delay))
}

const registerPlaybackService = async() => {
  if (isInitialized) return

  console.log('reg services...')
  initUnifiedPlayerController()
  onUnifiedPlayerEvent((event) => {
    if (event.type != 'interruption') return

    if (event.state == 'began') {
      shouldResumeAfterDuck = event.wasPlaying === true || playerState.isPlay
      clearDuckRecoveryTimeouts()
      void pause()
      return
    }

    restoreConfiguredVolume()
    const shouldResume = shouldResumeAfterDuck && event.shouldResume
    shouldResumeAfterDuck = false
    if (shouldResume) play()
  })
  isInitialized = true
}


export default () => {
  if (global.lx.playerStatus.isRegisteredService) return
  console.log('handle registerPlaybackService...')
  void registerPlaybackService()
  global.lx.playerStatus.isRegisteredService = true
}
