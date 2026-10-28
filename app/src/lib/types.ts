export type Role = 'admin' | 'nurse' | 'family'
export type RecordStatus = 'given' | 'refused' | 'missed'
export type DoseStatus = 'pending' | 'late' | RecordStatus

export interface Profile {
  id: string
  full_name: string
  role: Role
  active: boolean
  must_change_password: boolean
}

export interface Resident {
  id: string
  full_name: string
  birth_date: string | null
  room: string | null
  allergies: string | null
  notes: string | null
  active: boolean
}

export interface Prescription {
  id: string
  resident_id: string
  medication: string
  dosage: string
  route: string
  times: string[]
  start_date: string
  end_date: string | null
  prescriber_name: string
  prescriber_crm: string
  instructions: string | null
  active: boolean
}

export interface Administration {
  id: string
  prescription_id: string
  scheduled_for: string
  status: RecordStatus
  reason: string | null
  notes: string | null
  recorded_by: string
  recorded_at: string
  supersedes: string | null
}

export interface DoseItem {
  prescription: Prescription
  scheduledFor: Date
  status: DoseStatus
  record: Administration | null
}
