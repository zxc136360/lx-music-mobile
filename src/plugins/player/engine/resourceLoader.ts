import TrackPlayer from 'react-native-track-player'
import { Platform } from 'react-native'
import {
  getNativeFlacTrackId,
  resetNativeFlacPlayback,
  shouldUseNativeFlacPlayer,
  startNativeFlacPlayback,
} from '../nativeFlac'
import {
  clearTracks,
  ensureCurrentTrackMetadata,
  formatMusicInfo,
  loadTrackPlayerResource,
} from '../trackPlayerCore'
import { getTimelineDuration } from '@/core/player/timeline'
import settingState from '@/store/setting/state'

const resolveShouldAutoStart = (currentTrackIndex: number | null) => {
  if (currentTrackIndex != null) return true
  if (!global.lx.restorePlayInfo) return true
  global.lx.restorePlayInfo = null
  return false
}

export const loadPlaybackResource = async({
  musicInfo,
  url,
  time,
  quality,
}: {
  musicInfo: LX.Player.PlayMusic
  url: string
  time: number
  quality?: LX.Quality | null
}) => {
  const currentTrackIndex = await TrackPlayer.getCurrentTrack()
  const shouldAutoStart = resolveShouldAutoStart(currentTrackIndex)

  if (Platform.OS == 'ios' && await shouldUseNativeFlacPlayer(musicInfo, url, quality)) {
    global.lx.playerStatus.ignoreTrackPlayerLifecycle = true
    try {
      await TrackPlayer.reset().catch(async() => {
        await TrackPlayer.stop().catch(() => {})
      })
      clearTracks()
      const playbackInfo = await startNativeFlacPlayback(musicInfo, url, time, shouldAutoStart, quality ?? null)
      const mInfo = formatMusicInfo(musicInfo)
      global.lx.playerTrackId = getNativeFlacTrackId()
      ensureCurrentTrackMetadata({
        title: mInfo.name ?? 'Unknow',
        artist: mInfo.singer ?? 'Unknow',
        album: mInfo.album ?? undefined,
        artwork: typeof mInfo.pic == 'string' ? mInfo.pic : undefined,
        duration: getTimelineDuration(musicInfo, playbackInfo.duration),
        elapsedTime: playbackInfo.position,
        playbackRate: shouldAutoStart ? settingState.setting['player.playbackRate'] : 0,
      })
      return
    } finally {
      global.lx.playerStatus.ignoreTrackPlayerLifecycle = false
    }
  }

  if (Platform.OS == 'ios') {
    await resetNativeFlacPlayback().catch(() => {})
  }

  const track = await loadTrackPlayerResource(musicInfo, url, time, shouldAutoStart)
  ensureCurrentTrackMetadata({
    title: track.title,
    artist: track.artist,
    album: track.album,
    artwork: typeof track.artwork == 'string' ? track.artwork : undefined,
    duration: track.duration,
    elapsedTime: time,
    lyric: typeof track.lyric == 'string' ? track.lyric : undefined,
  })
}
