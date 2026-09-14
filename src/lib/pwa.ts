import { useCallback, useEffect, useState } from 'react'

// beforeinstallprompt 는 표준 타입이 없어 직접 선언한다.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/** 브라우저 탭이 아니라 설치된 앱으로 실행 중인지 */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS 사파리는 display-mode 대신 이 비표준 속성을 쓴다
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

/**
 * 안드로이드 크롬의 설치 배너를 우리 UI 버튼으로 연결한다.
 *
 * 주의: prompt() 는 이벤트 하나당 한 번만 호출할 수 있다. 한 번 쓰면 그 이벤트는
 * 소모되므로 버튼을 숨기고 크롬이 새 이벤트를 줄 때까지 기다려야 한다.
 * 그리고 이미 설치돼 있으면 이벤트가 아예 오지 않으므로 display-mode 도 같이 본다.
 */
export function useInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(isStandalone)

  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      event.preventDefault()
      setDeferred(event as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setDeferred(null)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const promptInstall = useCallback(async () => {
    if (!deferred) return
    await deferred.prompt()
    await deferred.userChoice
    // 이벤트는 소모됐다. 결과와 무관하게 버려야 한다.
    setDeferred(null)
  }, [deferred])

  return { canInstall: deferred !== null && !installed, installed, promptInstall }
}
