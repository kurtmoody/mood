// User-facing copy for RPC failures. Our RPCs raise P0001 as '<fn_name>: <message>'
// with a human-readable message — strip the internal prefix. Anything else (constraint
// violations, network) logs server-side and shows a generic line, so postgres
// internals never reach the UI.
export function rpcErrorMessage(error: { code?: string; message?: string }): string {
  const msg = error.message ?? ''
  if (error.code === 'P0001') return msg.replace(/^[a-z0-9_]+:\s*/i, '')
  if (error.code === '23505') return 'That already exists.'
  console.error('rpc error:', error.code, msg)
  return 'Something went wrong — please try again.'
}
