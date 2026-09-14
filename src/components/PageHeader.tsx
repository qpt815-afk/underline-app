interface Props {
  title: string
}

export default function PageHeader({ title }: Props) {
  return (
    <header
      className="px-5 pb-2"
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1.25rem)' }}
    >
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
    </header>
  )
}
