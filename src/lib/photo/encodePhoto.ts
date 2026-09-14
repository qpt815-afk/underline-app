/**
 * 사진 한 장을 OCR 에 보낼 수 있는 크기로 줄이고 JPEG 으로 굽는다.
 *
 * 이 모듈은 메인 스레드와 워커 양쪽에서 그대로 돈다.
 * 워커에서 돌리는 편이 낫다 — 메인 스레드에서는 Blink 가 JPEG 인코딩을
 * idle 태스크로 쪼개서 처리하는데(안드로이드 기준 시작 4초/완료 9초 타임아웃),
 * 촬영 직후에는 업로드와 OCR 요청이 동시에 나가므로 idle 이 없다.
 */

/** 긴 변 목표 길이. 한글 본문이 뭉개지지 않는 선에서 가장 작게. */
export const TARGET_LONG_EDGE = 1600

/**
 * JPEG 품질. 폰 사진은 이미 한 번 손실 압축된 상태라 두 번째 압축이 겹친다.
 * 0.85 미만으로 내리면 한글 획이 무너지기 시작한다.
 */
export const JPEG_QUALITY = 0.85

/** 원본이 이보다 크면 디코드 자체가 메모리를 터뜨릴 수 있어 먼저 거른다. */
const MAX_SOURCE_BYTES = 40 * 1024 * 1024
const MAX_SOURCE_PIXELS = 80_000_000

/** 결과 JPEG 상한. Vercel 함수 본문 4.5MB 중 base64 팽창(+33%)을 감안한 값. */
const MAX_OUTPUT_BYTES = 3 * 1024 * 1024

export type PhotoErrorCode =
  | 'not-an-image'
  | 'heic-unsupported'
  | 'too-large'
  | 'decode-failed'
  | 'encode-failed'
  | 'too-large-after-encode'

export class PhotoError extends Error {
  code: PhotoErrorCode
  constructor(code: PhotoErrorCode, message: string) {
    super(message)
    this.name = 'PhotoError'
    this.code = code
  }
}

export const PHOTO_ERROR_MESSAGE: Record<PhotoErrorCode, string> = {
  'not-an-image': '이미지 파일이 아닙니다.',
  // 갤럭시 카메라의 "고효율 사진"(HEIF) 설정이 켜져 있으면 여기로 온다.
  // 크롬에는 HEIF 디코더가 없어서 손쓸 방법이 없다.
  'heic-unsupported':
    'HEIC 사진은 아직 읽을 수 없어요. 카메라 설정에서 "고효율 사진"을 끄고 JPEG 으로 찍어주세요.',
  'too-large': '사진이 너무 큽니다.',
  'decode-failed': '사진을 읽지 못했습니다. 다시 찍어주세요.',
  'encode-failed': '사진을 변환하지 못했습니다.',
  'too-large-after-encode': '사진이 너무 큽니다. 조금 더 가까이서 찍어주세요.',
}

export interface EncodedPhoto {
  blob: Blob
  width: number
  height: number
}

export async function encodePhoto(file: Blob): Promise<EncodedPhoto> {
  if (file.type === 'image/heic' || file.type === 'image/heif') {
    throw new PhotoError('heic-unsupported', PHOTO_ERROR_MESSAGE['heic-unsupported'])
  }
  if (!file.type.startsWith('image/')) {
    throw new PhotoError('not-an-image', PHOTO_ERROR_MESSAGE['not-an-image'])
  }
  if (file.size === 0) {
    throw new PhotoError('decode-failed', PHOTO_ERROR_MESSAGE['decode-failed'])
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new PhotoError('too-large', PHOTO_ERROR_MESSAGE['too-large'])
  }

  // 1차 디코드는 원본 해상도로 일어나므로 피크 메모리는 목표가 아니라 원본이 정한다.
  let probe: ImageBitmap
  try {
    probe = await createImageBitmap(file)
  } catch {
    throw new PhotoError('decode-failed', PHOTO_ERROR_MESSAGE['decode-failed'])
  }

  let bitmap: ImageBitmap | undefined
  try {
    if (probe.width * probe.height > MAX_SOURCE_PIXELS) {
      throw new PhotoError('too-large', PHOTO_ERROR_MESSAGE['too-large'])
    }

    const longEdge = Math.max(probe.width, probe.height)
    const scale = longEdge > TARGET_LONG_EDGE ? TARGET_LONG_EDGE / longEdge : 1
    const width = Math.max(1, Math.round(probe.width * scale))
    const height = Math.max(1, Math.round(probe.height * scale))

    if (scale === 1) {
      bitmap = probe
    } else {
      // 리사이즈는 createImageBitmap 에 맡긴다. resizeQuality 를 지정하지 않으면
      // 기본값이 'low'(쌍선형)이라 한글 획이 뭉개진다. 'high' 는 Catmull-Rom 이다.
      //
      // 여기서 줄인 뒤 캔버스에서 또 줄이면 두 번 리샘플되므로,
      // 아래 캔버스는 반드시 비트맵과 같은 크기로 만든다.
      bitmap = await createImageBitmap(file, {
        resizeWidth: width,
        resizeHeight: height,
        resizeQuality: 'high',
        // EXIF 회전은 브라우저가 이미 적용한다. 'none' 은 함정이다 —
        // 스펙에서 'from-image' 로 이름이 바뀌었고, 크롬에서는 플래그가 꺼져 있어
        // 똑같이 동작하면서 deprecation 경고만 남긴다.
        imageOrientation: 'from-image',
      })
      probe.close()
    }

    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) throw new PhotoError('encode-failed', PHOTO_ERROR_MESSAGE['encode-failed'])

    // Skia 는 알파를 검정에 합성한다. 캔버스를 다 덮지 못하는 경우를 대비해 흰색을 깐다.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(bitmap, 0, 0)

    // convertToBlob 은 옵션 객체를 받는다(canvas.toBlob 의 콜백 시그니처와 다르다).
    // type 을 빼면 기본값이 image/png 라 몇 MB 짜리가 나오고,
    // quality 를 0~1 밖의 값으로 주면 조용히 92 로 떨어진다.
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY })

    if (blob.type !== 'image/jpeg') {
      throw new PhotoError('encode-failed', PHOTO_ERROR_MESSAGE['encode-failed'])
    }
    if (blob.size > MAX_OUTPUT_BYTES) {
      throw new PhotoError('too-large-after-encode', PHOTO_ERROR_MESSAGE['too-large-after-encode'])
    }

    return { blob, width: canvas.width, height: canvas.height }
  } finally {
    // 12MP 디코드는 RGBA 로 약 48MB 다. 몇 장 연속으로 찍으면 탭이 OOM 으로 죽는다.
    // 이미 detach 된 비트맵에 close() 를 부르는 것은 스펙상 무해하므로
    // scale === 1 이라 probe 와 bitmap 이 같은 객체인 경우도 안전하다.
    probe.close()
    bitmap?.close()
  }
}

/** JPEG Blob 을 JSON 본문에 실을 base64 문자열로 바꾼다. */
export async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  // 큰 배열을 한 번에 String.fromCharCode 에 넘기면 스택이 넘친다.
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}
