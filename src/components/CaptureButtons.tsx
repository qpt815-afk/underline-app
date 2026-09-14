import { useEffect, useRef } from 'react'

interface Props {
  onPick: (file: File) => void
  disabled?: boolean
}

/**
 * 카메라와 갤러리는 input 을 따로 둬야 한다.
 * capture 속성이 붙은 input 은 스펙상 갤러리를 열 수 없고, 반대로 capture 가 없는
 * input 은 안드로이드 14+ 에서 사진 선택기를 열어 카메라 타일이 없다.
 * 하나로는 두 경로를 다 못 준다.
 */
export default function CaptureButtons({ onPick, disabled = false }: Props) {
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

  // cancel 이벤트는 React 의 onCancel 로 받을 수 없다. @types/react 19 는 이 prop 을
  // input 에 선언하지 않고, react-dom 도 dialog 에만 리스너를 붙인다.
  // 굳이 여기서 할 일은 없지만(취소 시 change 가 안 온다) value 를 비워
  // 같은 파일을 다시 고를 수 있게 해 둔다.
  useEffect(() => {
    const inputs = [cameraRef.current, galleryRef.current]
    const reset = (event: Event) => {
      ;(event.currentTarget as HTMLInputElement).value = ''
    }
    for (const input of inputs) input?.addEventListener('cancel', reset)
    return () => {
      for (const input of inputs) input?.removeEventListener('cancel', reset)
    }
  }, [])

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const file = input.files?.item(0) ?? null
    // 같은 파일을 다시 고를 수 있도록, 그리고 오래된 File 이 다시 읽히지 않도록 비운다.
    input.value = ''
    if (file) onPick(file)
  }

  // input.click() 은 사용자 제스처와 같은 태스크 안에서 불러야 한다.
  // 앞에 await 가 하나라도 끼면 조용히 아무 일도 일어나지 않는다.
  function open(ref: React.RefObject<HTMLInputElement | null>) {
    const input = ref.current
    if (!input) return
    input.value = ''
    input.click()
  }

  return (
    <div className="flex gap-3">
      <input
        ref={cameraRef}
        type="file"
        // accept 가 없으면 capture 가 무시된다. 그리고 image/* 만 있어야
        // 안드로이드가 카메라를 연다.
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleChange}
      />
      <input
        ref={galleryRef}
        type="file"
        // 갤러리 쪽은 image/* 만 둔다. 다른 타입이 섞이면 안드로이드 사진 선택기가
        // 아니라 일반 파일 탐색기가 열린다.
        accept="image/*"
        className="hidden"
        onChange={handleChange}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => { open(cameraRef) }}
        className="h-16 flex-1 rounded-2xl bg-accent text-base font-semibold text-white disabled:opacity-40"
      >
        카메라
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => { open(galleryRef) }}
        className="h-16 flex-1 rounded-2xl border border-line bg-surface text-base font-semibold disabled:opacity-40"
      >
        갤러리
      </button>
    </div>
  )
}
