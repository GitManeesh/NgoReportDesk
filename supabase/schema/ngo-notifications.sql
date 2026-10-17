create table public.ngo_donors (
 id uuid primary key default gen_random_uuid(),owner_hash text not null,org text not null,identity_key text not null,
 name text not null,email text not null default '',whatsapp text not null default '',receives_reports boolean not null default true,
 created_at timestamptz not null default now(),unique(owner_hash,org,identity_key)
);
create table public.ngo_notification_outbox (
 id uuid primary key default gen_random_uuid(),owner_hash text not null,document_type text not null check(document_type in ('report','receipt')),
 document_id uuid not null,donor_id uuid not null references public.ngo_donors(id),
 channel text not null check(channel in ('gmail','whatsapp')),recipient text not null,
 status text not null default 'pending' check(status in ('pending','sending','sent','uncertain')),
 created_at timestamptz not null default now(),completed_at timestamptz,
 unique(document_type,document_id,donor_id,channel)
);
create index ngo_notification_pending on public.ngo_notification_outbox(created_at) where status='pending';
create index ngo_donors_owner on public.ngo_donors(owner_hash,org);
alter table public.ngo_donors enable row level security;
alter table public.ngo_notification_outbox enable row level security;
revoke all on public.ngo_donors,public.ngo_notification_outbox from anon,authenticated;
grant select,insert,update,delete on public.ngo_donors,public.ngo_notification_outbox to service_role;
create function public.ngo_queue_approved_document() returns trigger language plpgsql security invoker set search_path='' as $$
declare d record;channel_name text;address text;contact_key text;
begin
 if TG_TABLE_NAME='ngo_donations' then
  contact_key:=case when NEW.email<>'' then 'email:'||lower(NEW.email) when NEW.whatsapp<>'' then 'whatsapp:'||NEW.whatsapp else 'name:'||lower(NEW.donor) end;
  insert into public.ngo_donors(owner_hash,org,identity_key,name,email,whatsapp)
   values(NEW.owner_hash,NEW.org,contact_key,NEW.donor,NEW.email,NEW.whatsapp)
   on conflict(owner_hash,org,identity_key) do update set name=excluded.name,email=excluded.email,whatsapp=excluded.whatsapp;
 end if;
 if not exists(select 1 from public.ngo_channel_access a where a.owner_hash=NEW.owner_hash and a.enabled) then return NEW;end if;
 if TG_TABLE_NAME='ngo_donations' then
  for d in select * from public.ngo_donors where owner_hash=NEW.owner_hash and org=NEW.org and identity_key=contact_key loop
   channel_name:=case when d.whatsapp<>'' then 'whatsapp' else 'gmail' end;address:=case when d.whatsapp<>'' then d.whatsapp else d.email end;
   if address<>'' then insert into public.ngo_notification_outbox(owner_hash,document_type,document_id,donor_id,channel,recipient)values(NEW.owner_hash,'receipt',NEW.id,d.id,channel_name,address)on conflict do nothing;end if;
  end loop;
 else
  for d in select * from public.ngo_donors where owner_hash=NEW.owner_hash and org=NEW.org and receives_reports loop
   channel_name:=case when d.whatsapp<>'' then 'whatsapp' else 'gmail' end;address:=case when d.whatsapp<>'' then d.whatsapp else d.email end;
   if address<>'' then insert into public.ngo_notification_outbox(owner_hash,document_type,document_id,donor_id,channel,recipient)values(NEW.owner_hash,'report',NEW.id,d.id,channel_name,address)on conflict do nothing;end if;
  end loop;
 end if;
 return NEW;
end $$;
revoke all on function public.ngo_queue_approved_document() from public,anon,authenticated;
grant execute on function public.ngo_queue_approved_document() to service_role;
create trigger ngo_donation_auto_notify after insert on public.ngo_donations for each row execute function public.ngo_queue_approved_document();
create trigger ngo_report_auto_notify after insert on public.ngo_report_records for each row execute function public.ngo_queue_approved_document();
create function public.ngo_claim_notifications(workspace text default null) returns setof public.ngo_notification_outbox language sql security invoker set search_path='' as $$
 update public.ngo_notification_outbox set status='sending'
 where id in(select id from public.ngo_notification_outbox where status='pending' and (workspace is null or owner_hash=workspace) order by created_at for update skip locked limit 3)
 returning *;
$$;
revoke all on function public.ngo_claim_notifications(text) from public,anon,authenticated;
grant execute on function public.ngo_claim_notifications(text) to service_role;
