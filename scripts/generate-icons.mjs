import sharp from 'sharp'
import { writeFileSync } from 'node:fs'

import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons')

// 텍스트 3줄 + 마지막 줄 밑줄. 폰트 의존성 없이 순수 도형으로 그린다.
// safe = 마스커블 아이콘의 안전 영역 비율(중앙 80%)에 마크를 가둘지 여부
function mark({ bg, ink, accent, safe }) {
  const s = 512
  const inset = safe ? 0.2 : 0.14 // maskable 은 원형 크롭을 견뎌야 하므로 더 안쪽으로
  const w = s * (1 - inset * 2)
  const x0 = s * inset
  const barH = w * 0.085
  const gap = w * 0.135
  const rows = [
    { y: 0, len: 1.0 },
    { y: gap + barH, len: 0.82 },
    { y: (gap + barH) * 2, len: 0.94 },
  ]
  const blockH = (gap + barH) * 2 + barH
  const yOff = (s - blockH) / 2 - w * 0.045

  const bars = rows
    .map(
      (r) =>
        `<rect x="${x0}" y="${yOff + r.y}" width="${w * r.len}" height="${barH}" rx="${barH / 2}" fill="${ink}"/>`
    )
    .join('')

  // 마지막 줄 아래 손으로 그은 듯한 밑줄.
  // 활처럼 휘어야 '네 번째 글줄'이 아니라 '밑줄'로 읽힌다.
  const uy = yOff + blockH + w * 0.15
  const uw = w * 0.78
  const underline = `<path d="M ${x0} ${uy} Q ${x0 + uw * 0.5} ${uy - w * 0.11} ${x0 + uw} ${uy - w * 0.015}" stroke="${accent}" stroke-width="${barH * 1.15}" stroke-linecap="round" fill="none"/>`

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
    <rect width="${s}" height="${s}" fill="${bg}"/>${bars}${underline}</svg>`
}

const PAPER = '#FAF8F4'
const INK = '#1C1917'
const ACCENT = '#B4542E'

const targets = [
  { file: 'icon-192.png', size: 192, svg: mark({ bg: PAPER, ink: INK, accent: ACCENT, safe: false }) },
  { file: 'icon-512.png', size: 512, svg: mark({ bg: PAPER, ink: INK, accent: ACCENT, safe: false }) },
  { file: 'maskable-512.png', size: 512, svg: mark({ bg: PAPER, ink: INK, accent: ACCENT, safe: true }) },
  // iOS 는 투명도를 검정으로 합성하므로 알파 없이 굽는다
  { file: 'apple-touch-icon.png', size: 180, svg: mark({ bg: PAPER, ink: INK, accent: ACCENT, safe: true }) },
]

for (const t of targets) {
  await sharp(Buffer.from(t.svg)).resize(t.size, t.size).flatten({ background: PAPER }).png().toFile(resolve(OUT, t.file))
  console.log('wrote', t.file, t.size)
}

writeFileSync(
  resolve(OUT, "favicon.svg"),
  mark({ bg: PAPER, ink: INK, accent: ACCENT, safe: false })
)
console.log('wrote favicon.svg')
