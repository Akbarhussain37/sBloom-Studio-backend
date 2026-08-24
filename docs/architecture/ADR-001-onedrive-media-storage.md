# ADR-001: OneDrive Media Storage Architecture

**Date**: 2026-08-19
**Status**: Approved (Draft / Planning)

## Context
sBloom currently uses Supabase Storage for various assets (e.g., `profile_images_studio`, `creator-content`). As the platform scales, handling large video files (especially Healthcare raw footage and Creator videos) through Supabase Storage presents limitations in cost, file sizes, and integration with the broader Microsoft ecosystem.

## Decision
sBloom will **NOT** use Supabase Storage as the long-term media/file storage platform. Instead, we will implement **Microsoft Graph and OneDrive** integration.

### Separation of Concerns

**Supabase will handle:**
- Auth
- PostgreSQL database
- Row Level Security (RLS)
- Application metadata

**OneDrive / Microsoft Graph will handle:**
- Future creator images
- Creator videos
- Healthcare raw footage
- Edited media
- Final media
- Project files

### Constraints during Stabilization
1. **Legacy Buckets:** Existing Supabase buckets (`profile_images_studio`, `creator-content`) MUST remain untouched during this current stabilization step to avoid breaking existing data.
2. **Implementation:** Do not implement Microsoft Graph during the current phase.
3. **Secrets:** Microsoft Graph application secrets must NEVER be stored in frontend code or VITE variables.
4. **Uploads:** Large video upload architecture should use Microsoft Graph resumable upload sessions directly from the client (with secure, server-provided upload URLs).

## Future Migration Path
1. Inventory existing files.
2. Determine whether any live frontend depends on the buckets.
3. Establish Microsoft Graph / OneDrive integration.
4. Migrate required files.
5. Store OneDrive `driveItem` identifiers in Supabase (`onedrive_drive_id`, `onedrive_item_id`, `onedrive_path`).
6. Update application references.
7. Verify functionality.
8. Disable new Supabase Storage uploads.
9. Decommission legacy buckets later.
