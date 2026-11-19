import Link from "next/link";
import { Icon } from "./Icon";
import { KpiCard } from "./KpiCard";
import type { SellerTodoItem, SetupStep } from "@/lib/seller-analytics";

/** An icon per to-do, by lib/seller-analytics.ts SellerTodoItem key. Decoration: the words carry it. */
const TODO_ICON: Record<SellerTodoItem["key"], string> = {
  pending: "cart",
  processing: "truck",
  returns: "undo",
  lowStock: "box",
  flagged: "flag",
  reviews: "chat",
  messages: "message-circle",
};

/** An icon per setup step, by its words; a step this map does not know gets the arrow. */
const STEP_ICON: Record<string, string> = {
  "Verify your PWD ID": "shield",
  "Tell buyers your story": "message-circle",
  "Name your shop": "edit",
  "Add your first product": "plus",
  "Get a product approved": "box",
};

/** The to-do words start lower case, to follow a count ("3 orders to ship"); a tile's label starts with a capital. */
function sentence(words: string): string {
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** One setup step as a tile: a link while it is still to do, plain once done, its state in words either way. */
function Step({ step }: { step: SetupStep }) {
  const head = (
    <span className="kpi__head">
      <span className="kpi__label">{step.label}</span>
      <span className={`kpi__icon kpi__icon--${step.done ? "ok" : "blue"}`} aria-hidden="true">
        <Icon name={step.done ? "check" : (STEP_ICON[step.label] ?? "arrow-right")} />
      </span>
    </span>
  );
  // The space keeps the label and the state apart in the link's name
  // ("Name your shop Not done yet"); a flex container does not render it.
  return step.done ? (
    <div className="kpi kpi--step is-done">
      {head} <span className="kpi__status">Done</span>
    </div>
  ) : (
    <Link className="kpi kpi--step" href={step.href}>
      {head} <span className="kpi__status">Not done yet</span>
    </Link>
  );
}

/**
 * Seller Centre → Dashboard, what to fix first (C-31, 04 §2–§3): the
 * getting-started checklist until every step is done, then the to-do
 * counts, both in the dashboard's tile look (01 §6.1), as the admin
 * overview's "Needs attention" row.
 *
 * - The checklist stays an ordered list: "2 of 5 done" above it, each step
 *   a tile saying "Done" or "Not done yet" in words (the icon only repeats
 *   it). A step still to do links to where it is done; a done step does
 *   not. It goes away once all five are done. null (the products or the
 *   shop could not be read) says so rather than guessing.
 * - Every to-do is a queue KpiCard linking to its filtered list, with the
 *   brown bar while its count is above 0. A count that could not be read
 *   (null) shows "—" and says so: never 0, which would read as "nothing to
 *   do".
 */
export function SellerTodos({ todo, setup }: { todo: SellerTodoItem[]; setup: SetupStep[] | null }) {
  const done = setup ? setup.filter((s) => s.done).length : 0;
  const waiting = todo.filter((t) => (t.count ?? 0) > 0).length;
  const unread = todo.some((t) => t.count === null);
  const summary = waiting
    ? `${waiting} of these need${waiting === 1 ? "s" : ""} you now.`
    : unread
      ? "Nothing waiting in the counts that could be loaded."
      : "Nothing waiting right now. New orders, returns and low stock will show up here.";

  return (
    <>
      {setup === null || done < setup.length ? (
        <section aria-labelledby="setup-title">
          <div className="section-head">
            <h2 id="setup-title">Get your shop ready</h2>
          </div>
          {setup === null ? (
            <div className="empty">
              <p>
                <strong>Could not load this right now</strong>
              </p>
              <p>Try again in a moment.</p>
            </div>
          ) : (
            <>
              <p className="muted" id="setup-progress">
                {done} of {setup.length} done
              </p>
              {/* role="list": list-style none drops an <ol>'s list role in Safari. */}
              <ol className="kpis" role="list" aria-describedby="setup-progress">
                {setup.map((s) => (
                  <li key={s.label}>
                    <Step step={s} />
                  </li>
                ))}
              </ol>
            </>
          )}
        </section>
      ) : null}

      <section aria-labelledby="todo-title">
        <div className="section-head">
          <h2 id="todo-title">Things to do</h2>
        </div>
        <p className="muted">{summary}</p>
        <ul className="kpis" role="list">
          {todo.map((t) => (
            <li key={t.key}>
              <KpiCard
                label={sentence(t.label)}
                value={t.count}
                empty={t.count === null ? "Could not load this right now" : undefined}
                href={t.href}
                icon={TODO_ICON[t.key] ?? "bell"}
                queue
              />
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
