import type { ReactNode } from 'react'

interface Props {
  title: string
  description: string
  action?: ReactNode
}

/** 빈 상태가 이 앱의 첫인상이다. 사과하지 말고 다음 행동을 알려준다. */
export default function EmptyState({ title, description, action }: Props) {
  return (
    <div className="flex flex-col items-center justify-center px-8 py-16 text-center">
      <p className="font-serif text-lg text-ink">{title}</p>
      <p className="ko-prose mt-2 text-sm text-muted">{description}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  )
}
