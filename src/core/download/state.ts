import { getDownloadList as getStoreDownloadList, saveDownloadList } from '@/utils/data'
import { throttle } from '@/utils/common'
import { ensureDownloadDirs } from './paths'

type DownloadListListener = (list: LX.Download.ListItem[]) => void

let downloadList: LX.Download.ListItem[] = []
const listeners = new Set<DownloadListListener>()

const saveDownloadListThrottle = throttle((list: LX.Download.ListItem[]) => {
  void saveDownloadList(list)
}, 1000)

const emitDownloadListUpdate = () => {
  const list = getDownloadList()
  for (const listener of listeners) listener(list)
  global.app_event.downloadListUpdate()
  saveDownloadListThrottle(list)
}

export const initDownloadList = async() => {
  await ensureDownloadDirs()
  downloadList = await getStoreDownloadList()
  emitDownloadListUpdate()
  return getDownloadList()
}

export const getDownloadList = () => downloadList

export const subscribeDownloadList = (listener: DownloadListListener) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const findDownloadTask = (id: string) => downloadList.find(item => item.id == id)

export const findDownloadTaskByMusic = (musicInfo: LX.Music.MusicInfo, quality?: LX.Quality) => {
  return downloadList.find(item => {
    if (item.metadata.musicInfo.source != musicInfo.source) return false
    if (item.metadata.musicInfo.id != musicInfo.id) return false
    return quality ? item.metadata.quality == quality : true
  })
}

export const upsertDownloadTask = (task: LX.Download.ListItem) => {
  const index = downloadList.findIndex(item => item.id == task.id)
  const targetTask = {
    ...task,
    updatedAt: Date.now(),
  }
  if (index < 0) {
    downloadList = [targetTask, ...downloadList]
  } else {
    downloadList = [
      ...downloadList.slice(0, index),
      targetTask,
      ...downloadList.slice(index + 1),
    ]
  }
  emitDownloadListUpdate()
  return targetTask
}

export const updateDownloadTask = (id: string, updater: (task: LX.Download.ListItem) => LX.Download.ListItem) => {
  const task = findDownloadTask(id)
  if (!task) return null
  return upsertDownloadTask(updater(task))
}

export const removeDownloadTaskState = (id: string) => {
  const task = findDownloadTask(id)
  if (!task) return null
  downloadList = downloadList.filter(item => item.id != id)
  emitDownloadListUpdate()
  return task
}

export const flushDownloadList = async() => {
  await saveDownloadList(downloadList)
}
