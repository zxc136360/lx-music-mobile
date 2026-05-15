import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, TouchableOpacity } from 'react-native'
import { Icon } from '@/components/common/Icon'
import DownloadQualityModal, { type DownloadQualityModalType } from '@/components/DownloadQualityModal'
import { createDownloadTask, getDownloadList, retryDownloadTask, subscribeDownloadList } from '@/core/download'
import { findDownloadTaskByMusic } from '@/core/download/state'
import { markTimeoutExitInteraction } from '@/core/player/timeoutExit'
import { usePlayMusicInfo } from '@/store/player/hook'
import { useTheme } from '@/store/theme/hook'
import { createStyle, toast } from '@/utils/tools'

const BTN_SIZE = 22

type DownloadState = 'disabled' | 'ready' | 'downloading' | 'downloaded'

const isDownloadTask = (musicInfo: LX.Player.PlayMusic | null): musicInfo is LX.Download.ListItem => {
  return musicInfo != null && 'progress' in musicInfo
}

const getOnlineMusicInfo = (musicInfo: LX.Player.PlayMusic | null) => {
  if (!musicInfo || isDownloadTask(musicInfo) || musicInfo.source == 'local') return null
  return musicInfo
}

const findCurrentTask = (musicInfo: LX.Music.MusicInfoOnline | null) => {
  if (!musicInfo) return null
  const tasks = getDownloadList().filter(task => {
    return task.metadata.musicInfo.source == musicInfo.source && task.metadata.musicInfo.id == musicInfo.id
  })
  return tasks.find(task => task.status == 'run' || task.status == 'waiting') ??
    tasks.find(task => task.status == 'completed') ??
    tasks[0] ??
    null
}

const findTaskByQuality = (musicInfo: LX.Music.MusicInfoOnline, quality?: LX.Quality) => {
  return quality ? findDownloadTaskByMusic(musicInfo, quality) : findCurrentTask(musicInfo)
}

export default memo(() => {
  const theme = useTheme()
  const { musicInfo: playMusicInfo } = usePlayMusicInfo()
  const downloadQualityModalRef = useRef<DownloadQualityModalType>(null)
  const musicInfo = useMemo(() => getOnlineMusicInfo(playMusicInfo), [playMusicInfo])
  const [downloadTask, setDownloadTask] = useState(() => findCurrentTask(musicInfo))

  useEffect(() => {
    setDownloadTask(findCurrentTask(musicInfo))
    return subscribeDownloadList(() => {
      setDownloadTask(findCurrentTask(musicInfo))
    })
  }, [musicInfo])

  const downloadState: DownloadState = useMemo(() => {
    if (!musicInfo) return 'disabled'
    if (!downloadTask) return 'ready'
    if (downloadTask.status == 'completed') return 'downloaded'
    if (downloadTask.status == 'run' || downloadTask.status == 'waiting') return 'downloading'
    return 'ready'
  }, [downloadTask, musicInfo])

  const handleDownload = useCallback(async(quality?: LX.Quality) => {
    if (!musicInfo) return
    markTimeoutExitInteraction()
    const task = findTaskByQuality(musicInfo, quality)
    if (task?.status == 'completed') return
    if (task?.status == 'run' || task?.status == 'waiting') return

    try {
      if (task?.status == 'pause' || task?.status == 'error') {
        await retryDownloadTask(task.id)
      } else {
        await createDownloadTask(musicInfo, { quality })
      }
      toast(global.i18n.t('download_status_waiting'))
    } catch {
      toast('添加下载任务失败', 'long')
    }
  }, [musicInfo])

  const handleLongPress = useCallback(() => {
    if (!musicInfo || downloadState == 'downloaded' || downloadState == 'downloading') return
    markTimeoutExitInteraction()
    downloadQualityModalRef.current?.show(quality => {
      void handleDownload(quality)
    })
  }, [downloadState, handleDownload, musicInfo])

  const iconColor = downloadState == 'disabled'
    ? theme['c-font-label']
    : downloadState == 'downloaded'
      ? theme['c-primary']
      : theme['c-button-font']

  return (
    <>
      <TouchableOpacity
        style={styles.controlBtn}
        activeOpacity={downloadState == 'ready' ? 0.5 : 1}
        disabled={downloadState == 'disabled' || downloadState == 'downloaded' || downloadState == 'downloading'}
        onPress={() => { void handleDownload() }}
        onLongPress={handleLongPress}
      >
        {downloadState == 'downloading'
          ? <ActivityIndicator color={iconColor} size='small' />
          : <Icon name='download-2' color={iconColor} size={BTN_SIZE} />}
      </TouchableOpacity>
      <DownloadQualityModal ref={downloadQualityModalRef} />
    </>
  )
})

const styles = createStyle({
  controlBtn: {
    width: 36,
    height: 46,
    justifyContent: 'center',
    alignItems: 'center',
  },
})
