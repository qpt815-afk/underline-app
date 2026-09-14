import EmptyState from '../components/EmptyState.tsx'
import PageHeader from '../components/PageHeader.tsx'

export default function Library() {
  return (
    <div>
      <PageHeader title="서재" />
      <EmptyState
        title="서재가 비어 있어요"
        description="문장을 저장하면 책 단위로 차곡차곡 쌓입니다. 읽기 시작한 날, 다 읽은 날, 별점과 한 줄 감상도 함께 남길 수 있어요."
      />
    </div>
  )
}
