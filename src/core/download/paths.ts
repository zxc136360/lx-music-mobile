import { mkdir, privateStorageDirectoryPath } from '@/utils/fs'
import { filterFileName } from '@/utils/common'

export const DOWNLOAD_ROOT_DIR = `${privateStorageDirectoryPath}/download`
export const DOWNLOAD_AUDIO_DIR = `${DOWNLOAD_ROOT_DIR}/audio`
export const DOWNLOAD_LYRIC_DIR = `${DOWNLOAD_ROOT_DIR}/lyric`
export const DOWNLOAD_COVER_DIR = `${DOWNLOAD_ROOT_DIR}/cover`

const normalizeDownloadFileName = (fileName: string) => filterFileName(fileName).trim()

export const ensureDownloadDirs = async() => {
  await mkdir(DOWNLOAD_ROOT_DIR)
  await mkdir(DOWNLOAD_AUDIO_DIR)
  await mkdir(DOWNLOAD_LYRIC_DIR)
  await mkdir(DOWNLOAD_COVER_DIR)
}

export const getSafeDownloadFileName = (format: LX.AppSetting['download.fileName'], musicInfo: LX.Music.MusicInfo, fallbackName: string = musicInfo.id) => {
  const fileName = format
    .replace('歌手', musicInfo.singer)
    .replace('歌名', musicInfo.name)
  return normalizeDownloadFileName(fileName) || normalizeDownloadFileName(fallbackName) || Date.now().toString()
}

export const getDownloadAudioPath = (fileName: string, ext: LX.Download.FileExt) => {
  return `${DOWNLOAD_AUDIO_DIR}/${normalizeDownloadFileName(fileName)}.${ext}`
}

export const getDownloadLyricJsonPath = (fileName: string) => {
  return `${DOWNLOAD_LYRIC_DIR}/${normalizeDownloadFileName(fileName)}.json`
}

export const getDownloadLyricLrcPath = (fileName: string) => {
  return `${DOWNLOAD_LYRIC_DIR}/${normalizeDownloadFileName(fileName)}.lrc`
}

export const getDownloadCoverPath = (fileName: string, ext: 'jpg' | 'jpeg' | 'png' | 'webp' = 'jpg') => {
  return `${DOWNLOAD_COVER_DIR}/${normalizeDownloadFileName(fileName)}.${ext}`
}

export const getDownloadPaths = (fileName: string, audioExt: LX.Download.FileExt, coverExt?: 'jpg' | 'jpeg' | 'png' | 'webp') => ({
  audioPath: getDownloadAudioPath(fileName, audioExt),
  lyricJsonPath: getDownloadLyricJsonPath(fileName),
  lyricLrcPath: getDownloadLyricLrcPath(fileName),
  coverPath: getDownloadCoverPath(fileName, coverExt),
})
