import { z } from 'zod';

const postgresConfigSchema = z.object({
  host: z.string().min(1).max(255),
  port: z.number().int().min(1).max(65535),
  database: z.string().min(1).max(255),
  username: z.string().min(1).max(255),
  password: z.string().max(255).optional(),
});

const mongodbConfigSchema = z.object({
  connection_string: z.string().min(1).max(1024),
});

const mysqlConfigSchema = z.object({
  host: z.string().min(1).max(255),
  port: z.number().int().min(1).max(65535),
  database: z.string().min(1).max(255),
  username: z.string().min(1).max(255),
  password: z.string().max(255).optional(),
  ssl: z.boolean().optional(), // Default true - most cloud providers require SSL
});

const redisConfigSchema = z.object({
  host: z.string().min(1).max(255),
  port: z.number().int().min(1).max(65535),
  username: z.string().max(255).optional(),
  password: z.string().max(255).optional(),
  database: z.number().int().min(0).max(15).optional(),
  tls: z.boolean().optional(),
});

// S3 config with inline credentials (used when no credential provider)
const s3ConfigInlineSchema = z.object({
  endpoint: z.string().max(512).optional(),
  region: z.string().min(1).max(64),
  bucket: z.string().min(1).max(255),
  prefix: z.string().max(512).optional(),
  access_key_id: z.string().min(1).max(255),
  secret_access_key: z.string().min(1).max(255),
});

// S3 config when using credential provider (no inline credentials needed)
const s3ConfigWithProviderSchema = z.object({
  bucket: z.string().min(1).max(255),
  prefix: z.string().max(512).optional(),
});

// Union of both S3 config types - validation of which fields are required
// depends on whether source_credential_provider_id is set (done at route level)
const s3ConfigSchema = z.union([s3ConfigInlineSchema, s3ConfigWithProviderSchema]);

export const createBackupJobSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  type: z.enum(['postgres', 'mongodb', 'mysql', 'redis', 'files', 's3']),
  config: z.union([postgresConfigSchema, mongodbConfigSchema, mysqlConfigSchema, redisConfigSchema, s3ConfigSchema, z.object({})]),
  schedule: z.string().max(100).nullable().optional(),
  destination_ids: z.array(z.number().int().positive()).default([]),
  retention_days: z.number().int().min(1).max(3650).optional().default(30),
  retry_count: z.number().int().min(0).max(10).optional().default(3),
  enabled: z.boolean().optional().default(false),
  source_credential_provider_id: z.number().int().positive().nullable().optional(),
  notifications: z.array(z.object({
    channelId: z.number().int().positive(),
    onSuccess: z.boolean(),
    onFailure: z.boolean(),
  })).optional(),
}).refine(
  (data) => !data.enabled || (data.destination_ids && data.destination_ids.length > 0),
  {
    message: 'At least one destination is required to enable a backup job',
    path: ['destination_ids'],
  }
);

export const updateBackupJobSchema = createBackupJobSchema;

export type CreateBackupJobInput = z.infer<typeof createBackupJobSchema>;
export type UpdateBackupJobInput = z.infer<typeof updateBackupJobSchema>;
