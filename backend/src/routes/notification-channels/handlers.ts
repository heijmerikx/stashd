/**
 * Notification channels route handlers
 */

import { Response } from 'express';
import {
  getAllNotificationChannels,
  getNotificationChannelById,
  createNotificationChannel as dbCreateNotificationChannel,
  updateNotificationChannel as dbUpdateNotificationChannel,
  deleteNotificationChannel as dbDeleteNotificationChannel,
} from '../../db/notification-channels.js';
import { testNotificationChannel } from '../../services/notification-service.js';
import { createAuditLogEntry } from '../../db/audit-log.js';
import { AuthRequest } from '../../middleware/auth.js';
import {
  maskSensitiveConfig,
  encryptConfig,
  validateConfig,
  mergeConfigWithExisting,
} from './helpers.js';

/**
 * GET / - Get all notification channels
 */
export async function listChannels(_req: AuthRequest, res: Response) {
  try {
    const channels = await getAllNotificationChannels();
    // Mask sensitive config data
    const maskedChannels = channels.map(channel => ({
      ...channel,
      config: maskSensitiveConfig(channel.type, channel.config)
    }));
    res.json(maskedChannels);
  } catch (error) {
    console.error('Error fetching notification channels:', error);
    res.status(500).json({ error: 'Failed to fetch notification channels' });
  }
}

/**
 * GET /:id - Get single notification channel
 */
export async function getChannel(req: AuthRequest, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const channel = await getNotificationChannelById(id);

    if (!channel) {
      res.status(404).json({ error: 'Notification channel not found' });
      return;
    }

    res.json({
      ...channel,
      config: maskSensitiveConfig(channel.type, channel.config)
    });
  } catch (error) {
    console.error('Error fetching notification channel:', error);
    res.status(500).json({ error: 'Failed to fetch notification channel' });
  }
}

/**
 * POST / - Create notification channel
 */
export async function createChannel(req: AuthRequest, res: Response) {
  try {
    const { name, type, config, enabled } = req.body;

    const validation = validateConfig(type, config);
    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    // Encrypt sensitive fields before storing
    const encryptedConfig = encryptConfig(type, config);

    const channel = await dbCreateNotificationChannel(name, type, encryptedConfig, enabled ?? true);

    // Audit log
    await createAuditLogEntry({
      userId: req.user?.userId,
      userEmail: req.user?.email,
      entityType: 'notification_channel',
      entityId: channel.id,
      entityName: channel.name,
      action: 'create',
      changes: { name, type, enabled: enabled ?? true }
    });

    res.status(201).json({
      ...channel,
      config: maskSensitiveConfig(channel.type, channel.config)
    });
  } catch (error) {
    console.error('Error creating notification channel:', error);
    res.status(500).json({ error: 'Failed to create notification channel' });
  }
}

/**
 * PUT /:id - Update notification channel
 */
export async function updateChannel(req: AuthRequest, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const { name, type, config, enabled } = req.body;

    const validation = validateConfig(type, config);
    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    // If password fields are masked, get existing config and merge
    const existingChannel = await getNotificationChannelById(id);
    if (!existingChannel) {
      res.status(404).json({ error: 'Notification channel not found' });
      return;
    }

    const mergedConfig = mergeConfigWithExisting(type, config, existingChannel.config as object);

    // Encrypt sensitive fields before storing
    const encryptedConfig = encryptConfig(type, mergedConfig as Record<string, unknown>);

    const channel = await dbUpdateNotificationChannel(id, name, type, encryptedConfig, enabled);

    if (!channel) {
      res.status(404).json({ error: 'Notification channel not found' });
      return;
    }

    // Audit log
    await createAuditLogEntry({
      userId: req.user?.userId,
      userEmail: req.user?.email,
      entityType: 'notification_channel',
      entityId: channel.id,
      entityName: channel.name,
      action: 'update',
      changes: {
        before: { name: existingChannel.name, type: existingChannel.type, enabled: existingChannel.enabled },
        after: { name, type, enabled }
      }
    });

    res.json({
      ...channel,
      config: maskSensitiveConfig(channel.type, channel.config)
    });
  } catch (error) {
    console.error('Error updating notification channel:', error);
    res.status(500).json({ error: 'Failed to update notification channel' });
  }
}

/**
 * DELETE /:id - Delete notification channel
 */
export async function deleteChannel(req: AuthRequest, res: Response) {
  try {
    const id = parseInt(req.params.id);

    // Get channel info for audit log before deletion
    const existingChannel = await getNotificationChannelById(id);

    const deleted = await dbDeleteNotificationChannel(id);

    if (!deleted) {
      res.status(404).json({ error: 'Notification channel not found' });
      return;
    }

    // Audit log
    if (existingChannel) {
      await createAuditLogEntry({
        userId: req.user?.userId,
        userEmail: req.user?.email,
        entityType: 'notification_channel',
        entityId: id,
        entityName: existingChannel.name,
        action: 'delete',
        changes: { deleted: { name: existingChannel.name, type: existingChannel.type } }
      });
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting notification channel:', error);
    res.status(500).json({ error: 'Failed to delete notification channel' });
  }
}

/**
 * POST /:id/test - Test notification channel
 */
export async function testChannel(req: AuthRequest, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const channel = await getNotificationChannelById(id);

    if (!channel) {
      res.status(404).json({ error: 'Notification channel not found' });
      return;
    }

    const result = await testNotificationChannel(id);

    if (result.success) {
      res.json({ message: 'Test notification sent successfully' });
    } else {
      res.status(400).json({ error: result.error || 'Failed to send test notification' });
    }
  } catch (error) {
    console.error('Error testing notification channel:', error);
    res.status(500).json({ error: 'Failed to test notification channel' });
  }
}
