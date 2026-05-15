import { memo, useCallback } from 'react'
import { FlatList, StyleSheet, View } from 'react-native'
import ListItem from './ListItem'

interface Props {
  list: LX.Download.ListItem[]
}

export default memo(({ list }: Props) => {
  const renderItem = useCallback(({ item }: { item: LX.Download.ListItem }) => <ListItem item={item} />, [])

  return (
    <FlatList
      data={list}
      keyExtractor={item => item.id}
      renderItem={renderItem}
      contentContainerStyle={styles.content}
      ItemSeparatorComponent={Separator}
    />
  )
})

const Separator = () => <View style={styles.separator} />

const styles = StyleSheet.create({
  content: {
    padding: 12,
  },
  separator: {
    height: 10,
  },
})
