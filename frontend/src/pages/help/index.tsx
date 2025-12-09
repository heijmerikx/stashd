import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertTriangle,
  Server,
  Info,
  ExternalLink,
  BookOpen,
} from 'lucide-react';

export function HelpPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Help & Documentation</h1>
        <p className="text-muted-foreground">
          Learn about Stashd and how to configure your backups
        </p>
      </div>

      {/* Risk Warning */}
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Important: Backup Responsibility Disclaimer</AlertTitle>
        <AlertDescription className="mt-2 space-y-2">
          <p>
            <strong>Your data is your responsibility.</strong> While Stashd aims to automate and simplify backup management, it should not be blindly trusted as your sole backup solution.
          </p>
          <p>
            Always follow established backup strategies:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li><strong>3-2-1 Rule:</strong> Keep 3 copies of data, on 2 different media types, with 1 copy offsite</li>
            <li><strong>Regular Testing:</strong> Periodically verify that your backups can be successfully restored</li>
            <li><strong>Monitor Notifications:</strong> Configure alerts and actively monitor backup job status</li>
            <li><strong>Retention Policies:</strong> Ensure your retention settings align with your recovery needs</li>
            <li><strong>Multiple Destinations:</strong> Never rely on a single backup destination</li>
          </ul>
          <p className="mt-2">
            The author of Stashd accept no responsibility for data loss. This tool is provided as-is without warranty.
          </p>
        </AlertDescription>
      </Alert>

      {/* About Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5" />
            About Stashd
          </CardTitle>
          <CardDescription>
            Automated backup management for databases and files
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p>
            Stashd is a self-hosted backup management tool designed to automate the backup process for databases and files. It provides a web interface to configure, schedule, and monitor backups across multiple destinations.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h4 className="font-medium mb-2">Supported Backup Types</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>PostgreSQL databases</li>
                <li>MongoDB databases</li>
                <li>MySQL databases</li>
                <li>S3-to-S3 sync (copy files between buckets)</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-2">Supported Destinations</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>Local filesystem storage</li>
                <li>S3-compatible object storage</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Architecture */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            System Architecture
          </CardTitle>
          <CardDescription>
            How Stashd is structured
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="border rounded-lg p-4">
              <h4 className="font-medium mb-2">Frontend</h4>
              <p className="text-sm text-muted-foreground">
                React-based web interface for managing and monitoring backups. Communicates with the backend API.
              </p>
            </div>
            <div className="border rounded-lg p-4">
              <h4 className="font-medium mb-2">Backend API</h4>
              <p className="text-sm text-muted-foreground">
                Express.js server handling API requests, job scheduling, and backup orchestration.
              </p>
            </div>
            <div className="border rounded-lg p-4">
              <h4 className="font-medium mb-2">Job Queue</h4>
              <p className="text-sm text-muted-foreground">
                Redis-backed BullMQ queue for reliable backup job processing with retry support.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Documentation Link */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Documentation
          </CardTitle>
          <CardDescription>
            Learn more about configuring and using Stashd
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4">
            For detailed guides on backup jobs, destinations, notifications, security, and best practices, visit the official documentation.
          </p>
          <a
            href="https://stashd.cc/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-primary hover:underline"
          >
            <ExternalLink className="h-4 w-4" />
            View Documentation at stashd.cc/docs
          </a>
        </CardContent>
      </Card>
    </div>
  );
}
