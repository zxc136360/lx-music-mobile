import { addListMusics, getListMusics, removeListMusics, removeUserList, setFetchingListStatus, updateListMusics } from '@/core/list'
import { confirmDialog, handleReadFile, handleSaveFile, showImportTip, toast } from '@/utils/tools'
import syncSourceList from '@/core/syncSourceList'
import { log } from '@/utils/log'
import { filterFileName, filterMusicList, formatPlayTime2, toNewMusicInfo } from '@/utils'
import { handleImportListPart } from '@/screens/Home/Views/Setting/settings/Backup/actions'
import { readMetadata, scanAudioFiles, type MusicMetadataFull } from '@/utils/localMediaMetadata'
import settingState from '@/store/setting/state'
import BackgroundTimer from 'react-native-background-timer'
import { temporaryDirectoryPath, unlink, type FileType } from '@/utils/fs'
import { Platform } from 'react-native'
import { shareFile } from '@/utils/nativeModules/utils'
import { createDownloadTask } from '@/core/download'
import { findDownloadTaskByMusic } from '@/core/download/state'

export const handleRemove = (listInfo: LX.List.UserListInfo) => {
  void confirmDialog({
    message: global.i18n.t('list_remove_tip', { name: listInfo.name }),
    confirmButtonText: global.i18n.t('list_remove_tip_button'),
  }).then(isRemove => {
    if (!isRemove) return
    void removeUserList([listInfo.id])
  })
}

const readListData = async(path: string) => {
  let configData: any
  try {
    configData = await handleReadFile(path)
  } catch (error: any) {
    log.error(error.stack)
    throw error
  }
  let listData: LX.ConfigFile.MyListInfoPart['data']
  switch (configData.type) {
    case 'playListPart':
      listData = configData.data
      listData.list = filterMusicList(listData.list.map(m => toNewMusicInfo(m)))
      break
    case 'playListPart_v2':
      listData = configData.data
      break
    default:
      showImportTip(configData.type as string)
      return null
  }
  return listData
}

export const handleImport = (path: string, position: number) => {
  toast(global.i18n.t('setting_backup_part_import_list_tip_unzip'))
  void readListData(path).then(async listData => {
    if (listData == null) return
    void handleImportListPart(listData, position)
  }).catch((err) => {
    log.error(err)
    toast(global.i18n.t('setting_backup_part_import_list_tip_error'))
  })
}

const exportList = async(listInfo: LX.List.MyListInfo, path: string) => {
  const data = JSON.parse(JSON.stringify({
    type: 'playListPart_v2',
    data: {
      ...listInfo,
      list: await getListMusics(listInfo.id),
    },
  }))
  try {
    await handleSaveFile(`${path}/lx_list_part_${filterFileName(listInfo.name)}.lxmc`, data)
  } catch (error: any) {
    log.error(error.stack)
  }
}
export const handleExport = (listInfo: LX.List.MyListInfo, path?: string) => {
  toast(global.i18n.t('setting_backup_part_export_list_tip_zip'))
  const exportPath = Platform.OS == 'ios' ? temporaryDirectoryPath : path
  if (!exportPath) {
    toast(global.i18n.t('setting_backup_part_export_list_tip_failed'), 'long')
    return
  }
  const filePath = `${exportPath}/lx_list_part_${filterFileName(listInfo.name)}.lxmc`
  exportList(listInfo, exportPath).then(async() => {
    if (Platform.OS == 'ios') {
      await shareFile(global.i18n.t('share_title_music'), filePath).finally(() => {
        void unlink(filePath)
      })
    }
    toast(global.i18n.t('setting_backup_part_export_list_tip_success'))
  }).catch((err: any) => {
    log.error(err.message)
    toast(global.i18n.t('setting_backup_part_export_list_tip_failed') + ': ' + (err.message as string))
  })
}

export const handleSync = (listInfo: LX.List.UserListInfo) => {
  void confirmDialog({
    message: global.i18n.t('list_sync_confirm_tip', { name: listInfo.name }),
    confirmButtonText: global.i18n.t('list_remove_tip_button'),
  }).then(isSync => {
    if (!isSync) return
    void syncSourceList(listInfo).then(() => {
      toast(global.i18n.t('list_update_success', { name: listInfo.name }))
    }).catch(() => {
      toast(global.i18n.t('list_update_error', { name: listInfo.name }))
    })
  })
}

export const handleDownloadAll = async(listInfo: LX.List.MyListInfo, quality: LX.Quality) => {
  try {
    const list = await getListMusics(listInfo.id)
    if (!list.length) {
      toast('当前列表为空', 'long')
      return
    }

    const onlineList = list.filter((musicInfo): musicInfo is LX.Music.MusicInfoOnline => musicInfo.source != 'local')
    const localCount = list.length - onlineList.length
    if (!onlineList.length) {
      toast('当前列表没有可下载的在线歌曲', 'long')
      return
    }

    let added = 0
    let skipped = 0
    let failed = 0
    for (const musicInfo of onlineList) {
      const existsTask = findDownloadTaskByMusic(musicInfo, quality)
      if (existsTask) {
        skipped++
        continue
      }

      try {
        await createDownloadTask(musicInfo, {
          quality,
          sourceListId: listInfo.id,
          sourceListName: listInfo.name,
        })
        added++
      } catch (error) {
        log.error(error)
        failed++
      }
    }

    const messages = []
    if (added) messages.push(`已添加 ${added} 个下载任务`)
    if (skipped) messages.push(`已跳过 ${skipped} 个已有任务`)
    if (localCount) messages.push(`已跳过 ${localCount} 首本地歌曲`)
    if (failed) messages.push(`${failed} 首歌曲下载任务创建失败`)

    if (!messages.length) {
      toast('当前列表没有可下载的在线歌曲', 'long')
      return
    }

    toast(messages.join('，'), failed ? 'long' : undefined)
  } catch (error) {
    log.error(error)
    toast('批量下载失败', 'long')
  }
}

