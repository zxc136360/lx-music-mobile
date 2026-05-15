import { forwardRef, useImperativeHandle, useRef } from 'react'
import { View } from 'react-native'
import Dialog, { type DialogType } from '@/components/common/Dialog'
import Button from '@/components/common/Button'
import Text from '@/components/common/Text'
import { useTheme } from '@/store/theme/hook'
import { createStyle } from '@/utils/tools'

const qualityList: LX.Quality[] = ['128k', '320k', 'flac', 'flac24bit']

const qualityLabels: Record<LX.Quality, string> = {
  '128k': '128k',
  '192k': '192k',
  '320k': '320k',
  flac: 'FLAC',
  flac24bit: 'Hi-Res',
  ape: 'APE',
  wav: 'WAV',
}

export interface DownloadQualityModalType {
  show: (onSelect: (quality: LX.Quality) => void) => void
}

export default forwardRef<DownloadQualityModalType>((_props, ref) => {
  const theme = useTheme()
  const dialogRef = useRef<DialogType>(null)
  const onSelectRef = useRef<(quality: LX.Quality) => void>()

  useImperativeHandle(ref, () => ({
    show(onSelect) {
      onSelectRef.current = onSelect
      requestAnimationFrame(() => {
        dialogRef.current?.setVisible(true)
      })
    },
  }))

  const handleSelect = (quality: LX.Quality) => {
    dialogRef.current?.setVisible(false)
    onSelectRef.current?.(quality)
  }

  return (
    <Dialog ref={dialogRef} title={global.i18n.t('download_choose_quality')}>
      <View style={styles.content}>
        {qualityList.map(quality => (
          <Button
            key={quality}
            style={{ ...styles.item, borderBottomColor: theme['c-primary-light-200-alpha-700'] }}
            onPress={() => { handleSelect(quality) }}
          >
            <Text style={styles.itemText} size={15}>{qualityLabels[quality]}</Text>
          </Button>
        ))}
      </View>
    </Dialog>
  )
})

const styles = createStyle({
  content: {
    width: 240,
    paddingTop: 8,
    paddingBottom: 8,
  },
  item: {
    minHeight: 44,
    justifyContent: 'center',
    paddingLeft: 20,
    paddingRight: 20,
    borderBottomWidth: 0.5,
  },
  itemText: {
    textAlign: 'center',
  },
})
