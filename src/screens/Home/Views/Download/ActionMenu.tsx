import { memo, useCallback } from 'react'
import { Modal, StyleSheet, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native'
import Text from '@/components/common/Text'
import { Icon } from '@/components/common/Icon'
import { useTheme } from '@/store/theme/hook'
import { exportDownloadTask, locateDownloadTaskSource, pauseDownloadTask, redownloadAssets, resumeDownloadTask, retryDownloadTask } from '@/core/download'
import { handleRemoveDownloadTask } from './listAction'

interface Props {
  item: LX.Download.ListItem
  visible: boolean
  onClose: () => void
}

type IconName = 'pause' | 'play' | 'available_updates' | 'share' | 'download-2' | 'remove'

interface ActionItem {
  label: string
  icon: IconName
  action: () => Promise<unknown>
  danger?: boolean
}

export default memo(({ item, visible, onClose }: Props) => {
  const theme = useTheme()
  const actions: ActionItem[] = []

  if (item.status == 'run' || item.status == 'waiting') {
    actions.push({ label: '暂停任务', icon: 'pause', action: async() => { return pauseDownloadTask(item.id) } })
  }
  if (item.status == 'pause') {
    actions.push({ label: '继续下载', icon: 'play', action: async() => { return resumeDownloadTask(item.id) } })
  }
  if (item.status == 'error') {
    actions.push({ label: '重试下载', icon: 'available_updates', action: async() => { return retryDownloadTask(item.id) } })
  }
  actions.push(
    { label: global.i18n.t('download_action_locate'), icon: 'play', action: async() => { return locateDownloadTaskSource(item.id) } },
    { label: '分享/导出', icon: 'share', action: async() => { return exportDownloadTask(item.id) } },
    { label: '补全歌词封面', icon: 'download-2', action: async() => { return redownloadAssets(item.id) } },
    { label: '删除任务', icon: 'remove', action: async() => { return handleRemoveDownloadTask(item) }, danger: true },
  )

  const handlePress = useCallback((action: ActionItem['action']) => {
    onClose()
    void action()
  }, [onClose])

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.mask}>
          <TouchableWithoutFeedback>
            <View style={[styles.panel, { backgroundColor: theme['c-content-background'] }]}>
              <Text style={styles.title} size={16}>{item.metadata.musicInfo.name}</Text>
              {actions.map(action => (
                <TouchableOpacity key={action.label} style={styles.item} onPress={() => { handlePress(action.action) }}>
                  <Icon name={action.icon} size={16} color={action.danger ? theme['c-primary-background-active'] : theme['c-font']} />
                  <Text style={styles.label} size={14} color={action.danger ? theme['c-primary-background-active'] : theme['c-font']}>{action.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  )
})

const styles = StyleSheet.create({
  mask: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.32)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  panel: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 14,
    paddingVertical: 10,
  },
  title: {
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  item: {
    height: 44,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
  },
  label: {
    marginLeft: 12,
  },
})
