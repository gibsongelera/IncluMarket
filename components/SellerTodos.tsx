import Link from "next/link";

export interface TodoItem {
  label: string;
  count: number;
  href: string;
}

export interface SetupStep {
  label: string;
  done: boolean;
  href: string;
}

/**
 * Seller Centre: what needs doing now, each count linking to the filtered
 * list (C-31), and a getting-started checklist until the shop is set up.
 */
export function SellerTodos({ todos, setup }: { todos: TodoItem[]; setup: SetupStep[] }) {
  const open = todos.filter((t) => t.count > 0);
  const remaining = setup.filter((s) => !s.done).length;
  return (
    <div className="seller-todos">
      {remaining ? (
        <section className="card" aria-labelledby="setup-title">
          <h2 id="setup-title">Get your shop ready</h2>
          <p className="muted">
            {setup.length - remaining} of {setup.length} done
          </p>
          <ol className="setup-list">
            {setup.map((s) => (
              <li key={s.label} className={s.done ? "is-done" : undefined}>
                <span className="setup-list__mark" aria-hidden="true">
                  {s.done ? "✓" : ""}
                </span>
                {s.done ? (
                  <span>
                    {s.label}
                    <span className="sr-only"> (done)</span>
                  </span>
                ) : (
                  <Link href={s.href}>{s.label}</Link>
                )}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <section className="card" aria-labelledby="todo-title">
        <h2 id="todo-title">Things to do</h2>
        {open.length ? (
          <ul className="todo-list" role="list">
            {open.map((t) => (
              <li key={t.label}>
                <Link href={t.href} className="todo-list__item">
                  <strong className="todo-list__count">{t.count}</strong>
                  <span>{t.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p>Nothing waiting. New orders, returns and low stock will show up here.</p>
        )}
      </section>
    </div>
  );
}
