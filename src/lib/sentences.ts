/**
 * 문단을 문장으로 쪼갠다.
 *
 * OCR 은 문단 단위로 돌려준다(맥락 보존에 유리하고 프롬프트를 건드리지 않아도 된다).
 * 밑줄은 문장 단위로 긋고 싶으므로 클라이언트에서 나눈다.
 *
 * 한국어 문장 끝: 마침표·물음표·느낌표·말줄임표 바로 뒤의 공백. 소수점(3.14)은 뒤에
 * 공백이 없어 안전하다. 완벽하진 않다 — 잘못 나뉘면 사용자가 연달아 골라 합치면 된다.
 */
export function splitSentences(paragraph: string): string[] {
  const text = paragraph.replace(/\s+/g, ' ').trim()
  if (text === '') return []

  // 문장 종결 부호가 바로 공백 앞에 올 때만 자른다.
  // 「“가자.” 하고 말했다」처럼 닫는 따옴표가 뒤에 붙으면 인용 + 지문이 한 문장이므로
  // 자르지 않는다. 따옴표로 끝나는 진짜 문장이 뒤 문장과 붙는 경우는 사용자가 고칠 수 있다.
  const parts = text.split(/(?<=[.!?…。])\s+(?=\S)/)

  const out: string[] = []
  for (const part of parts) {
    const s = part.trim()
    if (s === '') continue
    // 너무 짧은 조각("다." 같은 오탐)은 앞 문장에 붙인다.
    if (s.length <= 2 && out.length > 0) {
      out[out.length - 1] = `${out[out.length - 1] ?? ''} ${s}`
    } else {
      out.push(s)
    }
  }
  return out
}

export interface SelectableRow {
  text: string
  /** 어느 문단에서 왔는지 */
  paragraph: number
}

/**
 * 고른 문장들을 저장 단위로 묶는다.
 * 같은 문단에서 연달아 고른 문장은 하나로 합친다 — 두세 문장을 한 덩어리로
 * 남기고 싶은 경우가 많다. 문단이 바뀌거나 사이에 안 고른 문장이 있으면 나눈다.
 */
export function groupSelected(
  rows: readonly SelectableRow[],
  selected: ReadonlySet<number>,
  edited: Readonly<Record<number, string>> = {}
): string[] {
  const groups: string[][] = []
  let prevIndex = -2
  rows.forEach((row, index) => {
    if (!selected.has(index)) return
    const text = (edited[index] ?? row.text).trim()
    if (text === '') return
    const continues = prevIndex === index - 1 && rows[prevIndex]?.paragraph === row.paragraph
    const last = groups[groups.length - 1]
    if (continues && last) last.push(text)
    else groups.push([text])
    prevIndex = index
  })
  return groups.map((parts) => parts.join(' '))
}
