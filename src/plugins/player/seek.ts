import { Platform } from 'react-native'
import {
  mapPlayerTimeToTimelineTime,
  mapTimelineTimeToPlayerTime,
} from '@/core/player/timeline'
import playerState from '@/store/player/state'
import {
  getPCMPlayerDuration,
  getPCMPlayerPosition,
  seekPCMPlayer,
} from './pcmPlayerCore'

const wait = async(ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export const getPlayerDuration = async() => {
  return getPCMPlayerDuration()
}

const waitForPlayerDuration = async() => {
  let duration = await getPlayerDuration().catch(() => 0)
  if (duration > 0 || Platform.OS != 'ios') return duration

  for (const delay of [80, 160, 320, 520] as const) {
    await wait(delay)
    duration = await getPlayerDuration().catch(() => 0)
    if (duration > 0) break
  }
  return duration
}

export const getRawPosition = async() => {
  return getPCMPlayerPosition()
}

export const getAccuratePosition = async() => {
  const position = await getRawPosition()
  if (Platform.OS != 'ios') return position

  const duration = await getPlayerDuration().catch(() => 0)
  return mapPlayerTimeToTimelineTime(playerState.playMusicInfo.musicInfo, position, duration)
}

export const seekToTime = async(targetTime: number) => {
  const duration = Platform.OS == 'ios'
    ? await waitForPlayerDuration()
    : 0
  const playerTargetTime = Platform.OS == 'ios'
    ? mapTimelineTimeToPlayerTime(playerState.playMusicInfo.musicInfo, targetTime, duration)
    : targetTime

  await seekPCMPlayer(playerTargetTime)
  return targetTime
}
