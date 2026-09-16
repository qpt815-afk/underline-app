import { useEffect, useRef, useState } from 'react'
import { getBarcodeDetector } from '../lib/barcode.ts'
import { isValidIsbn13 } from '../lib/isbn.ts'

interface Props {
  onDetected: (isbn13: string) => void
  onClose: () => void
}

type Problem = null | 'unsupported' | 'camera'

/**
 * 뒷면 카메라를 열고 ISBN 바코드가 보일 때까지 4분의 1초마다 프레임을 읽는다.
 * 읽히면 카메라를 끄고 값을 넘긴다. 사진을 찍고 올리는 게 아니라 폰 안에서 끝난다.
 */
export default function BarcodeScanner({ onDetected, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  // 지원 여부는 처음부터 안다. effect 안에서 setState 하지 않으려고 초기값으로 정한다.
  const [problem, setProblem] = useState<Problem>(() => (getBarcodeDetector() ? null : 'unsupported'))
  // 콜백이 바뀌어도 카메라를 다시 열지 않게 ref 로 든다. 렌더 중에 ref 를 쓰면 안 되므로 effect 에서 갱신한다.
  const onDetectedRef = useRef(onDetected)
  useEffect(() => {
    onDetectedRef.current = onDetected
  }, [onDetected])

  useEffect(() => {
    const Detector = getBarcodeDetector()
    const video = videoRef.current
    // 지원하지 않으면 video 가 렌더되지 않아 ref 도 없다. 할 일이 없다.
    if (!Detector || !video) return

    let stream: MediaStream | null = null
    let timer: ReturnType<typeof setInterval> | undefined
    let cancelled = false
    let busy = false

    const stop = () => {
      clearInterval(timer)
      stream?.getTracks().forEach((track) => { track.stop() })
      stream = null
    }

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        })
      } catch {
        if (!cancelled) setProblem('camera')
        return
      }
      if (cancelled) {
        stop()
        return
      }
      video.srcObject = stream
      try {
        await video.play()
      } catch {
        // 자동재생이 막혀도 프레임은 들어온다. detect 가 알아서 실패/성공한다.
      }
      const detector = new Detector({ formats: ['ean_13'] })
      timer = setInterval(() => {
        if (busy || cancelled) return
        busy = true
        detector
          .detect(video)
          .then((codes) => {
            const hit = codes.find((code) => isValidIsbn13(code.rawValue))
            if (hit && !cancelled) {
              cancelled = true
              stop()
              onDetectedRef.current(hit.rawValue)
            }
          })
          .catch(() => {
            // 첫 프레임이 오기 전엔 InvalidStateError 가 난다. 다음 틱에 다시.
          })
          .finally(() => { busy = false })
      }, 250)
    })()

    return () => {
      cancelled = true
      stop()
    }
  }, [])

  return (
    <div className="rounded-2xl border border-line bg-surface p-3">
      {problem === null ? (
        <div className="relative overflow-hidden rounded-xl bg-black">
          <video ref={videoRef} playsInline muted autoPlay className="aspect-[4/3] w-full object-cover" />
          {/* 바코드를 어디에 맞추면 되는지 보여주는 안내 틀. 기능은 없다. */}
          <div aria-hidden className="pointer-events-none absolute inset-x-8 top-1/2 h-20 -translate-y-1/2 rounded-lg border-2 border-white/80" />
        </div>
      ) : (
        <p className="ko-prose rounded-xl bg-accent/10 p-3 text-sm text-accent" role="alert">
          {problem === 'unsupported'
            ? '이 브라우저는 바코드 읽기를 지원하지 않아요. 아래에 ISBN 을 직접 입력해 주세요.'
            : '카메라를 열지 못했어요. 카메라 권한을 허용했는지 확인하거나 ISBN 을 직접 입력해 주세요.'}
        </p>
      )}
      <div className="mt-3 flex items-center justify-between">
        <p className="ko-prose text-xs text-muted">책 뒤표지의 바코드(978 또는 979 로 시작)를 틀 안에 맞춰 주세요.</p>
        <button type="button" onClick={onClose} className="shrink-0 px-2 py-2 text-sm text-muted">닫기</button>
      </div>
    </div>
  )
}
