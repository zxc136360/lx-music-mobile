import { Platform } from 'react-native'
import { isPCMPlayerSupported } from '@/utils/nativeModules/pcmPlayer'

export const shouldUsePCMPlayerEngine = () => Platform.OS == 'ios' && isPCMPlayerSupported
