/// <reference lib="webworker" />
import { encodePhoto, blobToBase64, PhotoError } from '../lib/photo/encodePhoto.ts'

declare const self: DedicatedWorkerGlobalScope

export interface PhotoRequest {
  id: number
  file: Blob
}

export type PhotoResponse =
  | { id: number; ok: true; blob: Blob; base64: string; width: number; height: number }
  | { id: number; ok: false; code: string; message: string }

self.addEventListener('message', (event: MessageEvent<PhotoRequest>) => {
  const { id, file } = event.data
  void (async () => {
    try {
      const { blob, width, height } = await encodePhoto(file)
      const base64 = await blobToBase64(blob)
      const response: PhotoResponse = { id, ok: true, blob, base64, width, height }
      self.postMessage(response)
    } catch (error) {
      const response: PhotoResponse =
        error instanceof PhotoError
          ? { id, ok: false, code: error.code, message: error.message }
          : { id, ok: false, code: 'encode-failed', message: '사진을 변환하지 못했습니다.' }
      self.postMessage(response)
    }
  })()
})
