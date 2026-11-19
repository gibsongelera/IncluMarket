# "Before" screenshots — client revision v3

Captured on 2026-10-09, before any client-revision change, from `npm run dev`
on `http://localhost:3000`.

| Page | 375 | 768 | 1280 |
|---|---|---|---|
| `/home` | `home-375.jpg` | `home-768.png` | `home-1280.png` |
| `/login` | `login-375.jpg` | `login-768.png` | `login-1280.png` |
| `/contact` | `contact-375.jpg` | `contact-768.png` | `contact-1280.png` |
| `/about` | — | `about-768.png` | `about-1280.png` |
| `/faq` | — | `faq-768.png` | `faq-1280.png` |
| `/accessibility` | — | `accessibility-768.png` | `accessibility-1280.png` |
| `/buyer/product/1` (missing product) | `product-missing-375.jpg` | `product-missing-768.png` | `product-missing-1280.png` |
| unknown URL (404) | `404-375.jpg` | `404-768.png` | `404-1280.png` |

How they were taken:

- **768 and 1280** — headless Microsoft Edge (`--window-size`).
- **375** — the Claude browser pane emulating a real 375×812 viewport. Headless
  Edge clamps its window to ~500px, so its "375" captures were discarded.

What they show (and why the catalog is empty):

- The Supabase project host did not resolve at capture time, so every page
  that reads data renders an **empty store** ("All Items 0", "0 results").
  The live Vercel site showed the same. See baseline finding B-00.
- `/buyer/product/1` answers HTTP 200 with "Product not found" (soft 404).
- Unknown URLs show Next.js's unstyled default 404.

Not captured: buyer, seller and admin pages. They need a signed-in session
against a reachable database, and are to be captured as soon as the project is
restored (plan step S0-04), before the S1+ changes are accepted.
