import BackgroundTimer from 'react-native-background-timer'
import { playMusic as handlePlayMusic } from './playList'
import { existsFile, moveFile, privateStorageDirectoryPath, temporaryDirectoryPath } from '@/utils/fs'
import { toast } from '@/utils/tools'
import { getAccuratePosition, getPlayerDuration, seekToTime } from './seek'
import { getUnifiedPlaybackState, onUnifiedPlayerEvent } from './engine'
import {
  destroyPCMPlayerCore,
  pausePCMPlayer,
  playPCMPlayer,
  setPCMPlayerRate,
  setPCMPlayerVolume,
  stopPCMPlayerCore,
} from './pcmPlayerCore'
// import { PlayerMusicInfo } from '@/store/modules/player/playInfo'


export { useBufferProgress } from './hook'

const emptyIdRxp = /\/\/default$/
const tempIdRxp = /\/\/default$|\/\/default\/\/restorePlay$/
export const isEmpty = (trackId = global.lx.playerTrackId) => {
  // console.log(trackId)
  return !trackId || emptyIdRxp.test(trackId)
}
export const isTempId = (trackId = global.lx.playerTrackId) => {
  return !trackId || tempIdRxp.test(trackId)
}

// export const replacePlayTrack = async(newTrack, oldTrack) => {
//   console.log('replaceTrack')
//   await TrackPlayer.add(newTrack)
//   await TrackPlayer.skip(newTrack.id)
//   await TrackPlayer.remove(oldTrack.id)
// }

// let timeout
// let isFirstPlay = true
// const updateInfo = async track => {
//   if (isFirstPlay) {
//     // timeout = setTimeout(() => {
//     await delayUpdateMusicInfo(track)
//     isFirstPlay = false
//     // }, 500)
//   }
// }


// 解决快速切歌导致的通知栏歌曲信息与当前播放歌曲对不上的问题
// const debouncePlayMusicTools = {
//   prevPlayMusicPromise: Promise.resolve(),
//   trackInfo: {},
//   isDelayUpdate: false,
//   isDebounced: false,
//   delay: 1000,
//   delayTimer: null,
//   debounce(fn, delay = 100) {
//     let timer = null
//     let _tracks = null
//     let _time = null
//     return (tracks, time) => {
//       if (!this.isDebounced && _tracks != null) this.isDebounced = true
//       _tracks = tracks
//       _time = time
//       if (timer) {
//         BackgroundTimer.clearTimeout(timer)
//         timer = null
//       }
//       if (this.isDelayUpdate) {
//         if (this.updateDelayTimer) {
//           BackgroundTimer.clearTimeout(this.updateDelayTimer)
//           this.updateDelayTimer = null
//         }
//         timer = BackgroundTimer.setTimeout(() => {
//           timer = null
//           let tracks = _tracks
//           let time = _time
//           _tracks = null
//           _time = null
//           this.isDelayUpdate = false
//           fn(tracks, time)
//         }, delay)
//       } else {
//         this.isDelayUpdate = true
//         fn(tracks, time)
//         this.updateDelayTimer = BackgroundTimer.setTimeout(() => {
//           this.updateDelayTimer = null
//           this.isDelayUpdate = false
//         }, this.delay)
//       }
//     }
//   },
//   delayUpdateMusicInfo() {
//     if (this.delayTimer) BackgroundTimer.clearTimeout(this.delayTimer)
//     this.delayTimer = BackgroundTimer.setTimeout(() => {
//       this.delayTimer = null
//       if (this.trackInfo.tracks && this.trackInfo.tracks.length) delayUpdateMusicInfo(this.trackInfo.tracks[0])
//     }, this.delay)
//   },
//   init() {
//     return this.debounce((tracks, time) => {
//       tracks = [...tracks]
//       this.trackInfo.tracks = tracks
//       this.trackInfo.time = time
//       return this.prevPlayMusicPromise.then(() => {
//         // console.log('run')
//         if (this.trackInfo.tracks === tracks) {
//           this.prevPlayMusicPromise = handlePlayMusic(tracks, time).then(() => {
//             if (this.isDebounced) {
//               this.delayUpdateMusicInfo()
//               this.isDebounced = false
//             }
//           })
//         }
//       })
//     }, 200)
//   },
// }

const playMusic = ((fn: (musicInfo: LX.Player.PlayMusic, url: string, time: number, quality?: LX.Quality | null) => void, delay = 800) => {
  let delayTimer: number | null = null
  let isDelayRun = false
  let timer: number | null = null
  let _musicInfo: LX.Player.PlayMusic | null = null
  let _url = ''
  let _time = 0
  let _quality: LX.Quality | null = null
  return (musicInfo: LX.Player.PlayMusic, url: string, time: number, quality?: LX.Quality | null) => {
    _musicInfo = musicInfo
    _url = url
    _time = time
    _quality = quality ?? null
    if (timer) {
      BackgroundTimer.clearTimeout(timer)
      timer = null
    }
    if (isDelayRun) {
      if (delayTimer) {
        BackgroundTimer.clearTimeout(delayTimer)
        delayTimer = null
      }
      timer = BackgroundTimer.setTimeout(() => {
        timer = null
        let musicInfo = _musicInfo
        let url = _url
        let time = _time
        let quality = _quality
        _musicInfo = null
        _url = ''
        _time = 0
        _quality = null
        isDelayRun = false
        fn(musicInfo!, url, time, quality)
      }, delay)
    } else {
      isDelayRun = true
      fn(musicInfo, url, time, quality ?? null)
      delayTimer = BackgroundTimer.setTimeout(() => {
        delayTimer = null
        isDelayRun = false
      }, 500)
    }
  }
})((musicInfo, url, time, quality) => {
  handlePlayMusic(musicInfo, url, time, quality)
})

