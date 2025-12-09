# Stashd - Claude Code Guidelines

## Project Overview
Stashd is an automated backup management tool with:
- **Backend**: Express 5, TypeScript, PostgreSQL, Redis/BullMQ
- **Frontend**: React, Vite, Tailwind CSS v4, shadcn/ui

## Frontend Conventions

### Shadcn/UI Components
- Use component props for sizing, not className. Example: `<SidebarMenuButton size="sm">` not `className="text-xs"`
- Alert component requires both `Alert` and `AlertDescription` imports
- Form dialogs should include error state with Alert variant="destructive"

### Styling
- Font: JetBrains Mono (configured in index.css and tailwind)
- Use Tailwind classes, avoid inline styles
- Icons from lucide-react, typically `h-4 w-4` size

### Form Error Handling Pattern
```tsx
const [error, setError] = useState<string | null>(null);

// In resetForm:
setError(null);

// In handleSubmit catch:
catch (err) {
  setError(err instanceof Error ? err.message : 'Failed to save');
}

// In dialog:
{error && (
  <Alert variant="destructive">
    <AlertCircle className="h-4 w-4" />
    <AlertDescription>{error}</AlertDescription>
  </Alert>
)}
```

## Backend Conventions

### Security
- **Helmet**: Security headers enabled (CSP, HSTS, etc.) via helmet middleware
- **Rate Limiting**:
  - General API: 1000 requests/15min
  - Auth routes: 20 requests/15min (stricter)
- **Request Validation**: Zod schemas in `backend/src/schemas/` validate all POST/PUT bodies
  - Schemas handle masked values (`********`) for updates
  - Validation middleware in `backend/src/middleware/validate.ts`
- **Body Size Limits**: JSON and URL-encoded bodies limited to 10MB
- **CORS**: Configured for frontend origin only

### API Routes
- All routes return `{ error: string }` on failure
- Use Express 5 async handlers (no need for try-catch wrapper)
- Sensitive config fields are masked with `********` in responses
- Always add `validate(schema)` middleware to POST/PUT routes

### Adding New Routes Checklist
1. Create Zod schema in `backend/src/schemas/`
2. Add `validate(schema)` middleware to route
3. Mask sensitive fields in responses
4. Encrypt sensitive fields before storage (use `encryptSensitiveFields`)

### Database
- Migrations in `backend/src/db/migrations/`
- Single consolidated migration file preferred (no data yet)
- Use junction tables for many-to-many relationships

### Environment Variables
- `ENCRYPTION_SECRET`: Required for encrypting sensitive credentials (32+ chars)
- `REDIS_HOST`, `REDIS_PORT`: Redis connection
- `DATABASE_URL`: PostgreSQL connection
- `JWT_SECRET`: Required for JWT token signing
- `CORS_ORIGIN`: Frontend origin (default: http://localhost:5173)

## Docker
- Backup storage volume: `backup_data` mounted at `/data/backups`
- Default backup path: `/data/backups`
