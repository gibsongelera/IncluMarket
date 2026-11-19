import { Fragment } from "react";
import { emailParts } from "@/lib/format";

/**
 * An email address with line-break opportunities of its own: a <wbr> after
 * the "@" and before each ".", so a narrow column wraps "juan.cruz@gmail.com"
 * as "juan / .cruz@ / gmail / .com" rather than at any letter
 * ("juan.cr/uz@gm/ail.com" at 320px with 24px text). `overflow-wrap:
 * anywhere` stays the last resort for a part longer than the line.
 *
 * <wbr> adds no character, so the address reads, copies and selects the same.
 * Fragments, not spans: iOS VoiceOver can stop at every inline element's
 * edge. Takes any address, masked or not; no hooks, so it renders on the
 * server or in a client component alike.
 */
export function EmailText({ address }: { address: string | null | undefined }) {
  return (
    <>
      {emailParts(address).map((part, i) => (
        <Fragment key={i}>
          {i > 0 ? <wbr /> : null}
          {part}
        </Fragment>
      ))}
    </>
  );
}
