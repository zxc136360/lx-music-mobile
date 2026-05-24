import { removeDownloadTask } from '@/core/download'
import { similar, sortInsert } from '@/utils'
import { confirmDialog } from '@/utils/tools'

const searchFilterRxp = /\s|'|\.|,|，|&|"|、|\(|\)|（|）|`|~|-|<|>|\||\/|\]|\[|!|！|:|：|;|；|\?|？|·/g
const normalizeSearchText = (str: string | number | undefined | null) => String(str ?? '').replace(searchFilterRxp, '').toLowerCase()

export const ungroupedDownloadGroupId = '__ungrouped__'

export const downloadStatusOptions: Array<{ id: LX.Download.DownloadTaskStatus, label: string }> = [
  { id: 'run', label: '下载中' },
  { id: 'waiting', label: '等待中' },
  { id: 'pause', label: '已暂停' },
  { id: 'error', label: '错误' },
  { id: 'completed', label: '已完成' },
]

export interface DownloadListGroup {
  id: string
  name: string
  count: number
}

const getSingerText = (singer: LX.Music.MusicInfoOnline['singer']) => {
  if (Array.isArray(singer)) return singer.join('、')
  return singer || ''
}

const getTaskSearchText = (item: LX.Download.ListItem) => {
  const musicInfo = item.metadata.musicInfo
  return [
    musicInfo.name,
    getSingerText(musicInfo.singer),
    musicInfo.meta.albumName,
    musicInfo.source,
    item.metadata.quality,
    item.statusText,
    item.status,
  ].join('')
}

const getDownloadGroupId = (item: LX.Download.ListItem) => item.metadata.sourceListId ?? ungroupedDownloadGroupId
const getDownloadGroupName = (item: LX.Download.ListItem) => {
  if (getDownloadGroupId(item) == ungroupedDownloadGroupId) return '未分组'
  return item.metadata.sourceListName ?? item.metadata.sourceListId ?? '未分组'
}
const getDownloadSortTime = (item: LX.Download.ListItem) => item.createdAt ?? item.updatedAt ?? 0

export const sortDownloadList = (list: LX.Download.ListItem[]) => {
  return [...list].sort((left, right) => {
    const timeDiff = getDownloadSortTime(right) - getDownloadSortTime(left)
    if (timeDiff) return timeDiff

    const updatedDiff = (right.updatedAt ?? 0) - (left.updatedAt ?? 0)
    if (updatedDiff) return updatedDiff

    return left.id.localeCompare(right.id)
  })
}

export const getDownloadListGroups = (list: LX.Download.ListItem[]) => {
  const groupMap = new Map<string, DownloadListGroup>()

  for (const item of list) {
    const id = getDownloadGroupId(item)
    const current = groupMap.get(id)
    if (current) {
      current.count += 1
      continue
    }

    groupMap.set(id, {
      id,
      name: getDownloadGroupName(item),
      count: 1,
    })
  }

  return [...groupMap.values()].sort((left, right) => {
    if (left.id == ungroupedDownloadGroupId) return -1
    if (right.id == ungroupedDownloadGroupId) return 1
    return left.name.localeCompare(right.name, 'zh-Hans-CN')
  })
}

export const filterDownloadList = (
  list: LX.Download.ListItem[],
  selectedGroupIds: Set<string>,
  selectedStatuses: Set<LX.Download.DownloadTaskStatus>,
) => {
  if (!selectedGroupIds.size && !selectedStatuses.size) return list

  return list.filter(item => {
    if (selectedGroupIds.size && !selectedGroupIds.has(getDownloadGroupId(item))) return false
    if (selectedStatuses.size && !selectedStatuses.has(item.status)) return false
    return true
  })
}

export const searchDownloadList = (list: LX.Download.ListItem[], text: string) => {
  text = normalizeSearchText(text)
  if (!text) return []

  const fullMathNameResults = new Set<LX.Download.ListItem>()
  const fullMathSingerResults = new Set<LX.Download.ListItem>()
  const fullMathAlbumResults = new Set<LX.Download.ListItem>()
  const fullMathMetaResults = new Set<LX.Download.ListItem>()

  for (const item of list) {
    const musicInfo = item.metadata.musicInfo
    if (normalizeSearchText(musicInfo.name).includes(text)) {
      fullMathNameResults.add(item)
    } else if (normalizeSearchText(getSingerText(musicInfo.singer)).includes(text)) {
      fullMathSingerResults.add(item)
    } else if (normalizeSearchText(musicInfo.meta.albumName).includes(text)) {
      fullMathAlbumResults.add(item)
    } else if (normalizeSearchText(`${musicInfo.source}${item.metadata.quality}${item.statusText}${item.status}`).includes(text)) {
      fullMathMetaResults.add(item)
    }
  }

  const result: LX.Download.ListItem[] = []
  const rxp = new RegExp(text.split('').map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '.*', 'i')
  for (const item of list) {
    if (fullMathNameResults.has(item) || fullMathSingerResults.has(item) || fullMathAlbumResults.has(item) || fullMathMetaResults.has(item)) continue
    const str = normalizeSearchText(getTaskSearchText(item))
    if (str.includes(text) || rxp.test(str)) result.push(item)
  }

  const sortedList: Array<{ num: number, data: LX.Download.ListItem }> = []

  for (const item of result) {
    sortInsert(sortedList, {
      num: similar(text, normalizeSearchText(getTaskSearchText(item))),
      data: item,
    })
  }

  return [
    ...fullMathNameResults.values(),
    ...fullMathSingerResults.values(),
    ...fullMathAlbumResults.values(),
    ...fullMathMetaResults.values(),
    ...sortedList.map(item => item.data).reverse(),
  ]
}

export const handleRemoveDownloadTask = async(item: LX.Download.ListItem) => {
  const musicInfo = item.metadata.musicInfo
  const isRemove = await confirmDialog({
    message: `确定要删除下载任务「${musicInfo.name}」吗？`,
    confirmButtonText: '删除',
  })
  if (!isRemove) return false
  await removeDownloadTask(item.id)
  return true
}

export const handleRemoveDownloadTasks = async(ids: string[]) => {
  if (!ids.length) return false
  const isRemove = await confirmDialog({
    message: `确定要删除选中的 ${ids.length} 个下载任务吗？`,
    confirmButtonText: '删除',
  })
  if (!isRemove) return false
  await Promise.all(ids.map(async id => removeDownloadTask(id)))
  return true
}
