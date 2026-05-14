import { ensureCurrentTrackMetadata } from '../playbackCore'
import { getCurrentPCMTrack, loadPCMPlaybackResource } from '../pcmPlayerCore'

const resolveShouldAutoStart = (hasCurrentTrack: boolean) => {
  if (hasCurrentTrack) return true
  if (!global.lx.restorePlayInfo) return true
  global.lx.restorePlayInfo = null
  return false
}

export const loadPlaybackResource = async({
  musicInfo,
  url,
  time,
  quality: _quality,
}: {
  musicInfo: LX.Player.PlayMusic
  url: string
  time: number
  quality?: LX.Quality | null
}) => {
  const currentTrack = await getCurrentPCMTrack()
  const shouldAutoStart = resolveShouldAutoStart(currentTrack != null)
  const track = await loadPCMPlaybackResource(musicInfo, url, time, shouldAutoStart)
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