export const setResource = (musicInfo: LX.Player.PlayMusic, url: string, duration?: number, quality?: LX.Quality | null) => {
  playMusic(musicInfo, url, duration ?? 0, quality)
}

export const setPlay = async() => playPCMPlayer()
export const getPosition = async() => {
  return getAccuratePosition()
}
export const getDuration = async() => getPlayerDuration()
export const setStop = async() => {
  await stopPCMPlayerCore()
}
export const setLoop = async(_loop: boolean) => {}

export const setPause = async() => pausePCMPlayer()
// export const skipToNext = () => TrackPlayer.skipToNext()
export const setCurrentTime = async(time: number) => {
  return seekToTime(time)
}
export const setVolume = async(num: number) => setPCMPlayerVolume(num)
export const setPlaybackRate = async(num: number) => setPCMPlayerRate(num)
export interface NowPlayingTitles {
  title?: string
  artist?: string
  album?: string
  lyric?: string
}
export const updateNowPlayingTitles = async(titles: NowPlayingTitles) => {
  console.log('set playing titles', titles)
  return Promise.resolve()
}

export const resetPlay = async() => Promise.all([setPause(), setCurrentTime(0)])

export const isCached = async(_url: string) => false
export const getCacheSize = async() => 0
export const clearCache = async() => {}
export const migratePlayerCache = async() => {
  const newCachePath = temporaryDirectoryPath + '/TrackPlayer'
  if (await existsFile(newCachePath)) return
  const oldCachePath = privateStorageDirectoryPath + '/TrackPlayer'
  if (!await existsFile(oldCachePath)) return
  let timeout: number | null = BackgroundTimer.setTimeout(() => {
    timeout = null
    toast(global.i18n.t('player_cache_migrating'), 'long')
  }, 2_000)
  await moveFile(oldCachePath, newCachePath).finally(() => {
    if (timeout) BackgroundTimer.clearTimeout(timeout)
  })
}

export const destroy = async() => {
  if (global.lx.playerStatus.isIniting || !global.lx.playerStatus.isInitialized) return
  try {
    await destroyPCMPlayerCore()
  } finally {
    global.lx.playerStatus.isInitialized = false
  }
}

type PlayStatus = 'None' | 'Ready' | 'Playing' | 'Paused' | 'Stopped' | 'Buffering' | 'Connecting'

export const onStateChange = async(listener: (state: PlayStatus) => void) => {
  const removeUnifiedListener = onUnifiedPlayerEvent((event) => {
    switch (event.type) {
      case 'state':
        switch (event.state) {
          case 'loading':
            listener('Connecting')
            break
          case 'buffering':
            listener('Buffering')
            break
          case 'playing':
            listener('Playing')
            break
          case 'paused':
            listener('Paused')
            break
          case 'stopped':
            listener('Stopped')
            break
          case 'idle':
          default:
            listener('None')
            break
        }
        break
      case 'ended':
        listener('Stopped')
        break
      case 'error':
        listener('Paused')
        break
    }
  })
  void getUnifiedPlaybackState().then((state) => {
    switch (state) {
      case 'loading':
        listener('Connecting')
        break
      case 'buffering':
        listener('Buffering')
        break
      case 'playing':
        listener('Playing')
        break
      case 'paused':
        listener('Paused')
        break
      case 'stopped':
        listener('Stopped')
        break
      case 'idle':
      default:
        listener('None')
        break
    }
  }).catch(() => {})

  return () => {
    removeUnifiedListener()
  }
}

/**
 * Subscription player state chuange event
 * @param options state change event
 * @returns remove event function
 */
// export const playState = callback => TrackPlayer.addEventListener('playback-state', callback)

export const updateOptions = async(_options = {}) => {}

// export const setMaxCache = async size => {
//   // const currentTrack = await TrackPlayer.getCurrentTrack()
//   // if (!currentTrack) return
//   // console.log(currentTrack)
//   // const currentTime = await TrackPlayer.getPosition()
//   // const state = await TrackPlayer.getState()
//   // await stop()
//   // await TrackPlayer.destroy()
//   // await TrackPlayer.setupPlayer({ maxCacheSize: size * 1024, maxBuffer: 1000, waitForBuffer: true })
//   // await updateOptions()
//   // await TrackPlayer.seekTo(currentTime)
//   // switch (state) {
//   //   case TrackPlayer.STATE_PLAYING:
//   //   case TrackPlayer.STATE_BUFFERING:
//   //     await TrackPlayer.play()
//   //     break
//   //   default:
//   //     break
//   // }
// }

// export {
//   useProgress,
// }

export { updateMetaData, initTrackInfo } from './playList'
