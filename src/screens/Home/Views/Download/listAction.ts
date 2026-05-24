import { removeDownloadTask } from '@/core/download'
import { similar, sortInsert } from '@/utils'
import { confirmDialog } from '@/utils/tools'

const searchFilterRxp = /\s|'|\.|,|，|&|"|、|\(|\)|（|）|`|~|-|<|>|\||\/|\]|\[|!|！|:|：|;|；|\?|？|·/g
const normalizeSearchText = (str: string | number | undefined | null) => String(str ?? '').replace(searchFilterRxp, '').toLowerCase()

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
