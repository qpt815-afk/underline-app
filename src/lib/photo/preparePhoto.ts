import { encodePhoto, blobToBase64, PhotoError } from './encodePhoto.ts'
import type { PhotoRequest, PhotoResponse } from '../../workers/photoWorker.ts'

export interface PreparedPhoto {
  blob: Blob
  base64: string
  width: number
  height: number
}

/** 워커가 먹통이 되면 UI 스피너가 영원히 돈다. 벽시계로 끊는다. */
const WORKER_TIMEOUT_MS = 30_000

let worker: Worker | null = null
let nextId = 1

function getWorker(): Worker | null {
  if (worker) return worker
  try {
    worker = new Worker(new URL('../../workers/photoWorker.ts', import.meta.url), {
      // 클래식 워커는 ESM import 를 못 쓴다.
      type: 'module',
    })
    return worker
  } catch {
    return null
  }
}

function killWorker() {
  worker?.terminate()
  worker = null
}

/**
 * 사진을 1600px JPEG + base64 로 만든다.
 *
 * 인코딩은 워커에서 한다. 메인 스레드에서 하면 Blink 가 JPEG 인코딩을 idle 태스크로
 * 미루는데, 촬영 직후에는 업로드와 OCR 요청이 동시에 나가 idle 이 없다.
 * 워커를 못 만들면 메인 스레드로 떨어진다 — 느릴 뿐 동작은 한다.
 */
export async function preparePhoto(file: Blob): Promise<PreparedPhoto> {
  const w = getWorker()
  if (!w) return prepareOnMainThread(file)

  const id = nextId++

  return new Promise<PreparedPhoto>((resolve, reject) => {
    let settled = false

    const cleanup = () => {
      w.removeEventListener('message', onMessage)
      w.removeEventListener('error', onFailure)
      w.removeEventListener('messageerror', onFailure)
      clearTimeout(timer)
    }

    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      cleanup()
      fn()
    }

    // 워커 실패 경로는 세 갈래다: 프로토콜 안의 {ok:false}, error 이벤트
    // (모듈 로드 실패나 잡히지 않은 throw), messageerror(구조화 복제 실패).
    // 뒤의 둘은 워커가 살아있다고 믿을 수 없으므로 죽이고 다음에 새로 만든다.
    const onFailure = () => {
      finish(() => {
        killWorker()
        void prepareOnMainThread(file).then(resolve, reject)
      })
    }

    const onMessage = (event: MessageEvent<PhotoResponse>) => {
      const data = event.data
      if (data.id !== id) return
      finish(() => {
        if (data.ok) {
          resolve({ blob: data.blob, base64: data.base64, width: data.width, height: data.height })
        } else {
          reject(new PhotoError(data.code as PhotoError['code'], data.message))
        }
      })
    }

    const timer = setTimeout(onFailure, WORKER_TIMEOUT_MS)

    w.addEventListener('message', onMessage)
    w.addEventListener('error', onFailure)
    w.addEventListener('messageerror', onFailure)

    const request: PhotoRequest = { id, file }
    w.postMessage(request)
  })
}

async function prepareOnMainThread(file: Blob): Promise<PreparedPhoto> {
  const { blob, width, height } = await encodePhoto(file)
  const base64 = await blobToBase64(blob)
  return { blob, base64, width, height }
}
