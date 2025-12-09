/**
 * Backup Destinations Router
 *
 * Endpoints:
 * - GET    /compatible-types/:jobType  Get compatible destination types
 * - GET    /compatible/:jobType        Get destinations filtered by compatibility
 * - GET    /                           List all destinations
 * - GET    /:id                        Get single destination
 * - GET    /:id/files                  List files in destination (flat list)
 * - GET    /:id/browse                 Browse files with folder navigation
 * - POST   /                           Create destination
 * - PUT    /:id                        Update destination
 * - DELETE /:id                        Delete destination
 * - POST   /:id/duplicate              Duplicate destination
 * - POST   /:id/test                   Test destination connectivity
 */

import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { createBackupDestinationSchema, updateBackupDestinationSchema } from '../../schemas/backup-destinations.js';
import {
  getCompatibleTypes,
  getCompatibleDestinations,
  listDestinations,
  getDestination,
  createDestination,
  updateDestination,
  deleteDestination,
  duplicateDestination,
  testDestinationConnectivity,
  getFiles,
  browseFiles,
} from './handlers.js';

const router = Router();

// Compatibility routes (must come before /:id routes)
router.get('/compatible-types/:jobType', getCompatibleTypes);
router.get('/compatible/:jobType', getCompatibleDestinations);

// List routes
router.get('/', listDestinations);

// Single destination routes
router.get('/:id', getDestination);
router.get('/:id/files', getFiles);
router.get('/:id/browse', browseFiles);

// Mutation routes
router.post('/', validate(createBackupDestinationSchema), createDestination);
router.put('/:id', validate(updateBackupDestinationSchema), updateDestination);
router.delete('/:id', deleteDestination);

// Action routes
router.post('/:id/duplicate', duplicateDestination);
router.post('/:id/test', testDestinationConnectivity);

export default router;
