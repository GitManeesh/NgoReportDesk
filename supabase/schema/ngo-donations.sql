create table public.ngo_donations (
 id uuid primary key default gen_random_uuid(), owner_hash text not null check(owner_hash ~ '^[a-f0-9]{64}$'),
 client_id uuid not null, sequence_no bigint generated always as identity unique,
 org text not null check(char_length(org) between 1 and 200), donor text not null check(char_length(donor) between 1 and 200),
 donated_on date not null, amount numeric(14,2) not null check(amount > 0), currency text not null default 'INR' check(currency ~ '^[A-Z]{3}$'),
 mode text not null check(mode in ('UPI','Bank transfer','Cash','Cheque','Other')),
 email text not null default '' check(char_length(email)<=254), whatsapp text not null default '' check(char_length(whatsapp)<=30),
 receipt_no text generated always as ('NGO-' || extract(year from donated_on)::text || '-' || lpad(sequence_no::text,8,'0')) stored unique,
 thank_you text not null check(char_length(thank_you)<=1000), approved_at timestamptz not null default now(),
 receipt_sent boolean not null default false, thank_you_sent boolean not null default false,
 created_at timestamptz not null default now(), unique(owner_hash,client_id)
);
create index ngo_donations_owner_date on public.ngo_donations(owner_hash,donated_on desc);
alter table public.ngo_donations enable row level security;
revoke all on public.ngo_donations from anon,authenticated;
grant select,insert,update,delete on public.ngo_donations to service_role;
grant usage,select on sequence public.ngo_donations_sequence_no_seq to service_role;
create table public.ngo_delivery_log (
 id uuid primary key default gen_random_uuid(),owner_hash text not null,
 donation_id uuid references public.ngo_donations(id) on delete cascade,
 channel text not null check(channel in ('gmail','whatsapp')),
 status text not null check(status in ('sending','sent','uncertain')),
 created_at timestamptz not null default now(), unique(donation_id,channel)
);
alter table public.ngo_delivery_log enable row level security;
revoke all on public.ngo_delivery_log from anon,authenticated;
grant select,insert,update,delete on public.ngo_delivery_log to service_role;
