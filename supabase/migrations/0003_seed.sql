-- InkluMarket — seed data (mirrors the original assets/js/seed.js demo dataset).
-- Demo-only. Timestamps are relative to now(). Tables are `im_`-prefixed.

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

-- ---- im_profiles -----------------------------------------------------------
insert into public.im_profiles (id, name, email, role, disability_type, assistive_needs, created_at, updated_at) values
  (1,'Ana Reyes','admin@inklumarket.ph','admin',null,null, now()-interval '180 days', now()-interval '180 days'),
  (2,'Maria Santos','seller1@inklumarket.ph','seller','Visual impairment','Screen reader compatibility', now()-interval '150 days', now()-interval '30 days'),
  (3,'Juan dela Cruz','seller2@inklumarket.ph','seller','Mobility impairment','Keyboard-only workflows', now()-interval '140 days', now()-interval '20 days'),
  (4,'Liwayway Bautista','seller3@inklumarket.ph','seller','Hearing impairment','Text-based communication', now()-interval '120 days', now()-interval '15 days'),
  (5,'Ramil Aquino','seller4@inklumarket.ph','seller','Speech impairment','Written order updates', now()-interval '110 days', now()-interval '12 days'),
  (6,'Perla Manalo','seller5@inklumarket.ph','seller','Physical (upper limb)','Larger touch targets', now()-interval '90 days', now()-interval '10 days'),
  (7,'Ernesto Gapasin','seller6@inklumarket.ph','seller','Low vision','High-contrast UI', now()-interval '70 days', now()-interval '8 days'),
  (10,'Karla Mendoza','buyer1@inklumarket.ph','buyer',null,null, now()-interval '60 days', now()-interval '5 days'),
  (11,'Paulo Villanueva','buyer2@inklumarket.ph','buyer',null,null, now()-interval '50 days', now()-interval '4 days'),
  (12,'Bea Aguilar','buyer3@inklumarket.ph','buyer',null,null, now()-interval '40 days', now()-interval '3 days'),
  (13,'Miguel Tan','buyer4@inklumarket.ph','buyer','Hearing impairment','Captioned support videos', now()-interval '38 days', now()-interval '2 days'),
  (14,'Jasmine Reyes','buyer5@inklumarket.ph','buyer',null,null, now()-interval '30 days', now()-interval '2 days'),
  (15,'Roman Cruz','buyer6@inklumarket.ph','buyer',null,null, now()-interval '20 days', now()-interval '1 days'),
  (16,'Elena Salvador','buyer7@inklumarket.ph','buyer',null,null, now()-interval '15 days', now()-interval '1 days'),
  (17,'Nico Domingo','buyer8@inklumarket.ph','buyer',null,null, now()-interval '10 days', now()-interval '2 hours')
on conflict (id) do nothing;

