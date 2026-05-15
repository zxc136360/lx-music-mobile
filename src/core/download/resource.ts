import { downloadFile, existsFile, unlink, writeFile } from '@/utils/fs'
import { shareFile } from '@/utils/nativeModules/utils'
import { getLyricInfo, getMusicUrlInfo, getPicPath } from '@/core/music'
import settingState from '@/store/setting/state'
import { getDownloadPaths, getSafeDownloadFileName } from './paths'

export interface DownloadResourceInfo {
  url: string
  quality: LX.Quality
  ext: LX.Download.FileExt
  fileName: string
  filePath: string
  lyricJsonPath: string
  lyricLrcPath: string
  coverPath: string
}

export interface DownloadProgressInfo {
  jobId?: number
  downloaded: number
  total: number
  progress: number
  speed: string
}

const extRxp = /\.([a-z0-9]+)(?:[?#].*)?$/i

const inferAudioExt = (url: string): LX.Download.FileExt => {
  const ext = url.match(extRxp)?.[1]?.toLowerCase()
  switch (ext) {
    case 'flac': return 'flac'
    case 'wav': return 'wav'
    case 'ape': return 'ape'
    default: return 'mp3'
  }
}

const formatSpeed = (bytesPerSecond: number) => {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return ''
  if (bytesPerSecond >= 1024 * 1024) return `${(bytesPerSecond / 1024 / 1024).toFixed(1)} MB/s`
  if (bytesPerSecond >= 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`
  return `${Math.round(bytesPerSecond)} B/s`
}

const normalizeQuality = (quality: LX.Quality | null | undefined, fallback: LX.Quality): LX.Quality => quality ?? fallback

export const resolveDownloadResource = async(musicInfo: LX.Music.MusicInfoOnline, quality?: LX.Quality): Promise<DownloadResourceInfo> => {
  const targetQuality = quality ?? settingState.setting['player.playQuality']
  const urlInfo = await getMusicUrlInfo({
    musicInfo,
    quality: targetQuality,
    isRefresh: true,
  })
  const downloadQuality = normalizeQuality(urlInfo.quality, targetQuality)
  const ext = inferAudioExt(urlInfo.url)
  const fileName = getSafeDownloadFileName(settingState.setting['download.fileName'], musicInfo, `${musicInfo.id}_${downloadQuality}`)
  const paths = getDownloadPaths(`${fileName}_${musicInfo.source}_${musicInfo.id}_${downloadQuality}`, ext)

  return {
    url: urlInfo.url,
    quality: downloadQuality,
    ext,
    fileName,
    filePath: paths.audioPath,
    lyricJsonPath: paths.lyricJsonPath,
    lyricLrcPath: paths.lyricLrcPath,
    coverPath: paths.coverPath,
  }
}

export const downloadAudioResource = async(url: string, filePath: string, onProgress: (info: DownloadProgressInfo) => void) => {
  const startTime = Date.now()
  const task = downloadFile(url, filePath, {
    begin: res => {
      onProgress({
        jobId: res.jobId,
        downloaded: 0,
        total: res.contentLength,
        progress: 0,
        speed: '',
      })
    },
    progress: res => {
      const elapsed = Math.max(Date.now() - startTime, 1)
      const bytesWritten = res.bytesWritten
      const contentLength = res.contentLength
      onProgress({
        downloaded: bytesWritten,
        total: contentLength,
        progress: contentLength > 0 ? bytesWritten / contentLength : 0,
        speed: formatSpeed(bytesWritten / elapsed * 1000),
      })
    },
  })
  await task.promise
}

const buildLrcText = (lyricInfo: LX.Player.LyricInfo) => {
  return [lyricInfo.lyric, lyricInfo.tlyric, lyricInfo.rlyric, lyricInfo.lxlyric]
    .filter(Boolean)
    .join('\n')
}

export const downloadLyricAsset = async(task: LX.Download.ListItem) => {
  const lyricInfo = await getLyricInfo({
    musicInfo: task.metadata.musicInfo,
    isRefresh: true,
  })
  await writeFile(task.lyricJsonPath!, JSON.stringify(lyricInfo))
  await writeFile(task.lyricLrcPath!, buildLrcText(lyricInfo))
}

export const downloadCoverAsset = async(task: LX.Download.ListItem) => {
  const picUrl = await getPicPath({
    musicInfo: task.metadata.musicInfo,
    isRefresh: true,
  })
  await downloadAudioResource(picUrl, task.coverPath!, () => {})
}

const removeFile = async(path?: string) => {
  if (!path) return
  if (!await existsFile(path)) return
  await unlink(path)
}

export const removeTaskFiles = async(task: LX.Download.ListItem) => {
  await Promise.all([
    removeFile(task.metadata.filePath),
    removeFile(task.lyricPath),
    removeFile(task.lyricJsonPath),
    removeFile(task.lyricLrcPath),
    removeFile(task.coverPath),
  ])
}

export const shareTaskFile = async(task: LX.Download.ListItem) => {
  if (task.status != 'completed' || !await existsFile(task.metadata.filePath)) throw new Error('file missing')
  await shareFile(task.metadata.fileName, task.metadata.filePath)
}
