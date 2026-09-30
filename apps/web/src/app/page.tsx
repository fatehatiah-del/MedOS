import { COURSES, CURRENT_SEMESTER } from "@medos/shared";
import { Button } from "@medos/ui";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 px-6">
      <h1 className="font-serif text-4xl font-medium tracking-tight">MedOS</h1>
      <p className="text-fg-muted">
        Engineering foundation ready for {CURRENT_SEMESTER.label} · {CURRENT_SEMESTER.name} with{" "}
        {COURSES.length} courses.
      </p>
      <div>
        <Button variant="primary" disabled>
          Application shell arrives in Phase 1
        </Button>
      </div>
    </main>
  );
}
