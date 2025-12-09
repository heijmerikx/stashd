import nodemailer from 'nodemailer';
import { getNotificationChannelById, EmailConfig, DiscordConfig } from '../db/notification-channels.js';
import { decryptSensitiveFields } from '../utils/encryption.js';

interface DestinationResult {
  name: string;
  status: 'completed' | 'failed';
  fileSize?: number;
  filePath?: string;
  error?: string;
}

interface NotificationData {
  jobName: string;
  jobType?: string;
  fileSize?: number;
  filePath?: string;
  error?: string;
  destinations?: DestinationResult[];
}

// Format job type for display
function formatJobType(type?: string): string {
  if (!type) return 'Unknown';
  const typeMap: Record<string, string> = {
    postgres: 'PostgreSQL',
    mongodb: 'MongoDB',
    mysql: 'MySQL',
    s3: 'S3 Copy',
    files: 'Files',
  };
  return typeMap[type] || type;
}

// Sensitive fields per channel type that need decryption
const SENSITIVE_FIELDS: Record<string, string[]> = {
  email: ['smtp_pass', 'smtp_user'],
  discord: ['webhook_url']
};

export async function sendNotification(
  channelId: number,
  eventType: 'success' | 'failure',
  data: NotificationData
): Promise<void> {
  const channel = await getNotificationChannelById(channelId);
  if (!channel || !channel.enabled) {
    return;
  }

  // Decrypt sensitive fields before use
  const sensitiveFields = SENSITIVE_FIELDS[channel.type] || [];
  const decryptedConfig = decryptSensitiveFields(
    channel.config as unknown as Record<string, unknown>,
    sensitiveFields
  );

  switch (channel.type) {
    case 'email':
      await sendEmailNotification(decryptedConfig as unknown as EmailConfig, eventType, data);
      break;
    case 'discord':
      await sendDiscordNotification(decryptedConfig as unknown as DiscordConfig, eventType, data);
      break;
    default:
      console.warn(`Unknown notification channel type: ${channel.type}`);
  }
}

async function sendEmailNotification(
  config: EmailConfig,
  eventType: 'success' | 'failure',
  data: NotificationData
): Promise<void> {
  const transporter = nodemailer.createTransport({
    host: config.smtp_host,
    port: config.smtp_port,
    secure: config.smtp_secure,
    auth: config.smtp_user ? {
      user: config.smtp_user,
      pass: config.smtp_pass
    } : undefined,
    connectionTimeout: 10000, // 10 seconds
    greetingTimeout: 10000,
    socketTimeout: 10000,
  });

  const subject = eventType === 'success'
    ? `[Stashd] Backup Completed: ${data.jobName}`
    : `[Stashd] Backup Failed: ${data.jobName}`;

  const html = eventType === 'success'
    ? generateSuccessEmail(data)
    : generateFailureEmail(data);

  try {
    await transporter.sendMail({
      from: config.from_email,
      to: config.to_emails.join(', '),
      subject,
      html
    });

    console.log(`Email notification sent for ${data.jobName}`);
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string; responseCode?: number };
    const code = err.code || 'UnknownError';
    const message = err.message || 'Unknown error occurred';

    console.error('Email notification failed:', {
      code,
      responseCode: err.responseCode,
      message,
      host: config.smtp_host,
      port: config.smtp_port,
    });

    // Provide more helpful error messages
    let detailedMessage = message;
    if (code === 'ECONNREFUSED') {
      detailedMessage = `Cannot connect to SMTP server at ${config.smtp_host}:${config.smtp_port}. Check the host and port.`;
    } else if (code === 'ENOTFOUND') {
      detailedMessage = `SMTP host "${config.smtp_host}" not found. Check the hostname.`;
    } else if (code === 'ETIMEDOUT' || code === 'ESOCKET') {
      detailedMessage = `Connection to SMTP server timed out. Check if the server is reachable and the port is correct.`;
    } else if (code === 'EAUTH') {
      detailedMessage = 'SMTP authentication failed. Check your username and password.';
    } else if (code === 'ESOCKET' && message.includes('SSL')) {
      detailedMessage = `SSL/TLS error. Try toggling the "Use TLS/SSL" setting or check if port ${config.smtp_port} requires SSL.`;
    } else if (err.responseCode === 535) {
      detailedMessage = 'SMTP authentication failed. Check your username and password.';
    } else if (err.responseCode === 553 || err.responseCode === 550) {
      detailedMessage = `Email rejected by server. Check the from/to email addresses are valid.`;
    }

    throw new Error(`${code}: ${detailedMessage}`);
  }
}

