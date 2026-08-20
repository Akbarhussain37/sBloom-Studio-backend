# ADR-002: External Source Media and OneDrive Delivery

**Date**: 2026-08-20
**Status**: Approved (Phase E1 Implementation)

## Context
sBloom requires a highly scalable media storage and intake solution. In ADR-001, we established that Supabase Storage is not suitable for raw media or large final files, and planned a migration to OneDrive. However, requiring customers to upload massive raw footage into sBloom's OneDrive creates excessive bandwidth costs, ingestion latency, and complexity around resumable uploads directly from the browser.

## Decision
The architecture has been revised to separate **Source Media** (input) from **Final Delivery** (output).

### 1. Customer Source Media (External Intake)
Customers will host and own their raw footage using their preferred cloud platforms (e.g., Google Drive, OneDrive, SharePoint, Dropbox).
Instead of uploading files directly to sBloom, customers will provide an **External Source Link** (URL) to their files or folders.
- sBloom will NOT ingest or copy these files into its own storage during V1.
- The production_submissions_studio table will store the external metadata, the source URL, and the editing instructions.
- The production team will use this URL to access the raw materials manually.

### 2. sBloom Final Delivery (OneDrive)
Once the production team completes the edits, the **Final Edited Output** will be uploaded to an **sBloom-controlled OneDrive / SharePoint location**.
- Final delivery identifiers (onedrive_item_id, onedrive_drive_id) will be tracked in the database, mapped to the media_assets_studio records.
- Customers will download the final output directly from the sBloom dashboard via short-lived, secure Microsoft Graph download URLs generated dynamically by the backend API.
- Customers do NOT interact directly with OneDrive; they interact only with the sBloom dashboard.

### 3. Separation of Concerns
- **Frontend**: Submits external links and editing instructions; fetches short-lived download links for completed videos. (No browser-based file uploads).
- **Backend**: Validates URLs, verifies JWTs, authenticates with Microsoft Graph using service principal credentials, generates secure temporary download URLs.
- **Supabase**: Handles Auth, PostgreSQL schema, RLS, and metadata. (No new Supabase Storage usage).
- **Customer Cloud**: Hosts raw footage.
- **sBloom OneDrive**: Hosts finalized deliverables (/deliveries/<creator-id>/<project-id>/<production-job-id>/final/).

## Architectural Semantics and Security

### Access Attestation vs Verification
The source_access_attested_at timestamp is written ONLY after the authenticated Creator explicitly confirms in the UI that sharing permissions have been properly configured for their source link.
- **Attestation does NOT mean sBloom has verified access.** It merely proves the user acknowledged the requirement.
- Actual access status is represented by the ccess_status field (PENDING_VERIFICATION, ACCESS_CONFIRMED, ACCESS_REQUIRED), which will be updated by the backend/production workflows.

### Narrow Service Role Privileges
The Supabase service_role has privileged RLS-bypass behavior, but it must not be treated as a PostgreSQL superuser for table grants. RLS bypass and SQL table privileges are separate concerns.
- During Phase E2, service_role is granted ONLY SELECT and INSERT privileges on production_submissions_studio.
- UPDATE privilege is deliberately omitted and will be added only when production-team access verification and workflow progression features are explicitly implemented.

### Sensitive URL Handling
The source_url field is highly sensitive because it can contain access-bearing share tokens or authentication fragments inherent to cloud provider URLs. Therefore, backend and frontend integrations MUST:
- Never log source_url.
- Never place it in analytics.
- Never include it in generic error telemetry.
- Never expose another Creator's URL.
- Protect it strictly with ownership controls via RLS and backend constraints.

### Project Delete Semantics
The project_id foreign key on the production_submissions_studio table uses ON DELETE RESTRICT. Once a production submission exists, the referenced Project **cannot be hard-deleted** until its submission history is explicitly handled or purged. This is an intentional decision designed to preserve production and audit integrity across the platform.

## Consequences
- **Positive**: Massively reduces sBloom's storage footprint and ingress bandwidth costs. Simplifies the frontend by removing complex resumable-upload client logic. Accelerates time-to-market.
- **Negative**: Relies on customers properly configuring sharing permissions on their source links.
- **Mitigation**: The UI explicitly requires the Creator to attest that sharing permissions were configured (source_access_attested_at), and the production team can mark a submission's status as ACCESS_REQUIRED if the link is broken or private.

*Note: This ADR partially supersedes ADR-001 regarding raw media uploads.*
