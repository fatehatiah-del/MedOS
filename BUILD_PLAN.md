# MedOS — BUILD_PLAN.md

## Purpose

This document defines the staged implementation plan for MedOS.

CLAUDE.md defines WHAT MedOS is.

BUILD_PLAN.md defines HOW development should proceed.

Do not attempt to implement the entire application in one pass.

Every phase has an acceptance gate.

A phase is not complete merely because UI exists.

Functionality must be tested.


# PHASE 0 — Repository & Engineering Foundation

## Goals

Create a maintainable foundation.

## Tasks

- Initialize repository/workspace.
- Configure TypeScript strict mode.
- Configure Next.js web application.
- Configure Tailwind.
- Configure reusable UI primitives.
- Configure linting.
- Configure formatting.
- Configure Vitest.
- Configure Playwright.
- Establish environment variable handling.
- Create packages/workspace structure.
- Add README.
- Add .env.example.
- Add CI-compatible scripts.

Suggested structure:

apps/web
apps/sync
packages/database
packages/ui
packages/parsers
packages/study-engine
packages/shared

## Acceptance Criteria

- development server runs
- production build succeeds
- typecheck succeeds
- lint succeeds
- unit test command succeeds
- Playwright smoke test succeeds
- no secrets committed


# PHASE 1 — Design System & Application Shell

## Goals

Establish the MedOS visual language before building feature pages.

## Tasks

Create:

- typography system
- spacing scale
- light theme
- dark theme
- theme switcher
- application sidebar
- top navigation
- responsive shell
- buttons
- cards
- dialogs
- dropdowns
- forms
- tabs
- progress indicators
- badges/status indicators
- loading skeletons
- empty states

Create placeholder routes:

/today
/courses
/calendar
/study-plan
/review
/question-bank
/flashcards
/search
/statistics
/settings

## Acceptance Criteria

- light and dark mode work
- preference persists
- keyboard navigation works
- desktop layout is polished
- responsive layout does not break
- no generic template branding remains
- visual style matches premium/minimal/academic direction


# PHASE 2 — Database Foundation

## Goals

Create stable core schema.

## Entities

User
Semester
Course
Week
Lecture
Resource

CalendarEvent
ExamEvent

LectureProgress
CourseProgress

StudySession

SyncFile

## Requirements

- user-scoped ownership
- course/week/lecture hierarchy
- multiple lectures per week
- resource provenance
- timestamps
- appropriate indexes
- migrations

Seed Semester 5:

Pathology I
Pathophysiology I
Medical Microbiology I
Pharmacology I
Public & Global Health
Communication Skills

## Acceptance Criteria

- migrations run from empty database
- seed is repeatable/idempotent
- multiple lectures can belong to same week
- database tests verify relationships


# PHASE 3 — Authentication & Privacy

## Goals

Protect MedOS.

## Tasks

Implement:

/login

Protected routes.

Session handling.

Logout.

User-scoped queries.

Private storage strategy.

Robots/no-index protections for private content.

## Acceptance Criteria

- unauthenticated users cannot access study content
- authenticated user can access application
- logout invalidates session
- private resource URLs are not publicly enumerable
- E2E auth tests pass


# PHASE 4 — Course / Week / Lecture System

## Goals

Build the academic content skeleton.

## Tasks

Course dashboard.

Week grouping.

Lecture cards.

Lecture workspace.

Manual lecture completion.

Resource indicators.

Example:

Week 4
├── Lecture 1
└── Lecture 2

## Acceptance Criteria

- six courses display
- weeks display correctly
- multiple lectures/week work
- lecture can be manually marked complete/incomplete
- completion is never automatic


# PHASE 5 — Local MedOS Sync CLI

## Goals

Import the user's S5 folder safely.

## Default source

C:\Users\fateh\Downloads\S5

Path must be configurable.

## CLI commands

medos-sync scan
medos-sync sync
medos-sync sync --dry-run
medos-sync status

## Tasks

Detect:

- course
- week
- lecture
- file type
- resource type

Calculate:

- hash
- relative path
- file size
- modified time

Avoid duplicate uploads.

Detect modifications.

Provide readable output.

## Acceptance Criteria

- recursive scanning works
- w1/w2/etc detected
- all six course folder aliases can be mapped
- unchanged files skipped
- changed files detected
- dry-run changes nothing
- failures do not delete originals
- tests use fixture directories


