export const MediaStatus = {
  PENDING_UPLOAD: 'PENDING_UPLOAD',
  READY: 'READY',
  PROCESSING: 'PROCESSING',
  OPTIMIZED: 'OPTIMIZED',
  FAILED: 'FAILED',
} as const;

export type MediaStatusValue = (typeof MediaStatus)[keyof typeof MediaStatus];
