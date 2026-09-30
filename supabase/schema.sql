-- Créneaux — schéma Supabase
-- À coller tel quel dans Supabase → SQL Editor → Run.
--
-- Les tables ne sont pas accessibles directement depuis le navigateur (RLS
-- activé, aucune policy). Tout passe par les fonctions ci-dessous, exécutées
-- avec les droits du propriétaire (security definer) :
--   create_event   → crée l'événement et ses créneaux, renvoie les deux liens
--   get_event      → vue publique (horaires + places restantes, sans les noms)
--   sign_up        → inscription, avec contrôle des places sous verrou
--   get_admin      → vue du créateur (noms compris), protégée par admin_key
--   delete_signup  → le créateur retire une personne

create table if not exists events (
  id          uuid primary key default gen_random_uuid(),
  public_id   text not null unique,
  admin_key   text not null unique,
  title       text not null check (char_length(title) between 1 and 120),
  event_date  date not null,
  capacity    int  not null check (capacity between 1 and 500),
  created_at  timestamptz not null default now()
);

create table if not exists slots (
  id        bigint generated always as identity primary key,
  event_id  uuid not null references events(id) on delete cascade,
  position  int  not null,
  starts_at time not null,
  ends_at   time not null,
  unique (event_id, position)
);

create table if not exists signups (
  id          bigint generated always as identity primary key,
  slot_id     bigint not null references slots(id) on delete cascade,
  first_name  text not null check (char_length(first_name) between 1 and 60),
  last_name   text not null check (char_length(last_name) between 1 and 60),
  created_at  timestamptz not null default now()
);

-- Inscriptions arrêtées par le créateur (null = ouvertes).
alter table events add column if not exists closed_at timestamptz;

create index if not exists slots_event_idx on slots(event_id);
create index if not exists signups_slot_idx on signups(slot_id);

alter table events  enable row level security;
alter table slots   enable row level security;
alter table signups enable row level security;

-- Identifiant aléatoire hexadécimal de n caractères.
create or replace function random_id(n int) returns text
language sql volatile as $$
  select substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, n)
$$;


create or replace function create_event(
  p_title text,
  p_date date,
  p_start time,
  p_end time,
  p_slot_count int,
  p_capacity int
) returns json
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_event   events;
  v_total   int;
  v_title   text := btrim(p_title);
  i         int;
begin
  if p_end <= p_start then
    raise exception 'INVALID_RANGE';
  end if;
  v_total := extract(epoch from (p_end - p_start))::int / 60;
  if p_slot_count < 1 or p_slot_count > 200 or p_slot_count > v_total then
    raise exception 'INVALID_SLOT_COUNT';
  end if;
  if p_capacity < 1 or p_capacity > 500 then
    raise exception 'INVALID_CAPACITY';
  end if;
  if v_title is null or v_title = '' then
    raise exception 'INVALID_TITLE';
  end if;

  insert into events (public_id, admin_key, title, event_date, capacity)
  values (random_id(10), random_id(32), v_title, p_date, p_capacity)
  returning * into v_event;

  -- Découpage régulier de la plage, arrondi à la minute.
  for i in 0 .. p_slot_count - 1 loop
    insert into slots (event_id, position, starts_at, ends_at)
    values (
      v_event.id,
      i,
      p_start + make_interval(mins => round(i * v_total::numeric / p_slot_count)::int),
      p_start + make_interval(mins => round((i + 1) * v_total::numeric / p_slot_count)::int)
    );
  end loop;

  return json_build_object('public_id', v_event.public_id, 'admin_key', v_event.admin_key);
end;
$$;


create or replace function get_event(p_public_id text) returns json
language sql stable security definer set search_path = public, pg_temp as $$
  select json_build_object(
    'title',    e.title,
    'date',     e.event_date,
    'capacity', e.capacity,
    'closed',   e.closed_at is not null,
    'slots', coalesce((
      select json_agg(json_build_object(
        'id',     s.id,
        'starts', to_char(s.starts_at, 'HH24:MI'),
        'ends',   to_char(s.ends_at, 'HH24:MI'),
        'taken',  (select count(*) from signups g where g.slot_id = s.id)
      ) order by s.position)
      from slots s where s.event_id = e.id
    ), '[]'::json)
  )
  from events e
  where e.public_id = p_public_id
$$;


create or replace function sign_up(
  p_public_id text,
  p_slot_id bigint,
  p_first_name text,
  p_last_name text
) returns json
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_event events;
  v_first text := btrim(p_first_name);
  v_last  text := btrim(p_last_name);
  v_taken int;
  v_slot  slots;
begin
  if v_first is null or v_first = '' or v_last is null or v_last = ''
     or char_length(v_first) > 60 or char_length(v_last) > 60 then
    raise exception 'INVALID_NAME';
  end if;

  -- Verrou sur l'événement : les inscriptions d'un même événement passent une
  -- par une, donc le comptage des places ne peut pas être dépassé.
  select * into v_event from events where public_id = p_public_id for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if v_event.closed_at is not null then
    raise exception 'CLOSED';
  end if;

  select * into v_slot from slots where id = p_slot_id and event_id = v_event.id;
  if not found then
    raise exception 'NOT_FOUND';
  end if;

  if exists (
    select 1 from signups g join slots s on s.id = g.slot_id
    where s.event_id = v_event.id
      and lower(g.first_name) = lower(v_first)
      and lower(g.last_name) = lower(v_last)
  ) then
    raise exception 'ALREADY_REGISTERED';
  end if;

  select count(*) into v_taken from signups where slot_id = p_slot_id;
  if v_taken >= v_event.capacity then
    raise exception 'SLOT_FULL';
  end if;

  insert into signups (slot_id, first_name, last_name) values (p_slot_id, v_first, v_last);

  return json_build_object(
    'starts', to_char(v_slot.starts_at, 'HH24:MI'),
    'ends',   to_char(v_slot.ends_at, 'HH24:MI')
  );
