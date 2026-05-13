import { UnifiedPlayerEventBus } from './EventBus'
import { createPCMPlayerDriver } from './drivers/pcmPlayerDriver'
import type { UnifiedPlaybackState, UnifiedPlayerEvent } from './types'

const bus = new UnifiedPlayerEventBus()

const pcmPlayerDriver = createPCMPlayerDriver(bus)

let isInitialized = false

export const initUnifiedPlayerEngine = () => {
  if (isInitialized) return
  pcmPlayerDriver.init()
  isInitialized = true
}

export const onUnifiedPlayerEvent = (listener: (event: UnifiedPlayerEvent) => void) => {
  initUnifiedPlayerEngine()
  return bus.on(listener)
}

export const getUnifiedPlaybackState = async(): Promise<UnifiedPlaybackState> => {
  initUnifiedPlayerEngine()
  return pcmPlayerDriver.getState()
}
