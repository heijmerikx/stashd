import { z } from 'zod';

const emailConfigSchema = z.object({
  smtp_host: z.string().min(1).max(255),
  smtp_port: z.number().int().min(1).max(65535),
  smtp_secure: z.boolean().optional().default(false),
  smtp_user: z.string().max(255).optional(),
  smtp_pass: z.string().max(255).optional(),
  from_email: z.string().email().max(255),
  to_emails: z.array(z.string().email().max(255)).min(1),
});

const discordConfigSchema = z.object({
  webhook_url: z.string().url().max(1024)
    .refine(url => url.includes('discord.com/api/webhooks') || url.includes('discordapp.com/api/webhooks'), 'Must be a valid Discord webhook URL'),
});

export const createNotificationChannelSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  type: z.enum(['email', 'discord']),
  config: z.union([emailConfigSchema, discordConfigSchema]),
  enabled: z.boolean().optional().default(true),
});

export const updateNotificationChannelSchema = createNotificationChannelSchema;

export type CreateNotificationChannelInput = z.infer<typeof createNotificationChannelSchema>;
export type UpdateNotificationChannelInput = z.infer<typeof updateNotificationChannelSchema>;
