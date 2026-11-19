/**
 * The values an admin may change on Admin → Settings (C-40), with their
 * bounds. Pure data — the settings page shows it, the action enforces it, and
 * a key not listed here cannot be written. Defaults match the seeds in
 * migrations 0014, 0017 and 0020, which the database functions also fall back
 * to.
 */

export interface SettingSpec {
  key: string;
  label: string;
  unit: string;
  help: string;
  min: number;
  max: number;
  default: number;
  group: "Orders" | "PWD verification" | "Seller payouts";
}

export const SETTING_SPECS: SettingSpec[] = [
  {
    key: "return_window_days",
    label: "Return window",
    unit: "days after delivery",
    help: "How long a buyer can ask to return an order.",
    min: 0,
    max: 60,
    default: 7,
    group: "Orders",
  },
  {
    key: "payment_hold_minutes",
    label: "Unpaid online order hold",
    unit: "minutes",
    help: "How long an unpaid online order keeps its items reserved before it is cancelled.",
    min: 15,
    max: 1440,
    default: 60,
    group: "Orders",
  },
  {
    key: "pwd_review_target_days",
    label: "Review turnaround we promise",
    unit: "business days",
    help: "Shown to people who submit their PWD ID.",
    min: 1,
    max: 30,
    default: 2,
    group: "PWD verification",
  },
  {
    key: "pwd_id_retention_days",
    label: "Keep ID photos for",
    unit: "days after the decision",
    help: "ID photos are deleted after this. The privacy policy states this number.",
    min: 1,
    max: 365,
    default: 30,
    group: "PWD verification",
  },
  {
    key: "pwd_renewal_reminder_days",
    label: "Renewal reminder",
    unit: "days before the ID expires",
    help: "When we remind someone that their PWD ID is about to expire.",
    min: 1,
    max: 120,
    default: 30,
    group: "PWD verification",
  },
  {
    key: "seller_verification_grace_days",
    label: "Grace period for existing sellers",
    unit: "days",
    help: "How long sellers who joined before verification keep selling while they get verified.",
    min: 0,
    max: 180,
    default: 30,
    group: "PWD verification",
  },
  {
    key: "platform_fee_percent",
    label: "Platform fee",
    unit: "% of online sales",
    help: "Taken from seller earnings. 0 means sellers keep everything.",
    min: 0,
    max: 30,
    default: 0,
    group: "Seller payouts",
  },
  {
    key: "payout_min_amount",
    label: "Smallest payout",
    unit: "pesos",
    help: "Sellers can ask for a payout once their balance reaches this.",
    min: 0,
    max: 100000,
    default: 100,
    group: "Seller payouts",
  },
];

export function settingSpec(key: string): SettingSpec | undefined {
  return SETTING_SPECS.find((s) => s.key === key);
}