-- ---- im_products -----------------------------------------------------------
insert into public.im_products (id, seller_id, title, description, base_price, category, image, status, created_at, updated_at) values
  (101,2,'Handwoven Abaca Tote Bag','Locally woven abaca tote with reinforced handles. Fair-trade sourced from Zamboanga weavers.',850,'bags','👜','approved', now()-interval '100 days', now()-interval '10 days'),
  (102,2,'Coconut Shell Coasters (Set of 4)','Polished coconut shell coasters, hand-sanded for a smooth finish.',320,'crafts','🥥','approved', now()-interval '95 days', now()-interval '8 days'),
  (103,3,'Malong Pillow Cover','Traditional Mindanaoan malong pattern printed on soft cotton pillow cover.',480,'apparel','🛏️','approved', now()-interval '92 days', now()-interval '9 days'),
  (104,3,'Yakan-Inspired Table Runner','Vibrant Yakan-inspired weave, 180 cm table runner.',1250,'crafts','🧵','approved', now()-interval '85 days', now()-interval '6 days'),
  (105,4,'Homemade Suman (12 pcs)','Fresh homemade suman wrapped in banana leaves. Best consumed within 3 days.',180,'food','🍡','approved', now()-interval '80 days', now()-interval '4 days'),
  (106,4,'Coco Sugar (500g)','Low-glycemic coconut sugar, sun-dried and unrefined.',220,'food','🍬','approved', now()-interval '75 days', now()-interval '3 days'),
  (107,5,'Hand-poured Soy Candle','Soy wax candle with locally sourced essential oils. Approx. 40-hour burn time.',350,'wellness','🕯️','approved', now()-interval '70 days', now()-interval '3 days'),
  (108,5,'Herbal Bath Soap Bar','Cold-processed soap with lemongrass and coconut oil.',120,'wellness','🧼','approved', now()-interval '65 days', now()-interval '2 days'),
  (109,6,'Beaded Statement Earrings','Hand-beaded earrings, lightweight surgical-steel hooks.',260,'accessories','💎','approved', now()-interval '60 days', now()-interval '2 days'),
  (110,6,'Recycled Denim Wallet','Sturdy wallet made from upcycled denim with 8 card slots.',420,'accessories','👛','approved', now()-interval '55 days', now()-interval '2 days'),
  (111,7,'Freelance Voice-Over (Filipino)','Filipino voice-over service, 60-second script. Delivered in 3 days.',900,'services','🎙️','approved', now()-interval '50 days', now()-interval '1 days'),
  (112,7,'Custom Illustration (Portrait)','Digital portrait illustration in your chosen style. 1 revision included.',1500,'services','🎨','approved', now()-interval '48 days', now()-interval '1 days'),
  (113,2,'Piña Fabric Scarf','Delicate piña fabric scarf, hand-hemmed edges.',780,'apparel','🧣','approved', now()-interval '45 days', now()-interval '1 days'),
  (114,3,'Bamboo Cutlery Set','Reusable bamboo utensil set with cotton pouch.',300,'crafts','🥢','approved', now()-interval '40 days', now()-interval '1 days'),
  (115,4,'Dried Mango Slices (200g)','Chewy dried mango slices, no added sugar.',180,'food','🥭','approved', now()-interval '38 days', now()-interval '1 days'),
  (116,5,'Reed Diffuser Set','Reed diffuser with a 100 ml essential oil blend.',550,'wellness','🌿','approved', now()-interval '35 days', now()-interval '1 days'),
  (117,6,'Woven Rattan Fan','Classic hand-woven rattan fan, lightweight.',190,'accessories','🪭','approved', now()-interval '33 days', now()-interval '1 days'),
  (118,7,'Logo Design Service','2 initial concepts, 2 revisions, final vector files.',2500,'services','✒️','approved', now()-interval '30 days', now()-interval '1 days'),
  (119,6,'Beaded Bracelet (New Collection)','Newly listed bracelet awaiting compliance review.',240,'accessories','📿','pending', now()-interval '2 days', now()-interval '2 days'),
  (120,5,'Aromatherapy Roll-On','Lavender roll-on, 10 ml. Awaiting label review.',190,'wellness','🧴','pending', now()-interval '1 days', now()-interval '1 days'),
  (121,4,'Frozen Ube Halaya (500g)','Fresh ube halaya. Flagged due to a cold-chain policy check.',380,'food','🍮','flagged', now()-interval '4 days', now()-interval '3 days')
on conflict (id) do nothing;

-- ---- im_product_variants ---------------------------------------------------
insert into public.im_product_variants (id, product_id, color_name, size, stock_qty, sku_code) values
  (1,101,'Natural','One size',12,'IM-101-NAT-OS'),(2,101,'Ebony','One size',5,'IM-101-EBO-OS'),(3,101,'Ivory','One size',0,'IM-101-IVO-OS'),
  (4,102,'Natural','Set of 4',30,'IM-102-NAT-S4'),(5,102,'Charred','Set of 4',18,'IM-102-CHR-S4'),
  (6,103,'Ruby','18x18',22,'IM-103-RUB-18'),(7,103,'Indigo','18x18',15,'IM-103-IND-18'),(8,103,'Emerald','18x18',8,'IM-103-EME-18'),
  (9,104,'Ruby','180cm',6,'IM-104-RUB-180'),(10,104,'Indigo','180cm',4,'IM-104-IND-180'),
  (11,105,'Classic','12 pcs',40,'IM-105-CLA-12'),(12,105,'Ube','12 pcs',20,'IM-105-UBE-12'),
  (13,106,'Natural','500g',55,'IM-106-NAT-500'),
  (14,107,'Lavender','8oz',25,'IM-107-LAV-8'),(15,107,'Citrus','8oz',25,'IM-107-CIT-8'),(16,107,'Lavender','4oz',32,'IM-107-LAV-4'),
  (17,108,'Lemongrass','100g',60,'IM-108-LEM-100'),(18,108,'Coconut','100g',60,'IM-108-COC-100'),
  (19,109,'Turquoise','One size',14,'IM-109-TUR-OS'),(20,109,'Ruby','One size',3,'IM-109-RUB-OS'),
  (21,110,'Indigo','One size',10,'IM-110-IND-OS'),(22,110,'Charcoal','One size',7,'IM-110-CHA-OS'),
  (23,111,'Service','60 sec',20,'IM-111-SVC-60'),(24,111,'Service','120 sec',15,'IM-111-SVC-120'),
  (25,112,'Service','Bust',8,'IM-112-SVC-B'),(26,112,'Service','Full body',6,'IM-112-SVC-F'),
  (27,113,'Ivory','One size',9,'IM-113-IVO-OS'),(28,113,'Champagne','One size',6,'IM-113-CHA-OS'),
  (29,114,'Natural','4-piece',35,'IM-114-NAT-4'),(30,115,'Classic','200g',40,'IM-115-CLA-200'),
  (31,116,'Lavender','100 ml',18,'IM-116-LAV-100'),(32,116,'Sampaguita','100 ml',12,'IM-116-SAM-100'),
  (33,117,'Natural','One size',22,'IM-117-NAT-OS'),(34,118,'Service','Standard',5,'IM-118-SVC-STD'),(35,118,'Service','Premium',3,'IM-118-SVC-PRE'),
  (36,119,'Turquoise','One size',12,'IM-119-TUR-OS'),(37,120,'Lavender','10 ml',25,'IM-120-LAV-10'),(38,121,'Classic','500g',10,'IM-121-CLA-500')
