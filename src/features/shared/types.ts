export type HistoryType = 'status' | 'note' | 'note-edit' | 'system' | 'lead-identified';

export type LeadHistoryItem = {
  id: string;
  noteId?: string;
  occurredAt?: string;
  updatedAt?: string;
  at: string;
  label: string;
  detail?: string;
  type: HistoryType;
};

export type LeadNote = { id: string; at: string; text: string };

export type ClosedSubcategory = 'all' | 'won' | 'lost' | 'not-interested' | 'withdrew';
