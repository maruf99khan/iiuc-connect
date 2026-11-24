-- Removes everything demo_data.sql created (and anything the demo members
-- collected: requests, sessions, notifications). Cascades from auth.users.
delete from auth.users where id::text like 'd3000000-%';
