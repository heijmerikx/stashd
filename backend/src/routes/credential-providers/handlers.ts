/**
 * Credential providers route handlers
 */

import { Response } from 'express';
import {
  getAllCredentialProviders,
  getCredentialProviderById,
  createCredentialProvider as dbCreateCredentialProvider,
  updateCredentialProvider as dbUpdateCredentialProvider,
  deleteCredentialProvider as dbDeleteCredentialProvider,
  isCredentialProviderInUse,
} from '../../db/credential-providers.js';
import { createAuditLogEntry } from '../../db/audit-log.js';
import { AuthRequest } from '../../middleware/auth.js';
import {
  maskSensitiveConfig,
  encryptConfig,
  decryptConfig,
  validateConfig,
  mergeConfigWithExisting,
  testProvider,
  getSensitiveFields,
} from './helpers.js';

/**
 * GET / - Get all credential providers
 */
export async function listProviders(_req: AuthRequest, res: Response) {
  try {
    const providers = await getAllCredentialProviders();
    const maskedProviders = providers.map(provider => ({
      ...provider,
      config: maskSensitiveConfig(provider.type, provider.config)
    }));
    res.json(maskedProviders);
  } catch (error) {
    console.error('Error fetching credential providers:', error);
    res.status(500).json({ error: 'Failed to fetch credential providers' });
  }
}

/**
 * GET /:id - Get single credential provider
 */
export async function getProvider(req: AuthRequest, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const provider = await getCredentialProviderById(id);

    if (!provider) {
      res.status(404).json({ error: 'Credential provider not found' });
      return;
    }

    const usage = await isCredentialProviderInUse(id);

    res.json({
      ...provider,
      config: maskSensitiveConfig(provider.type, provider.config),
      usage
    });
  } catch (error) {
    console.error('Error fetching credential provider:', error);
    res.status(500).json({ error: 'Failed to fetch credential provider' });
  }
}

/**
 * POST / - Create credential provider
 */
export async function createProvider(req: AuthRequest, res: Response) {
  try {
    const { name, type, provider_preset, config } = req.body;

    const validation = validateConfig(type, provider_preset, config);
    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    // Encrypt sensitive fields before storing
    const encryptedConfig = encryptConfig(type, config);

    const provider = await dbCreateCredentialProvider(name, type, encryptedConfig, provider_preset || 'custom');

    // Audit log
    await createAuditLogEntry({
      userId: req.user?.userId,
      userEmail: req.user?.email,
      entityType: 'credential_provider',
      entityId: provider.id,
      entityName: provider.name,
      action: 'create',
      changes: { name, type, provider_preset: provider_preset || 'custom' }
    });

    res.status(201).json({
      ...provider,
      config: maskSensitiveConfig(provider.type, provider.config)
    });
  } catch (error) {
    console.error('Error creating credential provider:', error);
    res.status(500).json({ error: 'Failed to create credential provider' });
  }
}

/**
 * PUT /:id - Update credential provider
 */
export async function updateProvider(req: AuthRequest, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const { name, type, provider_preset, config } = req.body;

    const validation = validateConfig(type, provider_preset, config);
    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const existingProvider = await getCredentialProviderById(id);
    if (!existingProvider) {
      res.status(404).json({ error: 'Credential provider not found' });
      return;
    }

    // Merge config with existing (keep encrypted values if masked)
    const mergedConfig = mergeConfigWithExisting(type, config, existingProvider.config as object);
    const encryptedConfig = encryptConfig(type, mergedConfig as Record<string, unknown>);

    const provider = await dbUpdateCredentialProvider(id, name, type, encryptedConfig, provider_preset || 'custom');

    if (!provider) {
      res.status(404).json({ error: 'Credential provider not found' });
      return;
    }

    // Audit log
    await createAuditLogEntry({
      userId: req.user?.userId,
      userEmail: req.user?.email,
      entityType: 'credential_provider',
      entityId: provider.id,
      entityName: provider.name,
      action: 'update',
      changes: {
        before: { name: existingProvider.name, type: existingProvider.type, provider_preset: existingProvider.provider_preset },
        after: { name, type, provider_preset: provider_preset || 'custom' }
      }
    });

    res.json({
      ...provider,
      config: maskSensitiveConfig(provider.type, provider.config)
    });
  } catch (error) {
    console.error('Error updating credential provider:', error);
    res.status(500).json({ error: 'Failed to update credential provider' });
  }
}

/**
 * DELETE /:id - Delete credential provider
 */
export async function deleteProvider(req: AuthRequest, res: Response) {
  try {
    const id = parseInt(req.params.id);

    // Get provider info for audit log before deletion
    const existingProvider = await getCredentialProviderById(id);

    // Check if provider is in use
    const usage = await isCredentialProviderInUse(id);
    if (usage.inUse) {
      res.status(400).json({
        error: 'Cannot delete credential provider that is in use',
        details: {
          destinationCount: usage.destinationCount,
          jobCount: usage.jobCount
        }
      });
      return;
    }

    const deleted = await dbDeleteCredentialProvider(id);

    if (!deleted) {
      res.status(404).json({ error: 'Credential provider not found' });
      return;
    }

    // Audit log
    if (existingProvider) {
      await createAuditLogEntry({
        userId: req.user?.userId,
        userEmail: req.user?.email,
        entityType: 'credential_provider',
        entityId: id,
        entityName: existingProvider.name,
        action: 'delete',
        changes: { deleted: { name: existingProvider.name, type: existingProvider.type } }
      });
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting credential provider:', error);
    res.status(500).json({ error: 'Failed to delete credential provider' });
  }
}

/**
 * POST /:id/test - Test credential provider connectivity
 */
export async function testProviderConnectivity(req: AuthRequest, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const provider = await getCredentialProviderById(id);

    if (!provider) {
      res.status(404).json({ error: 'Credential provider not found' });
      return;
    }

    // Decrypt config for testing
    const decryptedConfig = decryptConfig(
      provider.type,
      provider.config as unknown as Record<string, unknown>
    );

    const result = await testProvider(provider.type, decryptedConfig);

    if (result.success) {
      res.json({ message: 'Credential provider test successful', details: result.details });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    console.error('Error testing credential provider:', error);
    res.status(500).json({ error: 'Failed to test credential provider' });
  }
}
