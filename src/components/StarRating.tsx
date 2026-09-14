interface Props {
  value: number | null
  /** 넘기지 않으면 읽기 전용으로 렌더한다. */
  onChange?: (value: number | null) => void
  size?: 'sm' | 'md'
}

const STARS = [1, 2, 3, 4, 5] as const

export default function StarRating({ value, onChange, size = 'md' }: Props) {
  const readOnly = onChange === undefined
  const cls = size === 'sm' ? 'text-base' : 'text-2xl'

  if (readOnly) {
    return (
      <span className={`${cls} leading-none text-accent`} aria-label={`별점 ${value ?? 0}점`}>
        {STARS.map((n) => (
          <span key={n} className={value !== null && n <= value ? '' : 'opacity-25'}>
            ★
          </span>
        ))}
      </span>
    )
  }

  return (
    <div className={`${cls} flex gap-1 leading-none`} role="radiogroup" aria-label="별점">
      {STARS.map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n}점`}
          // 같은 별을 다시 누르면 해제한다. 폰에서 별점을 지울 다른 방법이 없다.
          onClick={() => { onChange(value === n ? null : n) }}
          className={`text-accent ${value !== null && n <= value ? '' : 'opacity-25'}`}
        >
          ★
        </button>
      ))}
    </div>
  )
}