end;
$$;


create or replace function get_admin(p_admin_key text) returns json
language sql stable security definer set search_path = public, pg_temp as $$
  select json_build_object(
    'public_id', e.public_id,
    'title',     e.title,
    'date',      e.event_date,
    'capacity',  e.capacity,
    'closed',    e.closed_at is not null,
    'slots', coalesce((
      select json_agg(json_build_object(
        'id',     s.id,
        'starts', to_char(s.starts_at, 'HH24:MI'),
        'ends',   to_char(s.ends_at, 'HH24:MI'),
        'people', coalesce((
          select json_agg(json_build_object(
            'id', g.id, 'first_name', g.first_name, 'last_name', g.last_name
          ) order by g.created_at)
          from signups g where g.slot_id = s.id
        ), '[]'::json)
      ) order by s.position)
      from slots s where s.event_id = e.id
    ), '[]'::json)
  )
  from events e
  where e.admin_key = p_admin_key
$$;


create or replace function delete_signup(p_admin_key text, p_signup_id bigint) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from signups g
  using slots s, events e
  where g.id = p_signup_id
    and s.id = g.slot_id
    and e.id = s.event_id
    and e.admin_key = p_admin_key;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
end;
$$;


-- Contrôles communs aux écritures du créateur, sous verrou de l'événement.
-- p_ignore : inscription à exclure des contrôles (celle qu'on modifie).
create or replace function check_signup(
  p_event events,
  p_slot_id bigint,
  p_first text,
  p_last text,
  p_ignore bigint
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_first is null or p_first = '' or p_last is null or p_last = ''
     or char_length(p_first) > 60 or char_length(p_last) > 60 then
    raise exception 'INVALID_NAME';
  end if;
  if not exists (select 1 from slots where id = p_slot_id and event_id = p_event.id) then
    raise exception 'NOT_FOUND';
  end if;
  if exists (
    select 1 from signups g join slots s on s.id = g.slot_id
    where s.event_id = p_event.id
      and g.id is distinct from p_ignore
      and lower(g.first_name) = lower(p_first)
      and lower(g.last_name) = lower(p_last)
  ) then
    raise exception 'ALREADY_REGISTERED';
  end if;
  if (select count(*) from signups where slot_id = p_slot_id and id is distinct from p_ignore) >= p_event.capacity then
    raise exception 'SLOT_FULL';
  end if;
end;
$$;


create or replace function admin_add_signup(
  p_admin_key text,
  p_slot_id bigint,
  p_first_name text,
  p_last_name text
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_event events;
  v_first text := btrim(p_first_name);
  v_last  text := btrim(p_last_name);
begin
  select * into v_event from events where admin_key = p_admin_key for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  perform check_signup(v_event, p_slot_id, v_first, v_last, null);
  insert into signups (slot_id, first_name, last_name) values (p_slot_id, v_first, v_last);
end;
$$;


-- Modifie le nom et/ou déplace la personne sur un autre créneau.
create or replace function admin_update_signup(
  p_admin_key text,
  p_signup_id bigint,
  p_slot_id bigint,
  p_first_name text,
  p_last_name text
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_event events;
  v_first text := btrim(p_first_name);
  v_last  text := btrim(p_last_name);
begin
  select * into v_event from events where admin_key = p_admin_key for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if not exists (
    select 1 from signups g join slots s on s.id = g.slot_id
    where g.id = p_signup_id and s.event_id = v_event.id
  ) then
    raise exception 'NOT_FOUND';
  end if;
  perform check_signup(v_event, p_slot_id, v_first, v_last, p_signup_id);
  update signups
  set slot_id = p_slot_id, first_name = v_first, last_name = v_last
  where id = p_signup_id;
end;
$$;


-- Arrête (true) ou rouvre (false) les inscriptions via le lien public.
create or replace function set_closed(p_admin_key text, p_closed boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update events
  set closed_at = case when p_closed then coalesce(closed_at, now()) end
  where admin_key = p_admin_key;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
end;
$$;


-- Seules les fonctions publiques sont appelables depuis le navigateur.
revoke all on events, slots, signups from anon, authenticated;
revoke execute on function random_id(int) from public, anon, authenticated;
revoke execute on function check_signup(events, bigint, text, text, bigint) from public, anon, authenticated;
grant execute on function
  create_event(text, date, time, time, int, int),
  get_event(text),
  sign_up(text, bigint, text, text),
  get_admin(text),
  delete_signup(text, bigint),
  admin_add_signup(text, bigint, text, text),
  admin_update_signup(text, bigint, bigint, text, text),
  set_closed(text, boolean)
to anon, authenticated;
