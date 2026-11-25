const EVENTS = [
  { day: "Mon", time: "10:40", name: "Pathophysiology", color: "#f8c28e" },
  { day: "Tue", time: "09:50", name: "Pharmacology", color: "#bcb9ff" },
  { day: "Wed", time: "11:30", name: "Public & Global Health", color: "#a7dce0" },
  { day: "Thu", time: "10:40", name: "Medical Microbiology", color: "#a8e1c5" },
  { day: "Fri", time: "10:40", name: "Pathology", color: "#f5b8cb" },
];

export function CalendarSample() {
  return (
    <div className="rounded-2xl border border-border bg-surface px-4 py-4 md:hidden">
      <p className="px-2 pb-3 text-sm font-semibold text-fg">Sample week</p>
      <ul className="divide-y divide-border border-t border-border">
        {EVENTS.map(({ day, time, name, color }) => (
          <li
            key={day}
            className="grid grid-cols-[2.25rem_1fr_auto] items-center gap-2 px-2 py-3 text-sm"
          >
            <span className="text-fg-muted">{day}</span>
            <span className="flex min-w-0 items-center gap-2 text-fg">
              <span
                aria-hidden="true"
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: color }}
              />
              {name}
            </span>
            <time className="text-fg-muted tabular-nums">{time}</time>
          </li>
        ))}
      </ul>
    </div>
  );
}
