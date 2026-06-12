'use server'

import { rpcErrorMessage } from '@/lib/rpcError'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export type CommentState = { error: string | null; ok: boolean }

function str(fd: FormData, k: string) {
  const v = (fd.get(k) as string | null)?.trim() ?? ''
  return v === '' ? null : v
}

export async function addCommentAction(_prev: CommentState, fd: FormData): Promise<CommentState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const itemId = str(fd, 'item_id')
  const body = str(fd, 'body')
  if (!itemId) return { error: 'Missing post.', ok: false }
  if (!body) return { error: 'Comment cannot be empty.', ok: false }

  const { error } = await supabase.rpc('add_comment', { p_item_id: itemId, p_body: body })
  if (error) return { error: rpcErrorMessage(error), ok: false }

  revalidatePath('/')
  return { error: null, ok: true }
}

export async function deleteCommentAction(_prev: CommentState, fd: FormData): Promise<CommentState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const commentId = str(fd, 'comment_id')
  if (!commentId) return { error: 'Missing comment.', ok: false }

  const { error } = await supabase.rpc('delete_comment', { p_comment_id: commentId })
  if (error) return { error: rpcErrorMessage(error), ok: false }

  revalidatePath('/')
  return { error: null, ok: true }
}
