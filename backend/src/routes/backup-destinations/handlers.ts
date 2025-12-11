/**
 * Backup destinations route handlers
 */

import { Response } from 'express';
import {
  getAllBackupDestinationsWithProviders,
  getBackupDestinationById,
  createBackupDestination as dbCreateBackupDestination,
  updateBackupDestination as dbUpdateBackupDestination,
  deleteBackupDestination as dbDeleteBackupDestination,
  isDestinationInUse,
  getDestinationStats,
  getDestinationStatsBatch,
} from '../../db/backup-destinations.js';
import { getCredentialProviderById } from '../../db/credential-providers.js';
import { createAuditLogEntry } from '../../db/audit-log.js';
import { filterCompatibleDestinations, getCompatibleDestinationTypes } from '../../utils/compatibility.js';
import { BackupJobType } from '../../db/backup-jobs.js';
import { AuthRequest } from '../../middleware/auth.js';
import {
  maskCredentialProviderConfig,
  validateConfig,
  testDestination,
  resolveS3Config,
  browseDestinationFiles,
} from './helpers.js';

/**
 * GET /compatible-types/:jobType - Get compatible destination types
 */
export async function getCompatibleTypes(req: AuthRequest, res: Response) {
  try {
    const jobType = req.params.jobType as BackupJobType;
    const validJobTypes: BackupJobType[] = ['postgres', 'mongodb', 'mysql', 'files', 's3'];

    if (!validJobTypes.includes(jobType)) {
      res.status(400).json({ error: `Invalid job type: ${jobType}` });
      return;
    }

    const compatibleTypes = getCompatibleDestinationTypes(jobType);
    res.json({ jobType, compatibleDestinationTypes: compatibleTypes });
  } catch (error) {
    console.error('Error getting compatible destination types:', error);
    res.status(500).json({ error: 'Failed to get compatible destination types' });
  }
}

/**
 * GET /compatible/:jobType - Get destinations filtered by compatibility
 */
export async function getCompatibleDestinations(req: AuthRequest, res: Response) {
  try {
    const jobType = req.params.jobType as BackupJobType;
    const validJobTypes: BackupJobType[] = ['postgres', 'mongodb', 'mysql', 'files', 's3'];

    if (!validJobTypes.includes(jobType)) {
      res.status(400).json({ error: `Invalid job type: ${jobType}` });
      return;
    }

    const destinations = await getAllBackupDestinationsWithProviders();
    const compatibleDestinations = filterCompatibleDestinations(destinations, jobType);

    const maskedDestinations = compatibleDestinations.map(dest => {
      const result: Record<string, unknown> = {
        ...dest,
        config: dest.config,
      };

      if (dest.credential_provider) {
        result.credential_provider = {
          ...dest.credential_provider,
          config: maskCredentialProviderConfig(dest.credential_provider.config),
        };
      }

      return result;
    });

    res.json(maskedDestinations);
  } catch (error) {
    console.error('Error getting compatible destinations:', error);
    res.status(500).json({ error: 'Failed to get compatible destinations' });
  }
}

/**
 * GET / - Get all backup destinations
 */
export async function listDestinations(_req: AuthRequest, res: Response) {
  try {
    const destinations = await getAllBackupDestinationsWithProviders();

    // Batch load stats for all destinations
    const destinationIds = destinations.map(d => d.id);
    const statsMap = await getDestinationStatsBatch(destinationIds);

    const maskedDestinations = destinations.map(dest => {
      const result: Record<string, unknown> = {
        ...dest,
        config: dest.config,
        stats: statsMap.get(dest.id) || { successful_backups: 0, total_size: 0, last_backup: null },
      };

      // Mask credential provider config if present
      if (dest.credential_provider) {
        result.credential_provider = {
          ...dest.credential_provider,
          config: maskCredentialProviderConfig(dest.credential_provider.config),
        };
      }

      return result;
    });
    res.json(maskedDestinations);
  } catch (error) {
    console.error('Error fetching backup destinations:', error);
    res.status(500).json({ error: 'Failed to fetch backup destinations' });
  }
}

