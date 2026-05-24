
// interface DownloadList {

// }


declare namespace LX {
  namespace Download {
    type DownloadTaskStatus = 'run'
    | 'waiting'
    | 'pause'
    | 'error'
    | 'completed'

    type FileExt = 'mp3' | 'flac' | 'wav' | 'ape'

    interface ProgressInfo {
      progress: number
      speed: string
      downloaded: number
      total: number
    }

    interface DownloadTaskActionBase <A> {
      action: A
    }
    interface DownloadTaskActionData<A, D> extends DownloadTaskActionBase<A> {
      data: D
    }
    type DownloadTaskAction<A, D = undefined> = D extends undefined ? DownloadTaskActionBase<A> : DownloadTaskActionData<A, D>

    type DownloadTaskActions = DownloadTaskAction<'start'>
    | DownloadTaskAction<'complete'>
    | DownloadTaskAction<'refreshUrl'>
    | DownloadTaskAction<'statusText', string>
    | DownloadTaskAction<'progress', ProgressInfo>
    | DownloadTaskAction<'error', {
      error?: string
      message?: string
    }>

    interface ListItem {
      id: string
      isComplate: boolean
      status: DownloadTaskStatus
      statusText: string
      downloaded: number
      total: number
      progress: number
      speed: string
      lyricPath?: string
      lyricJsonPath?: string
      lyricLrcPath?: string
      coverPath?: string
      error?: string
      createdAt?: number
      updatedAt?: number
      jobId?: number | string
      metadata: {
        musicInfo: LX.Music.MusicInfoOnline
        sourceListId?: string
        sourceListName?: string
        url: string | null
        quality: LX.Quality
        ext: FileExt
        fileName: string
        filePath: string
      }
    }

    interface saveDownloadMusicInfo {
      list: ListItem[]
      addMusicLocationType: LX.AddMusicLocationType
    }
  }
}
