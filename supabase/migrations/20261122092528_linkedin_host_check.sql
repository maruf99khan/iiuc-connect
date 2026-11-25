-- =============================================================================
-- IIUC Connect — Migration 005: LinkedIn address must be on linkedin.com
--
-- Sprint 1 only required "https://", so a member calling the API directly could
-- store any address and have it shown as their LinkedIn link. The app checks the
-- host too (lib/profile/schema.ts); this makes the database refuse the rest.
-- Allowed: linkedin.com or any subdomain, https, no credentials, no port.
-- Refused: linkedin.com.evil.example, notlinkedin.com, linkedin.com@evil.example.
-- =============================================================================

alter table public.profiles drop constraint profiles_linkedin_url_format;

alter table public.profiles add constraint profiles_linkedin_url_format
  check (
    linkedin_url is null
    or (
      char_length(linkedin_url) <= 300
      and linkedin_url ~* '^https://([a-z0-9-]+\.)*linkedin\.com(/|\?|#|$)'
    )
  );
