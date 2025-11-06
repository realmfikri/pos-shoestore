import { useEffect, useState } from 'react'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

export const usePwaInstallPrompt = () => {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [isInstalled, setIsInstalled] = useState(false)

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setEvent(e as BeforeInstallPromptEvent)
    }

    const listener = () => {
      setIsInstalled(true)
    }

    window.addEventListener('beforeinstallprompt', handler)
    window.addEventListener('appinstalled', listener)

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      window.removeEventListener('appinstalled', listener)
    }
  }, [])

  const requestInstall = async () => {
    if (!event) return
    await event.prompt()
    const { outcome } = await event.userChoice

    if (outcome !== 'accepted') {
      setEvent(null)
    }
  }

  return {
    canInstall: Boolean(event) && !isInstalled,
    requestInstall,
    dismiss: () => setEvent(null),
  }
}
