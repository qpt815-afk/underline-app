import { NavLink } from 'react-router'

const TABS = [
  { to: '/', label: '홈' },
  { to: '/library', label: '서재' },
  { to: '/feed', label: '문장' },
  { to: '/settings', label: '설정' },
] as const

/** 한 손 조작을 위해 주요 이동은 전부 화면 하단, 엄지 범위 안에 둔다. */
export default function BottomNav() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="mx-auto flex max-w-lg">
        {TABS.map((tab) => (
          <li key={tab.to} className="flex-1">
            <NavLink
              to={tab.to}
              end={tab.to === '/'}
              className={({ isActive }) =>
                [
                  'flex h-14 items-center justify-center text-sm transition-colors',
                  isActive ? 'font-semibold text-accent' : 'text-muted',
                ].join(' ')
              }
            >
              {tab.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
