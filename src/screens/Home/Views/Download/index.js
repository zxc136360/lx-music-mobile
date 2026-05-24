import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { StyleSheet, TouchableOpacity, View } from 'react-native'
import { getDownloadList, subscribeDownloadList } from '@/core/download'
import { useTheme } from '@/store/theme/hook'
import Text from '@/components/common/Text'
import { Icon } from '@/components/common/Icon'
import List from './List'
import Empty from './Empty'
import ListSearchBar from './ListSearchBar'
import ListDownloadSearch from './ListDownloadSearch'
import FilterBar from './FilterBar'
import {
  downloadStatusOptions,
  filterDownloadList,
  getDownloadListGroups,
  handleRemoveDownloadTasks,
  sortDownloadList,
} from './listAction'

export default () => {
  const theme = useTheme()
  const listRef = useRef(null)
  const listSearchBarRef = useRef(null)
  const listDownloadSearchRef = useRef(null)
  const listHeightRef = useRef(0)
  const [list, setList] = useState(() => [...getDownloadList()])
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [selectedGroupIds, setSelectedGroupIds] = useState(() => new Set())
  const [selectedStatuses, setSelectedStatuses] = useState(() => new Set())

  const sortedList = useMemo(() => sortDownloadList(list), [list])
  const groups = useMemo(() => getDownloadListGroups(sortedList), [sortedList])
  const filteredList = useMemo(() => filterDownloadList(sortedList, selectedGroupIds, selectedStatuses), [selectedGroupIds, selectedStatuses, sortedList])
  const selectedCount = selectedIds.size
  const visibleSelectedCount = useMemo(() => filteredList.reduce((count, item) => count + (selectedIds.has(item.id) ? 1 : 0), 0), [filteredList, selectedIds])
  const isAllSelected = !!filteredList.length && visibleSelectedCount == filteredList.length

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

  useEffect(() => {
    const ids = new Set(list.map(item => item.id))
    setSelectedIds(prevIds => {
      const nextIds = new Set()
      prevIds.forEach(id => {
        if (ids.has(id)) nextIds.add(id)
      })
      return nextIds
    })
  }, [list])

  const handleShowSearch = useCallback(() => {
    listSearchBarRef.current?.show()
  }, [])

  const handleSearch = useCallback((keyword) => {
    listDownloadSearchRef.current?.search(keyword, listHeightRef.current)
  }, [])

  const handleExitSearch = useCallback(() => {
    listSearchBarRef.current?.hide()
    listDownloadSearchRef.current?.hide()
  }, [])

  const handleScrollToInfo = useCallback((info) => {
    listRef.current?.scrollToInfo(info)
    handleExitSearch()
  }, [handleExitSearch])

  const handleListLayout = useCallback(event => {
    listHeightRef.current = event.nativeEvent.layout.height
  }, [])

  const handleToggleSelect = useCallback(id => {
    setSelectedIds(prevIds => {
      const nextIds = new Set(prevIds)
      if (nextIds.has(id)) nextIds.delete(id)
      else nextIds.add(id)
      return nextIds
    })
  }, [])

  const handleEnterMultiSelect = useCallback(id => {
    setIsMultiSelectMode(true)
    setSelectedIds(prevIds => {
      const nextIds = new Set(prevIds)
      nextIds.add(id)
      return nextIds
    })
  }, [])

  const handleSelectAll = useCallback(() => {
    if (!filteredList.length) return
    setSelectedIds(prevIds => {
      const nextIds = new Set(prevIds)
      if (isAllSelected) {
        filteredList.forEach(item => {
          nextIds.delete(item.id)
        })
      } else {
        filteredList.forEach(item => {
          nextIds.add(item.id)
        })
      }
      return nextIds
    })
  }, [filteredList, isAllSelected])

  const handleCancelMultiSelect = useCallback(() => {
    setIsMultiSelectMode(false)
    setSelectedIds(new Set())
  }, [])

  const handleRemoveSelected = useCallback(async() => {
    const ids = Array.from(selectedIds)
    const isRemoved = await handleRemoveDownloadTasks(ids)
    if (!isRemoved) return
    setIsMultiSelectMode(false)
    setSelectedIds(new Set())
  }, [selectedIds])

  const handleToggleGroup = useCallback((groupId) => {
    setSelectedGroupIds(prevIds => {
      const nextIds = new Set(prevIds)
      if (nextIds.has(groupId)) nextIds.delete(groupId)
      else nextIds.add(groupId)
      return nextIds
    })
  }, [])

  const handleToggleStatus = useCallback((status) => {
    setSelectedStatuses(prevStatuses => {
      const nextStatuses = new Set(prevStatuses)
      if (nextStatuses.has(status)) nextStatuses.delete(status)
      else nextStatuses.add(status)
      return nextStatuses
    })
  }, [])

  const handleResetFilters = useCallback(() => {
    setSelectedGroupIds(new Set())
    setSelectedStatuses(new Set())
  }, [])

  const listContent = useMemo(() => {
    if (!filteredList.length) return <Empty />
    return (
      <List
        ref={listRef}
        list={filteredList}
        isMultiSelectMode={isMultiSelectMode}
        selectedIds={selectedIds}
        onToggleSelect={handleToggleSelect}
        onEnterMultiSelect={handleEnterMultiSelect}
      />
    )
  }, [filteredList, handleEnterMultiSelect, handleToggleSelect, isMultiSelectMode, selectedIds])

  return (
    <View style={styles.container}>
      <View style={[styles.header, { borderBottomColor: theme['c-border-background'] }]}>
        <View style={styles.headerInfo}>
          <Text size={18}>下载</Text>
          <Text size={12} color={theme['c-font-label']}>{isMultiSelectMode ? `已选择 ${selectedCount} 个任务` : `共 ${filteredList.length} 个任务`}</Text>
        </View>
        <TouchableOpacity style={styles.headerButton} onPress={handleShowSearch}>
          <Text size={13} color={theme['c-primary-font']}>搜索</Text>
        </TouchableOpacity>
        <ListSearchBar ref={listSearchBarRef} onSearch={handleSearch} onExitSearch={handleExitSearch} />
      </View>
      <FilterBar
        groups={groups}
        statuses={downloadStatusOptions}
        selectedGroupIds={selectedGroupIds}
        selectedStatuses={selectedStatuses}
        onToggleGroup={handleToggleGroup}
        onToggleStatus={handleToggleStatus}
        onReset={handleResetFilters}
      />
      {isMultiSelectMode ? (
        <View style={[styles.selectBar, { borderBottomColor: theme['c-border-background'] }]}>
          <TouchableOpacity style={styles.selectButton} onPress={handleSelectAll} disabled={!filteredList.length}>
            <Icon name={isAllSelected ? 'minus-box' : 'checkbox-blank-outline'} size={18} color={filteredList.length ? theme['c-font'] : theme['c-font-label']} />
            <Text style={styles.selectButtonText} size={13} color={filteredList.length ? theme['c-font'] : theme['c-font-label']}>{isAllSelected ? '取消全选' : '全选'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.selectButton} onPress={handleRemoveSelected} disabled={!selectedCount}>
            <Icon name="remove" size={18} color={selectedCount ? theme['c-primary-background-active'] : theme['c-font-label']} />
            <Text style={styles.selectButtonText} size={13} color={selectedCount ? theme['c-primary-background-active'] : theme['c-font-label']}>删除选中</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.selectButton} onPress={handleCancelMultiSelect}>
            <Text size={13}>取消</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      <View style={styles.listContent} onLayout={handleListLayout}>
        {listContent}
        {filteredList.length ? <ListDownloadSearch ref={listDownloadSearchRef} list={filteredList} onScrollToInfo={handleScrollToInfo} /> : null}
      </View>
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
  headerInfo: {
    justifyContent: 'center',
  },
  headerButton: {
    position: 'absolute',
    right: 8,
    top: 8,
    height: 40,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectBar: {
    height: 44,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  selectButton: {
    height: 36,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectButtonText: {
    marginLeft: 4,
  },
  listContent: {
    flex: 1,
  },
})
