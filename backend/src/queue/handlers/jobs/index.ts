/**
 * Backup Job Handlers
 *
 * Each handler implements a specific backup strategy based on job type:
 * - databaseHandler: postgres, mysql, mongodb, redis (execute once, copy to all)
 * - s3Handler: S3 sync jobs (execute per destination)
 */
export { databaseHandler } from './database-handler.js';
export { s3Handler } from './s3-handler.js';
