-- IncluMarket — chat session isolation
--
-- The chatbot used to identify anonymous visitors by a `guest_id` the BROWSER
-- generated and stored in localStorage, then passed as an argument on every
-- call. The server checked that the supplied id matched the session's, which
-- sounds like an ownership check but is not one: the value being compared was
-- itself supplied by the caller, so it was forgeable, and it survived sign-out
-- on a shared device.
--
-- Guests are now identified by an httpOnly cookie the server issues
-- (`g_<uuid>`), which page scripts cannot read or set, and neither
-- sendChatMessage nor fetchChatHistory takes any identifier from the client at
-- all. See lib/chatbot/identity.ts.
--
-- This migration deals with the rows left over from the old scheme and adds
-- the indexes the new lookup pattern needs.

begin;

-- ---------------------------------------------------------------------------
-- Retire legacy guest sessions.
--
-- Their guest_id is in the old client-generated shape, so no cookie the server
-- issues can ever match one: they are already unreachable. Marking them closed
-- makes the stored state say so, and keeps them out of any "open sessions"
-- count. Transcripts are preserved — nothing is deleted.
--
-- Sessions with a user_id are untouched: those are still resolvable, because a
-- signed-in user is matched on their profile and never on a guest id.
-- ---------------------------------------------------------------------------
update public.im_chat_sessions
   set status = 'closed',
       updated_at = now()
 where user_id is null
   and guest_id is not null
   and guest_id !~ '^g_[0-9a-f-]{36}$'
   and status = 'open';

-- ---------------------------------------------------------------------------
-- Indexes for the lookup the app now performs: the caller's most recently
-- updated OPEN session, scoped by exactly one owner column.
-- ---------------------------------------------------------------------------
create index if not exists idx_im_chat_sessions_user_open
  on public.im_chat_sessions(user_id, updated_at desc)
  where status = 'open' and user_id is not null;

create index if not exists idx_im_chat_sessions_guest_open
  on public.im_chat_sessions(guest_id, updated_at desc)
  where status = 'open' and user_id is null and guest_id is not null;

comment on column public.im_chat_sessions.guest_id is
  'Server-issued httpOnly cookie value (g_<uuid>) for anonymous visitors. Never accepted from the client. Null for signed-in sessions, which are keyed on user_id.';

commit;
