create table users (
  id uuid primary key default gen_random_uuid(),
  university_id text not null unique,
  full_name text not null,
  role text not null check (role in ('student', 'professor', 'admin')),
  created_at timestamptz not null default now()
);

create table courses (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  title text not null,
  professor_id uuid not null references users(id),
  created_at timestamptz not null default now()
);

create table enrollments (
  course_id uuid not null references courses(id) on delete cascade,
  student_id uuid not null references users(id) on delete cascade,
  primary key (course_id, student_id)
);

-- WebAuthn credentials (one active device per student)
create table credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  credential_id text not null unique,
  public_key bytea not null,
  sign_count bigint not null default 0,
  device_name text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index one_active_credential_per_user
  on credentials (user_id) where active;

-- A class meeting; session_key is the secret used to build and verify HMAC tokens
create table class_sessions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  session_key bytea not null,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

create table attendance_records (
  id uuid primary key default gen_random_uuid(),
  class_session_id uuid not null references class_sessions(id) on delete cascade,
  student_id uuid not null references users(id) on delete cascade,
  credential_id uuid not null references credentials(id),
  token text not null,
  assertion jsonb not null,
  mode text not null check (mode in ('online', 'offline')),
  received_at timestamptz not null default now(),
  unique (class_session_id, student_id, token)
);

-- Supabase exposes tables through its public API; with RLS on and no policies,
-- only our server (direct connection) can read or write them.
alter table users enable row level security;
alter table courses enable row level security;
alter table enrollments enable row level security;
alter table credentials enable row level security;
alter table class_sessions enable row level security;
alter table attendance_records enable row level security;
