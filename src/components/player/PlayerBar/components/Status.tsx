import { useLrcPlay } from '@/plugins/lyric'
import { useIsPlay, usePlayerMusicInfo, useStatusText } from '@/store/player/hook'
import { useTheme } from '@/store/theme/hook'
import { StyleSheet, View } from 'react-native'
import Text from '@/components/common/Text'

const sourceTextKeyMap: Record<NonNullable<LX.Player.MusicInfo['playSource']>, Parameters<typeof global.i18n.t>[0]> = {
  download: 'download_status_downloaded',
  cache: 'download_status_cache',
  online: 'download_status_online',
  local: 'download_status_local',
}

export default ({ autoUpdate }: { autoUpdate: boolean }) => {
  const { text } = useLrcPlay(autoUpdate)
  const statusText = useStatusText()
  const isPlay = useIsPlay()
  const musicInfo = usePlayerMusicInfo()
  const theme = useTheme()

  const status = isPlay ? text : statusText
  const sourceText = musicInfo.playSource ? global.i18n.t(sourceTextKeyMap[musicInfo.playSource]) : ''

  return (
    <View style={styles.container}>
      {sourceText ? (
        <View style={[styles.badge, { borderColor: theme['c-border-background'] }]}>
          <Text numberOfLines={1} size={10} color={theme['c-font-label']}>{sourceText}</Text>
        </View>
      ) : null}
      <Text style={styles.text} numberOfLines={1} size={12}>{status}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  badge: {
    flexGrow: 0,
    flexShrink: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 3,
    paddingHorizontal: 3,
    marginRight: 4,
  },
  text: {
    flexGrow: 1,
    flexShrink: 1,
  },
})
