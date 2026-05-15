import { getListMusics, setActiveList } from '@/core/list'
import { setNavActiveId } from '@/core/common'
import { LIST_IDS } from '@/config/constant'
import listState from '@/store/list/state'
import { existsFile } from '@/utils/fs'
import { shareMusicFile, toast } from '@/utils/tools'
import { findDownloadTask as findDownloadTaskRaw } from './state'
import {
  createDownloadTask,
  pauseDownloadTask,
  resumeDownloadTask,
  retryDownloadTask,
  removeDownloadTask,
  redownloadAssets,
  type CreateDownloadTaskOptions,
} from './task'

export {
  initDownloadList,
  getDownloadList,
  subscribeDownloadList as subscribe,
  subscribeDownloadList,
  findDownloadTask,
} from './state'

export {
  createDownloadTask,
  pauseDownloadTask,
  resumeDownloadTask,
  retryDownloadTask,
  removeDownloadTask,
  redownloadAssets,
  type CreateDownloadTaskOptions,
}

export const exportDownloadTask = async(id: string) => {
  const task = findDownloadTaskRaw(id)
  if (!task) return null
  if (task.status != 'completed') return null
  if (!await existsFile(task.metadata.filePath)) return null

  await shareMusicFile(task.metadata.fileName, task.metadata.filePath)
  return task
}

const findDownloadSourceList = async(task: LX.Download.ListItem) => {
  const listIds: string[] = [LIST_IDS.DEFAULT, LIST_IDS.LOVE, ...listState.userList.map(list => list.id)]
  if (task.metadata.sourceListId) {
    listIds.unshift(task.metadata.sourceListId)
  }

  const checkedIds = new Set<string>()
  for (const listId of listIds) {
    if (checkedIds.has(listId)) continue
    checkedIds.add(listId)
    const list = await getListMusics(listId)
    const index = list.findIndex(musicInfo => musicInfo.id == task.metadata.musicInfo.id && musicInfo.source == task.metadata.musicInfo.source)
    if (index > -1) return { listId, index }
  }

  return null
}

export const locateDownloadTaskSource = async(id: string) => {
  const task = findDownloadTaskRaw(id)
  if (!task) return null

  const target = await findDownloadSourceList(task)
  if (!target) {
    toast('未在歌单中找到这首歌', 'long')
    return null
  }

  setActiveList(target.listId)
  setNavActiveId('nav_love')
  setTimeout(() => {
    global.app_event.jumpListPosition({ listId: target.listId, index: target.index })
  }, 200)
  return target
}
