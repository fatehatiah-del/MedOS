import { Sparkles } from "lucide-react";
import { type ScreenName, Screenshot } from "./screenshot";
import styles from "./welcome-motion.module.css";

const stories: readonly { title: string; body: string; screen: ScreenName; alt: string }[] = [
  {
    title: "Open the lecture. Everything is there.",
    body: "Courses are organised by week and lecture, with the study guide, practice questions and flashcards together. Our publishing target is within 48 hours of your lecturer uploading new material.",
    screen: "guide-v2",
    alt: "The current Med OS Study Guide with chapter navigation and the anaemia lecture open.",
  },
  {
    title: "Retake the questions you got wrong.",
    body: "Work through MCQs in Learn, Exam or USMLE mode. After a finished session, practise just your missed questions and use the explanations to understand what to change.",
    screen: "mcq",
    alt: "A Med OS MCQ in Learn mode showing the selected answer and the explanation.",
  },
  {
    title: "See what to work on next.",
    body: "Review your MCQ accuracy, repeated errors, completed lectures and flashcard retention by course. Put your time into the topics that need another pass.",
    screen: "stats",
    alt: "The current Med OS Statistics view with MCQ accuracy and flashcard retention for a sample account.",
  },
];

export function ProductStories() {
  return (
    <div className={styles.stories}>
      {stories.map(({ title, body, screen, alt }, index) => (
        <article
          key={screen}
          className={`${styles.story} ${styles.spotlight}`}
          data-lead={index === 0}
          data-spotlight
        >
          <div className="space-y-3">
            <h3 className={styles.storyTitle}>{title}</h3>
            <p className="max-w-[42ch] text-[16px] leading-relaxed text-pretty text-fg-muted">
              {body}
            </p>
          </div>
          <Screenshot
            name={screen}
            mobileCrop="crop"
            alt={alt}
            sizes={
              index === 0 ? "(min-width: 1280px) 1100px, 100vw" : "(min-width: 768px) 50vw, 100vw"
            }
            className={styles.storyPreview}
          />
        </article>
      ))}
      <article className={`${styles.story} ${styles.aiStory} ${styles.spotlight}`} data-spotlight>
        <div className="space-y-3">
          <h3 className={styles.storyTitle}>Ask Gemini Flash while you study.</h3>
          <p className="max-w-[42ch] text-[16px] leading-relaxed text-pretty text-fg-muted">
            Ask AI uses the course material visible on the page. Select a passage for a more focused
            explanation without leaving the lecture.
          </p>
        </div>
        <figure className={styles.aiExample}>
          <figcaption className="flex items-center gap-2 text-sm font-semibold text-fg">
            <Sparkles aria-hidden="true" size={17} className="text-accent" /> Ask AI
            <span className="ml-auto text-xs font-medium text-fg-muted">Example</span>
          </figcaption>
          <p className="mt-5 rounded-xl bg-subtle px-4 py-3 text-[15px] font-medium text-fg">
            Why does ferritin fall in iron deficiency?
          </p>
          <p className="mt-4 px-1 text-[15px] leading-relaxed text-fg-muted">
            Ferritin reflects the iron your body has stored. When those stores are depleted,
            ferritin usually falls.
          </p>
        </figure>
      </article>
    </div>
  );
}
