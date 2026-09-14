import EmptyState from '../components/EmptyState.tsx'

export default function Home() {
  return (
    <div>
      <header
        className="px-5 pb-4"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1.5rem)' }}
      >
        <p className="text-sm text-muted">오늘의 문장</p>
      </header>

      {/* 오늘의 문장 카드 자리. Phase 1 에서 실제 문장이 들어온다. */}
      <section className="px-5">
        <div className="rounded-2xl border border-line bg-surface p-6">
          <EmptyState
            title="아직 문장이 없어요"
            description="책을 읽다 마음에 드는 문장을 만나면 그 페이지를 찍어보세요. 여기에 매일 한 문장씩 다시 꺼내 드릴게요."
          />
        </div>
      </section>

      {/* 촬영 버튼. Phase 1 에서 카메라가 연결된다. */}
      <section className="px-5 pt-6">
        <button
          type="button"
          disabled
          className="flex h-16 w-full items-center justify-center rounded-2xl bg-accent text-base font-semibold text-white disabled:opacity-40"
        >
          문장 찍기
        </button>
        <p className="mt-3 text-center text-xs text-muted">
          촬영과 문장 추출은 다음 단계에서 연결됩니다.
        </p>
      </section>
    </div>
  )
}