export const buildLocalMusicInfoByFilePath = (file: FileType): LX.Music.MusicInfoLocal => {
  const index = file.name.lastIndexOf('.')
  return {
    id: file.path,
    name: file.name.substring(0, index),
    singer: '',
    source: 'local',
    interval: null,
    meta: {
      albumName: '',
      filePath: file.path,
      songId: file.path,
      picUrl: '',
      ext: file.name.substring(index + 1),
    },
  }
}
export const buildLocalMusicInfo = (filePath: string, metadata: MusicMetadataFull): LX.Music.MusicInfoLocal => {
  return {
    id: filePath,
    name: metadata.name,
    singer: metadata.singer,
    source: 'local',
    interval: formatPlayTime2(metadata.interval),
    meta: {
      albumName: metadata.albumName,
      filePath,
      songId: filePath,
      picUrl: '',
      ext: metadata.ext,
    },
  }
}
const createLocalMusicInfos = async(filePaths: string[], errorPath: string[]): Promise<LX.Music.MusicInfoLocal[]> => {
  const list: LX.Music.MusicInfoLocal[] = []
  filePaths = [...filePaths]
  while (filePaths.length) {
    const tasks = [
      filePaths.shift(),
      filePaths.shift(),
      filePaths.shift(),
      filePaths.shift(),
      filePaths.shift(),
    ].filter(Boolean) as string[]

    await Promise.all(tasks.map(async path => readMetadata(path).then(info => ([path, info] as const)))).then((res) => {
      for (const [path, info] of res) {
        if (!info) {
          errorPath.push(path)
          continue
        }
        list.push(buildLocalMusicInfo(path, info))
      }
    })
  }
  return list
}

const createThrottleAddMusics = (add: (listId: string, musicInfos: LX.Music.MusicInfoLocal[]) => Promise<void>, remove: (listId: string, errorPath: string[]) => Promise<void>, listId: string) => {
  let timer: number | null = null
  let _musicInfos: LX.Music.MusicInfoLocal[] = []
  let _errorPath: string[] = []
  return (musicInfos: LX.Music.MusicInfoLocal[], errorPath?: string[]) => {
    if (musicInfos.length) _musicInfos = [..._musicInfos, ...musicInfos]
    if (errorPath) _errorPath = [..._errorPath, ...errorPath]
    if (timer) return
    timer = BackgroundTimer.setTimeout(async() => {
      timer = null
      let musicInfos = _musicInfos
      _musicInfos = []
      let errorPath = _errorPath
      _errorPath = []
      if (musicInfos.length) await add(listId, musicInfos)
      if (errorPath.length) await remove(listId, errorPath)
    }, 1000)
  }
}

const handleUpdateMusics = async(filePaths: string[],
  throttleUpdateMusics: (musicInfos: LX.Music.MusicInfoLocal[], errorPath?: string[]) => void, index: number = -1, total: number = 0, errorPath: string[] = []) => {
  // console.log(index + 1, index + 201)
  if (!total) total = filePaths.length
  const paths = filePaths.slice(index + 1, index + 11)
  const musicInfos = await createLocalMusicInfos(paths, errorPath)
  if (musicInfos.length) throttleUpdateMusics(musicInfos)
  index += 10
  if (filePaths.length - 1 > index) await handleUpdateMusics(filePaths, throttleUpdateMusics, index, total, errorPath)
  else {
    if (errorPath.length) {
      log.warn('Parse metadata failed:\n' + errorPath.map(p => p.split('/').at(-1)).join('\n'))
      toast(global.i18n.t('list_select_local_file_result_failed_tip', { total, success: total - errorPath.length, failed: errorPath.length }), 'long')
    } else {
      toast(global.i18n.t('list_select_local_file_result_tip', { total }), 'long')
    }
    throttleUpdateMusics([], errorPath)
  }
}
export const handleImportMediaFile = async(listInfo: LX.List.MyListInfo, path: string) => {
  setFetchingListStatus(listInfo.id, true)
  const files = await scanAudioFiles(path)
  if (files.length) {
    const throttleUpdateMusics = createThrottleAddMusics(async(listId, musicInfos) => {
      return updateListMusics(musicInfos.map(info => ({ id: listId, musicInfo: info })))
    }, async(listId, errorPath) => {
      return removeListMusics(listId, errorPath)
    }, listInfo.id)
    await addListMusics(listInfo.id, files.map(buildLocalMusicInfoByFilePath), settingState.setting['list.addMusicLocationType'])
    toast(global.i18n.t('list_select_local_file_temp_add_tip', { total: files.length }), 'long')
    await handleUpdateMusics(files.map(f => f.path), throttleUpdateMusics)
  } else toast(global.i18n.t('list_select_local_file_empty_tip'), 'long')
  setFetchingListStatus(listInfo.id, false)
}
