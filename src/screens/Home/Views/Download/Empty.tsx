import { memo, useCallback } from 'react'
import { StyleSheet, TouchableOpacity, View } from 'react-native'
import Text from '@/components/common/Text'
import { Icon } from '@/components/common/Icon'
import { setNavActiveId } from '@/core/common'
import { useTheme } from '@/store/theme/hook'

export default memo(() => {
  const theme = useTheme()

  const handleSearch = useCallback(() => {
    setNavActiveId('nav_search')
  }, [])

  const handleList = useCallback(() => {
    setNavActiveId('nav_love')
  }, [])

  return (
    <View style={styles.container}>
      <Icon name="download-2" size={48} color={theme['c-font-label']} />
      <Text style={styles.title} size={18}>暂无下载任务</Text>
      <Text style={styles.desc} size={13} color={theme['c-font-label']}>可以从搜索结果或列表歌曲菜单发起下载</Text>
      <View style={styles.actions}>
        <TouchableOpacity style={[styles.button, { backgroundColor: theme['c-button-background'] }]} onPress={handleSearch}>
          <Icon name="search-2" size={14} color={theme['c-button-font']} />
          <Text style={styles.buttonText} size={13} color={theme['c-button-font']}>去搜索</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.button, { backgroundColor: theme['c-button-background'] }]} onPress={handleList}>
          <Icon name="album" size={14} color={theme['c-button-font']} />
          <Text style={styles.buttonText} size={13} color={theme['c-button-font']}>去列表</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
})

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  title: {
    marginTop: 18,
  },
  desc: {
    marginTop: 8,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    marginTop: 22,
  },
  button: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 5,
  },
  buttonText: {
    marginLeft: 6,
  },
})
