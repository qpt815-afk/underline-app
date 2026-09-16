/**
 * 바코드 읽기. 안드로이드 크롬에 내장된 BarcodeDetector 를 쓴다 — 라이브러리 없이
 * 카메라 프레임에서 EAN-13 을 바로 읽는다. iOS 사파리에는 없으므로 거기서는
 * ISBN 을 손으로 넣는다(2순위 타깃, 깨지지만 않으면 된다).
 *
 * TypeScript 의 lib.dom 에는 아직 없는 API 라 필요한 만큼만 직접 선언한다.
 */

export interface DetectedBarcode {
  rawValue: string
  format: string
}

export interface BarcodeDetectorLike {
  detect(source: ImageBitmapSource): Promise<DetectedBarcode[]>
}

interface BarcodeDetectorCtor {
  new (options?: { formats: string[] }): BarcodeDetectorLike
}

export function getBarcodeDetector(): BarcodeDetectorCtor | null {
  const g = globalThis as { BarcodeDetector?: BarcodeDetectorCtor }
  return typeof g.BarcodeDetector === 'function' ? g.BarcodeDetector : null
}

export function isBarcodeScanSupported(): boolean {
  return (
    getBarcodeDetector() !== null &&
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function'
  )
}
