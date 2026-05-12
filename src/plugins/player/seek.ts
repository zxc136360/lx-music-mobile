import TrackPlayer from 'react-native-track-player'
import { NativeModules, Platform } from 'react-native'
import {
  mapPlayerTimeToTimelineTime,
  mapTimelineTimeToPlayerTime,
} from '@/core/player/timeline'
import playerState from '@/store/player/state'

const NativeTrackPlayerModule = NativeModules.TrackPlayerModule as {
  getPosition?: () => Promise<number>
  getDuration?: () => Promise<number>
}

const wait = async(ms: number) => new Promise(resolve => setTimeout(resolve, ms))
let seekActionId = 0

export const getPlayerDuration = async() => {
  if (Platform.OS == 'ios' && typeof NativeTrackPlayerModule?.getDuration == 'function') {
    return NativeTrackPlayerModule.getDuration()
  }
  return TrackPlayer.getDuration()
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
  if (Platform.OS == 'ios' && typeof NativeTrackPlayerModule?.getPosition == 'function') {
    return NativeTrackPlayerModule.getPosition()
  }
  return TrackPlayer.getPosition()
}

export const getAccuratePosition = async() => {
  const position = await getRawPosition()
  if (Platform.OS != 'ios') return position

  const duration = await getPlayerDuration().catch(() => 0)
  return mapPlayerTimeToTimelineTime(playerState.playMusicInfo.musicInfo, position, duration)
}

export const seekToTime = async(targetTime: number) => {
  const actionId = ++seekActionId
  const duration = Platform.OS == 'ios'
    ? await waitForPlayerDuration()
    : 0
  const playerTargetTime = Platform.OS == 'ios'
    ? mapTimelineTimeToPlayerTime(playerState.playMusicInfo.musicInfo, targetTime, duration)
    : targetTime

  if (actionId != seekActionId) return targetTime
  await TrackPlayer.seekTo(playerTargetTime)
  if (Platform.OS != 'ios') return targetTime

  let position = playerTargetTime
  let stableCount = 0
  for (const [delay, tolerance] of [
    [140, 1.2],
    [200, 0.75],
    [280, 0.4],
    [360, 0.22],
    [520, 0.12],
  ] as const) {
    await wait(delay)
    if (actionId != seekActionId) return targetTime
    const currentPosition = await getRawPosition().catch(() => position)
    const nextPosition = currentPosition > 0 ? currentPosition : position
    // eslint-disable-next-line require-atomic-updates
    position = nextPosition
    if (Math.abs(position - playerTargetTime) <= tolerance) {
      stableCount++
      if (stableCount > 1 || tolerance <= 0.22) break
      continue
    }
    stableCount = 0
    if (actionId != seekActionId) return targetTime
    await TrackPlayer.seekTo(playerTargetTime)
  }
  if (actionId != seekActionId) return targetTime
  const finalPosition = await getRawPosition().catch(() => position)
  // eslint-disable-next-line require-atomic-updates
  position = finalPosition > 0 ? finalPosition : position
  const finalDuration = await getPlayerDuration().catch(() => duration)
  return mapPlayerTimeToTimelineTime(playerState.playMusicInfo.musicInfo, position, finalDuration || duration)
}
