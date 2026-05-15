import { memo, useCallback, useMemo, useState } from 'react'
import { StyleSheet, TouchableOpacity, View } from 'react-native'
import Text from '@/components/common/Text'
import { Icon } from '@/components/common/Icon'
import { useTheme } from '@/store/theme/hook'
import { locateDownloadTaskSource, pauseDownloadTask, resumeDownloadTask, retryDownloadTask } from '@/core/download'
import ActionMenu from './ActionMenu'

interface Props {
  item: LX.Download.ListItem
}

const getProgressText = (item: LX.Download.ListItem) => {
  const progress = Math.max(0, Math.min(100, (item.progress || 0) * 100))
  return `${progress.toFixed(progress >= 10 || progress == 0 ? 0 : 1)}%`
}

const getSingerText = (singer: LX.Music.MusicInfoOnline['singer']) => {
  if (Array.isArray(singer)) return singer.join('、')
  return singer || '未知歌手'
}

export default memo(({ item }: Props) => {
  const theme = useTheme()
  const [menuVisible, setMenuVisible] = useState(false)
  const musicInfo = item.metadata.musicInfo
  const progressValue = Math.max(0, Math.min(100, (item.progress || 0) * 100))
  const progressText = getProgressText(item)
  const statusColor = item.status == 'error'
    ? theme['c-primary-background-active']
    : item.status == 'completed'
      ? theme['c-primary-font']
      : theme['c-font-label']

  const primaryAction = useMemo(() => {
    switch (item.status) {
      case 'run':
      case 'waiting':
        return { label: '暂停', icon: 'pause' as const, action: async() => { return pauseDownloadTask(item.id) } }
      case 'pause':
        return { label: '继续', icon: 'play' as const, action: async() => { return resumeDownloadTask(item.id) } }
      case 'error':
        return { label: '重试', icon: 'available_updates' as const, action: async() => { return retryDownloadTask(item.id) } }
      case 'completed':
        return { label: global.i18n.t('download_action_locate'), icon: 'play' as const, action: async() => { return locateDownloadTaskSource(item.id) } }
      default:
        return null
    }
  }, [item.id, item.status])

  const handlePrimaryAction = useCallback(() => {
    if (!primaryAction) return
    void primaryAction.action()
  }, [primaryAction])

  const handleShowMenu = useCallback(() => {
    setMenuVisible(true)
  }, [])

  const handleCloseMenu = useCallback(() => {
    setMenuVisible(false)
  }, [])

  return (
    <View style={[styles.container, { backgroundColor: theme['c-content-background'], borderColor: theme['c-border-background'] }]}>
      <View style={styles.content}>
        <View style={styles.titleRow}>
          <Text style={styles.name} numberOfLines={1}>{musicInfo.name}</Text>
          <Text size={12} color={theme['c-font-label']}>{String(item.metadata.quality)}</Text>
        </View>
        <Text style={styles.singer} size={12} color={theme['c-font-label']} numberOfLines={1}>{getSingerText(musicInfo.singer)}</Text>
        <View style={[styles.progressTrack, { backgroundColor: theme['c-border-background'] }]}>
          <View style={[styles.progressBar, { width: `${progressValue}%`, backgroundColor: theme['c-primary-font'] }]} />
        </View>
        <View style={styles.statusRow}>
          <Text size={12} color={statusColor}>{item.statusText || item.status}</Text>
          <Text size={12} color={theme['c-font-label']}>{item.status == 'completed' ? '已完成' : `${progressText}${item.speed ? ` · ${item.speed}` : ''}`}</Text>
        </View>
        {item.error ? <Text style={styles.error} size={12} color={theme['c-primary-background-active']} numberOfLines={2}>{item.error}</Text> : null}
      </View>
      <View style={styles.actions}>
        {primaryAction ? (
          <TouchableOpacity style={[styles.actionButton, { backgroundColor: theme['c-button-background'] }]} onPress={handlePrimaryAction}>
            <Icon name={primaryAction.icon} size={13} color={theme['c-button-font']} />
            <Text style={styles.actionText} size={12} color={theme['c-button-font']}>{primaryAction.label}</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity style={styles.menuButton} onPress={handleShowMenu}>
          <Icon name="dots-vertical" size={13} color={theme['c-font-label']} />
        </TouchableOpacity>
      </View>
      <ActionMenu item={item} visible={menuVisible} onClose={handleCloseMenu} />
    </View>
  )
})

const styles = StyleSheet.create({
  container: {
    minHeight: 118,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    flexDirection: 'row',
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  name: {
    flex: 1,
    marginRight: 8,
  },
  singer: {
    marginTop: 4,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    marginTop: 12,
    overflow: 'hidden',
  },
  progressBar: {
    height: 4,
    borderRadius: 2,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  error: {
    marginTop: 6,
  },
  actions: {
    marginLeft: 10,
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  actionButton: {
    height: 30,
    borderRadius: 15,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionText: {
    marginLeft: 4,
  },
  menuButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
