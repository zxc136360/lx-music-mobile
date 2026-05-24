import { forwardRef, memo, useCallback, useImperativeHandle, useRef } from 'react'
import { FlatList, StyleSheet, View } from 'react-native'
import { scaleSizeH } from '@/utils/pixelRatio'
import ListItem from './ListItem'

export const ITEM_HEIGHT = scaleSizeH(130)
const SEPARATOR_HEIGHT = 10
const ITEM_LAYOUT_HEIGHT = ITEM_HEIGHT + SEPARATOR_HEIGHT

export interface ListType {
  scrollToInfo: (info: LX.Download.ListItem) => void
  scrollToTop: () => void
}

interface Props {
  list: LX.Download.ListItem[]
  isMultiSelectMode: boolean
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  onEnterMultiSelect: (id: string) => void
}

export default memo(forwardRef<ListType, Props>(({ list, isMultiSelectMode, selectedIds, onToggleSelect, onEnterMultiSelect }, ref) => {
  const flatListRef = useRef<FlatList<LX.Download.ListItem>>(null)

  useImperativeHandle(ref, () => ({
    scrollToInfo(info) {
      const index = list.findIndex(item => item.id == info.id)
      if (index < 0) return
      flatListRef.current?.scrollToIndex({ index, viewPosition: 0.3, animated: true })
    },
    scrollToTop() {
      flatListRef.current?.scrollToOffset({ offset: 0, animated: true })
    },
  }), [list])

  const renderItem = useCallback(({ item }: { item: LX.Download.ListItem }) => (
    <ListItem
      item={item}
      isSelected={selectedIds.has(item.id)}
      isMultiSelectMode={isMultiSelectMode}
      onToggleSelect={onToggleSelect}
      onEnterMultiSelect={onEnterMultiSelect}
    />
  ), [isMultiSelectMode, onEnterMultiSelect, onToggleSelect, selectedIds])

  const getItemLayout = useCallback((data: ArrayLike<LX.Download.ListItem> | null | undefined, index: number) => {
    return { length: ITEM_LAYOUT_HEIGHT, offset: ITEM_LAYOUT_HEIGHT * index, index }
  }, [])

  return (
    <FlatList
      ref={flatListRef}
      data={list}
      keyExtractor={item => item.id}
      renderItem={renderItem}
      getItemLayout={getItemLayout}
      contentContainerStyle={styles.content}
      ItemSeparatorComponent={Separator}
    />
  )
}))

const Separator = () => <View style={styles.separator} />

const styles = StyleSheet.create({
  content: {
    padding: 12,
  },
  separator: {
    height: SEPARATOR_HEIGHT,
  },
})
