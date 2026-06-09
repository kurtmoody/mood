// Per-client ownership role slots — single source of truth for the column keys (which
// match client_ownership) and their human labels. Used by the per-client edit form and
// the read-only matrix overview.
export const OWNERSHIP_ROLES = [
  { key: 'lead_pm_id', label: 'Lead PM' },
  { key: 'comms_backup_id', label: 'Comms backup' },
  { key: 'creative_lead_id', label: 'Creative lead' },
  { key: 'design_owner_id', label: 'Design owner' },
  { key: 'content_owner_id', label: 'Content owner' },
  { key: 'video_owner_id', label: 'Video owner' },
  { key: 'sales_ops_id', label: 'Sales / ops' },
  { key: 'intern_support_id', label: 'Intern support' },
] as const

export type OwnershipRoleKey = (typeof OWNERSHIP_ROLES)[number]['key']
export type Ownership = Record<OwnershipRoleKey, string | null>
