import Image from "next/image";
import styles from "./welcome-motion.module.css";

export function StudyPulse() {
  return (
    <div className={styles.clinicalArt} aria-hidden="true">
      <Image
        src="/welcome/clinical-heart.webp"
        alt=""
        fill
        sizes="(max-width: 767px) 100vw, 85vw"
        className={styles.clinicalHeart}
      />
      <svg className={styles.clinicalTrace} viewBox="0 0 780 180" fill="none">
        <path
          d="M1 122h89l16-15 18 32 22-62 20 45h112c150 0 164-80 305-80h196"
          pathLength={1}
          stroke="currentColor"
          strokeWidth={1.7}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}
