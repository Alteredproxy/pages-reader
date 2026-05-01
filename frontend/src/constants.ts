export const AudioStatus = {
  PENDING:    "pending",
  GENERATING: "generating",
  READY:      "ready",
  ERROR:      "error",
} as const;
export type AudioStatusType = typeof AudioStatus[keyof typeof AudioStatus];

export const DocumentStatus = {
  PENDING:    "pending",
  PROCESSING: "processing",
  READY:      "ready",
  ERROR:      "error",
} as const;
export type DocumentStatusType = typeof DocumentStatus[keyof typeof DocumentStatus];

export const DocumentSource = {
  PDF: "pdf",
  URL: "url",
} as const;
export type DocumentSourceType = typeof DocumentSource[keyof typeof DocumentSource];

export const MAX_CHUNK_CHARS    = 800;
export const API_BASE_URL       = import.meta.env.VITE_API_BASE_URL as string;
export const POLLING_INTERVAL   = Number(import.meta.env.VITE_POLLING_INTERVAL_MS ?? 3000);
