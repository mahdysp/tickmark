alter table attendance_records add column slot_time timestamptz;
update attendance_records set slot_time = received_at where slot_time is null;
alter table attendance_records alter column slot_time set not null;
create index attendance_session_slot on attendance_records (class_session_id, slot_time);
