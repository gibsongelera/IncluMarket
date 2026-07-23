/* InkluMarket seed data
   Mirrors the PostgreSQL schema from the InkluMarket directive 1:1.
   All rows are demo-only. Password hashes are placeholders, NOT real bcrypt.
*/
(function (global) {
  'use strict';

  var now = new Date();
  function iso(offsetDays, offsetHours) {
    var d = new Date(now.getTime());
    if (offsetDays)  d.setDate(d.getDate() + offsetDays);
    if (offsetHours) d.setHours(d.getHours() + offsetHours);
    return d.toISOString();
  }
  var HASH = 'bcrypt-cost-12$demo$placeholder-not-real';

  var CATEGORIES = [
    { id: 'bags',        label: 'Bags',        folder: 'Bags' },
    { id: 'apparel',     label: 'Apparel',     folder: 'Apparel' },
    { id: 'crafts',      label: 'Crafts',      folder: 'Crafts' },
    { id: 'food',        label: 'Food',        folder: 'Food' },
    { id: 'accessories', label: 'Accessories', folder: 'Accessories' },
    { id: 'wellness',    label: 'Wellness',    folder: 'Wellness' },
    { id: 'services',    label: 'Services',    folder: 'Services' }
  ];

  var users = [
    { id: 1,  name: 'Ana Reyes',        email: 'admin@inklumarket.ph',  password_hash: HASH, role: 'admin',
      disability_type: null, assistive_needs: null,
      created_at: iso(-180, 0), updated_at: iso(-180, 0) },

    { id: 2,  name: 'Maria Santos',     email: 'seller1@inklumarket.ph', password_hash: HASH, role: 'seller',
      disability_type: 'Visual impairment', assistive_needs: 'Screen reader compatibility',
      created_at: iso(-150, 0), updated_at: iso(-30, 0) },
    { id: 3,  name: 'Juan dela Cruz',   email: 'seller2@inklumarket.ph', password_hash: HASH, role: 'seller',
      disability_type: 'Mobility impairment', assistive_needs: 'Keyboard-only workflows',
      created_at: iso(-140, 0), updated_at: iso(-20, 0) },
    { id: 4,  name: 'Liwayway Bautista', email: 'seller3@inklumarket.ph', password_hash: HASH, role: 'seller',
      disability_type: 'Hearing impairment', assistive_needs: 'Text-based communication',
      created_at: iso(-120, 0), updated_at: iso(-15, 0) },
    { id: 5,  name: 'Ramil Aquino',     email: 'seller4@inklumarket.ph', password_hash: HASH, role: 'seller',
      disability_type: 'Speech impairment', assistive_needs: 'Written order updates',
      created_at: iso(-110, 0), updated_at: iso(-12, 0) },
    { id: 6,  name: 'Perla Manalo',     email: 'seller5@inklumarket.ph', password_hash: HASH, role: 'seller',
      disability_type: 'Physical (upper limb)', assistive_needs: 'Larger touch targets',
      created_at: iso(-90, 0),  updated_at: iso(-10, 0) },
    { id: 7,  name: 'Ernesto Gapasin',  email: 'seller6@inklumarket.ph', password_hash: HASH, role: 'seller',
      disability_type: 'Low vision', assistive_needs: 'High-contrast UI',
      created_at: iso(-70, 0),  updated_at: iso(-8, 0) },

    { id: 10, name: 'Karla Mendoza',    email: 'buyer1@inklumarket.ph',  password_hash: HASH, role: 'buyer',
      disability_type: null, assistive_needs: null,
      created_at: iso(-60, 0), updated_at: iso(-5, 0) },
    { id: 11, name: 'Paulo Villanueva', email: 'buyer2@inklumarket.ph',  password_hash: HASH, role: 'buyer',
      disability_type: null, assistive_needs: null,
      created_at: iso(-50, 0), updated_at: iso(-4, 0) },
    { id: 12, name: 'Bea Aguilar',      email: 'buyer3@inklumarket.ph',  password_hash: HASH, role: 'buyer',
      disability_type: null, assistive_needs: null,
      created_at: iso(-40, 0), updated_at: iso(-3, 0) },
    { id: 13, name: 'Miguel Tan',       email: 'buyer4@inklumarket.ph',  password_hash: HASH, role: 'buyer',
      disability_type: 'Hearing impairment', assistive_needs: 'Captioned support videos',
      created_at: iso(-38, 0), updated_at: iso(-2, 0) },
    { id: 14, name: 'Jasmine Reyes',    email: 'buyer5@inklumarket.ph',  password_hash: HASH, role: 'buyer',
      disability_type: null, assistive_needs: null,
      created_at: iso(-30, 0), updated_at: iso(-2, 0) },
    { id: 15, name: 'Roman Cruz',       email: 'buyer6@inklumarket.ph',  password_hash: HASH, role: 'buyer',
      disability_type: null, assistive_needs: null,
      created_at: iso(-20, 0), updated_at: iso(-1, 0) },
    { id: 16, name: 'Elena Salvador',   email: 'buyer7@inklumarket.ph',  password_hash: HASH, role: 'buyer',
      disability_type: null, assistive_needs: null,
      created_at: iso(-15, 0), updated_at: iso(-1, 0) },
    { id: 17, name: 'Nico Domingo',     email: 'buyer8@inklumarket.ph',  password_hash: HASH, role: 'buyer',
      disability_type: null, assistive_needs: null,
      created_at: iso(-10, 0), updated_at: iso(0, -2) }
  ];

  /* Products with an added 'category', 'image' (emoji), and 'status'
     (pending/approved/flagged) to power the admin verification queue. */
  var products = [
    { id: 101, seller_id: 2, title: 'Handwoven Abaca Tote Bag',        description: 'Locally woven abaca tote with reinforced handles. Fair-trade sourced from Zamboanga weavers.', base_price: 850,  category: 'bags', image: '👜', status: 'approved', created_at: iso(-100), updated_at: iso(-10) },
    { id: 102, seller_id: 2, title: 'Coconut Shell Coasters (Set of 4)', description: 'Polished coconut shell coasters, hand-sanded for a smooth finish.', base_price: 320, category: 'crafts', image: '🥥', status: 'approved', created_at: iso(-95), updated_at: iso(-8) },
    { id: 103, seller_id: 3, title: 'Malong Pillow Cover',              description: 'Traditional Mindanaoan malong pattern printed on soft cotton pillow cover.', base_price: 480,  category: 'apparel', image: '🛏️', status: 'approved', created_at: iso(-92), updated_at: iso(-9) },
    { id: 104, seller_id: 3, title: 'Yakan-Inspired Table Runner',     description: 'Vibrant Yakan-inspired weave, 180 cm table runner.', base_price: 1250, category: 'crafts', image: '🧵', status: 'approved', created_at: iso(-85), updated_at: iso(-6) },
    { id: 105, seller_id: 4, title: 'Homemade Suman (12 pcs)',         description: 'Fresh homemade suman wrapped in banana leaves. Best consumed within 3 days.', base_price: 180, category: 'food', image: '🍡', status: 'approved', created_at: iso(-80), updated_at: iso(-4) },
    { id: 106, seller_id: 4, title: 'Coco Sugar (500g)',                description: 'Low-glycemic coconut sugar, sun-dried and unrefined.', base_price: 220, category: 'food', image: '🍬', status: 'approved', created_at: iso(-75), updated_at: iso(-3) },
    { id: 107, seller_id: 5, title: 'Hand-poured Soy Candle',           description: 'Soy wax candle with locally sourced essential oils. Approx. 40-hour burn time.', base_price: 350, category: 'wellness', image: '🕯️', status: 'approved', created_at: iso(-70), updated_at: iso(-3) },
    { id: 108, seller_id: 5, title: 'Herbal Bath Soap Bar',             description: 'Cold-processed soap with lemongrass and coconut oil.', base_price: 120, category: 'wellness', image: '🧼', status: 'approved', created_at: iso(-65), updated_at: iso(-2) },
    { id: 109, seller_id: 6, title: 'Beaded Statement Earrings',        description: 'Hand-beaded earrings, lightweight surgical-steel hooks.', base_price: 260, category: 'accessories', image: '💎', status: 'approved', created_at: iso(-60), updated_at: iso(-2) },
    { id: 110, seller_id: 6, title: 'Recycled Denim Wallet',            description: 'Sturdy wallet made from upcycled denim with 8 card slots.', base_price: 420, category: 'accessories', image: '👛', status: 'approved', created_at: iso(-55), updated_at: iso(-2) },
    { id: 111, seller_id: 7, title: 'Freelance Voice-Over (Filipino)',  description: 'Filipino voice-over service, 60-second script. Delivered in 3 days.', base_price: 900, category: 'services', image: '🎙️', status: 'approved', created_at: iso(-50), updated_at: iso(-1) },
    { id: 112, seller_id: 7, title: 'Custom Illustration (Portrait)',   description: 'Digital portrait illustration in your chosen style. 1 revision included.', base_price: 1500, category: 'services', image: '🎨', status: 'approved', created_at: iso(-48), updated_at: iso(-1) },
    { id: 113, seller_id: 2, title: 'Piña Fabric Scarf',                description: 'Delicate piña fabric scarf, hand-hemmed edges.', base_price: 780, category: 'apparel', image: '🧣', status: 'approved', created_at: iso(-45), updated_at: iso(-1) },
    { id: 114, seller_id: 3, title: 'Bamboo Cutlery Set',                description: 'Reusable bamboo utensil set with cotton pouch.', base_price: 300, category: 'crafts', image: '🥢', status: 'approved', created_at: iso(-40), updated_at: iso(-1) },
    { id: 115, seller_id: 4, title: 'Dried Mango Slices (200g)',        description: 'Chewy dried mango slices, no added sugar.', base_price: 180, category: 'food', image: '🥭', status: 'approved', created_at: iso(-38), updated_at: iso(-1) },
    { id: 116, seller_id: 5, title: 'Reed Diffuser Set',                description: 'Reed diffuser with a 100 ml essential oil blend.', base_price: 550, category: 'wellness', image: '🌿', status: 'approved', created_at: iso(-35), updated_at: iso(-1) },
    { id: 117, seller_id: 6, title: 'Woven Rattan Fan',                 description: 'Classic hand-woven rattan fan, lightweight.', base_price: 190, category: 'accessories', image: '🪭', status: 'approved', created_at: iso(-33), updated_at: iso(-1) },
    { id: 118, seller_id: 7, title: 'Logo Design Service',              description: '2 initial concepts, 2 revisions, final vector files.', base_price: 2500, category: 'services', image: '✒️', status: 'approved', created_at: iso(-30), updated_at: iso(-1) },
    /* Pending / flagged so the admin queue is populated */
    { id: 119, seller_id: 6, title: 'Beaded Bracelet (New Collection)', description: 'Newly listed bracelet awaiting compliance review.', base_price: 240, category: 'accessories', image: '📿', status: 'pending',  created_at: iso(-2),  updated_at: iso(-2) },
    { id: 120, seller_id: 5, title: 'Aromatherapy Roll-On',             description: 'Lavender roll-on, 10 ml. Awaiting label review.', base_price: 190, category: 'wellness',  image: '🧴', status: 'pending',  created_at: iso(-1),  updated_at: iso(-1) },
    { id: 121, seller_id: 4, title: 'Frozen Ube Halaya (500g)',         description: 'Fresh ube halaya. Flagged due to a cold-chain policy check.', base_price: 380, category: 'food',       image: '🍮', status: 'flagged',  created_at: iso(-4),  updated_at: iso(-3) }
  ];

  /* Variants: color + size + stock. SKU must be unique. */
  var product_variants = [
    { id: 1,  product_id: 101, color_name: 'Natural', size: 'One size', stock_qty: 12, sku_code: 'IM-101-NAT-OS' },
    { id: 2,  product_id: 101, color_name: 'Ebony',   size: 'One size', stock_qty: 5,  sku_code: 'IM-101-EBO-OS' },
    { id: 3,  product_id: 101, color_name: 'Ivory',   size: 'One size', stock_qty: 0,  sku_code: 'IM-101-IVO-OS' },

    { id: 4,  product_id: 102, color_name: 'Natural', size: 'Set of 4', stock_qty: 30, sku_code: 'IM-102-NAT-S4' },
    { id: 5,  product_id: 102, color_name: 'Charred', size: 'Set of 4', stock_qty: 18, sku_code: 'IM-102-CHR-S4' },

    { id: 6,  product_id: 103, color_name: 'Ruby',    size: '18x18',    stock_qty: 22, sku_code: 'IM-103-RUB-18' },
    { id: 7,  product_id: 103, color_name: 'Indigo',  size: '18x18',    stock_qty: 15, sku_code: 'IM-103-IND-18' },
    { id: 8,  product_id: 103, color_name: 'Emerald', size: '18x18',    stock_qty: 8,  sku_code: 'IM-103-EME-18' },

    { id: 9,  product_id: 104, color_name: 'Ruby',    size: '180cm',    stock_qty: 6,  sku_code: 'IM-104-RUB-180' },
    { id: 10, product_id: 104, color_name: 'Indigo',  size: '180cm',    stock_qty: 4,  sku_code: 'IM-104-IND-180' },

    { id: 11, product_id: 105, color_name: 'Classic', size: '12 pcs',   stock_qty: 40, sku_code: 'IM-105-CLA-12' },
    { id: 12, product_id: 105, color_name: 'Ube',     size: '12 pcs',   stock_qty: 20, sku_code: 'IM-105-UBE-12' },

    { id: 13, product_id: 106, color_name: 'Natural', size: '500g',     stock_qty: 55, sku_code: 'IM-106-NAT-500' },

    { id: 14, product_id: 107, color_name: 'Lavender',size: '8oz',      stock_qty: 25, sku_code: 'IM-107-LAV-8' },
    { id: 15, product_id: 107, color_name: 'Citrus',  size: '8oz',      stock_qty: 25, sku_code: 'IM-107-CIT-8' },
    { id: 16, product_id: 107, color_name: 'Lavender',size: '4oz',      stock_qty: 32, sku_code: 'IM-107-LAV-4' },

    { id: 17, product_id: 108, color_name: 'Lemongrass', size: '100g',  stock_qty: 60, sku_code: 'IM-108-LEM-100' },
    { id: 18, product_id: 108, color_name: 'Coconut',    size: '100g',  stock_qty: 60, sku_code: 'IM-108-COC-100' },

    { id: 19, product_id: 109, color_name: 'Turquoise', size: 'One size', stock_qty: 14, sku_code: 'IM-109-TUR-OS' },
    { id: 20, product_id: 109, color_name: 'Ruby',      size: 'One size', stock_qty: 3,  sku_code: 'IM-109-RUB-OS' },

    { id: 21, product_id: 110, color_name: 'Indigo',    size: 'One size', stock_qty: 10, sku_code: 'IM-110-IND-OS' },
    { id: 22, product_id: 110, color_name: 'Charcoal',  size: 'One size', stock_qty: 7,  sku_code: 'IM-110-CHA-OS' },

    { id: 23, product_id: 111, color_name: 'Service',   size: '60 sec',   stock_qty: 20, sku_code: 'IM-111-SVC-60' },
    { id: 24, product_id: 111, color_name: 'Service',   size: '120 sec',  stock_qty: 15, sku_code: 'IM-111-SVC-120' },

    { id: 25, product_id: 112, color_name: 'Service',   size: 'Bust',     stock_qty: 8,  sku_code: 'IM-112-SVC-B' },
    { id: 26, product_id: 112, color_name: 'Service',   size: 'Full body',stock_qty: 6,  sku_code: 'IM-112-SVC-F' },

    { id: 27, product_id: 113, color_name: 'Ivory',     size: 'One size', stock_qty: 9,  sku_code: 'IM-113-IVO-OS' },
    { id: 28, product_id: 113, color_name: 'Champagne', size: 'One size', stock_qty: 6,  sku_code: 'IM-113-CHA-OS' },

    { id: 29, product_id: 114, color_name: 'Natural',   size: '4-piece',  stock_qty: 35, sku_code: 'IM-114-NAT-4' },
    { id: 30, product_id: 115, color_name: 'Classic',   size: '200g',     stock_qty: 40, sku_code: 'IM-115-CLA-200' },

    { id: 31, product_id: 116, color_name: 'Lavender',  size: '100 ml',   stock_qty: 18, sku_code: 'IM-116-LAV-100' },
    { id: 32, product_id: 116, color_name: 'Sampaguita',size: '100 ml',   stock_qty: 12, sku_code: 'IM-116-SAM-100' },

    { id: 33, product_id: 117, color_name: 'Natural',   size: 'One size', stock_qty: 22, sku_code: 'IM-117-NAT-OS' },
    { id: 34, product_id: 118, color_name: 'Service',   size: 'Standard', stock_qty: 5,  sku_code: 'IM-118-SVC-STD' },
    { id: 35, product_id: 118, color_name: 'Service',   size: 'Premium',  stock_qty: 3,  sku_code: 'IM-118-SVC-PRE' },

    { id: 36, product_id: 119, color_name: 'Turquoise', size: 'One size', stock_qty: 12, sku_code: 'IM-119-TUR-OS' },
    { id: 37, product_id: 120, color_name: 'Lavender',  size: '10 ml',    stock_qty: 25, sku_code: 'IM-120-LAV-10' },
    { id: 38, product_id: 121, color_name: 'Classic',   size: '500g',     stock_qty: 10, sku_code: 'IM-121-CLA-500' }
  ];

  var orders = [
    { id: 5001, buyer_id: 10, total_amount: 1170, order_status: 'pending',    created_at: iso(0, -3) },
    { id: 5002, buyer_id: 11, total_amount: 780,  order_status: 'processing', created_at: iso(-1) },
    { id: 5003, buyer_id: 12, total_amount: 1450, order_status: 'shipped',    created_at: iso(-3) },
    { id: 5004, buyer_id: 10, total_amount: 350,  order_status: 'delivered',  created_at: iso(-7) },
    { id: 5005, buyer_id: 13, total_amount: 2100, order_status: 'delivered',  created_at: iso(-14) },
    { id: 5006, buyer_id: 14, total_amount: 550,  order_status: 'returned',   created_at: iso(-20) },
    { id: 5007, buyer_id: 15, total_amount: 480,  order_status: 'delivered',  created_at: iso(-9) },
    { id: 5008, buyer_id: 16, total_amount: 900,  order_status: 'processing', created_at: iso(-2) },
    { id: 5009, buyer_id: 17, total_amount: 260,  order_status: 'pending',    created_at: iso(0, -1) }
  ];

  var order_items = [
    { id: 1, order_id: 5001, product_id: 101, variant_id: 1,  quantity: 1, unit_price: 850 },
    { id: 2, order_id: 5001, product_id: 102, variant_id: 4,  quantity: 1, unit_price: 320 },

    { id: 3, order_id: 5002, product_id: 113, variant_id: 27, quantity: 1, unit_price: 780 },

    { id: 4, order_id: 5003, product_id: 104, variant_id: 9,  quantity: 1, unit_price: 1250 },
    { id: 5, order_id: 5003, product_id: 108, variant_id: 17, quantity: 2, unit_price: 100  },

    { id: 6, order_id: 5004, product_id: 107, variant_id: 14, quantity: 1, unit_price: 350 },

    { id: 7, order_id: 5005, product_id: 112, variant_id: 26, quantity: 1, unit_price: 1500 },
    { id: 8, order_id: 5005, product_id: 108, variant_id: 18, quantity: 5, unit_price: 120  },

    { id: 9, order_id: 5006, product_id: 116, variant_id: 31, quantity: 1, unit_price: 550 },

    { id: 10, order_id: 5007, product_id: 103, variant_id: 6, quantity: 1, unit_price: 480 },

    { id: 11, order_id: 5008, product_id: 111, variant_id: 23, quantity: 1, unit_price: 900 },

    { id: 12, order_id: 5009, product_id: 109, variant_id: 19, quantity: 1, unit_price: 260 }
  ];

  var product_reviews = [
    { id: 1, product_id: 101, buyer_id: 10, rating_score: 5, comment_text: 'Beautifully made, sturdy handles. Will buy again!', created_at: iso(-7) },
    { id: 2, product_id: 101, buyer_id: 12, rating_score: 4, comment_text: 'Very nice bag, arrived a day late but the quality is excellent.', created_at: iso(-14) },
    { id: 3, product_id: 107, buyer_id: 10, rating_score: 5, comment_text: 'Long burn time and the scent is soothing.', created_at: iso(-6) },
    { id: 4, product_id: 108, buyer_id: 13, rating_score: 5, comment_text: 'Skin feels great, will restock.', created_at: iso(-12) },
    { id: 5, product_id: 112, buyer_id: 13, rating_score: 4, comment_text: 'Artist was very accommodating, needed one revision.', created_at: iso(-10) },
    { id: 6, product_id: 103, buyer_id: 15, rating_score: 4, comment_text: 'Colors are vibrant. Matches my sofa well.', created_at: iso(-8) },
    { id: 7, product_id: 104, buyer_id: 12, rating_score: 5, comment_text: 'Truly heirloom quality.', created_at: iso(-4) },
    { id: 8, product_id: 116, buyer_id: 14, rating_score: 3, comment_text: 'Nice scent but arrived with a chipped bottle.', created_at: iso(-18) }
  ];

  var support_tickets = [
    { id: 9001, user_id: 10, subject: 'Order 5001 delivery ETA?',
      description_narrative: 'Hi, I ordered a tote bag and coasters. Any update on shipping?',
      ticket_status: 'open', priority_level: 'medium',
      assigned_to: null,
      responses: [
        { author_role: 'buyer', author_id: 10, message: 'Hi, I ordered a tote bag and coasters. Any update on shipping?', created_at: iso(0, -3) }
      ],
      created_at: iso(0, -3), updated_at: iso(0, -3) },

    { id: 9002, user_id: 12, subject: 'Refund on damaged diffuser',
      description_narrative: 'The bottle arrived cracked. Please assist.',
      ticket_status: 'in_progress', priority_level: 'high',
      assigned_to: 1,
      responses: [
        { author_role: 'buyer', author_id: 12, message: 'The bottle arrived cracked. Please assist.', created_at: iso(-18) },
        { author_role: 'admin', author_id: 1,  message: 'Escalating to the seller; a replacement will be scheduled.', created_at: iso(-17) }
      ],
      created_at: iso(-18), updated_at: iso(-17) },

    { id: 9003, user_id: 14, subject: 'How do I change my delivery address?',
      description_narrative: 'I placed order 5006 but need to update the address.',
      ticket_status: 'resolved', priority_level: 'low',
      assigned_to: 1,
      responses: [
        { author_role: 'buyer', author_id: 14, message: 'I placed order 5006 but need to update the address.', created_at: iso(-20) },
        { author_role: 'admin', author_id: 1,  message: 'Updated. Please confirm on the order page.', created_at: iso(-19) },
        { author_role: 'buyer', author_id: 14, message: 'Confirmed, thanks!', created_at: iso(-19) }
      ],
      created_at: iso(-20), updated_at: iso(-19) },

    { id: 9004, user_id: 2, subject: 'Seller: How to add a product variant?',
      description_narrative: 'I want to add a new color for the tote bag but cannot find the option.',
      ticket_status: 'open', priority_level: 'low',
      assigned_to: null,
      responses: [
        { author_role: 'seller', author_id: 2, message: 'I want to add a new color for the tote bag but cannot find the option.', created_at: iso(-1) }
      ],
      created_at: iso(-1), updated_at: iso(-1) }
  ];

  var consent_logs = [
    { id: 1, user_id: 10, action: 'account_created', consent: true, purpose: 'RA 10173 DPA registration consent', created_at: iso(-60) },
    { id: 2, user_id: 11, action: 'account_created', consent: true, purpose: 'RA 10173 DPA registration consent', created_at: iso(-50) },
    { id: 3, user_id: 12, action: 'account_created', consent: true, purpose: 'RA 10173 DPA registration consent', created_at: iso(-40) },
    { id: 4, user_id: 13, action: 'account_created', consent: true, purpose: 'RA 10173 DPA registration consent', created_at: iso(-38) },
    { id: 5, user_id: 14, action: 'account_created', consent: true, purpose: 'RA 10173 DPA registration consent', created_at: iso(-30) },
    { id: 6, user_id: 15, action: 'account_created', consent: true, purpose: 'RA 10173 DPA registration consent', created_at: iso(-20) },
    { id: 7, user_id: 16, action: 'account_created', consent: true, purpose: 'RA 10173 DPA registration consent', created_at: iso(-15) },
    { id: 8, user_id: 17, action: 'account_created', consent: true, purpose: 'RA 10173 DPA registration consent', created_at: iso(-10) }
  ];

  var audit_logs = [
    { id: 1, actor_id: 1,  actor_role: 'admin',  action: 'approved_product',   target: 'product:117', created_at: iso(-33) },
    { id: 2, actor_id: 1,  actor_role: 'admin',  action: 'resolved_ticket',    target: 'ticket:9003', created_at: iso(-19) },
    { id: 3, actor_id: 1,  actor_role: 'admin',  action: 'assigned_ticket',    target: 'ticket:9002', created_at: iso(-17) },
    { id: 4, actor_id: 2,  actor_role: 'seller', action: 'created_product',    target: 'product:119', created_at: iso(-2) },
    { id: 5, actor_id: 5,  actor_role: 'seller', action: 'created_product',    target: 'product:120', created_at: iso(-1) },
    { id: 6, actor_id: 10, actor_role: 'buyer',  action: 'placed_order',       target: 'order:5001',  created_at: iso(0, -3) },
    { id: 7, actor_id: 11, actor_role: 'buyer',  action: 'placed_order',       target: 'order:5002',  created_at: iso(-1) },
    { id: 8, actor_id: 1,  actor_role: 'admin',  action: 'flagged_product',    target: 'product:121', created_at: iso(-3) }
  ];

  /* Every product carries an empty images[] by default; real photos uploaded
     by the seller are pushed here as data URLs. When empty the UI falls back
     to a SVG placeholder generated from the emoji "art" field. */
  for (var pi = 0; pi < products.length; pi++) {
    if (!Array.isArray(products[pi].images)) products[pi].images = [];
  }

  /* Categories are metadata (not from the DDL), exposed as a helper collection. */
  global.INKLU_SEED = {
    _version: 3,
    categories: CATEGORIES,
    users: users,
    products: products,
    product_variants: product_variants,
    orders: orders,
    order_items: order_items,
    product_reviews: product_reviews,
    support_tickets: support_tickets,
    consent_logs: consent_logs,
    audit_logs: audit_logs
  };
})(window);
