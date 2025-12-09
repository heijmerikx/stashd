/**
 * License Router
 *
 * Endpoints:
 * - GET    /status   Get current license status
 * - PUT    /         Update license key
 * - DELETE /         Remove license key
 */

import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';
import { getStatus, updateLicense, removeLicense } from './handlers.js';

const router = Router();

const updateLicenseSchema = z.object({
  license_key: z.string().max(2000),
});

router.get('/status', getStatus);
router.put('/', validate(updateLicenseSchema), updateLicense);
router.delete('/', removeLicense);

export default router;
