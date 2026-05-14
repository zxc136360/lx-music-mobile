import { clearNowPlayingInfo } from '@/utils/nativeModules/nowPlaying'
import {
  destroyPCMPlayer,
  getPCMPlayerBufferedPosition,
  getPCMPlayerDuration,
  getPCMPlayerPosition,
  loadPCMPlayerSource,
  pausePCMPlayer,
  playPCMPlayer,
  seekPCMPlayer,
  setPCMPlayerRate,
  setPCMPlayerVolume,
  setupPCMPlayer,
  stopPCMPlayer,
} from '@/utils/nativeModules/pcmPlayer'
import {
  buildTracks,
  clearTracks,
  ensureCurrentTrackMetadata,
} from './playbackCore'

const list: LX.Player.Track[] = []
let currentTrack: LX.Player.Track | null = null

export const setupPCMPlayerCore = async(config: {
  volume: number
  playRate: number
  cacheSize: number
  isHandleAudioFocus: boolean
  isEnableAudioOffload: boolean
}) => {
  await setupPCMPlayer({
    maxCacheSize: config.cacheSize * 1024,
    handleAudioFocus: config.isHandleAudioFocus,
    audioOffload: config.isEnableAudioOffload,
  })
}

export const getCurrentPCMTrack = async() => currentTrack

export const getCurrentPCMTrackId = async() => currentTrack?.id ?? ''

export const clearPCMTracks = () => {
  list.length = 0
  currentTrack = null
}

export const clearPCMPlaybackTrack = () => {
  clearPCMTracks()
  global.lx.playerTrackId = ''
}

export const initPCMTrackInfo = async(
  musicInfo: LX.Player.PlayMusic,
  mInfo: LX.Player.MusicInfo,
  delayUpdateMusicInfo: (musicInfo: LX.Player.MusicInfo, lyric?: string, isPlaying?: boolean) => void,
) => {
  const tracks = buildTracks(musicInfo)
  clearPCMTracks()
  list.push(...tracks)
  currentTrack = tracks[0] ?? null
  if (!currentTrack) return
  global.lx.playerTrackId = currentTrack.id
  delayUpdateMusicInfo(mInfo)
}

export const loadPCMPlaybackResource = async(
  musicInfo: LX.Player.PlayMusic,
  url: string,
  time: number,
  shouldAutoStart: boolean,
) => {
  const tracks = buildTracks(musicInfo, url)
  const track = tracks[0]
  if (!track) throw new Error('PCM playback track not found')
  clearPCMTracks()
  list.push(...tracks)
  currentTrack = track
  global.lx.playerTrackId = track.id

  const result = await loadPCMPlayerSource({
    trackId: track.id,
    url: String(track.url),
    userAgent: typeof track.userAgent == 'string' ? track.userAgent : undefined,
    position: time,
  })
  if (result?.cancelled) return track
  if (shouldAutoStart) await playPCMPlayer()
  else await pausePCMPlayer()

  ensureCurrentTrackMetadata({
    title: track.title,
    artist: track.artist,
    album: track.album,
    artwork: typeof track.artwork == 'string' ? track.artwork : undefined,
    duration: track.duration,
    elapsedTime: time,
    lyric: typeof track.lyric == 'string' ? track.lyric : undefined,
  })
  return track
}

export const restorePCMTrack = async(track: LX.Player.Track, position: number, isPlaying: boolean) => {
  clearPCMTracks()
  const restoredTrack = { ...track }
  list.push(restoredTrack)
  currentTrack = restoredTrack
  global.lx.playerTrackId = restoredTrack.id
  const result = await loadPCMPlayerSource({
    trackId: restoredTrack.id,
    url: String(restoredTrack.url),
    userAgent: typeof restoredTrack.userAgent == 'string' ? restoredTrack.userAgent : undefined,
    position,
  })
  if (result?.cancelled) return
  if (isPlaying) await playPCMPlayer()
  else await pausePCMPlayer()
  ensureCurrentTrackMetadata({
    title: restoredTrack.title,
    artist: restoredTrack.artist,
    album: restoredTrack.album,
    artwork: typeof restoredTrack.artwork == 'string' ? restoredTrack.artwork : undefined,
    duration: restoredTrack.duration,
    elapsedTime: position,
    lyric: typeof restoredTrack.lyric == 'string' ? restoredTrack.lyric : undefined,
  })
}

export const destroyPCMPlayerCore = async() => {
  try {
    await destroyPCMPlayer()
  } finally {
    await clearNowPlayingInfo().catch(() => {})
    clearPCMTracks()
    clearTracks()
  }
}

export const stopPCMPlayerCore = async() => {
  try {
    await stopPCMPlayer()
  } finally {
    clearPCMPlaybackTrack()
  }
}

export {
  getPCMPlayerPosition,
  getPCMPlayerDuration,
  getPCMPlayerBufferedPosition,
  pausePCMPlayer,
  playPCMPlayer,
  seekPCMPlayer,
  setPCMPlayerRate,
  setPCMPlayerVolume,
}
