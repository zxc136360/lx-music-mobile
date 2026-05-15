import { existsFile, readFile } from '@/utils/fs'
import { updateDownloadTask } from '@/core/download/state'
import {
  getMusicUrl as getOnlineMusicUrl,
  getMusicUrlInfo as getOnlineMusicUrlInfo,
  getPicUrl as getOnlinePicUrl,
  getLyricInfo as getOnlineLyricInfo,
} from './online'
import { buildLyricInfo, getCachedLyricInfo } from './utils'
import { parseLyric } from './local'

interface MusicUrlInfo {
  url: string
  quality: LX.Quality | null
  source: NonNullable<LX.Player.MusicInfo['playSource']>
}

const getFilePath = async(path?: string) => {
  if (!path) return ''
  return await existsFile(path) ? path : ''
}

const getFileUrl = (path: string) => path.startsWith('/') ? `file://${path}` : path

const markFileMissing = (musicInfo: LX.Download.ListItem) => {
  if (musicInfo.status != 'completed') return
  updateDownloadTask(musicInfo.id, task => ({
    ...task,
    status: 'error',
    isComplate: false,
    statusText: '文件丢失/重新下载',
    speed: '',
    jobId: undefined,
    error: 'download file missing',
  }))
}

const getLocalMusicUrlInfo = async(musicInfo: LX.Download.ListItem) => {
  const path = await getFilePath(musicInfo.metadata.filePath)
  if (path) return { url: path, quality: musicInfo.metadata.quality }
  markFileMissing(musicInfo)
  return null
}

const getLocalLyricInfo = async(musicInfo: LX.Download.ListItem) => {
  const jsonPath = await getFilePath(musicInfo.lyricJsonPath)
  if (jsonPath) {
    const lyricInfo = JSON.parse(await readFile(jsonPath)) as LX.Music.LyricInfo
    return buildLyricInfo(lyricInfo)
  }

  const lrcPath = await getFilePath(musicInfo.lyricLrcPath ?? musicInfo.lyricPath)
  if (!lrcPath) return null
  return buildLyricInfo(parseLyric(await readFile(lrcPath)))
}

export const getMusicUrl = async({ musicInfo, isRefresh, allowToggleSource = true, onToggleSource = () => {} }: {
  musicInfo: LX.Download.ListItem
  isRefresh: boolean
  onToggleSource?: (musicInfo?: LX.Music.MusicInfoOnline) => void
  allowToggleSource?: boolean
}): Promise<string> => {
  if (!isRefresh) {
    const urlInfo = await getLocalMusicUrlInfo(musicInfo)
    if (urlInfo) return urlInfo.url
  }

  return getOnlineMusicUrl({ musicInfo: musicInfo.metadata.musicInfo, isRefresh, onToggleSource, allowToggleSource })
}

export const getMusicUrlInfo = async({ musicInfo, isRefresh, allowToggleSource = true, onToggleSource = () => {} }: {
  musicInfo: LX.Download.ListItem
  isRefresh: boolean
  onToggleSource?: (musicInfo?: LX.Music.MusicInfoOnline) => void
  allowToggleSource?: boolean
}): Promise<MusicUrlInfo> => {
  if (!isRefresh) {
    const urlInfo = await getLocalMusicUrlInfo(musicInfo)
    if (urlInfo) return { ...urlInfo, source: 'download' as const }
  }

  return getOnlineMusicUrlInfo({ musicInfo: musicInfo.metadata.musicInfo, isRefresh, onToggleSource, allowToggleSource })
}

export const getPicUrl = async({ musicInfo, isRefresh, onToggleSource = () => {} }: {
  musicInfo: LX.Download.ListItem
  isRefresh: boolean
  listId?: string | null
  onToggleSource?: (musicInfo?: LX.Music.MusicInfoOnline) => void
}): Promise<string> => {
  if (!isRefresh) {
    const coverPath = await getFilePath(musicInfo.coverPath)
    if (coverPath) return getFileUrl(coverPath)

    const onlineMusicInfo = musicInfo.metadata.musicInfo
    if (onlineMusicInfo.meta.picUrl) return onlineMusicInfo.meta.picUrl
  }

  return getOnlinePicUrl({ musicInfo: musicInfo.metadata.musicInfo, isRefresh, onToggleSource })
}

export const getLyricInfo = async({ musicInfo, isRefresh, onToggleSource = () => {} }: {
  musicInfo: LX.Download.ListItem
  isRefresh: boolean
  onToggleSource?: (musicInfo?: LX.Music.MusicInfoOnline) => void
}): Promise<LX.Player.LyricInfo> => {
  if (!isRefresh) {
    const localLyricInfo = await getLocalLyricInfo(musicInfo).catch(() => null)
    if (localLyricInfo) return localLyricInfo

    const lyricInfo = await getCachedLyricInfo(musicInfo.metadata.musicInfo)
    if (lyricInfo) return buildLyricInfo(lyricInfo)
  }

  return getOnlineLyricInfo({
    musicInfo: musicInfo.metadata.musicInfo,
    isRefresh,
    onToggleSource,
  }).catch(async() => {
    throw new Error('failed')
  })
}