/**
 * GET /:id - Get single backup destination
 */
export async function getDestination(req: AuthRequest, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const destination = await getBackupDestinationById(id);

    if (!destination) {
      res.status(404).json({ error: 'Backup destination not found' });
      return;
    }

    const stats = await getDestinationStats(id);
    const inUse = await isDestinationInUse(id);

    res.json({
      ...destination,
      config: destination.config,
      stats,
      in_use: inUse
    });
  } catch (error) {
    console.error('Error fetching backup destination:', error);
    res.status(500).json({ error: 'Failed to fetch backup destination' });
  }
}

/**
 * POST / - Create backup destination
 */
export async function createDestination(req: AuthRequest, res: Response) {
  try {
    const { name, type, config, enabled, credential_provider_id } = req.body;

    // S3 destinations require a credential provider
    if (type === 's3' && !credential_provider_id) {
      res.status(400).json({ error: 'S3 destinations require a credential provider' });
      return;
    }

    // Validate credential provider exists if specified
    if (credential_provider_id) {
      const provider = await getCredentialProviderById(credential_provider_id);
      if (!provider) {
        res.status(400).json({ error: 'Invalid credential provider' });
        return;
      }
    }

    const validation = validateConfig(type, config);
    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const destination = await dbCreateBackupDestination(
      name,
      type,
      config,
      enabled ?? true,
      credential_provider_id || null
    );

    // Audit log
    await createAuditLogEntry({
      userId: req.user?.userId,
      userEmail: req.user?.email,
      entityType: 'backup_destination',
      entityId: destination.id,
      entityName: destination.name,
      action: 'create',
      changes: { name, type, enabled: enabled ?? true, credential_provider_id }
    });

    res.status(201).json({
      ...destination,
      config: destination.config
    });
  } catch (error) {
    console.error('Error creating backup destination:', error);
    res.status(500).json({ error: 'Failed to create backup destination' });
  }
}

/**
 * PUT /:id - Update backup destination
 */
export async function updateDestination(req: AuthRequest, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const { name, type, config, enabled, credential_provider_id } = req.body;

    // S3 destinations require a credential provider
    if (type === 's3' && !credential_provider_id) {
      res.status(400).json({ error: 'S3 destinations require a credential provider' });
      return;
    }

    // Validate credential provider exists if specified
    if (credential_provider_id) {
      const provider = await getCredentialProviderById(credential_provider_id);
      if (!provider) {
        res.status(400).json({ error: 'Invalid credential provider' });
        return;
      }
    }

    const validation = validateConfig(type, config);
    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const existingDestination = await getBackupDestinationById(id);
    if (!existingDestination) {
      res.status(404).json({ error: 'Backup destination not found' });
      return;
    }

    const destination = await dbUpdateBackupDestination(
      id,
      name,
      type,
      config,
      enabled,
      credential_provider_id ?? null
    );

    if (!destination) {
      res.status(404).json({ error: 'Backup destination not found' });
      return;
    }

    // Audit log
    await createAuditLogEntry({
      userId: req.user?.userId,
      userEmail: req.user?.email,
      entityType: 'backup_destination',
      entityId: destination.id,
      entityName: destination.name,
      action: 'update',
      changes: {
        before: { name: existingDestination.name, type: existingDestination.type, enabled: existingDestination.enabled },
        after: { name, type, enabled, credential_provider_id }
      }
    });

    res.json({
      ...destination,
      config: destination.config
    });
  } catch (error) {
    console.error('Error updating backup destination:', error);
    res.status(500).json({ error: 'Failed to update backup destination' });
  }
}

/**
 * DELETE /:id - Delete backup destination
 */
