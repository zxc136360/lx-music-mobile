import { memo, useCallback, useMemo, useState } from 'react'
import { StyleSheet, TouchableOpacity, View } from 'react-native'
import { scaleSizeH } from '@/utils/pixelRatio'
import Text from '@/components/common/Text'
import { Icon } from '@/components/common/Icon'
import { useTheme } from '@/store/theme/hook'
import { locateDownloadTaskSource, pauseDownloadTask, resumeDownloadTask, retryDownloadTask } from '@/core/download'
import ActionMenu from './ActionMenu'
import { handleRemoveDownloadTask } from './listAction'

export const ITEM_HEIGHT = scaleSizeH(130)

interface Props {
  item: LX.Download.ListItem
  isSelected: boolean
  isMultiSelectMode: boolean
  onToggleSelect: (id: string) => void
  onEnterMultiSelect: (id: string) => void
}

const getProgressText = (item: LX.Download.ListItem) => {
  const progress = Math.max(0, Math.min(100, (item.progress || 0) * 100))
  return `${progress.toFixed(progress >= 10 || progress == 0 ? 0 : 1)}%`
}

const getSingerText = (singer: LX.Music.MusicInfoOnline['singer']) => {
  if (Array.isArray(singer)) return singer.join('、')
  return singer || '未知歌手'
}

export default memo(({ item, isSelected, isMultiSelectMode, onToggleSelect, onEnterMultiSelect }: Props) => {
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

  const handleRemove = useCallback(() => {
    void handleRemoveDownloadTask(item)
  }, [item])

  const handleShowMenu = useCallback(() => {
    setMenuVisible(true)
  }, [])

  const handleCloseMenu = useCallback(() => {
    setMenuVisible(false)
  }, [])

  const handlePress = useCallback(() => {
    if (!isMultiSelectMode) return
    onToggleSelect(item.id)
  }, [isMultiSelectMode, item.id, onToggleSelect])

  const handleLongPress = useCallback(() => {
    onEnterMultiSelect(item.id)
  }, [item.id, onEnterMultiSelect])

  return (
    <TouchableOpacity
      activeOpacity={isMultiSelectMode ? 0.75 : 1}
      onPress={handlePress}
      onLongPress={handleLongPress}
      style={[
        styles.container,
        {
          backgroundColor: isSelected ? theme['c-primary-background-hover'] : theme['c-content-background'],
          borderColor: isSelected ? theme['c-primary-font'] : theme['c-border-background'],
        },
      ]}>
      {isMultiSelectMode ? (
        <View style={styles.selectIcon}>
          <Icon name={isSelected ? 'checkbox-marked' : 'checkbox-blank-outline'} size={22} color={isSelected ? theme['c-primary-font'] : theme['c-font-label']} />
        </View>
      ) : null}
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
          <Text size={12} color={statusColor} numberOfLines={1}>{item.statusText || item.status}</Text>
          <Text size={12} color={theme['c-font-label']} numberOfLines={1}>{item.status == 'completed' ? '已完成' : `${progressText}${item.speed ? ` · ${item.speed}` : ''}`}</Text>
        </View>
        {item.error ? <Text style={styles.error} size={12} color={theme['c-primary-background-active']} numberOfLines={1}>{item.error}</Text> : null}
      </View>
      {isMultiSelectMode ? null : (
        <View style={styles.actions}>
          {primaryAction ? (
            <TouchableOpacity style={[styles.actionButton, { backgroundColor: theme['c-button-background'] }]} onPress={handlePrimaryAction}>
              <Icon name={primaryAction.icon} size={13} color={theme['c-button-font']} />
              <Text style={styles.actionText} size={12} color={theme['c-button-font']}>{primaryAction.label}</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={[styles.actionButton, styles.removeButton, { borderColor: theme['c-primary-background-active'] }]} onPress={handleRemove}>
            <Icon name="remove" size={13} color={theme['c-primary-background-active']} />
            <Text style={styles.actionText} size={12} color={theme['c-primary-background-active']}>删除</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuButton} onPress={handleShowMenu}>
            <Icon name="dots-vertical" size={13} color={theme['c-font-label']} />
          </TouchableOpacity>
        </View>
      )}
      <ActionMenu item={item} visible={menuVisible} onClose={handleCloseMenu} />
    </TouchableOpacity>
  )
})

const styles = StyleSheet.create({
  container: {
    height: ITEM_HEIGHT,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    flexDirection: 'row',
  },
  selectIcon: {
    width: 30,
    alignItems: 'flex-start',
    justifyContent: 'center',
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
    height: 28,
    borderRadius: 14,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  removeButton: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  actionText: {
    marginLeft: 4,
  },
  menuButton: {
    width: 34,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
