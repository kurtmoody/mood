// Canonical task lists — single source of truth for the tasks feature.
// TASK_TYPES must match raci_matrix.task_type exactly (migration 0027).

export const TASK_TYPES = [
  'New lead / client intake',
  'Scope / quote / contract or retainer change',
  'Client relationship / main communication',
  'Content strategy / monthly plan',
  'Caption writing / copy',
  'Design direction',
  'Design execution',
  'Video concept / shot list',
  'Filming / content capture',
  'Video editing / reels',
  'Scheduling / publishing',
  'Paid ads setup / boost coordination',
  'Client feedback / revisions',
  'Final approval before client sees work',
  'Reporting / performance updates',
] as const

export const TASK_STATUSES = [
  'Not Started',
  'In Progress',
  'Waiting on Client',
  'Ready for Review',
  'Complete',
  'On Hold',
] as const

export const TASK_PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'] as const

export type TaskStatus = (typeof TASK_STATUSES)[number]
export type TaskPriority = (typeof TASK_PRIORITIES)[number]

// Small status/priority colours, consistent with the calendar's status dots.
export const STATUS_COLOUR: Record<string, string> = {
  'Not Started': '#A6ABB3',
  'In Progress': '#3B82F6',
  'Waiting on Client': '#E8920C',
  'Ready for Review': '#8B5CF6',
  Complete: '#16A34A',
  'On Hold': '#E0572E',
}

export const PRIORITY_COLOUR: Record<string, string> = {
  Low: '#9398A1',
  Medium: '#3B82F6',
  High: '#E8920C',
  Urgent: '#E0572E',
}

// Open = anything not yet Complete.
export const OPEN_STATUSES = TASK_STATUSES.filter((s) => s !== 'Complete')
