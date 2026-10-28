-- Auto Brilho Web: execute no SQL Editor do Supabase.
-- Crie apenas o usuário administrador em Authentication > Users.
-- Desative cadastro público (signup) nas configurações de Auth.
create extension if not exists pgcrypto;

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(), data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.vehicles (like public.clients including all);
create table if not exists public.services (like public.clients including all);
create table if not exists public.appointments (like public.clients including all);
create table if not exists public.payments (like public.clients including all);
create table if not exists public.expenses (like public.clients including all);

-- Row Level Security: somente usuários autenticados podem ler e alterar os dados.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;


-- IMPORTANTE: substitua ADMIN_EMAIL_AQUI pelo e-mail exato do administrador
-- antes de executar este SQL. Desative o cadastro público em Authentication > Settings.
-- Crie somente esse usuário em Authentication > Users.
do $$ declare t text; begin
  foreach t in array array['clients','vehicles','services','appointments','payments','expenses'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "admin authenticated access" on public.%I', t);
    execute format('create policy "admin authenticated access" on public.%I for all to authenticated using (lower((auth.jwt() ->> ''email'')) = lower(''eduardoschelhase@gmail.com'')) with check (lower((auth.jwt() ->> ''email'')) = lower(''eduardoschelhase@gmail.com''))', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- Ative Realtime para sincronizar atualizações entre aparelhos.
alter publication supabase_realtime add table public.clients;
alter publication supabase_realtime add table public.vehicles;
alter publication supabase_realtime add table public.services;
alter publication supabase_realtime add table public.appointments;
alter publication supabase_realtime add table public.payments;
alter publication supabase_realtime add table public.expenses;
