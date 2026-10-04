# MedOS — Master Product & Engineering Specification

## 0. Purpose of this document

This file is the permanent source of truth for the MedOS project.

All implementation decisions must remain consistent with this specification unless the user explicitly changes a requirement.

Before making significant architectural changes:

1. Read this file.
2. Read BUILD_PLAN.md.
3. Inspect the existing implementation.
4. Preserve working functionality.
5. Prefer incremental changes over unnecessary rewrites.
6. Test the affected functionality.
7. Update documentation when architecture or behavior changes.

Do not reinterpret MedOS as a generic LMS, document manager, note-taking application, or SaaS dashboard.

MedOS is a personal medical-school study operating system.


# 1. Product Vision

MedOS organizes a medical student's entire semester around the learning cycle:

University schedule
→ Lecture
→ Original lecture material
→ Structured Study Guide
→ Understanding
→ MCQ testing
→ Active recall
→ Flashcards
→ Spaced repetition
→ Weakness detection
→ Revision
→ Exam preparation
→ Mastery

The central design principle is:

"Documents are inputs. Learning is the product."

Optimize MedOS around moving the student through:

Exposure
→ Understanding
→ Retrieval
→ Testing
→ Review
→ Mastery

Do not optimize primarily around file storage.


# 2. Primary User

Initial MedOS is a private single-user application.

Primary user:
Fateh

Academic context:

Institution:
European University Cyprus — Frankfurt Campus

Programme:
Medicine / MD

Academic year:
Year 3

Semester:
Semester 5 / Fall 2026

Group:
A

Fall semester:
28 September 2026 – 29 January 2027

Midterm period:
12 November 2026 – 18 November 2026

Final examination period:
18 January 2027 – 29 January 2027

Individual subject examination dates may be manually added when released.


# 3. Courses

Initial semester contains six separate courses:

1. Pathology I
2. Pathophysiology I
3. Medical Microbiology I
4. Pharmacology I
5. Public & Global Health
6. Communication Skills

Public & Global Health and Communication Skills are separate courses.

Each course is an independent learning environment.

Flashcard review must remain course-specific.

Never automatically mix flashcards from different courses into one review session.


# 4. Academic Hierarchy

The core hierarchy is:

Semester
└── Course
    └── Week
        └── Lecture
            ├── Study Guide
            ├── Original Lecture
            ├── MCQ
            ├── Question Bank
            ├── Flashcards
            ├── Notes
            ├── Highlights
            ├── Bookmarks
            ├── Review Later
            └── Performance

IMPORTANT:

A week can contain zero, one, or multiple lectures.

Never model:

week = lecture

Correct relationship:

Course
→ Week
→ 0..n Lectures


# 5. Existing Source Folder

The user's source material is approximately organized under:

C:\Users\fateh\Downloads\S5\

Typical pattern:

S5/
├── Pharma/
│   ├── w1/
│   ├── w2/
│   ├── w3/
│   └── ...
├── Pathology/
├── Pathophysiology/
├── Microbiology/
├── Public Health/
└── Communication Skills/

Future preferred convention for multiple lectures:

S5/
└── Pharma/
    └── w4/
        ├── lecture-1/
        │   ├── StudyGuide.docx
        │   ├── Quiz.html
        │   ├── QuestionBank.docx
        │   └── Lecture.pdf
        └── lecture-2/
            ├── StudyGuide.docx
            ├── Quiz.html
            ├── QuestionBank.docx
            └── Lecture.pdf

Do not require perfect filenames.

The importer should be tolerant of existing naming variations.


# 6. Resource Types

A lecture may contain:

- Study Guide
- Original lecture PDF/slides
- MCQ quiz
- Question Bank
- diagrams/images
- supplementary documents

Future resource types may be added without changing the fundamental lecture model.

Original source files must always be preserved.

Parsed/structured representations are derivatives and must never replace the original file.


# 7. Study Guide Philosophy

The user creates the completed Study Guide externally.

V1 must IMPORT the completed Study Guide.

V1 must NOT attempt to regenerate or rewrite the Study Guide with AI.

Future AI may generate Study Guides from original lecture material, but this is a V2 capability.

