import { LIST_IDS } from '@/config/constant'
import { createDownloadTask, retryDownloadTask, type CreateDownloadTaskOptions } from '@/core/download'
import { findDownloadTaskByMusic } from '@/core/download/state'
import { addListMusics } from '@/core/list'
import { playList, playNext } from '@/core/player/player'
import { addTempPlayList } from '@/core/player/tempPlayList'
import settingState from '@/store/setting/state'
import { getListMusicSync } from '@/utils/listManage'
import { confirmDialog, openUrl, shareMusic, toast } from '@/utils/tools'
import { addDislikeInfo, hasDislike } from '@/core/dislikeList'
import playerState from '@/store/player/state'
import musicSdk from '@/utils/musicSdk'
import { toOldMusicInfo } from '@/utils'

export const handlePlay = (musicInfo: LX.Music.MusicInfoOnline) => {
  void addListMusics(LIST_IDS.DEFAULT, [musicInfo], settingState.setting['list.addMusicLocationType']).then(() => {
    const index = getListMusicSync(LIST_IDS.DEFAULT).findIndex(m => m.id == musicInfo.id)
    if (index < 0) return
    void playList(LIST_IDS.DEFAULT, index)
  })
}
export const handlePlayLater = (musicInfo: LX.Music.MusicInfoOnline, selectedList: LX.Music.MusicInfoOnline[], onCancelSelect: () => void) => {
  if (selectedList.length) {
    addTempPlayList(selectedList.map(s => ({ listId: '', musicInfo: s })))
    onCancelSelect()
  } else {
    addTempPlayList([{ listId: '', musicInfo }])
  }
}


export const handleDownload = async(musicInfo: LX.Music.MusicInfoOnline, selectedList: LX.Music.MusicInfoOnline[], onCancelSelect: () => void, options: CreateDownloadTaskOptions = {}) => {
  const list = selectedList.length ? selectedList : [musicInfo]
  let added = 0
  let skipped = 0
  let retried = 0
  let failed = 0

  for (const musicInfo of list) {
    try {
      const existsTask = findDownloadTaskByMusic(musicInfo, options.quality)
      if (existsTask) {
        if (existsTask.status == 'error' || existsTask.status == 'pause') {
          await retryDownloadTask(existsTask.id)
          retried++
        } else {
          skipped++
        }
        continue
      }
      await createDownloadTask(musicInfo, options)
      added++
    } catch {
      failed++
    }
  }

  if (selectedList.length) onCancelSelect()

  const messages = []
  if (added) messages.push(`已添加 ${added} 个下载任务`)
  if (retried) messages.push(`已重试 ${retried} 个下载任务`)
  if (skipped) messages.push(`已跳过 ${skipped} 个已有任务`)
  if (failed) messages.push(`${failed} 个任务添加失败`)
  if (!messages.length) return
  if (failed) toast(messages.join('，'), 'long')
  else toast(messages.join('，'))
}

export const handleShare = (musicInfo: LX.Music.MusicInfoOnline) => {
  shareMusic(settingState.setting['common.shareType'], settingState.setting['download.fileName'], musicInfo)
}

export const handleShowMusicSourceDetail = async(minfo: LX.Music.MusicInfoOnline) => {
  const url = musicSdk[minfo.source as LX.OnlineSource]?.getMusicDetailPageUrl(toOldMusicInfo(minfo))
  if (!url) return
  void openUrl(url)
}


export const handleDislikeMusic = async(musicInfo: LX.Music.MusicInfoOnline) => {
  const confirm = await confirmDialog({
    message: musicInfo.singer ? global.i18n.t('lists_dislike_music_singer_tip', { name: musicInfo.name, singer: musicInfo.singer }) : global.i18n.t('lists_dislike_music_tip', { name: musicInfo.name }),
    cancelButtonText: global.i18n.t('cancel_button_text_2'),
    confirmButtonText: global.i18n.t('confirm_button_text'),
    bgClose: false,
  })
  if (!confirm) return
  await addDislikeInfo([{ name: musicInfo.name, singer: musicInfo.singer }])
  toast(global.i18n.t('lists_dislike_music_add_tip'))
  if (hasDislike(playerState.playMusicInfo.musicInfo)) {
    void playNext(true)
  }
}

