 create extension if not exists pgcrypto;

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.salary_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  amount numeric(12, 2) not null check (amount >= 0),
  pay_date date not null,
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.deductions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  salary_record_id uuid not null references public.salary_records(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete restrict,
  amount numeric(12, 2) not null check (amount >= 0),
  description text not null default '',
  created_at timestamptz not null default now()
);

alter table public.categories enable row level security;
alter table public.salary_records enable row level security;
alter table public.deductions enable row level security;

drop policy if exists "Users can manage their categories" on public.categories;
create policy "Users can manage their categories"
  on public.categories for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can manage their salaries" on public.salary_records;
create policy "Users can manage their salaries"
  on public.salary_records for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can read their deductions" on public.deductions;
create policy "Users can read their deductions"
  on public.deductions for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can add their deductions" on public.deductions;
create policy "Users can add their deductions"
  on public.deductions for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.salary_records s
      where s.id = salary_record_id and s.user_id = auth.uid()
    )
    and exists (
      select 1 from public.categories c
      where c.id = category_id and c.user_id = auth.uid()
    )
  );

drop policy if exists "Users can delete their deductions" on public.deductions;
create policy "Users can delete their deductions"
  on public.deductions for delete to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.categories to authenticated;
grant select, insert, update, delete on public.salary_records to authenticated;
grant select, insert, delete on public.deductions to authenticated;