export async function deleteDestination(req: AuthRequest, res: Response) {
  try {
    const id = parseInt(req.params.id);

    // Get destination info for audit log before deletion
    const existingDestination = await getBackupDestinationById(id);

    // Check if destination is in use
    const inUse = await isDestinationInUse(id);
    if (inUse) {
      res.status(400).json({ error: 'Cannot delete destination that is in use by backup jobs' });
      return;
    }

    const deleted = await dbDeleteBackupDestination(id);

    if (!deleted) {
      res.status(404).json({ error: 'Backup destination not found' });
      return;
    }

    // Audit log
    if (existingDestination) {
      await createAuditLogEntry({
        userId: req.user?.userId,
        userEmail: req.user?.email,
        entityType: 'backup_destination',
        entityId: id,
        entityName: existingDestination.name,
        action: 'delete',
        changes: { deleted: { name: existingDestination.name, type: existingDestination.type } }
      });
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting backup destination:', error);
    res.status(500).json({ error: 'Failed to delete backup destination' });
  }
}

/**
 * POST /:id/duplicate - Duplicate backup destination
 */
export async function duplicateDestination(req: AuthRequest, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const existingDestination = await getBackupDestinationById(id);

    if (!existingDestination) {
      res.status(404).json({ error: 'Backup destination not found' });
      return;
    }

    // Create a copy with "(copy)" suffix and disabled
    const newName = `${existingDestination.name} (copy)`;
    const newDestination = await dbCreateBackupDestination(
      newName,
      existingDestination.type,
      existingDestination.config,
      false, // disabled by default
      existingDestination.credential_provider_id
    );

    // Audit log
    await createAuditLogEntry({
      userId: req.user?.userId,
      userEmail: req.user?.email,
      entityType: 'backup_destination',
      entityId: newDestination.id,
      entityName: newDestination.name,
      action: 'create',
      changes: { duplicated_from: { id: existingDestination.id, name: existingDestination.name } }
    });

    res.status(201).json({
      ...newDestination,
      config: newDestination.config
    });
  } catch (error) {
    console.error('Error duplicating backup destination:', error);
    res.status(500).json({ error: 'Failed to duplicate backup destination' });
  }
}

/**
 * POST /:id/test - Test destination connectivity
 */
export async function testDestinationConnectivity(req: AuthRequest, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const destination = await getBackupDestinationById(id);

    if (!destination) {
      res.status(404).json({ error: 'Backup destination not found' });
      return;
    }

    // For S3, resolve credentials from provider
    let resolvedConfig: Record<string, unknown> = destination.config as unknown as Record<string, unknown>;
    if (destination.type === 's3' && destination.credential_provider_id) {
      const provider = await getCredentialProviderById(destination.credential_provider_id);
      if (!provider) {
        res.status(400).json({ error: 'Credential provider not found' });
        return;
      }
      resolvedConfig = resolveS3Config(
        resolvedConfig,
        provider.config as unknown as Record<string, unknown>
      );
    }

    const result = await testDestination(destination.type, resolvedConfig);

    if (result.success) {
      res.json({ message: 'Destination test successful', details: result.details });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    console.error('Error testing backup destination:', error);
    res.status(500).json({ error: 'Failed to test backup destination' });
  }
}

/**
 * GET /:id/browse - Browse destination files with folder-like navigation
 */
export async function browseFiles(req: AuthRequest, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 1000);
    const browsePath = req.query.path as string | undefined;
    const destination = await getBackupDestinationById(id);

    if (!destination) {
      res.status(404).json({ error: 'Backup destination not found' });
      return;
    }

    // For S3, resolve credentials from provider
    let resolvedConfig: Record<string, unknown> = destination.config as unknown as Record<string, unknown>;
    if (destination.type === 's3' && destination.credential_provider_id) {
      const provider = await getCredentialProviderById(destination.credential_provider_id);
      if (!provider) {
        res.status(400).json({ error: 'Credential provider not found' });
        return;
      }
      resolvedConfig = resolveS3Config(
        resolvedConfig,
        provider.config as unknown as Record<string, unknown>
      );
    }

    console.log('Browsing destination:', {
      id,
      type: destination.type,
      path: browsePath || '(root)',
      limit,
    });

    const result = await browseDestinationFiles(destination.type, resolvedConfig, browsePath, limit);
    res.json(result);
  } catch (error) {
    console.error('Error browsing destination files:', error);
    res.status(500).json({ error: 'Failed to browse destination files' });
  }
}