on conflict (id) do nothing;

-- ---- im_orders -------------------------------------------------------------
insert into public.im_orders (id, buyer_id, total_amount, order_status, created_at) values
  (5001,10,1170,'pending',    now()-interval '3 hours'),
  (5002,11,780, 'processing', now()-interval '1 days'),
  (5003,12,1450,'shipped',    now()-interval '3 days'),
  (5004,10,350, 'delivered',  now()-interval '7 days'),
  (5005,13,2100,'delivered',  now()-interval '14 days'),
  (5006,14,550, 'returned',   now()-interval '20 days'),
  (5007,15,480, 'delivered',  now()-interval '9 days'),
  (5008,16,900, 'processing', now()-interval '2 days'),
  (5009,17,260, 'pending',    now()-interval '1 hours')
on conflict (id) do nothing;

-- ---- im_order_items --------------------------------------------------------
insert into public.im_order_items (id, order_id, product_id, variant_id, quantity, unit_price) values
  (1,5001,101,1,1,850),(2,5001,102,4,1,320),
  (3,5002,113,27,1,780),
  (4,5003,104,9,1,1250),(5,5003,108,17,2,100),
  (6,5004,107,14,1,350),
  (7,5005,112,26,1,1500),(8,5005,108,18,5,120),
  (9,5006,116,31,1,550),
  (10,5007,103,6,1,480),
  (11,5008,111,23,1,900),
  (12,5009,109,19,1,260)
on conflict (id) do nothing;

-- ---- im_product_reviews ----------------------------------------------------
insert into public.im_product_reviews (id, product_id, buyer_id, rating_score, comment_text, created_at) values
  (1,101,10,5,'Beautifully made, sturdy handles. Will buy again!', now()-interval '7 days'),
  (2,101,12,4,'Very nice bag, arrived a day late but the quality is excellent.', now()-interval '14 days'),
  (3,107,10,5,'Long burn time and the scent is soothing.', now()-interval '6 days'),
  (4,108,13,5,'Skin feels great, will restock.', now()-interval '12 days'),
  (5,112,13,4,'Artist was very accommodating, needed one revision.', now()-interval '10 days'),
  (6,103,15,4,'Colors are vibrant. Matches my sofa well.', now()-interval '8 days'),
  (7,104,12,5,'Truly heirloom quality.', now()-interval '4 days'),
  (8,116,14,3,'Nice scent but arrived with a chipped bottle.', now()-interval '18 days')
on conflict (id) do nothing;

-- ---- im_support_tickets + im_ticket_responses -----------------------------
insert into public.im_support_tickets (id, user_id, subject, description_narrative, ticket_status, priority_level, assigned_to, created_at, updated_at) values
  (9001,10,'Order 5001 delivery ETA?','Hi, I ordered a tote bag and coasters. Any update on shipping?','open','medium',null, now()-interval '3 hours', now()-interval '3 hours'),
  (9002,12,'Refund on damaged diffuser','The bottle arrived cracked. Please assist.','in_progress','high',1, now()-interval '18 days', now()-interval '17 days'),
  (9003,14,'How do I change my delivery address?','I placed order 5006 but need to update the address.','resolved','low',1, now()-interval '20 days', now()-interval '19 days'),
  (9004,2,'Seller: How to add a product variant?','I want to add a new color for the tote bag but cannot find the option.','open','low',null, now()-interval '1 days', now()-interval '1 days')
