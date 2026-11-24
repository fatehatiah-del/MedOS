# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Primary (in-app):** medical students working through a semester: following lectures,
  reading study guides, drilling MCQs and flashcards, and preparing for exams. Main device is a
  Windows laptop; phone and tablet are secondary.
- **Primary (welcome page):** any medical student meeting MedOS for the first time and deciding
  whether to sign up. First rollout target is the owner's Year 3 cohort (100+ students at the
  same university, same courses and Blackboard material).
- **Owner:** one student who builds MedOS and publishes course material weekly from Blackboard
  through the bb-pipeline.

## Product Purpose

MedOS is a medical-school study operating system. It organises the whole semester around the
learning cycle: timetable → lecture → original material → structured Study Guide → MCQs →
active recall → flashcards with spaced repetition → weak-spot detection → revision → exam.

Central principle: **"Documents are inputs. Learning is the product."**

Success: a student opens MedOS, knows what to study today, and moves each lecture from exposure
to mastery without managing files.

## Positioning

Not a generic LMS, note app, file store or SaaS dashboard. MedOS arrives with each course's
material already structured into a learning cycle per lecture (original slides, study guide,
quiz, question bank, flashcards, notebook), and ties it to the student's real timetable, a
study plan and FSRS spaced review, so a student never builds a study system from scratch.

## Operating Context

- Courses → weeks → lectures; each lecture holds Original Lecture, Study Guide, MCQ (Learn /
  Exam / USMLE modes), Question Bank, flashcards and a Notebook.
- Global surfaces: Today, Calendar (Group A timetable, academic dates, exams), Study Plan,
  Flashcards (FSRS review), Question Bank, Review (notes, highlights, bookmarks, Review Later),
  Notebooks, Search, Statistics (weak spots), Settings, study timer, Ask AI (Gemini), Export
  (incl. Anki).
- Long study sessions, often at night; light and dark themes are both required.

## Capabilities and Constraints

- Stack: npm workspaces, Next.js 16 (`apps/web`), Better Auth, Postgres (PGlite locally),
  S3-compatible storage, deployed on Vercel from `main`.
- **Sign-up becomes open to anyone** (was allowlist-only). Methods: email + password, and
  Google when configured.
- **New accounts receive the owner's course material automatically on sign-up** (mirror: the
  material only, never the owner's study data). Material published later reaches them too.
- **Monetisation is planned.** Owner's pricing (2026-11-25): **30 days free, then €9.99 per
  month**. The welcome page shows it; there is no checkout or trial enforcement yet, so copy
  must not imply billing is live.
- OPEN (owner's decision): permission to redistribute university lecture material to students,
  especially for payment.
- Gamification stays restrained: streak, weekly target, counts. No badges, no confetti.
- Existing functionality, routes and data must keep working through any redesign.

## Brand Commitments

- Name: **MedOS**. Tagline-level truth: "Documents are inputs. Learning is the product."
- The previous "Apple-inspired, calm" direction is no longer binding.
- **Standing preference (2026-11-25):** after seeing two rounds of unconventional directions,
  the owner chose the category standard on purpose: a clean, modern study-app look, executed
  at full craft. Quality bar: **Linear, Notion, Amboss/UWorld**. Convention is the commitment;
  no smuggled quirk.
- No logo or brand assets exist yet.

## Evidence on Hand

- Real product: every screen listed above, running on real course material (Pathophysiology,
  Pathology, Microbiology, etc.); real screenshots can be captured from the app.
- No testimonials, user counts, university endorsements or outcome statistics exist. Do not
  fabricate any.

## Product Principles

1. Learning over files: every surface moves the student one step along the cycle.
2. Arrive ready: material is already structured; the student studies instead of organising.
3. Honest progress: show real measures (retention, weak spots, hours), never vanity rewards.
4. Desktop-first depth, mobile that still works.

## Accessibility & Inclusion

Semantic HTML, keyboard access, visible focus, WCAG AA contrast in both themes (per CLAUDE.md
§41). Existing axe-core Playwright checks must keep passing.