Study Guides should be transformed from DOCX into an interactive structured reading environment.


# 8. Study Guide Semantic Components

Where present, preserve semantic elements such as:

- Learning Objectives
- Big Picture
- Key Concepts
- Detailed Notes
- Tables
- Figures
- Important Facts
- Clinical Correlations / Clinical Links
- Exam Tips
- Exam Traps
- Memory Hooks
- How It's Tested
- Exam Snapshots
- Golden Points
- Summary

Do not flatten all Study Guide content into generic paragraphs.

Create reusable semantic components for these structures.


# 9. Study Guide Reader

Desktop layout should support:

LEFT:
Table of contents / section navigation

CENTER:
Structured Study Guide

RIGHT:
Context panel containing:
- reading progress
- bookmarks
- notes
- review-later items
- active timer/session information

Text selection actions:

- Highlight
- Add Note
- Bookmark
- Review Later
- Create Flashcard

Highlights must persist.

Notes must persist.

Bookmarks must persist.

Review Later must persist.


# 10. Original Lecture Viewer

Original lecture PDFs remain accessible.

Viewer should eventually support:

- previous page
- next page
- page number
- zoom
- fullscreen
- bookmark page
- note on page
- source linking

Where Study Guides reference original slides/pages, preserve enough provenance to support future direct links between Study Guide sections and original slides.


# 11. MCQ Engine

MedOS requires three MCQ modes.

## Learn Mode

After answering:

- immediately show correct/incorrect
- show correct answer
- show explanation
- show why incorrect options are incorrect when available
- show source/reference when available

## Exam Mode

- no immediate feedback
- timer
- question navigator
- flag question
- previous/next
- submit exam
- results only after submission

Results should include:

- total score
- percentage
- performance by topic
- performance by question type
- incorrect questions
- flagged questions
- time spent

## USMLE Mode

USMLE Mode should prioritize available questions tagged or identifiable as:

- vignette
- clinical
- mechanism
- consequence
- application

V1 should use existing imported questions.

Do NOT fabricate new medical questions without an explicitly configured AI provider.

Future AI may generate additional USMLE-style questions.


# 12. MCQ Data Model

Questions should support:

- question text
- topic
- question type
- options
- correct answer
- explanation
- explanations for wrong options
- source reference
- tags
- originating course
- originating lecture

Attempts should store:

- user
- question
- mode
- selected answer
- correctness
- time spent
- attempt number
- date/time
- flagged state


# 13. Question Bank

Question Bank is distinct from MCQ.

Purpose:
Active recall.

Typical interaction:

Question

[Optional answer field]

Reveal Answer

Model Answer

Self-rating:
- Again
- Hard
- Good
- Easy

Typing an answer must be optional.

A user should be able to think through the response and reveal the model answer.

Store attempt history and self-ratings.


# 14. Flashcards

Flashcards are a first-class subsystem.

They are not an optional add-on.

Flashcards belong to:

Course
→ Lecture/Week
→ Deck

Support:

- manually created cards
- cards created from selected Study Guide text
- future AI-generated candidate cards

V1 must support manual cards.

Text selection in Study Guide should support:

Create Flashcard

The application should prepopulate a proposed card when feasible, but the user must be able to edit it before saving.

Automatic AI card generation is a future capability and should remain disabled until AI is configured.


# 15. Flashcard Review

Use FSRS or a clean abstraction compatible with FSRS.

Ratings:

- Again
- Hard
- Good
- Easy

Persist appropriate scheduling data including:

- due date
- difficulty
- stability
- retrievability where applicable
- last review
- review count
- lapse count

Flashcard review sessions are COURSE-SPECIFIC.

Never create a default review session mixing Pharmacology, Pathology, Microbiology, etc.


# 16. Review Later

Review Later is separate from flashcards.

Possible Review Later targets:

- Study Guide paragraph
- section
- figure
- lecture page
- MCQ
- Question Bank question
- concept

Review Later should preserve source context.


# 17. Lecture Completion

Lecture completion is MANUAL.

Never automatically mark a lecture complete.

MedOS may display readiness indicators such as:

Study Guide: Read
MCQ: 85%
Question Bank: Complete
Flashcards: 78% reviewed

But only the user can activate:

"Mark Lecture Complete"


# 18. Dashboard

The dashboard's primary purpose is to answer:

1. What university activity do I have today?
2. What should I study today?
3. What is due or overdue?
4. How am I progressing?

Do not turn the dashboard into an analytics wall.

Priority order:

- today's university schedule
- recommended study plan
- today's progress
- due reviews
- course progress
- compact statistics


# 19. Study Planner

Default available study time:

Weekdays:
2.5 hours/day

Weekends:
4 hours/day

These values must be editable.

Study recommendations should consider:

- today's lectures
- unfinished lectures
- overdue review
- flashcards due
- weak MCQ topics
- repeatedly incorrect questions
- Question Bank performance
- exam proximity
- midterm proximity
- final exam proximity
- available study time
- recent workload

The recommendation engine should produce an editable daily plan.

The user must be able to:

- reorder items
- change duration
- delete
- add
- postpone
- manually override recommendations

Never punish the user for overriding a recommendation.


# 20. Planner Priority Model

V1 may use a deterministic weighted system.

Conceptually:

priority =
exam urgency
+ overdue review
+ weakness
+ incomplete lecture
+ flashcard due load
+ lecture recency

Keep the algorithm transparent and maintainable.

Do not use opaque AI for V1 planning.


# 21. Calendar

Views:

- Day
- Week
- Month
- Semester

Event types:

- Lecture
- Lab
- Exam
- Midterm
- Academic Deadline
- Holiday
- Study Session
- Revision
- Assignment
- Personal

University timetable events and user study sessions must be visually distinguishable.


# 22. Timetable

The supplied Semester 5 timetable contains shared lectures and section-specific labs.

The user is Group A.

Only Group A lab events should be imported for the user.

Do not import Group B–F labs into the user's active timetable.

Shared lectures should be imported normally.


# 23. Academic Calendar

Fall 2026:
28 September 2026 – 29 January 2027

Midterms:
12–18 November 2026

Winter holiday and other academic calendar periods should be represented.

Final exam period:
18–29 January 2027

Exact subject examination dates are manually entered when known.


# 24. Exam Planning

When a specific exam is added, MedOS should be capable of generating an editable revision plan based on:

- lectures in exam scope
- completion
- weak topics
- incorrect MCQs
- flagged MCQs
- Question Bank performance
- flashcards due
- available study time
- days remaining

Do not automatically infer exam scope unless explicitly configured.


# 25. Study Timer

Provide contextual study timing.

Starting a timer from a lecture should automatically associate:

- course
- lecture
- activity type

Activity examples:

- Study Guide
- MCQ
- Question Bank
- Flashcards
- Revision

Controls:

- Start
- Pause
- Resume
- Finish

Track ACTIVE study time.

Do not count idle browser-tab time as study time when avoidable.


# 26. Search

Provide global search.

Preferred keyboard shortcut:

Ctrl+K

Search across:

- courses
- lectures
- Study Guide content
- MCQs
- Question Bank
- flashcards
- notes
- bookmarks

Results must indicate source context.


# 27. Statistics

Statistics exist at:

## Lecture level

- completion
- study time
- MCQ accuracy
- Question Bank performance
- flashcard performance
- weak concepts

## Course level

- completion
- study hours
- MCQ accuracy
- performance by topic
- flashcard retention
- weak topics
- progress over time

## Semester level

- total study time
- weekly consistency
- course completion
- MCQ volume
- average accuracy
- study streak
- upcoming workload


# 28. Weakness Engine

Potential weakness signals:

- repeated MCQ errors
- low MCQ topic accuracy
- Question Bank Again/Hard ratings
- flashcard lapses
- Review Later flags
- manually marked difficult concepts

Weakness analysis should be evidence-based and transparent.

Example:

GPCR Signalling

MCQ accuracy: 58%
Flashcard lapses: 4
Review Later items: 3

Avoid presenting arbitrary "AI mastery scores" in V1.


# 29. Gamification

Gamification should be restrained and useful.

Allowed:

- study streak
- weekly study target
- course completion
- questions answered
- flashcards mastered
- study hours
- retention

Avoid:

- childish badges
- confetti everywhere
- excessive reward animations
- game-like visual clutter


# 30. AI Architecture

MedOS must be AI-ready but V1 must not depend on AI.

Provide an abstraction similar to:

interface AIProvider {
  summarizeLecture(...)
  generateFlashcards(...)
  generateMCQs(...)
  explainQuestion(...)
  analyzeWeaknesses(...)
  answerFromLecture(...)
}

Default provider:

None

AI-related UI may be visible but disabled:

- Ask MedOS
- Explain This
- Generate Flashcards
- Generate USMLE Questions
- Generate Study Guide

Label appropriately as:

Coming Soon

or

AI provider not configured


# 31. AI Provenance

Future AI-generated material must be visibly distinguishable from source-derived material.

Never silently present AI-generated medical content as if it came directly from the university lecture.

Maintain provenance.


# 32. Authentication & Privacy

MedOS is publicly reachable but login protected.

All study data is private.

Requirements:

- /login route
- protected application routes
- secure sessions
- no public course content
- no search-engine indexing of private content
- secure object storage
- user-scoped database access

Initial implementation may be single-user oriented while maintaining a clean user_id-based schema.


# 33. Local Sync Architecture

A hosted application cannot directly monitor:

C:\Users\fateh\Downloads\S5

Therefore create a separate local sync tool.

Architecture:

Local S5 folder
→ MedOS Sync
→ detect changes
→ parse/validate
→ upload metadata/resources
→ MedOS database/storage

The sync tool should:

- scan recursively
- detect course
- detect week
- detect lecture
- classify resources
- hash files
- avoid duplicate uploads
- identify changed files
- report errors clearly
- support dry-run
- support verbose output


# 34. Sync State

Store information such as:

- local relative path
- content hash
- size
- modified timestamp
- detected course
- detected week
- detected lecture
- resource type
- last synced
- remote resource ID
- sync status

Do not store machine-specific absolute paths as the sole identifier.


# 35. Import Pipeline

Conceptually:

File
→ Identify
→ Validate
→ Parse
→ Normalize
→ Store original
→ Store structured representation
→ Index
→ Render

Supported initial formats:

DOCX:
Study Guides / Question Banks

PDF:
Original lecture material

HTML:
Existing MCQ quizzes

Images:
Embedded/source media where relevant


# 36. Provenance

Every parsed or generated resource should preserve origin information.

Example:

Flashcard
→ Study Guide section
→ StudyGuide.docx
→ Lecture
→ Week
→ Course

MCQ
→ Quiz.html
→ Lecture
→ Week
→ Course

Traceability is important.


# 37. Export / Backup

Avoid data lock-in.

Design for export of:

- notes
- highlights
- bookmarks
- flashcards
- question history
- progress
- study sessions
- calendar

Preferred formats where appropriate:

- JSON
- CSV
- Markdown

Design flashcard data to permit future Anki import/export.


# 38. UI Design Direction

Style:

Apple-inspired
Premium
Minimal
Spacious
Academic
Calm

Do NOT directly clone Apple interfaces.

Avoid generic SaaS dashboard styling.

Characteristics:

- generous whitespace
- excellent typography
- subtle borders
- restrained shadows
- clear hierarchy
- smooth but subtle transitions
- high information clarity
- minimal visual noise


# 39. Light / Dark Themes

Required:

- Light
- Dark
- optionally System

Persist user preference.

Light:
- warm/off-white background
- white surfaces
- dark typography
- subtle borders

Dark:
- near-black background
- slightly elevated surfaces
- off-white typography
- muted borders

Ensure accessible contrast.


# 40. Responsive Design

Primary target:
Windows laptop

Desktop:
sidebar + main workspace + contextual panel where useful

Tablet:
collapsible navigation

Mobile:
simplified navigation and study experience

Do not compromise desktop functionality to force mobile parity.


# 41. Accessibility

Implement:

- semantic HTML
- keyboard navigation
- visible focus states
- accessible forms
- sufficient contrast
- appropriate ARIA only when necessary
- reduced-motion support where appropriate