on conflict (id) do nothing;

insert into public.im_ticket_responses (ticket_id, author_role, author_id, message, created_at) values
  (9001,'buyer',10,'Hi, I ordered a tote bag and coasters. Any update on shipping?', now()-interval '3 hours'),
  (9002,'buyer',12,'The bottle arrived cracked. Please assist.', now()-interval '18 days'),
  (9002,'admin',1,'Escalating to the seller; a replacement will be scheduled.', now()-interval '17 days'),
  (9003,'buyer',14,'I placed order 5006 but need to update the address.', now()-interval '20 days'),
  (9003,'admin',1,'Updated. Please confirm on the order page.', now()-interval '19 days'),
  (9003,'buyer',14,'Confirmed, thanks!', now()-interval '19 days'),
  (9004,'seller',2,'I want to add a new color for the tote bag but cannot find the option.', now()-interval '1 days');

-- ---- im_consent_logs -------------------------------------------------------
insert into public.im_consent_logs (user_id, action, consent, purpose, created_at) values
  (10,'account_created',true,'RA 10173 DPA registration consent', now()-interval '60 days'),
  (11,'account_created',true,'RA 10173 DPA registration consent', now()-interval '50 days'),
  (12,'account_created',true,'RA 10173 DPA registration consent', now()-interval '40 days'),
  (13,'account_created',true,'RA 10173 DPA registration consent', now()-interval '38 days'),
  (14,'account_created',true,'RA 10173 DPA registration consent', now()-interval '30 days'),
  (15,'account_created',true,'RA 10173 DPA registration consent', now()-interval '20 days'),
  (16,'account_created',true,'RA 10173 DPA registration consent', now()-interval '15 days'),
  (17,'account_created',true,'RA 10173 DPA registration consent', now()-interval '10 days');

-- ---- im_audit_logs ---------------------------------------------------------
insert into public.im_audit_logs (actor_id, actor_role, action, target, created_at) values
  (1,'admin','approved_product','product:117', now()-interval '33 days'),
  (1,'admin','resolved_ticket','ticket:9003', now()-interval '19 days'),
  (1,'admin','assigned_ticket','ticket:9002', now()-interval '17 days'),
  (2,'seller','created_product','product:119', now()-interval '2 days'),
  (5,'seller','created_product','product:120', now()-interval '1 days'),
  (10,'buyer','placed_order','order:5001', now()-interval '3 hours'),
  (11,'buyer','placed_order','order:5002', now()-interval '1 days'),
  (1,'admin','flagged_product','product:121', now()-interval '3 days');

-- ---- im_theme_settings singleton ------------------------------------------
insert into public.im_theme_settings (id, theme_preset) values (1,'default')
on conflict (id) do nothing;

-- ---- reset identity sequences past the seeded ids -------------------------
select setval(pg_get_serial_sequence('public.im_profiles','id'),         (select max(id) from public.im_profiles));
select setval(pg_get_serial_sequence('public.im_products','id'),         (select max(id) from public.im_products));
select setval(pg_get_serial_sequence('public.im_product_variants','id'), (select max(id) from public.im_product_variants));
select setval(pg_get_serial_sequence('public.im_product_images','id'),   greatest(coalesce((select max(id) from public.im_product_images),1),1));
select setval(pg_get_serial_sequence('public.im_orders','id'),           (select max(id) from public.im_orders));
select setval(pg_get_serial_sequence('public.im_order_items','id'),      (select max(id) from public.im_order_items));
select setval(pg_get_serial_sequence('public.im_product_reviews','id'),  (select max(id) from public.im_product_reviews));
select setval(pg_get_serial_sequence('public.im_support_tickets','id'),  (select max(id) from public.im_support_tickets));
select setval(pg_get_serial_sequence('public.im_ticket_responses','id'), (select max(id) from public.im_ticket_responses));
select setval(pg_get_serial_sequence('public.im_consent_logs','id'),     (select max(id) from public.im_consent_logs));
select setval(pg_get_serial_sequence('public.im_audit_logs','id'),       (select max(id) from public.im_audit_logs));

commit;
