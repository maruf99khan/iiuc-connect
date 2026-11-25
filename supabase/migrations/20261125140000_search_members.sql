-- =============================================================================
-- IIUC Connect — Migration 009: ranked, typo-tolerant member search (D-029)
--
--   * A weighted tsvector on profiles, kept in step by the existing trigger:
--     name A; job title, headline, skills B; company, department, place,
--     industry, batch C; bio D (Master File 6.4).
--   * public.search_members(): every query word must match a word of the
--     profile, either as its start (prefix) or, for words of four letters or
--     more, within a small edit distance (typo tolerance). Each word scores the
--     weight of the best field it matches (A 1.0, B 0.5, C 0.2, D 0.1), times
--     1.0 for the exact word, 0.9 for a longer word it starts, 0.8 for a typo.
--     Rank is the sum, plus a small bonus for similarity to the name; ties fall
--     back to name order.
--   * SECURITY INVOKER: it reads public.profiles as the caller, so Row Level
--     Security decides what is visible. The function adds the directory rules
--     (verified, not private, not the caller) exactly as the old query did.
--
-- ponytail: the search scans every visible profile (no index is used), which is
-- measured and fine for a university-sized network (see docs/evidence).
-- Upgrade path if it ever matters: a GIN index on search_vector plus a trigram
-- shortlist before the edit-distance check.
-- =============================================================================

create extension if not exists fuzzystrmatch with schema extensions;

-- -----------------------------------------------------------------------------
-- 1. Weighted vector
-- -----------------------------------------------------------------------------
alter table public.profiles add column search_vector tsvector;

create or replace function private.profiles_set_search_text()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.search_text := lower(btrim(
    coalesce(new.full_name, '')  || ' ' || coalesce(new.headline, '')   || ' ' ||
    coalesce(new.job_title, '')  || ' ' || coalesce(new.company, '')    || ' ' ||
    coalesce(new.location, '')   || ' ' || coalesce(new.industry, '')   || ' ' ||
    coalesce(new.department, '') || ' ' || coalesce(new.batch, '')      || ' ' ||
    array_to_string(new.skills, ' ')
  ));
  new.search_vector :=
    setweight(to_tsvector('simple', coalesce(new.full_name, '')), 'A') ||
    setweight(to_tsvector('simple',
      coalesce(new.job_title, '') || ' ' || coalesce(new.headline, '') || ' ' ||
      array_to_string(new.skills, ' ')), 'B') ||
    setweight(to_tsvector('simple',
      coalesce(new.company, '')  || ' ' || coalesce(new.department, '') || ' ' ||
      coalesce(new.location, '') || ' ' || coalesce(new.industry, '')   || ' ' ||
      coalesce(new.batch, '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(new.bio, '')), 'D');
  return new;
end;
$$;

-- Fill the column for rows that already exist (fires the trigger).
update public.profiles set full_name = full_name;

alter table public.profiles alter column search_vector set not null;

-- -----------------------------------------------------------------------------
-- 2. The search
-- -----------------------------------------------------------------------------
create function public.search_members(
  p_query  text default '',
  p_who    public.affiliation default null,
  p_limit  integer default 20,
  p_offset integer default 0
)
returns table (
  id              uuid,
  full_name       text,
  headline        text,
  job_title       text,
  company         text,
  location        text,
  department      text,
  batch           text,
  graduation_year integer,
  affiliation     public.affiliation,
  skills          text[],
  rank            real,
  total           bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with words as (
    -- At most five distinct words, letters and digits only, so quotes,
    -- wildcards and tsquery operators in the input are never interpreted.
    select w, min(ord) as ord
      from (
        select left(regexp_replace(lower(t), '[^[:alnum:]]', '', 'g'), 40) as w, ord
          from regexp_split_to_table(coalesce(p_query, ''), '\s+')
               with ordinality as s(t, ord)
      ) cleaned
     where w <> ''
     group by w
     order by min(ord)
     limit 5
  ),
  plain as (
    select string_agg(w, ' ' order by ord) as q, count(*) as n from words
  ),
  hits as (
    select p.id, p.full_name, p.headline, p.job_title, p.company, p.location,
           p.department, p.batch, p.graduation_year, p.affiliation, p.skills,
           (
             sc.score
             + 0.3 * coalesce(extensions.similarity(lower(p.full_name), plain.q), 0)
           )::real as rank
      from public.profiles p
     cross join plain
     cross join lateral (
       -- best score per word: the weight of the best field it matches, or null
       select coalesce(sum(m.best), 0) as score,
              coalesce(bool_and(m.best is not null), true) as every_word
         from (
           select (
             select max(
                      case when 'A' = any(l.weights) then 1.0
                           when 'B' = any(l.weights) then 0.5
                           when 'C' = any(l.weights) then 0.2
                           else 0.1 end
                      * case when l.lexeme = x.w then 1.0
                             when l.lexeme like x.w || '%' then 0.9
                             else 0.8 end
                    )
               from unnest(p.search_vector) as l
              where l.lexeme like x.w || '%'
                 or (length(x.w) >= 4
                     and abs(length(l.lexeme) - length(x.w)) <= 2
                     and extensions.levenshtein_less_equal(
                           l.lexeme, x.w, case when length(x.w) >= 6 then 2 else 1 end
                         ) <= case when length(x.w) >= 6 then 2 else 1 end)
           ) as best
           from words x
         ) m
     ) sc
     where p.verification_status in ('verified_student', 'verified_alumni', 'trusted_member')
       and p.visibility <> 'private'
       and p.id <> (select auth.uid())
       and (p_who is null or p.affiliation = p_who)
       and sc.every_word
       -- A blank query lists everyone; a query with nothing searchable in it
       -- ("%", "\") matches nobody, as it did before.
       and (plain.n > 0 or btrim(coalesce(p_query, '')) = '')
  )
  select h.id, h.full_name, h.headline, h.job_title, h.company, h.location,
         h.department, h.batch, h.graduation_year, h.affiliation, h.skills,
         h.rank, count(*) over () as total
    from hits h
   order by h.rank desc, h.full_name, h.id
   limit least(greatest(coalesce(p_limit, 20), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0)
$$;

revoke all on function public.search_members(text, public.affiliation, integer, integer) from public, anon;
grant execute on function public.search_members(text, public.affiliation, integer, integer) to authenticated;
