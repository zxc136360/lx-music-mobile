import { stopDownload } from '@/utils/fs'
import {
  downloadAudioResource,
  downloadCoverAsset,
  downloadLyricAsset,
  removeTaskFiles,
  resolveDownloadResource,
  shareTaskFile,
} from './resource'
import {
  findDownloadTask,
  findDownloadTaskByMusic,
  removeDownloadTaskState,
  updateDownloadTask,
  upsertDownloadTask,
} from './state'
import { ensureDownloadDirs } from './paths'

export interface CreateDownloadTaskOptions {
  quality?: LX.Quality
  sourceListId?: string
  sourceListName?: string
  listId?: string
  listName?: string
}

const createTaskId = (musicInfo: LX.Music.MusicInfoOnline, quality: LX.Quality) => `${musicInfo.source}_${musicInfo.id}_${quality}`

const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : String(error)

const applyAssetError = (task: LX.Download.ListItem, error: unknown) => ({
  ...task,
  error: [task.error, getErrorMessage(error)].filter(Boolean).join('\n'),
})

const runAssetDownloads = async(id: string) => {
  const task = findDownloadTask(id)
  if (!task) return

  const results = await Promise.allSettled([
    downloadLyricAsset(task),
    downloadCoverAsset(task),
  ])
  const errors = results
    .filter((result): result is PromiseRejectedResult => result.status == 'rejected')
    .map(result => getErrorMessage(result.reason))

  if (!errors.length) return
  updateDownloadTask(id, task => ({
    ...applyAssetError(task, errors.join('\n')),
    statusText: '资源部分下载失败',
  }))
}

const runDownloadTask = async(id: string) => {
  const task = findDownloadTask(id)
  if (!task) return null

  try {
    updateDownloadTask(id, task => ({
      ...task,
      status: 'run',
      statusText: '下载中',
      error: undefined,
    }))

    await downloadAudioResource(task.metadata.url!, task.metadata.filePath, info => {
      updateDownloadTask(id, task => ({
        ...task,
        status: 'run',
        statusText: '下载中',
        jobId: info.jobId ?? task.jobId,
        downloaded: info.downloaded,
        total: info.total,
        progress: info.progress,
        speed: info.speed,
      }))
    })

    updateDownloadTask(id, task => ({
      ...task,
      status: 'completed',
      isComplate: true,
      statusText: '下载完成',
      progress: 1,
      speed: '',
      jobId: undefined,
    }))

    await runAssetDownloads(id)
    return findDownloadTask(id)
  } catch (error) {
    const currentTask = findDownloadTask(id)
    if (currentTask?.status == 'pause') return currentTask

    return updateDownloadTask(id, task => ({
      ...task,
      status: 'error',
      isComplate: false,
      statusText: '下载失败',
      speed: '',
      jobId: undefined,
      error: getErrorMessage(error),
    }))
  }
}

export const createDownloadTask = async(musicInfo: LX.Music.MusicInfoOnline, options: CreateDownloadTaskOptions = {}) => {
  await ensureDownloadDirs()
  const resource = await resolveDownloadResource(musicInfo, options.quality)
  const sourceListId = options.sourceListId ?? options.listId
  const sourceListName = options.sourceListName ?? options.listName
  const existsTask = findDownloadTaskByMusic(musicInfo, resource.quality)
  if (existsTask) {
    if (sourceListId != null || sourceListName != null) {
      return updateDownloadTask(existsTask.id, task => ({
        ...task,
        metadata: {
          ...task.metadata,
          sourceListId: task.metadata.sourceListId ?? sourceListId,
          sourceListName: task.metadata.sourceListName ?? sourceListName,
        },
      })) ?? existsTask
    }
    return existsTask
  }

  const now = Date.now()
  const task = upsertDownloadTask({
    id: createTaskId(musicInfo, resource.quality),
    isComplate: false,
    status: 'waiting',
    statusText: '等待中',
    downloaded: 0,
    total: 0,
    progress: 0,
    speed: '',
    lyricPath: resource.lyricLrcPath,
    lyricJsonPath: resource.lyricJsonPath,
    lyricLrcPath: resource.lyricLrcPath,
    coverPath: resource.coverPath,
    createdAt: now,
    updatedAt: now,
    metadata: {
      musicInfo,
      sourceListId,
      sourceListName,
      url: resource.url,
      quality: resource.quality,
      ext: resource.ext,
      fileName: resource.fileName,
      filePath: resource.filePath,
    },
  })

  void runDownloadTask(task.id)
  return task
}

export const pauseDownloadTask = async(id: string) => {
  const task = findDownloadTask(id)
  if (!task) return null
  if (task.jobId != null) stopDownload(Number(task.jobId))
  return updateDownloadTask(id, task => ({
    ...task,
    status: 'pause',
    statusText: '已暂停',
    speed: '',
    jobId: undefined,
  }))
}

export const resumeDownloadTask = async(id: string) => {
  const task = findDownloadTask(id)
  if (!task) return null
  if (task.status == 'completed') return task
  return retryDownloadTask(id)
}

export const retryDownloadTask = async(id: string) => {
  const task = findDownloadTask(id)
  if (!task) return null
  const resource = await resolveDownloadResource(task.metadata.musicInfo, task.metadata.quality)
  updateDownloadTask(id, task => ({
    ...task,
    status: 'waiting',
    statusText: '等待中',
    isComplate: false,
    error: undefined,
    downloaded: 0,
    total: 0,
    progress: 0,
    speed: '',
    lyricPath: resource.lyricLrcPath,
    lyricJsonPath: resource.lyricJsonPath,
    lyricLrcPath: resource.lyricLrcPath,
    coverPath: resource.coverPath,
    metadata: {
      ...task.metadata,
      url: resource.url,
      quality: resource.quality,
      ext: resource.ext,
      fileName: resource.fileName,
      filePath: resource.filePath,
    },
  }))
  return runDownloadTask(id)
}

export const removeDownloadTask = async(id: string) => {
  const task = removeDownloadTaskState(id)
  if (!task) return null
  if (task.jobId != null) stopDownload(Number(task.jobId))
  await removeTaskFiles(task)
  return task
}

export const exportDownloadTask = async(id: string) => {
  const task = findDownloadTask(id)
  if (!task) return null
  await shareTaskFile(task)
  return task
}

export const redownloadAssets = async(id: string) => {
  const task = findDownloadTask(id)
  if (!task) return null
  updateDownloadTask(id, task => ({
    ...task,
    statusText: task.status == 'completed' ? '补全资源中' : task.statusText,
    error: undefined,
  }))
  await runAssetDownloads(id)
  return findDownloadTask(id)
}
