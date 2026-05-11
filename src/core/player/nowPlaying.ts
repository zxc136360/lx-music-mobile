import { getPosition, updateMetaData } from '@/plugins/player'
import playerState from '@/store/player/state'
import settingState from '@/store/setting/state'
import { pauseNowPlaying, playNowPlaying, stopNowPlaying } from '@/utils/nativeModules/nowPlaying'

const getElapsedTime = async() => getPosition().catch(() => playerState.progress.nowPlayTime)
const getPlaybackRate = () => playerState.isPlay ? settingState.setting['player.playbackRate'] : 0

export const syncNowPlayingState = async(type: 'play' | 'pause' | 'stop') => {
  const elapsedTime = type == 'stop' ? 0 : await getElapsedTime()

  if (type == 'play') {
    await playNowPlaying({
      elapsedTime,
      playbackRate: settingState.setting['player.playbackRate'],
    }).catch(() => {})
    return
  }

  if (type == 'pause') {
    await pauseNowPlaying({
      elapsedTime,
      playbackRate: 0,
    }).catch(() => {})
    return
  }

  await stopNowPlaying({
    elapsedTime,
    playbackRate: 0,
  }).catch(() => {})
}

export const syncNowPlayingProgress = async(elapsedTime?: number) => {
  if (!playerState.playMusicInfo.musicInfo || !playerState.isPlay) return
  await playNowPlaying({
    elapsedTime: elapsedTime ?? await getElapsedTime(),
    playbackRate: getPlaybackRate(),
  }).catch(() => {})
}

export const syncNowPlayingMetadata = (force = false) => {
  if (!playerState.playMusicInfo.musicInfo) return
  void updateMetaData(playerState.musicInfo, playerState.isPlay, playerState.lastLyric, force)
}