# PHASE 6 — Parsing & Resource Pipeline

## Goals

Convert source resources into structured data.

## Parsers

DOCX
PDF metadata/resource registration
HTML MCQ
Question Bank DOCX

## Pipeline

identify
→ validate
→ parse
→ normalize
→ persist
→ index

## Acceptance Criteria

- original files remain available
- parsing failure preserves original
- parsed resources retain provenance
- malformed files produce useful errors


# PHASE 7 — Study Guide Reader

## Goals

Build a high-quality reading experience.

## Components

- table of contents
- semantic sections
- progress tracking
- Big Picture
- Learning Objectives
- Key Concepts
- Tables
- Clinical Links
- Exam Traps
- Memory Hooks
- Exam Snapshots
- Golden Points
- Summary

## Interactions

Text selection:
- Highlight
- Add Note
- Bookmark
- Review Later
- Create Flashcard

## Acceptance Criteria

- DOCX guide renders structurally
- table of contents navigation works
- semantic callouts are visually distinct
- annotations persist
- reload preserves state


# PHASE 8 — Original Lecture Viewer

## Goals

Preserve access to authoritative source lecture.

## Features

- PDF viewer
- page navigation
- zoom
- fullscreen
- page bookmark
- page note
- lazy rendering

Prepare architecture for future Study Guide ↔ slide links.

## Acceptance Criteria

- large PDF does not render all pages immediately
- page navigation works
- notes/bookmarks persist
- resource remains private


# PHASE 9 — MCQ Engine

## Goals

Implement serious question practice.

## Data

Question
Options
Answer
Explanation
Wrong-answer explanations
Topic
Question type
Source
Tags

## Modes

Learn
Exam
USMLE

## Learn

Immediate feedback.

## Exam

No feedback until submission.

Timer.

Navigator.

Flagging.

## USMLE

Filter/prioritize imported vignette/application questions.

## Acceptance Criteria

- imported quiz questions render correctly
- Learn Mode feedback works
- Exam Mode hides feedback
- Exam submission produces results
- USMLE filtering works
- attempts persist
- repeat attempts remain separate records


# PHASE 10 — Question Bank / Active Recall

## Goals

Create active recall separate from MCQ.

## Flow

Question
→ optional typed answer
→ Reveal
→ model/source answer
→ Again / Hard / Good / Easy

## Acceptance Criteria

- answer can be revealed without typing
- ratings persist
- attempt history persists
- course/lecture provenance preserved


# PHASE 11 — Flashcards & FSRS

## Goals

Make flashcards integral.

## Features

- course-specific decks
- lecture decks
- manual card creation
- edit card
- delete with confirmation
- create from Study Guide selection
- review session
- FSRS scheduling
- Again / Hard / Good / Easy

## Important

Do not mix courses by default.

## Acceptance Criteria

- manual cards work
- Study Guide → card works
- scheduling persists
- due cards calculated correctly
- course-specific review works
- review history retained


# PHASE 12 — Notes, Highlights, Bookmarks & Review Later

Some foundations exist from Phase 7.

Complete unified system.

## Requirements

All annotations must retain:

- user
- course
- lecture
- resource
- target/location
- timestamps

Review Later supports multiple target types.

## Acceptance Criteria

- global annotation pages work
- source can be reopened from annotation
- deletion/editing works
- no orphaned annotation behavior


# PHASE 13 — Study Timer

## Goals

Track actual study behavior.

## Features

Start
Pause
Resume
Finish

Context:

Course
Lecture
Activity

Prevent obvious duplicate simultaneous timers.

Handle accidental page navigation.

## Acceptance Criteria

- active time excludes paused periods
- session persists
- statistics update
- refresh does not silently lose session


# PHASE 14 — Calendar & Academic Schedule

## Goals

Integrate university life with studying.

## Views

Day
Week
Month
Semester

## Event types

Lecture
Lab
Midterm
Exam
Holiday
Academic Deadline
Study Session
Revision
Assignment
Personal

## Initial academic information

Fall:
28 Sep 2026 – 29 Jan 2027

Midterms:
12–18 Nov 2026

Finals:
18–29 Jan 2027

Import Group A timetable only.

Exact course exam dates manually editable.

## Acceptance Criteria

- Group A labs shown
- other groups excluded
- shared lectures shown
- academic periods visible
- user events editable
- course exams manually addable


# PHASE 15 — Study Planner

## Goals

