import { updateSetting } from '@/core/common'
import { useI18n } from '@/lang'
import { useSettingValue } from '@/store/setting/hook'
import CheckBox from '@/components/common/CheckBox'
import { memo, useMemo } from 'react'
import { StyleSheet, View } from 'react-native'

import CheckBoxItem from '../components/CheckBoxItem'
import Section from '../components/Section'
import SubTitle from '../components/SubTitle'

type DownloadFileName = LX.AppSetting['download.fileName']

const setFileName = (fileName: DownloadFileName) => {
  updateSetting({ 'download.fileName': fileName })
}

const useFileNameActive = (fileName: DownloadFileName) => {
  const currentFileName = useSettingValue('download.fileName')
  const isActive = useMemo(() => currentFileName == fileName, [currentFileName, fileName])
  return isActive
}

const FileNameItem = ({ id, name }: {
  id: DownloadFileName
  name: string
}) => {
  const isActive = useFileNameActive(id)
  return <CheckBox marginRight={8} check={isActive} label={name} onChange={() => { setFileName(id) }} need />
}

const FileName = memo(() => {
  const t = useI18n()

  return (
    <SubTitle title={t('setting_download_file_name')}>
      <View style={styles.list}>
        <FileNameItem id="歌名 - 歌手" name={t('setting_download_file_name_name_singer')} />
        <FileNameItem id="歌手 - 歌名" name={t('setting_download_file_name_singer_name')} />
        <FileNameItem id="歌名" name={t('setting_download_file_name_name')} />
      </View>
    </SubTitle>
  )
})

const DownloadLyric = memo(() => {
  const t = useI18n()
  const isDownloadLyric = useSettingValue('download.isDownloadLyric')
  const setDownloadLyric = (isDownloadLyric: boolean) => {
    updateSetting({ 'download.isDownloadLyric': isDownloadLyric })
  }

  return (
    <View style={styles.content}>
      <CheckBoxItem
        check={isDownloadLyric}
        onChange={setDownloadLyric}
        label={t('setting_download_lyric')}
        helpDesc={t('setting_download_lyric_tip')}
      />
    </View>
  )
})

const DownloadCover = memo(() => {
  const t = useI18n()
  const isDownloadCover = useSettingValue('download.isDownloadCover')
  const setDownloadCover = (isDownloadCover: boolean) => {
    updateSetting({ 'download.isDownloadCover': isDownloadCover })
  }

  return (
    <View style={styles.content}>
      <CheckBoxItem
        check={isDownloadCover}
        onChange={setDownloadCover}
        label={t('setting_download_cover')}
        helpDesc={t('setting_download_cover_tip')}
      />
    </View>
  )
})

const ShowCompleteToast = memo(() => {
  const t = useI18n()
  const isShowCompleteToast = useSettingValue('download.isShowCompleteToast')
  const setShowCompleteToast = (isShowCompleteToast: boolean) => {
    updateSetting({ 'download.isShowCompleteToast': isShowCompleteToast })
  }

  return (
    <View style={styles.content}>
      <CheckBoxItem
        check={isShowCompleteToast}
        onChange={setShowCompleteToast}
        label={t('setting_download_complete_toast')}
      />
    </View>
  )
})

const AutoCleanFailedTask = memo(() => {
  const t = useI18n()
  const isAutoCleanFailedTask = useSettingValue('download.isAutoCleanFailedTask')
  const setAutoCleanFailedTask = (isAutoCleanFailedTask: boolean) => {
    updateSetting({ 'download.isAutoCleanFailedTask': isAutoCleanFailedTask })
  }

  return (
    <View style={styles.content}>
      <CheckBoxItem
        check={isAutoCleanFailedTask}
        onChange={setAutoCleanFailedTask}
        label={t('setting_download_auto_clean_failed_task')}
        helpDesc={t('setting_download_auto_clean_failed_task_tip')}
      />
    </View>
  )
})

export default memo(() => {
  const t = useI18n()

  return (
    <Section title={t('setting_download')}>
      <FileName />
      <DownloadLyric />
      <DownloadCover />
      <ShowCompleteToast />
      <AutoCleanFailedTask />
    </Section>
  )
})

const styles = StyleSheet.create({
  list: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  content: {
    marginTop: 5,
  },
})
