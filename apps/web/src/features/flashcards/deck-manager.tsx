"use client";

import { Button } from "@medos/ui";
import { Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  addDeck,
  addFlashcard,
  deleteFlashcard,
  editFlashcard,
  openDeckForLecture,
} from "./actions";
import { CardEditor } from "./card-editor";

/*
 * Managing cards in a deck: adding, editing, and deleting with confirmation,
 * plus small controls to make a course deck or open a lecture's deck.
 */

export interface DeckCard {
  id: string;
  front: string;
  back: string;
  origin: "manual" | "study-guide";
  /** Where a card made from a Study Guide came from, and the label to show. */
  source: { href: string; quote: string } | null;
  dueLabel: string;
}

export function AddCard({ deckId }: { deckId: string }) {
  return <CardEditor submitLabel="Add card" onSave={(card) => addFlashcard({ deckId, ...card })} />;
}

export function CardList({ cards }: { cards: readonly DeckCard[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (cards.length === 0) {
    return <p className="text-sm text-fg-muted">No cards yet.</p>;
  }

  return (
    <>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
        {cards.map((card) => (
          <li key={card.id} className="space-y-2 px-4 py-3">
            {editing === card.id ? (
              <CardEditor
                initialFront={card.front}
                initialBack={card.back}
                submitLabel="Save card"
                onSave={(text) => editFlashcard({ cardId: card.id, ...text })}
                onCancel={() => setEditing(null)}
                onSaved={() => setEditing(null)}
              />
            ) : (
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="text-[15px] font-medium whitespace-pre-wrap text-fg">
                    {card.front}
                  </p>
                  <p className="text-[14px] whitespace-pre-wrap text-fg-muted">{card.back}</p>
                  <p className="flex flex-wrap gap-x-2 text-[12px] text-fg-subtle">
                    <span>{card.dueLabel}</span>
                    {card.source ? (
                      <Link href={card.source.href} className="text-accent hover:underline">
                        From the Study Guide
                      </Link>
                    ) : null}
                  </p>
                </div>
                <div className="flex shrink-0 items-center">
                  <button
                    type="button"
                    aria-label={`Edit card: ${card.front.slice(0, 60)}`}
                    onClick={() => setEditing(card.id)}
                    className="flex size-8 items-center justify-center rounded-md text-fg-subtle hover:bg-hover hover:text-fg"
                  >
                    <Pencil aria-hidden="true" className="size-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete card: ${card.front.slice(0, 60)}`}
                    aria-disabled={pending || undefined}
                    onClick={() => {
                      if (
                        pending ||
                        !window.confirm("Delete this card? Its review history is kept.")
                      ) {
                        return;
                      }
                      startTransition(async () => {
                        const result = await deleteFlashcard({ cardId: card.id });
                        setError(result.ok ? null : result.error);
                      });
                    }}
                    className="flex size-8 items-center justify-center rounded-md text-fg-subtle hover:bg-hover hover:text-danger"
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

export function NewDeck({ courseId, courseName }: { courseId: string; courseName: string }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (pending) return;
        startTransition(async () => {
          const result = await addDeck({ courseId, name });
          if (result.ok) setName("");
          setError(result.ok ? null : result.error);
        });
      }}
    >
      <div className="space-y-1">
        <label htmlFor={`new-deck-${courseId}`} className="block text-[13px] font-medium text-fg">
          New deck for {courseName}
        </label>
        <input
          id={`new-deck-${courseId}`}
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={200}
          className="h-9 w-64 max-w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-fg focus:border-accent focus:outline-none"
        />
      </div>
      <Button type="submit" variant="secondary" aria-disabled={pending || undefined}>
        Create deck
      </Button>
      {error ? (
        <p role="alert" className="w-full text-sm text-danger">
          {error}
        </p>
      ) : null}
    </form>
  );
}

/** Opens (and if needed creates) a lecture's own deck. */
export function OpenLectureDeck({
  lectureId,
  deckHref,
  label,
}: {
  lectureId: string;
  /** The deck page address with DECK in place of the deck id. */
  deckHref: string;
  label: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        aria-disabled={pending || undefined}
        onClick={() =>
          startTransition(async () => {
            const result = await openDeckForLecture({ lectureId });
            if (result.ok) router.push(deckHref.replace("DECK", result.value.deckId));
            else setError(result.error);
          })
        }
        className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-[13px] font-medium text-accent-fg transition-colors duration-150 hover:bg-accent-hover"
      >
        {label}
      </button>
      {error ? (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      ) : null}
    </>
  );
}
