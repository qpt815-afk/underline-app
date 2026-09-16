import type { ReactNode } from 'react'

interface Props {
  title: string
  /** 제목 오른쪽에 붙는 동작 하나(링크나 버튼). */
  action?: ReactNode
}

export default function PageHeader({ title, action }: Props) {
  return (
    <header
      className="flex items-baseline justify-between px-5 pb-2"
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1.25rem)' }}
    >
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      {action}
    </header>
  )
}
