import EmptyState from '../components/EmptyState.tsx'
import PageHeader from '../components/PageHeader.tsx'

export default function Feed() {
  return (
    <div>
      <PageHeader title="문장" />
      <EmptyState
        title="모아둔 문장이 없어요"
        description="저장한 문장이 시간순으로 여기 쌓입니다. 책별로 걸러 보거나 검색해서 다시 찾아볼 수 있어요."
      />
    </div>
  )
}
