import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { JobType } from './CreateJobDialog';

interface JobTypeConfigFieldsProps {
  type: JobType;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}

export function JobTypeConfigFields({ type, values, onChange }: JobTypeConfigFieldsProps) {
  if (type === 'postgres') {
    return (
      <>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="host">Host</Label>
            <Input
              id="host"
              value={values.host}
              onChange={(e) => onChange('host', e.target.value)}
              placeholder="localhost"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="port">Port</Label>
            <Input
              id="port"
              value={values.port}
              onChange={(e) => onChange('port', e.target.value)}
              placeholder="5432"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="database">Database</Label>
          <Input
            id="database"
            value={values.database}
            onChange={(e) => onChange('database', e.target.value)}
            placeholder="mydb"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              value={values.username}
              onChange={(e) => onChange('username', e.target.value)}
              placeholder="postgres"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={values.password}
              onChange={(e) => onChange('password', e.target.value)}
            />
          </div>
        </div>
      </>
    );
  }

  if (type === 'mysql') {
    return (
      <>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="host">Host</Label>
            <Input
              id="host"
              value={values.host}
              onChange={(e) => onChange('host', e.target.value)}
              placeholder="localhost"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="port">Port</Label>
            <Input
              id="port"
              value={values.port}
              onChange={(e) => onChange('port', e.target.value)}
              placeholder="3306"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="database">Database</Label>
          <Input
            id="database"
            value={values.database}
            onChange={(e) => onChange('database', e.target.value)}
            placeholder="mydb"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              value={values.username}
              onChange={(e) => onChange('username', e.target.value)}
              placeholder="root"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={values.password}
              onChange={(e) => onChange('password', e.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox
            id="ssl"
            checked={values.ssl !== 'false'}
            onCheckedChange={(checked) => onChange('ssl', checked ? 'true' : 'false')}
          />
          <Label htmlFor="ssl" className="text-sm font-normal">
            Require SSL connection
          </Label>
        </div>
        <p className="text-xs text-muted-foreground -mt-1">
          Most cloud databases (AWS RDS, PlanetScale, etc.) require SSL. Disable for local databases.
        </p>
      </>
    );
  }

  if (type === 'mongodb') {
    return (
      <div className="space-y-2">
        <Label htmlFor="connectionString">Connection String</Label>
        <Input
          id="connectionString"
          value={values.connectionString}
          onChange={(e) => onChange('connectionString', e.target.value)}
          placeholder="mongodb://user:pass@host:27017/mydb?authSource=admin"
        />
        <p className="text-xs text-muted-foreground">
          Full MongoDB connection URI including database name
        </p>
      </div>
    );
  }

  if (type === 'redis') {
    return (
      <>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="host">Host</Label>
            <Input
              id="host"
              value={values.host}
              onChange={(e) => onChange('host', e.target.value)}
              placeholder="localhost"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="port">Port</Label>
            <Input
              id="port"
              value={values.port}
              onChange={(e) => onChange('port', e.target.value)}
              placeholder="6379"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="redisUsername">Username</Label>
            <Input
              id="redisUsername"
              value={values.redisUsername}
              onChange={(e) => onChange('redisUsername', e.target.value)}
              placeholder="default"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={values.password}
              onChange={(e) => onChange('password', e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="redisDatabase">Database Number</Label>
            <Input
              id="redisDatabase"
              value={values.redisDatabase}
              onChange={(e) => onChange('redisDatabase', e.target.value)}
              placeholder="0"
            />
            <p className="text-xs text-muted-foreground">Redis database number (0-15)</p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center space-x-2 pt-8">
              <Checkbox
                id="redisTls"
                checked={values.redisTls === 'true'}
                onCheckedChange={(checked) => onChange('redisTls', checked ? 'true' : 'false')}
              />
              <Label htmlFor="redisTls" className="text-sm font-normal">
                Use TLS (rediss://)
              </Label>
            </div>
            <p className="text-xs text-muted-foreground">
              Only enable if your Redis requires TLS. Most proxy connections (e.g. Railway) don't need this.
            </p>
          </div>
        </div>
      </>
    );
  }

  if (type === 's3') {
    return (
      <>
        <div className="space-y-2">
          <Label htmlFor="s3Endpoint">Endpoint (optional)</Label>
          <Input
            id="s3Endpoint"
            value={values.s3Endpoint}
            onChange={(e) => onChange('s3Endpoint', e.target.value)}
            placeholder="https://s3.eu-central-1.amazonaws.com"
          />
          <p className="text-xs text-muted-foreground">
            For S3-compatible storage (AWS s3, Cloudflare R2, Railway, etc.)
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="s3Region">Region</Label>
            <Input
              id="s3Region"
              value={values.s3Region}
              onChange={(e) => onChange('s3Region', e.target.value)}
              placeholder="eu-central-1"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="s3Bucket">Bucket</Label>
            <Input
              id="s3Bucket"
              value={values.s3Bucket}
              onChange={(e) => onChange('s3Bucket', e.target.value)}
              placeholder="my-source-bucket"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="s3Prefix">Prefix (optional)</Label>
          <Input
            id="s3Prefix"
            value={values.s3Prefix}
            onChange={(e) => onChange('s3Prefix', e.target.value)}
            placeholder="backups/"
          />
          <p className="text-xs text-muted-foreground">
            Only sync files with this prefix
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="s3AccessKeyId">Access Key ID</Label>
            <Input
              id="s3AccessKeyId"
              value={values.s3AccessKeyId}
              onChange={(e) => onChange('s3AccessKeyId', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="s3SecretAccessKey">Secret Access Key</Label>
            <Input
              id="s3SecretAccessKey"
              type="password"
              value={values.s3SecretAccessKey}
              onChange={(e) => onChange('s3SecretAccessKey', e.target.value)}
            />
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Files from this S3 source will be synced to the selected destination(s).
        </p>
      </>
    );
  }

  return null;
}
