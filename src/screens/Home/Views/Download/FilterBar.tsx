import { memo, useMemo, type ReactNode } from 'react'
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native'
import Text from '@/components/common/Text'
import { Icon } from '@/components/common/Icon'
import { useTheme } from '@/store/theme/hook'
import type { DownloadListGroup } from './listAction'

interface Props {
  groups: DownloadListGroup[]
  statuses: Array<{ id: LX.Download.DownloadTaskStatus, label: string }>
  selectedGroupIds: Set<string>
  selectedStatuses: Set<LX.Download.DownloadTaskStatus>
  onToggleGroup: (id: string) => void
  onToggleStatus: (status: LX.Download.DownloadTaskStatus) => void
  onReset: () => void
}

export default memo(({ groups, statuses, selectedGroupIds, selectedStatuses, onToggleGroup, onToggleStatus, onReset }: Props) => {
  const theme = useTheme()
  const hasFilter = selectedGroupIds.size > 0 || selectedStatuses.size > 0
  const summary = useMemo(() => {
    const parts: string[] = []
    if (selectedGroupIds.size) parts.push(`分组 ${selectedGroupIds.size}`)
    if (selectedStatuses.size) parts.push(`状态 ${selectedStatuses.size}`)
    return parts.join(' · ')
  }, [selectedGroupIds.size, selectedStatuses.size])

  return (
    <View style={[styles.container, { borderBottomColor: theme['c-border-background'] }]}>
      <View style={styles.titleRow}>
        <View style={styles.titleContent}>
          <Text size={13}>筛选</Text>
          {summary ? <Text style={styles.summary} size={12} color={theme['c-font-label']}>{summary}</Text> : null}
        </View>
        <TouchableOpacity style={styles.resetButton} onPress={onReset} disabled={!hasFilter}>
          <Text size={12} color={hasFilter ? theme['c-primary-font'] : theme['c-font-label']}>重置</Text>
        </TouchableOpacity>
      </View>
      <FilterRow title="分组">
        {groups.map(group => (
          <FilterChip
            key={group.id}
            label={`${group.name} ${group.count}`}
            selected={selectedGroupIds.has(group.id)}
            onPress={() => { onToggleGroup(group.id) }}
          />
        ))}
      </FilterRow>
      <FilterRow title="状态">
        {statuses.map(status => (
          <FilterChip
            key={status.id}
            label={status.label}
            selected={selectedStatuses.has(status.id)}
            onPress={() => { onToggleStatus(status.id) }}
          />
        ))}
      </FilterRow>
    </View>
  )
})

const FilterRow = ({ title, children }: { title: string, children: ReactNode }) => {
  const theme = useTheme()

  return (
    <View style={styles.row}>
      <Text style={styles.rowTitle} size={12} color={theme['c-font-label']}>{title}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipList}>
        {children}
      </ScrollView>
    </View>
  )
}

const FilterChip = ({ label, selected, onPress }: { label: string, selected: boolean, onPress: () => void }) => {
  const theme = useTheme()

  return (
    <TouchableOpacity
      style={[
        styles.chip,
        {
          backgroundColor: selected ? theme['c-primary-background-hover'] : theme['c-button-background'],
          borderColor: selected ? theme['c-primary-font'] : theme['c-border-background'],
        },
      ]}
      onPress={onPress}>
      {selected ? <Icon name="checkbox-marked" size={12} color={theme['c-primary-font']} /> : null}
      <Text style={selected ? styles.selectedChipText : null} size={12} color={selected ? theme['c-primary-font'] : theme['c-button-font']} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  titleRow: {
    height: 26,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  summary: {
    marginLeft: 8,
  },
  resetButton: {
    height: 26,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    height: 34,
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowTitle: {
    width: 36,
  },
  chipList: {
    alignItems: 'center',
    paddingRight: 8,
  },
  chip: {
    height: 26,
    maxWidth: 160,
    paddingHorizontal: 9,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
    marginRight: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectedChipText: {
    marginLeft: 4,
  },
})
