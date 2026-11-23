-- ROLLBACK for 0026_message_photos.sql. DEV only.
-- Drops the three checks and the body default. The image columns, the
-- message-media bucket and its deny policy are KEPT: the columns hold user
-- data, and dropping the deny would leave private photos one careless
-- storage policy away from a browser.

begin;

alter table public.im_messages drop constraint if exists im_messages_has_content;
alter table public.im_messages drop constraint if exists im_messages_image_path_shape;
alter table public.im_messages drop constraint if exists im_messages_image_alt_length;
alter table public.im_messages alter column body drop default;

commit;
