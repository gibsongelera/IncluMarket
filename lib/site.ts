/**
 * Who runs the site and how to reach them, defined once (C-41). Pure data —
 * safe in server and client components.
 *
 * Nothing here is invented: an email address, phone number or social link
 * shows only once it is set in the environment. Until then the pages offer
 * the contact form, and the footer shows no social icons (B-19, Q11).
 */

function url(value: string | undefined): string | null {
  const v = (value ?? "").trim();
  return /^https:\/\/[^\s]+$/.test(v) ? v : null;
}

function email(value: string | undefined): string | null {
  const v = (value ?? "").trim();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) && !/\.example$/i.test(v) ? v : null;
}

/** A tel: link only for a value that is a phone number, not office hours. */
function tel(value: string | null): string | null {
  return value && /^\+?[\d\s()-]+$/.test(value) && (value.match(/\d/g) ?? []).length >= 7
    ? `tel:${value.replace(/[\s()-]/g, "")}`
    : null;
}

const contactPhone = (process.env.NEXT_PUBLIC_CONTACT_PHONE ?? "").trim() || null;

export const SITE = {
  name: "InclusiveMarket",
  tagline: "Products made by PWD trainees of AVRC Region IX",
  operator: "AVRC Region IX",
  region: "the Zamboanga Peninsula, Philippines",
  ecosystem: "InkluTrack",
  /** Public contact address, when the operator has confirmed one. */
  contactEmail: email(process.env.NEXT_PUBLIC_CONTACT_EMAIL),
  /** Phone or office hours, when confirmed. */
  contactPhone,
  /** tel: link for contactPhone, or null when it is not a dialable number. */
  contactPhoneHref: tel(contactPhone),
  /** Postal address of the center, when confirmed. */
  contactAddress: (process.env.NEXT_PUBLIC_CONTACT_ADDRESS ?? "").trim() || null,
  /** Whose profiles the social links are: one name everywhere they appear. */
  socialName: "AVRC III",
  social: {
    facebook: url(process.env.NEXT_PUBLIC_FACEBOOK_URL),
    instagram: url(process.env.NEXT_PUBLIC_INSTAGRAM_URL),
  },
  /**
   * Who buyers pay when they pay over the counter (migration 0028): the
   * Workshop runs the shop's counter accounts and pays sellers out.
   */
  workshop: {
    name: "Rehabilitation Sheltered Workshop",
    under: "AVRC III, DSWD Field Office IX",
  },
  /** The DSWD center whose trainees sell here, and its official marks. */
  partner: {
    name: "Area Vocational Rehabilitation Center III (AVRC III)",
    office: "DSWD Field Office IX – Zamboanga Peninsula",
    website: url(process.env.NEXT_PUBLIC_DSWD_WEBSITE_URL),
    facebook: url(process.env.NEXT_PUBLIC_DSWD_FACEBOOK_URL),
    logos: [
      // No alt: the office's name is the visible line beside it.
      { src: "/assets/img/partners/dswd-fo9.png", alt: "", width: 190, height: 270 },
      { src: "/assets/img/partners/crcf.png", alt: "DSWD Centers and Residential Care Facilities", width: 620, height: 218 },
    ],
  },
} as const;

/** Topics on the contact form; the inbox (im_contact_messages) allows these. */
export const CONTACT_TOPICS = [
  { id: "question", label: "A question about the shop" },
  { id: "order", label: "An order" },
  { id: "selling", label: "Selling here" },
  { id: "accessibility", label: "Something hard to use (accessibility)" },
  { id: "privacy", label: "My personal data" },
  { id: "other", label: "Something else" },
] as const;

export type ContactTopic = (typeof CONTACT_TOPICS)[number]["id"];

/** How long contact messages are kept (Q22). */
export const CONTACT_RETENTION_DAYS = 365;
