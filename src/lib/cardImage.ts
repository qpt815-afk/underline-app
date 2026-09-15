/**
 * 문장 카드 이미지. 인스타 스토리 비율(9:16, 1080×1920).
 * 문장이 주인공이므로 세리프로 크게, 아래에 책 제목과 저자만 작게.
 */

const W = 1080
const H = 1920
const PAD = 120

interface CardInput {
  text: string
  bookTitle?: string | null
  author?: string | null
}

/** 캔버스 텍스트를 너비에 맞춰 줄바꿈한다. 공백 기준이되, 한 어절이 너무 길면 글자로 자른다. */
function wrap(ctx: OffscreenCanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    let line = ''
    for (const word of paragraph.split(' ')) {
      const candidate = line === '' ? word : `${line} ${word}`
      if (ctx.measureText(candidate).width <= maxWidth) {
        line = candidate
        continue
      }
      if (line !== '') lines.push(line)
      // 어절 하나가 한 줄을 넘으면 글자 단위로 나눈다.
      if (ctx.measureText(word).width > maxWidth) {
        let chunk = ''
        for (const ch of word) {
          if (ctx.measureText(chunk + ch).width > maxWidth && chunk !== '') {
            lines.push(chunk)
            chunk = ''
          }
          chunk += ch
        }
        line = chunk
      } else {
        line = word
      }
    }
    lines.push(line)
  }
  return lines
}

/** 글자 수에 따라 크기를 고른다. 짧은 문장은 크게, 긴 문장은 다 들어가게. */
function fontSizeFor(length: number): number {
  if (length <= 40) return 64
  if (length <= 90) return 54
  if (length <= 160) return 46
  if (length <= 260) return 40
  return 34
}

export async function renderCardImage(input: CardInput): Promise<Blob> {
  // 폰트가 아직 안 내려왔으면 캔버스는 대체 서체로 그린다. 먼저 기다린다.
  const family = '"Noto Serif KR"'
  try {
    await document.fonts.load(`400 48px ${family}`)
  } catch {
    // 폰트 API 가 없거나 실패해도 그린다 — 대체 서체로.
  }

  const canvas = new OffscreenCanvas(W, H)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('캔버스를 만들 수 없습니다')

  ctx.fillStyle = '#faf8f4'
  ctx.fillRect(0, 0, W, H)

  const size = fontSizeFor(input.text.length)
  const lineHeight = Math.round(size * 1.75)
  ctx.font = `400 ${String(size)}px ${family}, serif`
  ctx.fillStyle = '#1c1917'
  ctx.textBaseline = 'top'

  const lines = wrap(ctx, input.text, W - PAD * 2)
  const blockHeight = lines.length * lineHeight
  // 세로 가운데보다 살짝 위 — 아래에 출처가 오니까.
  const top = Math.max(PAD, Math.round((H - blockHeight) / 2) - 80)
  lines.forEach((line, i) => { ctx.fillText(line, PAD, top + i * lineHeight) })

  // 밑줄 — 앱 이름이자 표식.
  const underlineY = top + blockHeight + 48
  ctx.strokeStyle = '#b4542e'
  ctx.lineWidth = 6
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(PAD, underlineY)
  ctx.quadraticCurveTo(PAD + 150, underlineY - 14, PAD + 300, underlineY - 2)
  ctx.stroke()

  // 출처.
  const source = [input.bookTitle, input.author].filter(Boolean).join(' · ')
  if (source) {
    ctx.font = `400 30px ${family}, serif`
    ctx.fillStyle = '#78716c'
    const sourceLines = wrap(ctx, source, W - PAD * 2)
    sourceLines.forEach((line, i) => { ctx.fillText(line, PAD, H - PAD - 60 - (sourceLines.length - 1 - i) * 44) })
  }

  ctx.font = `400 24px system-ui, sans-serif`
  ctx.fillStyle = '#a8a29e'
  ctx.textAlign = 'right'
  ctx.fillText('밑줄', W - PAD, H - PAD - 60)

  return canvas.convertToBlob({ type: 'image/png' })
}
