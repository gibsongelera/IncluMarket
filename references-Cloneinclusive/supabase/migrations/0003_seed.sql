-- InkluMarket — baseline reference data (categories + theme).
-- Production accounts are provisioned via scripts/provision-users.mjs
-- (Supabase Auth Admin API). Products are created by sellers in-app.

begin;

-- ---- im_categories ---------------------------------------------------------
insert into public.im_categories (id, label, folder) values
  ('bags','Bags','Bags'),
  ('apparel','Apparel','Apparel'),
  ('crafts','Crafts','Crafts'),
  ('food','Food','Food'),
  ('accessories','Accessories','Accessories'),
  ('wellness','Wellness','Wellness'),
  ('services','Services','Services')
on conflict (id) do nothing;

-- ---- im_theme_settings singleton ------------------------------------------
insert into public.im_theme_settings (id, theme_preset) values (1,'default')
on conflict (id) do nothing;

commit;