Generate useful but editable recommendations.

## Defaults

Weekday:
150 minutes

Weekend:
240 minutes

## Signals

- today's lectures
- unfinished lectures
- reviews due
- flashcards due
- weak topics
- incorrect MCQs
- Question Bank ratings
- exam urgency
- available study time

## User controls

- drag
- reorder
- edit duration
- remove
- add
- postpone

## Acceptance Criteria

- plan fits configured daily availability
- recommendations are deterministic/explainable
- manual edits persist
- user can completely override generated plan


# PHASE 16 — Weakness Engine & Analytics

## Goals

Turn activity data into useful feedback.

## Weakness signals

- MCQ errors
- topic accuracy
- repeated errors
- flashcard lapses
- Question Bank ratings
- Review Later
- manually difficult concepts

## Views

Lecture statistics
Course statistics
Semester statistics

## Charts

Use only where they add comprehension.

## Acceptance Criteria

- metrics derive from real data
- empty datasets handled gracefully
- weak-topic explanation exposes underlying signals
- no arbitrary AI-generated mastery score


# PHASE 17 — Search

## Goals

Search entire study environment.

## Search

Courses
Lectures
Study Guide
MCQ
Question Bank
Flashcards
Notes
Bookmarks

Keyboard shortcut:
Ctrl+K

## Acceptance Criteria

- results return quickly
- result type clearly shown
- course/lecture context shown
- clicking result navigates to source


# PHASE 18 — Gamification

## Features

- study streak
- weekly target
- study hours
- questions answered
- flashcards mastered
- retention
- course completion

## Rules

Restrained.

No childish UI.

## Acceptance Criteria

- streak logic tested
- weekly target respects configured availability
- metrics derive from real sessions/activity


# PHASE 19 — AI-Ready Interfaces

## Goals

Prepare future capability without enabling fake AI.

Create AIProvider interface.

Default:
None

Display disabled controls where appropriate:

Ask MedOS
Explain This
Generate Flashcards
Generate USMLE Questions
Generate Study Guide

## Acceptance Criteria

- application works completely with AI_PROVIDER=none
- no external AI call occurs
- disabled UI clearly communicates unavailable state
- future provider can be added without rewriting feature pages


# PHASE 20 — Export / Backup

## Export

JSON
CSV
Markdown where appropriate

Export:

notes
highlights
bookmarks
flashcards
question attempts
progress
study sessions
calendar

Prepare schema for future Anki interoperability.

## Acceptance Criteria

- export contains provenance
- exported data can be parsed
- no hidden dependency on proprietary format


# PHASE 21 — Final Integration & UX Pass

## Goals

Make MedOS coherent.

Test complete workflow:

Login
→ Today
→ Course
→ Week
→ Lecture
→ Study Guide
→ annotation
→ flashcard
→ MCQ
→ Question Bank
→ timer
→ completion
→ planner
→ statistics

Review:

- typography
- spacing
- dark mode
- loading states
- errors
- empty states
- keyboard navigation
- responsiveness

## Acceptance Criteria

All critical E2E flows pass.


# PHASE 22 — Deployment Readiness

## Goals

Vercel-ready but provider-independent.

## Tasks

- production environment validation
- database migration process
- secure environment variables
- storage configuration
- authentication callback configuration
- CSP/security headers
- private resource verification
- production build
- deployment documentation
- backup documentation

## Acceptance Criteria

- production build succeeds
- deployment documented
- no Vercel-only dependency unless optional
- environment variables documented
- security checklist complete


# Definition of Done

MedOS V1 is complete when the user can:

1. Sign in securely.
2. See today's university schedule.
3. See an automatically recommended editable study plan.
4. Open all six courses.
5. Navigate course → week → lecture.
6. Support multiple lectures per week.
7. Sync material from the S5 folder.
8. Read structured Study Guides.
9. Open original lecture PDFs.
10. Highlight and annotate material.
11. Bookmark and mark Review Later.
12. Create flashcards.
13. Review flashcards with FSRS.
14. Complete MCQs in Learn, Exam and USMLE modes.
15. Practice Question Bank active recall.
16. Track study time.
17. Manually mark lectures complete.
18. Use Group A timetable/calendar.
19. Add exact exam dates.
20. View useful performance statistics.
21. Identify weak topics.
22. Search the study library.
23. Use light/dark themes.
24. Export important personal study data.
25. Use the application without any AI provider.