MCQs and flashcards must be keyboard usable.


# 42. Preferred Technology Stack

Use unless a clearly superior reason is documented:

Frontend:
- Next.js
- React
- TypeScript

Styling:
- Tailwind CSS
- shadcn/ui or equivalent composable primitives

Database:
- PostgreSQL

Validation:
- Zod

Authentication:
- provider abstraction, initially Supabase-compatible

Storage:
- object-storage abstraction, initially Supabase/S3-compatible

Charts:
- Recharts

Testing:
- Vitest
- React Testing Library where useful
- Playwright

Flashcards:
- FSRS-compatible implementation


# 43. Hosting

MedOS must be:

VERCEL-READY

but

HOSTING-PROVIDER-INDEPENDENT.

Do not unnecessarily depend on proprietary Vercel-only APIs.

Use environment-based configuration.

Example:

DATABASE_URL
AUTH configuration
STORAGE configuration
AI_PROVIDER=none

Keep deployment adapters replaceable.


# 44. Suggested Repository Structure

Prefer a monorepo or clean workspace structure similar to:

medos/
├── apps/
│   ├── web/
│   └── sync/
├── packages/
│   ├── database/
│   ├── ui/
│   ├── parsers/
│   ├── study-engine/
│   ├── fsrs/
│   └── shared/
├── docs/
├── CLAUDE.md
├── BUILD_PLAN.md
└── README.md

Exact structure may evolve if justified.


# 45. Core Data Entities

At minimum consider:

User

Semester
Course
Week
Lecture

Resource
StudyGuide
StudySection

MCQQuestion
MCQOption
MCQAttempt

QuestionBankItem
QuestionBankAttempt

FlashcardDeck
Flashcard
FlashcardReview

Note
Highlight
Bookmark
ReviewLaterItem

StudySession

CalendarEvent
ExamEvent

DailyPlan
DailyPlanItem

LectureProgress
CourseProgress

SyncFile

Do not denormalize prematurely.


# 46. Performance

MedOS should feel fast.

Use:

- appropriate database indexes
- lazy loading
- PDF lazy rendering
- image optimization
- server-side pagination where useful
- efficient queries
- caching where safe
- skeleton loading
- optimistic UI where safe

Avoid excessive client-side global state.


# 47. Error Handling

Never fail silently.

Important operations must provide actionable feedback:

- sync
- import
- parsing
- authentication
- file upload
- MCQ submission
- flashcard save
- calendar changes

Preserve original source files even if parsing fails.


# 48. Medical Content Rule

Do not silently "correct" imported university content using model knowledge.

Imported source material is the authoritative content for the study workspace.

If future AI features provide additional explanation, clearly label the explanation as AI-generated and preserve the original source separately.


# 49. Development Principles

For every implementation phase:

1. Inspect current repository.
2. Read CLAUDE.md.
3. Read BUILD_PLAN.md.
4. Identify dependencies.
5. Write/adjust tests.
6. Implement incrementally.
7. Run type checking.
8. Run linting.
9. Run relevant unit tests.
10. Run integration/E2E tests where applicable.
11. Visually inspect major UI changes.
12. Fix regressions.
13. Update documentation.
14. Report what changed.

Do not claim something works unless it has been tested.


# 50. Scope Discipline

Do not implement V2 AI functionality prematurely.

Do not add unnecessary features simply because they are technically interesting.

Prioritize the core student workflow:

Attend lecture
→ add resources
→ sync
→ study
→ annotate
→ test
→ active recall
→ flashcards
→ review
→ detect weakness
→ revise
→ prepare for exam


# 51. Definition of Success

MedOS succeeds when the user can open it and immediately understand:

- what university activity is happening today
- what should be studied today
- what material exists for every lecture
- what has been completed
- what needs review
- where performance is weak
- what exams are approaching

while keeping all Semester 5 study material organized, searchable, testable, reviewable, and traceable to its source.

# 52. Working Rules

- Use npm.
- Run tests quietly: `npm test -- --silent`
- Output concise diffs; do not reprint whole files.
- Do not summarize unchanged code.
