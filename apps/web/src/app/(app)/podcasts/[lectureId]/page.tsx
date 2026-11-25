import { Button, EmptyState, Notice, PageHeader } from "@medos/ui";
import { Headphones } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { lectureHref } from "@/features/courses/progress";
import { PodcastPlayer } from "@/features/podcasts/player";
import { podcastSource } from "@/features/podcasts/sources";
import { aiConfigured } from "@/server/ai";
import { getWorkspace } from "@/server/workspace";

export const metadata: Metadata = { title: "Lecture Podcasts" };
export const maxDuration = 60;

export default async function LecturePodcastsPage({
  params,
}: {
  params: Promise<{ lectureId: string }>;
}) {
  const { lectureId } = await params;
  const { scope, user } = await getWorkspace();
  const detail = await scope.lectures.detail(lectureId);
  if (!detail) notFound();

  const { lecture, course, resources } = detail;
  const from = lectureHref(course.slug, lecture.id);
  const load = (kind: "study-guide" | "original-lecture") =>
    Promise.all(
      resources
        .filter((resource) => resource.kind === kind)
        .map((resource) => podcastSource(scope, resource)),
    ).then((sources) => sources.filter(({ episodes }) => episodes.length));

  const guides = await load("study-guide");
  const sources = guides.length ? guides : await load("original-lecture");
  const configured = aiConfigured();
  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: "Podcasts", href: "/podcasts" }, { label: lecture.title }]} />
      <PageHeader
        title={lecture.title}
        description={course.name + " · Week " + detail.week.number}
      />
      {!sources.length ? (
        <>
          <EmptyState
            icon={<Headphones />}
            title="No readable lecture material"
            description="Sync a Study Guide or lecture slides with selectable text to create episodes."
          />
          <Button asChild>
            <Link href={from}>Open lecture</Link>
          </Button>
        </>
      ) : (
        <>
          {!configured && (
            <Notice title="AI generation is unavailable.">
              Configure an AI provider in Med OS to create episodes.
            </Notice>
          )}
          <PodcastPlayer
            lectureId={lecture.id}
            accountId={user.id}
            configured={configured}
            sources={sources.map(({ id, title, episodes }) => ({
              id,
              title,
              episodes: episodes.map(({ labels, version }) => ({ labels, version })),
              href: from + (guides.length ? "/study-guide/" : "/original/") + id,
            }))}
          />
        </>
      )}
    </div>
  );
}
