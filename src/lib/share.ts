/** 클립보드 복사. 실패하면 false — 시크릿 모드나 권한 문제. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** 시스템 공유 시트로 텍스트를 보낸다. 지원하지 않으면 클립보드로 대신한다. */
export async function shareText(text: string, title?: string): Promise<'shared' | 'copied' | 'failed'> {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ text, title })
      return 'shared'
    } catch (error) {
      // 사용자가 시트를 닫은 것은 실패가 아니다.
      if (error instanceof DOMException && error.name === 'AbortError') return 'shared'
    }
  }
  return (await copyText(text)) ? 'copied' : 'failed'
}

/**
 * 파일을 공유 시트로 보내고, 안 되면 내려받게 한다.
 * 안드로이드 크롬은 파일 공유를 지원하므로 인스타 스토리 등으로 바로 보낼 수 있다.
 */
export async function shareOrDownloadFile(file: File, title?: string): Promise<'shared' | 'downloaded' | 'failed'> {
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title })
      return 'shared'
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'shared'
    }
  }
  try {
    const url = URL.createObjectURL(file)
    const a = document.createElement('a')
    a.href = url
    a.download = file.name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => { URL.revokeObjectURL(url) }, 10_000)
    return 'downloaded'
  } catch {
    return 'failed'
  }
}
