/**
 * Credential Providers Router
 *
 * Endpoints:
 * - GET    /         List all credential providers
 * - GET    /:id      Get single credential provider
 * - POST   /         Create credential provider
 * - PUT    /:id      Update credential provider
 * - DELETE /:id      Delete credential provider
 * - POST   /:id/test Test credential provider connectivity
 */

import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { createCredentialProviderSchema, updateCredentialProviderSchema } from '../../schemas/credential-providers.js';
import {
  listProviders,
  getProvider,
  createProvider,
  updateProvider,
  deleteProvider,
  testProviderConnectivity,
} from './handlers.js';

const router = Router();

// List routes
router.get('/', listProviders);

// Single provider routes
router.get('/:id', getProvider);

// Mutation routes
router.post('/', validate(createCredentialProviderSchema), createProvider);
router.put('/:id', validate(updateCredentialProviderSchema), updateProvider);
router.delete('/:id', deleteProvider);

// Action routes
router.post('/:id/test', testProviderConnectivity);

export default router;
