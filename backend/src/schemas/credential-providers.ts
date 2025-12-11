import { z } from 'zod';

// S3-compatible provider presets (only tested providers)
export const S3_PROVIDER_PRESETS = ['aws', 'cloudflare', 'hetzner', 'custom'] as const;
export type S3ProviderPreset = typeof S3_PROVIDER_PRESETS[number];

const s3CredentialConfigSchema = z.object({
  endpoint: z.string().url().max(1024).optional(),
  region: z.string().max(64).optional(), // Required for AWS, optional for S3-compatible services
  access_key_id: z.string().min(1).max(255),
  secret_access_key: z.string().min(1).max(255),
});

export const createCredentialProviderSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  type: z.enum(['s3']),
  provider_preset: z.enum(S3_PROVIDER_PRESETS).default('custom'),
  config: s3CredentialConfigSchema,
});

export const updateCredentialProviderSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  type: z.enum(['s3']),
  provider_preset: z.enum(S3_PROVIDER_PRESETS).default('custom'),
  config: s3CredentialConfigSchema,
});

export type CreateCredentialProviderInput = z.infer<typeof createCredentialProviderSchema>;
export type UpdateCredentialProviderInput = z.infer<typeof updateCredentialProviderSchema>;