async function sendDiscordNotification(
  config: DiscordConfig,
  eventType: 'success' | 'failure',
  data: NotificationData
): Promise<void> {
  const color = eventType === 'success' ? 0x00ff00 : 0xff0000;
  const title = eventType === 'success'
    ? `Backup Completed: ${data.jobName}`
    : `Backup Failed: ${data.jobName}`;

  const fields: { name: string; value: string; inline: boolean }[] = [];

  // Add job type as the first field
  fields.push({ name: 'Type', value: formatJobType(data.jobType), inline: true });

  if (eventType === 'success') {
    fields.push({ name: 'Total Size', value: formatBytes(data.fileSize || 0), inline: true });
  } else {
    fields.push({ name: 'Error', value: data.error || 'Unknown error', inline: false });
  }

  // Add destination results if available
  if (data.destinations && data.destinations.length > 0) {
    const destSummary = data.destinations.map(d => {
      const statusIcon = d.status === 'completed' ? '✅' : '❌';
      const details = d.status === 'completed'
        ? formatBytes(d.fileSize || 0)
        : (d.error || 'Failed');
      return `${statusIcon} **${d.name}**: ${details}`;
    }).join('\n');

    fields.push({ name: 'Destinations', value: destSummary, inline: false });
  }

  const payload = {
    embeds: [{
      title,
      color,
      fields,
      timestamp: new Date().toISOString(),
      footer: { text: 'Stashd Backup Manager' }
    }]
  };

  const response = await fetch(config.webhook_url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Discord webhook failed: ${response.status}`);
  }

  console.log(`Discord notification sent for ${data.jobName}`);
}

function generateSuccessEmail(data: NotificationData): string {
  const destinationsHtml = data.destinations && data.destinations.length > 0
    ? `
      <h3 style="margin-top: 20px;">Destination Results</h3>
      <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
        <tr style="background-color: #f5f5f5;">
          <th style="text-align: left; padding: 8px; border: 1px solid #ddd;">Destination</th>
          <th style="text-align: left; padding: 8px; border: 1px solid #ddd;">Status</th>
          <th style="text-align: left; padding: 8px; border: 1px solid #ddd;">Size</th>
          <th style="text-align: left; padding: 8px; border: 1px solid #ddd;">Path</th>
        </tr>
        ${data.destinations.map(d => `
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;">${d.name}</td>
            <td style="padding: 8px; border: 1px solid #ddd; color: ${d.status === 'completed' ? '#22c55e' : '#ef4444'};">${d.status}</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${formatBytes(d.fileSize || 0)}</td>
            <td style="padding: 8px; border: 1px solid #ddd; word-break: break-all;">${d.filePath || 'N/A'}</td>
          </tr>
        `).join('')}
      </table>
    `
    : '';

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #22c55e;">Backup Completed Successfully</h2>
      <p><strong>Job Name:</strong> ${data.jobName}</p>
      <p><strong>Type:</strong> ${formatJobType(data.jobType)}</p>
      <p><strong>Total Size:</strong> ${formatBytes(data.fileSize || 0)}</p>
      <p><strong>Time:</strong> ${new Date().toISOString()}</p>
      ${destinationsHtml}
      <hr style="border: 1px solid #e5e5e5; margin: 20px 0;">
      <p style="color: #666; font-size: 12px;">This is an automated message from Stashd Backup Manager.</p>
    </div>
  `;
}

function generateFailureEmail(data: NotificationData): string {
  const destinationsHtml = data.destinations && data.destinations.length > 0
    ? `
      <h3 style="margin-top: 20px;">Destination Results</h3>
      <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
        <tr style="background-color: #f5f5f5;">
          <th style="text-align: left; padding: 8px; border: 1px solid #ddd;">Destination</th>
          <th style="text-align: left; padding: 8px; border: 1px solid #ddd;">Status</th>
          <th style="text-align: left; padding: 8px; border: 1px solid #ddd;">Details</th>
        </tr>
        ${data.destinations.map(d => `
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;">${d.name}</td>
            <td style="padding: 8px; border: 1px solid #ddd; color: ${d.status === 'completed' ? '#22c55e' : '#ef4444'};">${d.status}</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${d.status === 'completed' ? formatBytes(d.fileSize || 0) : (d.error || 'Failed')}</td>
          </tr>
        `).join('')}
      </table>
    `
    : '';

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #ef4444;">Backup Failed</h2>
      <p><strong>Job Name:</strong> ${data.jobName}</p>
      <p><strong>Type:</strong> ${formatJobType(data.jobType)}</p>
      <p><strong>Error:</strong> ${data.error || 'Unknown error'}</p>
      <p><strong>Time:</strong> ${new Date().toISOString()}</p>
      ${destinationsHtml}
      <hr style="border: 1px solid #e5e5e5; margin: 20px 0;">
      <p style="color: #666; font-size: 12px;">This is an automated message from Stashd Backup Manager.</p>
    </div>
  `;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export async function testNotificationChannel(channelId: number): Promise<{ success: boolean; error?: string }> {
  try {
    await sendNotification(channelId, 'success', {
      jobName: 'Test Notification',
      jobType: 'postgres',
      fileSize: 1024 * 1024,
      filePath: '/test/path/backup.sql'
    });
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
