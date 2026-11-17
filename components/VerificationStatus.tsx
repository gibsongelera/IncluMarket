import Link from "next/link";
import { formatDate } from "@/lib/format";
import { maskPwdId } from "@/lib/pwd/id-number";
import type { MyVerificationLite } from "@/lib/pwd/data";

/**
 * Where a person stands with PWD verification, in words. Used on the account
 * overview (compact) and the verification page. Status is always stated in
 * text; the badge and colour only repeat it.
 */
export function VerificationStatus({
  my,
  role,
  compact = false,
  headingLevel = 2,
}: {
  my: MyVerificationLite;
  role: "buyer" | "seller";
  compact?: boolean;
  /** 3 where the card sits under a section's own h2 (the buyer dashboard). */
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 3 ? "h3" : "h2";
  // Under a section's own h2 the card is part of that region, not a second
  // named region inside it.
  const nested = headingLevel === 3;
  const why =
    role === "seller"
      ? "Verified sellers' listings appear in the shop with a Verified PWD seller badge."
      : "Verified buyers get PWD discounts on items where one applies.";

  let title: string;
  let tone: "success" | "info" | "warning" | "danger";
  const body: React.ReactNode[] = [];

  switch (my.state) {
    case "unavailable":
      title = "PWD verification is not switched on yet";
      tone = "info";
      body.push(<p key="u">We are finishing this feature. Please check back soon.</p>);
      break;
    case "verified": {
      const a = my.active!;
      title = "You are a verified PWD";
      tone = "success";
      body.push(
        <p key="v">
          {a.method === "avrc_in_person" ? (
            <>Verified in person by AVRC Region IX staff.</>
          ) : (
            <>
              PWD ID <span className="mono">{maskPwdId(a.last4)}</span>
              {a.expiresOn ? <> · valid until {formatDate(a.expiresOn)}</> : null}
            </>
          )}
        </p>
      );
      if (my.pending) {
        body.push(<p key="p">We are reviewing your renewed ID. You stay verified while we do.</p>);
      } else if (my.renewalDue && my.daysLeft !== null) {
        body.push(
          <p key="r">
            <strong>
              Your ID expires in {my.daysLeft} day{my.daysLeft === 1 ? "" : "s"}.
            </strong>{" "}
            Renew it at your PDAO, then send us the new ID so you stay verified.
          </p>
        );
      }
      break;
    }
    case "submitted":
      title = "We are reviewing your PWD ID";
      tone = "info";
      body.push(
        <p key="s">
          Sent on {formatDate(my.pending!.submittedAt)}. Reviews usually take up to{" "}
          {my.settings.pwd_review_target_days} business days. We will tell you here and by email.
        </p>
      );
      break;
    case "rejected":
      title = "We could not verify your ID";
      tone = "warning";
      body.push(
        <p key="r">
          <strong>Reason:</strong> {my.latest?.reasonLabel}
          {my.latest?.reasonText ? <> — {my.latest.reasonText}</> : null}
        </p>,
        <p key="n">You can send your ID again{compact ? " from the PWD verification page" : " below"}.</p>
      );
      break;
    case "revoked":
      title = "Your verification was withdrawn";
      tone = "danger";
      body.push(
        my.latest?.revokeReason ? (
          <p key="r">
            <strong>Reason:</strong> {my.latest.revokeReason}
          </p>
        ) : null,
        <p key="n">
          If you think this is a mistake, <Link href="/contact">contact us</Link>. You can also send your ID
          again{compact ? "" : " below"}.
        </p>
      );
      break;
    case "expired":
      title = "Your verification has expired";
      tone = "warning";
      body.push(<p key="e">Send us your renewed PWD ID to be verified again.</p>);
      break;
    default:
      title = "You are not verified yet";
      tone = "info";
      body.push(<p key="w">{why}</p>);
  }

  if (role === "seller" && my.state !== "verified" && my.state !== "unavailable") {
    body.push(
      my.graceUntil ? (
        <p key="g">
          Your listings stay in the shop until <strong>{formatDate(my.graceUntil)}</strong> while you get
          verified.
        </p>
      ) : (
        <p key="g">
          <strong>Your listings are hidden from the shop until you are verified.</strong>
        </p>
      )
    );
  }

  const content = (
    <>
      <Heading id="verification-status-title" className="verification-status__title">
        {title}
      </Heading>
      {body}
      {compact && my.state !== "unavailable" ? (
        <p>
          <Link href="/account/verification" className="btn btn--outline btn--sm">
            {my.canSubmit ? "Verify my PWD ID" : "View PWD verification"}
          </Link>
        </p>
      ) : null}
    </>
  );
  return nested ? (
    <div className={`notice notice--${tone} verification-status`}>{content}</div>
  ) : (
    <section className={`notice notice--${tone} verification-status`} aria-labelledby="verification-status-title">
      {content}
    </section>
  );
}
