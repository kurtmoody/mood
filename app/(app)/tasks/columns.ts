import type { ColumnDef } from '@/lib/viewColumns'

// The task list's columns. 'title' is non-lockable (always shown — a row can never be
// blank). The actions column is rendered separately and is not user-managed.
export const TASK_VIEW_KEY = 'tasks'

export const TASK_COLUMNS: ColumnDef[] = [
  { key: 'title', label: 'Task', lockable: false },
  { key: 'client', label: 'Client', lockable: true },
  { key: 'task_type', label: 'Type', lockable: true },
  { key: 'owner', label: 'Owner', lockable: true },
  { key: 'status', label: 'Status', lockable: true },
  { key: 'priority', label: 'Priority', lockable: true },
  { key: 'due', label: 'Due', lockable: true },
  { key: 'estimate', label: 'Est.', lockable: true },
  { key: 'value', label: 'Value', lockable: true },
  { key: 'next_action', label: 'Next action', lockable: true },
]
