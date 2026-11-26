-- Add emailed_at so the notification-email cron can track what has already
-- been sent without re-querying the email provider.
alter table public.notifications
  add column emailed_at timestamptz;

create index notifications_unsent_idx on public.notifications (created_at)
  where emailed_at is null;
