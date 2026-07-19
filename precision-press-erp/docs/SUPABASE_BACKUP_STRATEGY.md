# Supabase Backup Strategy

> **Precision Press ERP — Production Backup & Recovery Runbook**
> Version: 1.0 · Phase 5 · Production Hardened

---

## 1. Backup Architecture Overview

```
Supabase Postgres
      │
      ├─── Supabase Managed Daily Snapshots (Auto)
      │         └─ Retained: 7 days (Free) / 30 days (Pro)
      │
      ├─── pg_dump → S3 Offsite (Custom Cron)
      │         └─ Retained: 90 days · Encrypted at rest
      │
      └─── Point-in-Time Recovery (PITR)
                └─ Pro plan: up to 7-day WAL window
```

---

## 2. Supabase Built-In Snapshots

Supabase automatically creates daily database backups.

To access:

1. Go to [Supabase Dashboard](https://app.supabase.com) → Your Project
2. Navigate to **Settings → Database → Backups**
3. Click **Restore** on any snapshot (restores to a new branch or in-place)

> [!IMPORTANT]
> Free plan retains 7 days. Upgrade to **Pro** for 30-day retention and PITR access.

---

## 3. Offsite S3 Backup (Recommended for Production)

### 3.1 Prerequisites

```bash
# Install required tools (Linux/macOS CI server or VPS)
sudo apt-get install postgresql-client-15 awscli -y

# Configure AWS credentials
aws configure
# Or set environment variables:
export AWS_ACCESS_KEY_ID=your_key
export AWS_SECRET_ACCESS_KEY=your_secret
export AWS_DEFAULT_REGION=ap-south-1
```

### 3.2 Backup Script

Create `/opt/scripts/supabase-backup.sh`:

```bash
#!/bin/bash
set -euo pipefail

# ── Configuration ──────────────────────────────────────────────────────────
DB_URL="postgresql://postgres.[YOUR_PROJECT_REF]:[PASSWORD]@aws-0-ap-south-1.pooler.supabase.com:6543/postgres"
S3_BUCKET="s3://your-backup-bucket/precision-press"
RETENTION_DAYS=90
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="/tmp/pp_backup_${TIMESTAMP}.sql.gz"

# ── Dump ───────────────────────────────────────────────────────────────────
echo "[$(date)] Starting backup..."
pg_dump "$DB_URL" \
  --no-owner \
  --no-acl \
  --format=plain \
  | gzip > "$BACKUP_FILE"

echo "[$(date)] Backup size: $(du -sh $BACKUP_FILE | cut -f1)"

# ── Upload to S3 ───────────────────────────────────────────────────────────
aws s3 cp "$BACKUP_FILE" "${S3_BUCKET}/daily/${TIMESTAMP}.sql.gz" \
  --storage-class STANDARD_IA \
  --server-side-encryption AES256

echo "[$(date)] Uploaded to S3: ${S3_BUCKET}/daily/${TIMESTAMP}.sql.gz"

# ── Cleanup local file ─────────────────────────────────────────────────────
rm -f "$BACKUP_FILE"

# ── Prune old S3 backups beyond retention window ───────────────────────────
CUTOFF_DATE=$(date -d "-${RETENTION_DAYS} days" +%Y-%m-%d)
aws s3 ls "${S3_BUCKET}/daily/" \
  | awk '{print $4}' \
  | while read FILE; do
      FILE_DATE=$(echo "$FILE" | cut -c1-8 | sed 's/\(....\)\(..\)\(..\)/\1-\2-\3/')
      if [[ "$FILE_DATE" < "$CUTOFF_DATE" ]]; then
        aws s3 rm "${S3_BUCKET}/daily/${FILE}"
        echo "[$(date)] Pruned old backup: $FILE"
      fi
    done

echo "[$(date)] Backup completed successfully."
```

```bash
chmod +x /opt/scripts/supabase-backup.sh
```

### 3.3 Schedule Daily Backup (Cron)

```bash
# Run at 02:00 AM IST (20:30 UTC previous day)
crontab -e
30 20 * * * /opt/scripts/supabase-backup.sh >> /var/log/supabase-backup.log 2>&1
```

---

## 4. Point-in-Time Recovery (PITR)

> [!NOTE]
> PITR requires Supabase **Pro** plan or higher.

### Via Supabase Dashboard:

1. **Settings → Database → Backups → PITR**
2. Select target timestamp
3. Choose: **Restore to new project** or **In-place recovery**
4. Confirm — restoration takes 5–30 minutes depending on DB size

### Via Supabase CLI:

```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# List available recovery points
supabase db recovery list --project-ref YOUR_PROJECT_REF

# Restore to specific time (UTC)
supabase db recovery restore \
  --project-ref YOUR_PROJECT_REF \
  --target-time "2026-06-15T12:00:00Z"
```

---

## 5. Selective Table Restore

To restore a specific table from a backup without full restore:

```bash
# Extract single table from backup
pg_restore --table=orders /tmp/pp_backup_20260615.dump > /tmp/orders_restore.sql

# Connect to your Supabase DB
psql "postgresql://postgres.[REF]:[PASSWORD]@aws-0-ap-south-1.pooler.supabase.com:6543/postgres"

# Disable triggers temporarily
SET session_replication_role = 'replica';

# Apply restore
\i /tmp/orders_restore.sql

# Re-enable triggers
SET session_replication_role = DEFAULT;
```

---

## 6. Verification & Testing

### Monthly Backup Test Procedure

```bash
# 1. Download latest backup from S3
aws s3 cp s3://your-backup-bucket/precision-press/daily/LATEST.sql.gz /tmp/latest.sql.gz

# 2. Decompress
gunzip /tmp/latest.sql.gz

# 3. Restore to a temporary local DB
createdb pp_test_restore
psql pp_test_restore < /tmp/latest.sql

# 4. Verify row counts match production
psql pp_test_restore -c "SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC LIMIT 20;"

# 5. Cleanup
dropdb pp_test_restore
```

> [!IMPORTANT]
> Run this test **monthly** and log the result in your maintenance records. A backup that has never been tested is not a backup.

---

## 7. Firebase / Firestore Backup

Firestore data (notifications, audit logs, profiles) is replicated asynchronously.

### Export via Firebase CLI:

```bash
# Install Firebase CLI
npm install -g firebase-tools

# Authenticate
firebase login

# Export all collections to GCS bucket
firebase firestore:export gs://your-gcs-bucket/firestore-backup-$(date +%Y%m%d)
```

### Schedule export with Cloud Scheduler:

Create a Cloud Scheduler job in GCP Console:
- **Frequency:** `0 3 * * *` (3:00 AM daily)
- **Target:** Firestore Managed Export API
- **Bucket:** `gs://your-gcs-bucket/firestore-exports/`

---

## 8. Recovery Time Objectives (RTO/RPO)

| Scenario                  | RPO          | RTO         | Method                    |
|---------------------------|-------------|-------------|---------------------------|
| Accidental data delete     | < 24 hours  | 15–30 min   | Supabase daily snapshot   |
| Corrupted table            | < 24 hours  | 10–20 min   | Selective table restore   |
| Full database loss         | < 24 hours  | 30–60 min   | Full pg_dump restore      |
| Point-in-time recovery     | < 1 minute  | 10–30 min   | Supabase PITR (Pro)       |
| Firestore data loss        | < 24 hours  | 20–40 min   | GCS Firestore export      |

---

## 9. Monitoring Backup Health

Add to your cron script to send an alert on failure:

```bash
# Add to supabase-backup.sh — alert on failure
notify_failure() {
  curl -s -X POST https://ntfy.sh/pp-erp-alerts \
    -H "Title: BACKUP FAILED" \
    -d "Supabase backup failed at $(date). Check /var/log/supabase-backup.log" \
    -H "Priority: urgent"
}

trap notify_failure ERR
```

Or integrate with your existing monitoring system (PagerDuty, Slack webhook, etc.)

---

*Last updated: Phase 5 Production Hardening · Precision Press ERP*
