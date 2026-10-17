create table public.ngo_report_records (
  id uuid primary key default gen_random_uuid(),
  owner_hash text not null check (owner_hash ~ '^[a-f0-9]{64}$'),
  client_id text not null check (client_id ~ '^[a-f0-9]{64}$'),
  org text not null check (char_length(org) between 1 and 200),
  period text not null check (char_length(period) between 1 and 150),
  content text not null check (char_length(content) between 30 and 80000),
  status text not null default 'approved' check (status = 'approved'),
  created_at timestamptz not null default now(),
  unique (owner_hash, client_id)
);
create index ngo_report_records_owner_created on public.ngo_report_records(owner_hash, created_at desc);
alter table public.ngo_report_records enable row level security;
revoke all on public.ngo_report_records from anon, authenticated;
grant select, insert, delete on public.ngo_report_records to service_role;
comment on table public.ngo_report_records is 'Approved NGO reports. Accessible only through the capability-authenticated ngo-records Edge Function. No public or authenticated-role access.';
