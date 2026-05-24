import { useRef, useImperativeHandle, forwardRef, useState, useEffect, useCallback } from 'react'
import SearchTipList, { type SearchTipListProps as _SearchTipListProps, type SearchTipListType } from '@/components/SearchTipList'
import { debounce } from '@/utils'
import Button from '@/components/common/Button'
import { createStyle } from '@/utils/tools'
import Text from '@/components/common/Text'
import { useTheme } from '@/store/theme/hook'
import { View } from 'react-native'
import { scaleSizeH } from '@/utils/pixelRatio'
import { BorderWidths } from '@/theme'
import { useI18n } from '@/lang'
import { searchDownloadList } from './listAction'

export const ITEM_HEIGHT = scaleSizeH(64)

type SearchTipListProps = _SearchTipListProps<LX.Download.ListItem>

interface ListDownloadSearchProps {
  list: LX.Download.ListItem[]
  onScrollToInfo: (info: LX.Download.ListItem) => void
}

export interface ListDownloadSearchType {
  search: (keyword: string, height: number) => void
  hide: () => void
}

export const debounceSearchList = debounce((text: string, list: LX.Download.ListItem[], callback: (list: LX.Download.ListItem[]) => void) => {
  callback(searchDownloadList(list, text))
}, 200)

const getSingerText = (singer: LX.Music.MusicInfoOnline['singer']) => {
  if (Array.isArray(singer)) return singer.join('、')
  return singer || '未知歌手'
}

export default forwardRef<ListDownloadSearchType, ListDownloadSearchProps>(({ list, onScrollToInfo }, ref) => {
  const searchTipListRef = useRef<SearchTipListType<LX.Download.ListItem>>(null)
  const [visible, setVisible] = useState(false)
  const currentKeywordRef = useRef('')
  const currentHeightRef = useRef(0)
  const currentSearchIdRef = useRef(0)
  const theme = useTheme()
  const t = useI18n()

  const handleShowList = useCallback((keyword: string, height = currentHeightRef.current) => {
    currentHeightRef.current = height
    searchTipListRef.current?.setHeight(height)
    currentKeywordRef.current = keyword
    const searchId = ++currentSearchIdRef.current
    if (keyword) {
      debounceSearchList(keyword, list, (resultList) => {
        if (currentKeywordRef.current != keyword || currentSearchIdRef.current != searchId) return
        searchTipListRef.current?.setList(resultList)
      })
    } else {
      currentSearchIdRef.current = searchId
      searchTipListRef.current?.hide()
    }
  }, [list])

  useImperativeHandle(ref, () => ({
    search(keyword, height) {
      if (visible) handleShowList(keyword, height)
      else {
        setVisible(true)
        requestAnimationFrame(() => {
          handleShowList(keyword, height)
        })
      }
    },
    hide() {
      currentKeywordRef.current = ''
      currentSearchIdRef.current++
      searchTipListRef.current?.hide()
    },
  }))

  useEffect(() => {
    if (!currentKeywordRef.current) return
    handleShowList(currentKeywordRef.current)
  }, [handleShowList])

  const renderItem = ({ item, index }: { item: LX.Download.ListItem, index: number }) => {
    const musicInfo = item.metadata.musicInfo
    return (
      <Button
        style={{
          ...styles.item,
          borderTopColor: theme['c-border-background'],
          borderTopWidth: index ? BorderWidths.normal2 : 0,
        }}
        onPress={() => { onScrollToInfo(item) }}
        key={item.id}>
        <View style={styles.itemName}>
          <Text numberOfLines={1}>{musicInfo.name}</Text>
          <Text style={styles.subName} numberOfLines={1} size={12} color={theme['c-font-label']}>
            {getSingerText(musicInfo.singer)} ({musicInfo.meta.albumName})
          </Text>
          <Text style={styles.subName} numberOfLines={1} size={12} color={theme['c-font-label']}>
            {musicInfo.source} · {item.metadata.quality} · {item.statusText || item.status}
          </Text>
        </View>
        <Text style={styles.itemSource} size={12} color={theme['c-font-label']}>{item.status == 'completed' ? '已完成' : `${Math.max(0, Math.min(100, (item.progress || 0) * 100)).toFixed(0)}%`}</Text>
      </Button>
    )
  }
  const getkey: SearchTipListProps['keyExtractor'] = item => item.id
  const getItemLayout: SearchTipListProps['getItemLayout'] = (data, index) => {
    return { length: ITEM_HEIGHT, offset: ITEM_HEIGHT * index, index }
  }

  return (
    visible
      ? <SearchTipList
          ref={searchTipListRef}
          renderItem={renderItem}
          onPressBg={() => searchTipListRef.current?.hide()}
          hideWhenEmpty={false}
          ListEmptyComponent={<View style={styles.empty}><Text color={theme['c-font-label']}>{t('no_item')}</Text></View>}
          keyExtractor={getkey}
          getItemLayout={getItemLayout}
        />
      : null
  )
})

const styles = createStyle({
  item: {
    height: ITEM_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 15,
    paddingRight: 15,
  },
  itemName: {
    flexGrow: 1,
    flexShrink: 1,
  },
  subName: {
    marginTop: 2,
  },
  itemSource: {
    flexGrow: 0,
    flexShrink: 0,
  },
  empty: {
    paddingTop: 15,
    paddingBottom: 15,
    paddingLeft: 15,
    paddingRight: 15,
    alignItems: 'center',
  },
})
