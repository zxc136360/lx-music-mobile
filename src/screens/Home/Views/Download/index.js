import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { getDownloadList, subscribeDownloadList } from '@/core/download'
import { useTheme } from '@/store/theme/hook'
import Text from '@/components/common/Text'
import List from './List'
import Empty from './Empty'

export default () => {
  const theme = useTheme()
  const [list, setList] = useState(() => [...getDownloadList()])

  const updateList = useCallback(() => {
    setList([...getDownloadList()])
  }, [])

  useEffect(() => {
    const unsubscribe = subscribeDownloadList(nextList => {
      setList([...nextList])
    })

    global.app_event.on('downloadListUpdate', updateList)
    updateList()

    return () => {
      unsubscribe()
      global.app_event.off('downloadListUpdate', updateList)
    }
  }, [updateList])

  return (
    <View style={styles.container}>
      <View style={[styles.header, { borderBottomColor: theme['c-border-background'] }]}>
        <Text size={18}>下载</Text>
        <Text size={12} color={theme['c-font-label']}>共 {list.length} 个任务</Text>
      </View>
      {list.length
        ? <List list={list} />
        : <Empty />}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    height: 56,
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
})
