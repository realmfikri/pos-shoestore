import { registerSW } from 'virtual:pwa-register'

export const registerPwa = () => {
  if ('serviceWorker' in navigator) {
    registerSW({
      immediate: false,
      onNeedRefresh() {
        console.info('New version available. Refresh to update.')
      },
      onOfflineReady() {
        console.info('App ready to work offline')
      },
    })
  }
}
