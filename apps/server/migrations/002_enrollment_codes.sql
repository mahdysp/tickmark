create table enrollment_codes (
  code text primary key,
  user_id uuid not null references users(id) on delete cascade,
  challenge text,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
alter table enrollment_codes enable row level security;
