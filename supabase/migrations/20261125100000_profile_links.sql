-- =============================================================================
-- IIUC Connect — optional portfolio and GitHub addresses on a profile (D-025)
--
-- A poster reading an application wants to see some of the applicant's work.
-- Both fields are optional and https only. The portfolio may be on any host but
-- the host part cannot carry credentials (https://github.com@evil.example/ is
-- refused), so a link cannot pretend to be somewhere it is not. The GitHub
-- address must be on github.com, by the same rule as the LinkedIn address.
-- The app checks the same rules again before showing a link (lib/profile/schema.ts).
-- =============================================================================

alter table public.profiles
  add column portfolio_url text,
  add column github_url    text;

alter table public.profiles add constraint profiles_portfolio_url_format
  check (
    portfolio_url is null
    or (
      char_length(portfolio_url) <= 300
      and portfolio_url ~* '^https://[^/?#@[:space:]]+([/?#][^[:space:]]*)?$'
    )
  );

alter table public.profiles add constraint profiles_github_url_format
  check (
    github_url is null
    or (
      char_length(github_url) <= 300
      and github_url ~* '^https://(www\.)?github\.com(/|\?|#|$)'
    )
  );

grant update (portfolio_url, github_url) on public.profiles to authenticated;
