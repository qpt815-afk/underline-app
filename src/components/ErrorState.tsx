interface Props {
  message: string
  onRetry?: () => void
}

/** 빈 상태와 확실히 구분되어야 한다. 비어 있는 것과 못 불러온 것은 다른 일이다. */
export default function ErrorState({ message, onRetry }: Props) {
  return (
    <div className="px-5 py-12 text-center">
      <p className="ko-prose text-sm text-muted">불러오지 못했어요.</p>
      <p className="ko-prose mt-1 text-xs text-muted">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium"
        >
          다시 시도
        </button>
      ) : null}
    </div>
  )
}
