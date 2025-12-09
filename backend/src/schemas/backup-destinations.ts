import { z } from 'zod';

// Local config - path inside the container
const localConfigSchema = z.object({
  path: z.string().min(1, 'Path is required').max(1024),
});

// S3 config - credentials come from credential_provider_id, only bucket and prefix stored here
const s3ConfigSchema = z.object({
  bucket: z.string().min(1).max(255),
  prefix: z.string().max(255).optional(),
});

// Local destination schema
const localDestinationSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  type: z.literal('local'),
  config: localConfigSchema,
  enabled: z.boolean().optional().default(true),
  credential_provider_id: z.null().optional(),
});

// S3 destination schema
const s3DestinationSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  type: z.literal('s3'),
  config: s3ConfigSchema,
  enabled: z.boolean().optional().default(true),
  credential_provider_id: z.number().int().positive(),
});

export const createBackupDestinationSchema = z.discriminatedUnion('type', [
  localDestinationSchema,
  s3DestinationSchema,
]);

export const updateBackupDestinationSchema = z.discriminatedUnion('type', [
  localDestinationSchema,
  s3DestinationSchema,
]);

export type CreateBackupDestinationInput = z.infer<typeof createBackupDestinationSchema>;
export type UpdateBackupDestinationInput = z.infer<typeof updateBackupDestinationSchema>;
