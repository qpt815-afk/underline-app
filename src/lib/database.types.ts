// supabase/migrations/*.sql 과 대응하는 손으로 쓴 타입.
//
// `supabase gen types` 는 CLI 가 필요한데 이 프로젝트는 로컬 머신 없이 굴러가므로
// 직접 유지한다. 스키마를 바꾸면 여기도 바꿔야 한다.
//
// ⚠️ Views / Functions / Enums / CompositeTypes 와 각 테이블의 Relationships 는
//    supabase-js 의 GenericSchema 가 구조적으로 요구한다. 하나라도 빠뜨리면
//    from('books').select() 의 추론이 never 로 무너지고, 모든 필드 접근이
//    "Property 'title' does not exist on type 'never'" 로 터진다.
//    테이블 이름 오타처럼 보이지만 사실은 이 키가 없어서 그런 것이다.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      books: {
        Row: {
          id: string
          user_id: string
          title: string
          author: string | null
          cover_path: string | null
          status: string
          rating: number | null
          review: string | null
          started_at: string | null
          finished_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          author?: string | null
          cover_path?: string | null
          status?: string
          rating?: number | null
          review?: string | null
          started_at?: string | null
          finished_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          title?: string
          author?: string | null
          cover_path?: string | null
          status?: string
          rating?: number | null
          review?: string | null
          started_at?: string | null
          finished_at?: string | null
        }
        Relationships: []
      }
      highlights: {
        Row: {
          id: string
          user_id: string
          book_id: string
          text: string
          page: number | null
          note: string | null
          tags: string[]
          image_path: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          book_id: string
          text: string
          page?: number | null
          note?: string | null
          tags?: string[]
          image_path?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          text?: string
          page?: number | null
          note?: string | null
          tags?: string[]
          image_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'highlights_book_id_fkey'
            columns: ['book_id']
            isOneToOne: false
            referencedRelation: 'books'
            referencedColumns: ['id']
          },
        ]
      }
      daily_picks: {
        Row: { user_id: string; pick_date: string; highlight_id: string }
        Insert: { user_id: string; pick_date: string; highlight_id: string }
        Update: { highlight_id?: string }
        Relationships: [
          {
            foreignKeyName: 'daily_picks_highlight_id_fkey'
            columns: ['highlight_id']
            isOneToOne: false
            referencedRelation: 'highlights'
            referencedColumns: ['id']
          },
        ]
      }
      push_subs: {
        Row: {
          endpoint: string
          user_id: string
          keys: Json
          enabled: boolean
          created_at: string
        }
        Insert: {
          endpoint: string
          user_id: string
          keys: Json
          enabled?: boolean
          created_at?: string
        }
        Update: { keys?: Json; enabled?: boolean }
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}
