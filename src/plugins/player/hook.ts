import { useEffect, useState, useRef } from 'react'
import { getUnifiedPlaybackState, onUnifiedPlayerEvent } from './engine'
import { getPCMPlayerBufferedPosition } from './pcmPlayerCore'
import { getDuration, getPosition } from './utils'

const PlaybackState = {
  None: 'None',
  Connecting: 'Connecting',
  Buffering: 'Buffering',
  Playing: 'Playing',
  Paused: 'Paused',
  Stopped: 'Stopped',
} as const

type PlaybackStateValue = typeof PlaybackState[keyof typeof PlaybackState]

/** Get current playback state and subsequent updatates  */
export const usePlaybackState = () => {
  const [state, setState] = useState<PlaybackStateValue>(PlaybackState.None)

  useEffect(() => {
    async function setPlayerState() {
      const unifiedState = await getUnifiedPlaybackState()
      switch (unifiedState) {
        case 'loading':
          setState(PlaybackState.Connecting)
          break
        case 'buffering':
          setState(PlaybackState.Buffering)
          break
        case 'playing':
          setState(PlaybackState.Playing)
          break
        case 'paused':
          setState(PlaybackState.Paused)
          break
        case 'stopped':
          setState(PlaybackState.Stopped)
          break
        case 'idle':
        default:
          setState(PlaybackState.None)
          break
      }
    }

    void setPlayerState()

    const removeUnifiedListener = onUnifiedPlayerEvent((event) => {
      if (event.type == 'ended') {
        setState(PlaybackState.Stopped)
        return
      }
      if (event.type == 'error') {
        setState(PlaybackState.Paused)
        return
      }
      if (event.type != 'state') return
      switch (event.state) {
        case 'loading':
          setState(PlaybackState.Connecting)
          break
        case 'buffering':
          setState(PlaybackState.Buffering)
          break
        case 'playing':
          setState(PlaybackState.Playing)
          break
        case 'paused':
          setState(PlaybackState.Paused)
          break
        case 'stopped':
          setState(PlaybackState.Stopped)
          break
        case 'idle':
        default:
          setState(PlaybackState.None)
          break
      }
    })

    return () => {
      removeUnifiedListener()
    }
  }, [])

  return state
}

/**
 * Attaches a handler to the given TrackPlayer events and performs cleanup on unmount
 * @param events - TrackPlayer events to subscribe to
 * @param handler - callback invoked when the event fires
 */
// export const useTrackPlayerEvents = (events, handler) => {
//   const savedHandler = useRef()

//   useEffect(() => {
//     savedHandler.current = handler
//   }, [handler])

//   useEffect(() => {
//     // eslint-disable-next-line no-undef
//     if (__DEV__) {
//       const allowedTypes = Object.values(Event)
//       const invalidTypes = events.filter(type => !allowedTypes.includes(type))
//       if (invalidTypes.length) {
//         console.warn(
//           'One or more of the events provided to useTrackPlayerEvents is ' +
//             `not a valid TrackPlayer event: ${invalidTypes.join("', '")}. ` +
//             'A list of available events can be found at ' +
//             'https://react-native-kit.github.io/react-native-track-player/documentation/#events',
//         )
//       }
//     }

//     const subs = events.map(event =>
//       TrackPlayer.addEventListener(event, payload => savedHandler.current({ ...payload, type: event })),
//     )

//     return () => subs.forEach(sub => sub.remove())
//   }, [events])
// }

const pollTrackPlayerStates = [
  PlaybackState.Playing,
  PlaybackState.Buffering,
] as const
/**
 * Poll for track progress for the given interval (in miliseconds)
 * @param updateInterval - ms interval
 */
export function useProgress(updateInterval: number) {
  const [state, setState] = useState({ position: 0, duration: 0, buffered: 0 })
  const playerState = usePlaybackState()
  const stateRef = useRef(state)
  const isUnmountedRef = useRef(true)
  useEffect(() => {
    isUnmountedRef.current = false
    return () => {
      isUnmountedRef.current = true
    }
  }, [])

  const getProgress = async() => {
    const progressInfoPromise = Promise.all([
      getPosition(),
      getDuration(),
      getPCMPlayerBufferedPosition(),
    ])
    const [position, duration, buffered] = await progressInfoPromise
    // After the asynchronous code is executed, if the component has been uninstalled, do not update the status
    if (isUnmountedRef.current) return

    if (
      position === stateRef.current.position &&
      duration === stateRef.current.duration &&
      buffered === stateRef.current.buffered
    ) return

    const state = { position, duration, buffered }
    stateRef.current = state
    setState(state)
  }

  useEffect(() => {
    // @ts-expect-error
    if (!pollTrackPlayerStates.includes(playerState)) return

    void getProgress()

    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    const poll = setInterval(getProgress, updateInterval || 1000)
    return () => { clearInterval(poll) }
  }, [playerState, updateInterval])

  return state
}

export function useBufferProgress() {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    let isUnmounted = false
    let preBuffered = 0
    let duration = 0
    let interval: ReturnType<typeof setInterval> | null = null

    const clearItv = () => {
      if (!interval) return
      clearInterval(interval)
      interval = null
    }
    const updateBuffer = async() => {
      const buffered = await (duration ? getBufferedPosition() : Promise.all([getBufferedPosition(), getDuration()]).then(([buffered, _duration]) => {
        duration = _duration
        return buffered
      }))
      // console.log('updateBuffer', buffered, duration, buffered > 0, buffered == duration)
      // After the asynchronous code is executed, if the component has been uninstalled, do not update the status
      if (buffered > 0 && buffered == duration) clearItv()
      if (buffered == preBuffered || isUnmounted) return
      preBuffered = buffered
      setProgress(duration ? (buffered / duration) : 0)
    }

    const getBufferedPosition = async() => getPCMPlayerBufferedPosition()

    const handleState = (state: PlaybackStateValue) => {
      switch (state) {
        case PlaybackState.None:
          // console.log('state', 'None')
          setProgress(0)
          break
        // case State.Ready:
        //   console.log('state', 'Ready')
        //   break
        // case State.Stopped:
        //   console.log('state', 'Stopped')
        //   break
        // case State.Paused:
        //   console.log('state', 'Paused')
        //   break
        // case State.Playing:
        //   console.log('state', 'Playing')
        //   break
        case PlaybackState.Buffering:
          // console.log('state', 'Buffering')
          clearItv()
          duration = 0
          interval = setInterval(updateBuffer, 1000)
          void updateBuffer()
          break
        // case State.Connecting:
        //   console.log('state', 'Connecting')
        //   break
        // default:
        //   console.log('playback-state', data)
        //   break
      }
    }

    const sub = {
      remove: onUnifiedPlayerEvent(event => {
        if (event.type == 'state') {
          switch (event.state) {
            case 'idle':
              handleState(PlaybackState.None)
              break
            case 'buffering':
            case 'loading':
              handleState(PlaybackState.Buffering)
              break
          }
        }
      }),
    }

    void updateBuffer()
    void getUnifiedPlaybackState().then((state) => {
      if (state == 'buffering' || state == 'loading') interval = setInterval(updateBuffer, 1000)
    })
    return () => {
      isUnmounted = true
      sub.remove()
      clearItv()
    }
  }, [])

  return progress
}
