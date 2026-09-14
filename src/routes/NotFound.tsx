import { Link } from 'react-router'
import EmptyState from '../components/EmptyState.tsx'

export default function NotFound() {
  return (
    <EmptyState
      title="없는 페이지예요"
      description="주소가 바뀌었거나 잘못 눌렀을 수 있어요."
      action={
        <Link to="/" className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">
          홈으로
        </Link>
      }
    />
  )
}
