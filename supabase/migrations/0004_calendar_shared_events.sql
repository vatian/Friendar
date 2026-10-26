-- =====================================================================
-- Одно событие в нескольких календарях.
--
-- Отметки одного события в разных календарях получают общий series_id.
-- Приложение меняет и удаляет их все вместе (по series_id); правила
-- доступа прежние — затронуть можно только свои отметки.
-- У старых отметок series_id свой у каждой — они остаются одиночными.
-- =====================================================================

alter table public.calendar_slots
  add column series_id uuid not null default gen_random_uuid();

create index calendar_slots_series_id_idx on public.calendar_slots (user_id, series_id);

-- Одно событие — не больше одной отметки в каждом календаре.
-- user_id в ключе: чужая отметка с тем же series_id не помешает добавить свою.
alter table public.calendar_slots
  add constraint calendar_slots_series_calendar_key unique (user_id, series_id, calendar_id);

grant insert (series_id) on public.calendar_slots to authenticated;
