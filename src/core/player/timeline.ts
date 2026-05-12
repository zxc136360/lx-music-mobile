import { Platform } from 'react-native'
import { parsePlayTime } from '@/utils/common'

const durationDriftTolerance = 1.5

const isOnlineMusic = (musicInfo: LX.Player.PlayMusic | null | undefined) => {
  if (!musicInfo) return false
  return 'progress' in musicInfo ? true : musicInfo.source != 'local'
}

const getMusicInterval = (musicInfo: LX.Player.PlayMusic | null | undefined) => {
  if (!musicInfo) return null
  return 'progress' in musicInfo ? musicInfo.metadata.musicInfo.interval : musicInfo.interval
}

export const getMusicIntervalDuration = (musicInfo: LX.Player.PlayMusic | null | undefined) => {
  return parsePlayTime(getMusicInterval(musicInfo))
}

export const getTimelineDuration = (musicInfo: LX.Player.PlayMusic | null | undefined, playerDuration: number) => {
  const intervalDuration = getMusicIntervalDuration(musicInfo)
  if (!intervalDuration) return playerDuration

  // iOS online/high-quality streams may expose an unstable duration after load/seek.
  if (Platform.OS == 'ios' && isOnlineMusic(musicInfo)) return intervalDuration

  if (!playerDuration) return intervalDuration
  return Math.abs(playerDuration - intervalDuration) > durationDriftTolerance ? intervalDuration : playerDuration
}

const shouldMapTimeline = (musicInfo: LX.Player.PlayMusic | null | undefined, playerDuration: number, timelineDuration: number) => {
  return Platform.OS == 'ios' &&
    isOnlineMusic(musicInfo) &&
    playerDuration > 0 &&
    timelineDuration > 0 &&
    Math.abs(playerDuration - timelineDuration) > durationDriftTolerance
}

export const mapTimelineTimeToPlayerTime = (musicInfo: LX.Player.PlayMusic | null | undefined, timelineTime: number, playerDuration: number) => {
  const timelineDuration = getMusicIntervalDuration(musicInfo)
  if (!shouldMapTimeline(musicInfo, playerDuration, timelineDuration)) return timelineTime
  return Math.min(Math.max(timelineTime / timelineDuration * playerDuration, 0), playerDuration)
}

export const mapPlayerTimeToTimelineTime = (musicInfo: LX.Player.PlayMusic | null | undefined, playerTime: number, playerDuration: number) => {
  const timelineDuration = getMusicIntervalDuration(musicInfo)
  if (!shouldMapTimeline(musicInfo, playerDuration, timelineDuration)) return playerTime
  return Math.min(Math.max(playerTime / playerDuration * timelineDuration, 0), timelineDuration)
}
