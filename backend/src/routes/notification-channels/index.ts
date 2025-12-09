/**
 * Notification Channels Router
 *
 * Endpoints:
 * - GET    /         List all notification channels
 * - GET    /:id      Get single notification channel
 * - POST   /         Create notification channel
 * - PUT    /:id      Update notification channel
 * - DELETE /:id      Delete notification channel
 * - POST   /:id/test Test notification channel
 */

import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { createNotificationChannelSchema, updateNotificationChannelSchema } from '../../schemas/notification-channels.js';
import {
  listChannels,
  getChannel,
  createChannel,
  updateChannel,
  deleteChannel,
  testChannel,
} from './handlers.js';

const router = Router();

// List routes
router.get('/', listChannels);

// Single channel routes
router.get('/:id', getChannel);

// Mutation routes
router.post('/', validate(createNotificationChannelSchema), createChannel);
router.put('/:id', validate(updateNotificationChannelSchema), updateChannel);
router.delete('/:id', deleteChannel);

// Action routes
router.post('/:id/test', testChannel);

export default router;
