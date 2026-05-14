import { defaultUrl } from '@/config'
import { Platform } from 'react-native'
import settingState from '@/store/setting/state'
import playerState from '@/store/player/state'
import { clearNowPlayingInfo, updateNowPlayingInfo } from '@/utils/nativeModules/nowPlaying'

const list: LX.Player.Track[] = []

const defaultUserAgent = 'Mozilla/5.0 (Linux; Android 10; Pixel 3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.79 Mobile Safari/537.36'
const httpRxp = /^(https?:\/\/.+|\/.+)/
const wait = async(ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export const playbackState = {
  isPlaying: false,
  prevDuration: -1,
}

export const formatNowPlayingTitleLine = (title?: string, artist?: string) => {
  const safeTitle = title ?? 'Unknow'
  return artist ? `${safeTitle} - ${artist}` : safeTitle
}

const formatIOSNowPlayingMetadata = (metadata: {
  title?: string
  artist?: string
  artwork?: string
  duration?: number
  elapsedTime?: number
  playbackRate?: number
  lyric?: string
  preserveArtist?: boolean
}) => {
  const nowPlayingMetadata: Parameters<typeof updateNowPlayingInfo>[0] = {
    title: formatNowPlayingTitleLine(metadata.title, metadata.artist),
    album: '',
    artwork: metadata.artwork,
    duration: metadata.duration,
    elapsedTime: metadata.elapsedTime,
    playbackRate: metadata.playbackRate,
  }
  if (metadata.lyric !== undefined) {
    nowPlayingMetadata.artist = metadata.lyric
  } else if (!metadata.preserveArtist) {
    nowPlayingMetadata.artist = ''
  }
  return nowPlayingMetadata
}

export const formatMusicInfo = (musicInfo: LX.Player.PlayMusic) => {
  return 'progress' in musicInfo ? {
    id: musicInfo.id,
    pic: musicInfo.metadata.musicInfo.meta.picUrl,
    name: musicInfo.metadata.musicInfo.name,
    singer: musicInfo.metadata.musicInfo.singer,
    album: musicInfo.metadata.musicInfo.meta.albumName,
  } : {
    id: musicInfo.id,
    pic: musicInfo.meta.picUrl,
    name: musicInfo.name,
    singer: musicInfo.singer,
    album: musicInfo.meta.albumName,
  }
}

export const getCurrentFullLyric = (targetId: string | null) => {
  return (settingState.setting['player.isShowBluetoothFullLyric'] && targetId &&
      playerState.musicInfo.id == targetId && playerState.musicInfo.lrc)
    ? playerState.musicInfo.lrc
    : undefined
}

export const buildTracks = (musicInfo: LX.Player.PlayMusic, url?: LX.Player.Track['url'], duration?: LX.Player.Track['duration']): LX.Player.Track[] => {
  const mInfo = formatMusicInfo(musicInfo)
  const track = [] as LX.Player.Track[]
  const isShowNotificationImage = settingState.setting['player.isShowNotificationImage']
  const album = mInfo.album || undefined
  const artwork = isShowNotificationImage && mInfo.pic && httpRxp.test(mInfo.pic) ? mInfo.pic : undefined
  const lyric = getCurrentFullLyric(mInfo.id)
  if (url) {
    track.push({
      id: `${mInfo.id}__//${Math.random()}__//${url}`,
      url,
      title: mInfo.name || 'Unknow',
      artist: mInfo.singer || 'Unknow',
      album,
      artwork,
      userAgent: defaultUserAgent,
      musicId: mInfo.id,
      lyric,
      duration,
    })
  }
  if (!url || Platform.OS != 'ios') {
    track.push({
      id: `${mInfo.id}__//${Math.random()}__//default`,
      url: defaultUrl,
      title: mInfo.name || 'Unknow',
      artist: mInfo.singer || 'Unknow',
      album,
      artwork,
      musicId: mInfo.id,
      lyric,
      duration: 0,
    })
  }
  return track
}

export const isTempTrack = (trackId: string) => /\/\/default$/.test(trackId)

export const getCurrentTrackId = async() => list[0]?.id ?? ''

export const getCurrentTrack = async() => list[0]

export const applyCurrentVolume = async() => {}

export const getTrackDuration = async() => {
  const { getPCMPlayerDuration } = await import('./pcmPlayerCore')
  return getPCMPlayerDuration()
}

export const clearTracks = () => {
  list.length = 0
  playbackState.isPlaying = false
  playbackState.prevDuration = -1
}

export const updateCurrentTrackMetadata = async(metadata: {
  title?: string
  artist?: string
  album?: string
  artwork?: string
  duration?: number
  elapsedTime?: number
  playbackRate?: number
  lyric?: string
  preserveArtist?: boolean
}) => {
  const nowPlayingMetadata: Parameters<typeof updateNowPlayingInfo>[0] = {
    ...metadata,
    artwork: metadata.artwork ?? '',
  }
  if (metadata.playbackRate !== undefined) nowPlayingMetadata.playbackRate = metadata.playbackRate
  await updateNowPlayingInfo(nowPlayingMetadata).catch(() => {})
}

export const updateNowPlayingDisplayMetadata = async(metadata: {
  title?: string
  artist?: string
  album?: string
  artwork?: string
  playbackRate?: number
  lyric?: string
}) => {
  const nowPlayingMetadata: Parameters<typeof updateNowPlayingInfo>[0] = {
    ...metadata,
    artwork: metadata.artwork ?? '',
  }
  if (metadata.playbackRate !== undefined) nowPlayingMetadata.playbackRate = metadata.playbackRate
  await updateNowPlayingInfo(nowPlayingMetadata).catch(() => {})
}

export const ensureCurrentTrackMetadata = (metadata: {
  title?: string
  artist?: string
  album?: string
  artwork?: string
  duration?: number
  elapsedTime?: number
  playbackRate?: number
  lyric?: string
  preserveArtist?: boolean
}) => {
  void (async() => {
    const delays = [0, 160, 420, 900]
    for (const delay of delays) {
      if (delay) await wait(delay)
      const retryMetadata = { ...metadata }
      if (delay) delete retryMetadata.elapsedTime
      const targetMetadata = formatIOSNowPlayingMetadata(retryMetadata)
      await updateCurrentTrackMetadata(targetMetadata)
    }
  })()
}
export const destroyPlaybackCore = async() => {
  await clearNowPlayingInfo().catch(() => {})
  clearTracks()
}
