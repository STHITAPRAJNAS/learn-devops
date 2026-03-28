import React, { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { GetStaticPaths, GetStaticProps } from "next";
import { useRouter } from "next/router";
import path from "path";
import fs from "fs";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";

import {
  learningPaths,
  getLearningPath,
  getLesson,
  Lesson,
  LearningPath,
  Topic,
} from "@/lib/lessons";
import QuizComponent from "@/components/QuizComponent";
import ProgressTracker, { useProgress } from "@/components/ProgressTracker";
import CodeBlock from "@/components/CodeBlock";
import {
  ChevronLeft,
  ChevronRight,
  Home,
  CheckCircle2,
  Clock,
  BookOpen,
  Menu,
  X,
} from "lucide-react";
import clsx from "clsx";

// ─── Types ─────────────────────────────────────────────────────────────────

interface LessonPageProps {
  lesson: Lesson;
  learningPath: LearningPath;
  content: string;
  prevLesson: Lesson | null;
  nextLesson: Lesson | null;
}

// ─── Static generation ────────────────────────────────────────────────────

export const getStaticPaths: GetStaticPaths = async () => {
  const paths = learningPaths.flatMap((lp) =>
    lp.lessons.map((l) => ({
      params: { topic: lp.topic, lesson: l.slug },
    }))
  );
  return { paths, fallback: false };
};

export const getStaticProps: GetStaticProps<LessonPageProps> = async ({
  params,
}) => {
  const topic = params!.topic as Topic;
  const lessonSlug = params!.lesson as string;

  const learningPath = getLearningPath(topic);
  const lesson = getLesson(topic, lessonSlug);

  if (!learningPath || !lesson) {
    return { notFound: true };
  }

  // Read markdown file
  const contentDir = path.join(process.cwd(), "..", "content");
  const filePath = path.join(contentDir, lesson.contentFile);
  let content = "";
  try {
    content = fs.readFileSync(filePath, "utf-8");
  } catch {
    content = `# ${lesson.title}\n\n> Content coming soon!`;
  }

  const idx = learningPath.lessons.findIndex((l) => l.slug === lessonSlug);
  const prevLesson = idx > 0 ? learningPath.lessons[idx - 1] : null;
  const nextLesson =
    idx < learningPath.lessons.length - 1
      ? learningPath.lessons[idx + 1]
      : null;

  return {
    props: {
      lesson,
      learningPath: JSON.parse(JSON.stringify(learningPath)),
      content,
      prevLesson: prevLesson ? JSON.parse(JSON.stringify(prevLesson)) : null,
      nextLesson: nextLesson ? JSON.parse(JSON.stringify(nextLesson)) : null,
    },
  };
};

// ─── Breadcrumb ───────────────────────────────────────────────────────────

function Breadcrumb({
  learningPath,
  lesson,
}: {
  learningPath: LearningPath;
  lesson: Lesson;
}) {
  return (
    <nav className="flex items-center gap-1.5 text-sm text-gray-500 mb-6 flex-wrap">
      <Link href="/" className="hover:text-white transition-colors flex items-center gap-1">
        <Home className="w-3.5 h-3.5" />
        Home
      </Link>
      <ChevronRight className="w-3.5 h-3.5" />
      <span className="text-gray-300">{learningPath.title}</span>
      <ChevronRight className="w-3.5 h-3.5" />
      <span className="text-white font-medium">{lesson.title}</span>
    </nav>
  );
}

// ─── Lesson Navigation ────────────────────────────────────────────────────

function LessonNav({
  prev,
  next,
  topic,
}: {
  prev: Lesson | null;
  next: Lesson | null;
  topic: Topic;
}) {
  return (
    <div className="flex items-center justify-between gap-4 pt-8 mt-8 border-t border-gray-700">
      {prev ? (
        <Link
          href={`/learn/${topic}/${prev.slug}`}
          className="group flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-700 hover:border-gray-500 bg-gray-800/50 hover:bg-gray-800 transition-all max-w-xs"
        >
          <ChevronLeft className="w-5 h-5 text-gray-400 group-hover:text-white transition-colors flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-xs text-gray-500 mb-0.5">Previous</p>
            <p className="text-sm font-medium text-gray-300 group-hover:text-white transition-colors truncate">
              {prev.title}
            </p>
          </div>
        </Link>
      ) : (
        <div />
      )}

      {next ? (
        <Link
          href={`/learn/${topic}/${next.slug}`}
          className="group flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-700 hover:border-gray-500 bg-gray-800/50 hover:bg-gray-800 transition-all max-w-xs text-right ml-auto"
        >
          <div className="min-w-0">
            <p className="text-xs text-gray-500 mb-0.5">Next</p>
            <p className="text-sm font-medium text-gray-300 group-hover:text-white transition-colors truncate">
              {next.title}
            </p>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-white transition-colors flex-shrink-0" />
        </Link>
      ) : (
        <div />
      )}
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────

function Sidebar({
  learningPath,
  currentSlug,
  open,
  onClose,
}: {
  learningPath: LearningPath;
  currentSlug: string;
  open: boolean;
  onClose: () => void;
}) {
  const { isCompleted, mounted } = useProgress();

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/60 z-30 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={clsx(
          "fixed top-0 left-0 h-full w-72 bg-gray-900 border-r border-gray-800 z-40 flex flex-col",
          "transition-transform duration-300 ease-in-out",
          "lg:static lg:translate-x-0 lg:h-auto lg:z-auto",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Sidebar header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800 flex-shrink-0">
          <Link href="/" className="flex items-center gap-2 font-bold text-white">
            <span className="text-xl">{learningPath.icon}</span>
            <span className="text-sm">{learningPath.title}</span>
          </Link>
          <button
            onClick={onClose}
            className="lg:hidden p-1 text-gray-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Lessons list */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {learningPath.lessons.map((lesson) => {
            const done = mounted && isCompleted(lesson.id);
            const isCurrent = lesson.slug === currentSlug;

            return (
              <Link
                key={lesson.id}
                href={`/learn/${learningPath.topic}/${lesson.slug}`}
                onClick={onClose}
                className={clsx(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all",
                  isCurrent
                    ? "bg-blue-500/15 border border-blue-500/30 text-blue-300"
                    : done
                    ? "text-emerald-400 hover:bg-gray-800"
                    : "text-gray-400 hover:bg-gray-800 hover:text-gray-200"
                )}
              >
                <span
                  className={clsx(
                    "flex-shrink-0 w-6 h-6 rounded-full border flex items-center justify-center text-xs font-bold",
                    isCurrent
                      ? "border-blue-400 bg-blue-500/20 text-blue-300"
                      : done
                      ? "border-emerald-500 bg-emerald-500/20 text-emerald-400"
                      : "border-gray-600 text-gray-500"
                  )}
                >
                  {done ? <CheckCircle2 className="w-3.5 h-3.5" /> : lesson.order}
                </span>
                <span className="leading-tight">{lesson.title}</span>
              </Link>
            );
          })}
        </nav>

        {/* Progress at bottom */}
        <div className="p-4 border-t border-gray-800 flex-shrink-0">
          <ProgressTracker
            learningPath={learningPath}
            currentLessonSlug={currentSlug}
            compact
          />
        </div>
      </aside>
    </>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function LessonPage({
  lesson,
  learningPath,
  content,
  prevLesson,
  nextLesson,
}: LessonPageProps) {
  const { markComplete, isCompleted, mounted } = useProgress();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [quizStarted, setQuizStarted] = useState(false);
  const router = useRouter();

  const done = mounted && isCompleted(lesson.id);

  function handleMarkComplete() {
    markComplete(lesson.id);
  }

  function handleQuizComplete(score: number, total: number) {
    if (score >= Math.ceil(total / 2)) {
      markComplete(lesson.id);
    }
  }

  return (
    <>
      <Head>
        <title>{lesson.title} — DevOps Learn</title>
        <meta name="description" content={lesson.description} />
      </Head>

      <div className="min-h-screen bg-gray-950 flex flex-col">
        {/* Top nav */}
        <header className="sticky top-0 z-50 border-b border-gray-800 bg-gray-950/90 backdrop-blur-sm">
          <div className="flex items-center gap-4 px-4 h-14">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-1.5 text-gray-400 hover:text-white transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
            <Link href="/" className="flex items-center gap-2 font-bold text-white text-sm">
              <span>🚀</span>
              <span className="hidden sm:block">DevOps Learn</span>
            </Link>
            <div className="flex-1" />
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Clock className="w-3.5 h-3.5" />
              {lesson.duration}
            </div>
            {done && (
              <span className="flex items-center gap-1 text-xs text-emerald-400 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Completed
              </span>
            )}
          </div>
        </header>

        <div className="flex flex-1">
          {/* Sidebar */}
          <Sidebar
            learningPath={learningPath}
            currentSlug={lesson.slug}
            open={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
          />

          {/* Main content */}
          <main className="flex-1 min-w-0 overflow-x-hidden">
            <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
              <Breadcrumb learningPath={learningPath} lesson={lesson} />

              {/* Lesson header */}
              <div className="mb-8">
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span className="text-sm font-medium text-gray-400">
                    {learningPath.icon} {learningPath.title}
                  </span>
                  <span className="text-gray-600">·</span>
                  <span
                    className={clsx(
                      "px-2 py-0.5 rounded-full text-xs font-medium border",
                      lesson.difficulty === "beginner"
                        ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/20"
                        : lesson.difficulty === "intermediate"
                        ? "text-yellow-400 bg-yellow-400/10 border-yellow-400/20"
                        : "text-red-400 bg-red-400/10 border-red-400/20"
                    )}
                  >
                    {lesson.difficulty}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-gray-500">
                    <Clock className="w-3.5 h-3.5" />
                    {lesson.duration}
                  </span>
                  {lesson.quiz.length > 0 && (
                    <span className="flex items-center gap-1 text-xs text-gray-500">
                      <BookOpen className="w-3.5 h-3.5" />
                      {lesson.quiz.length} quiz questions
                    </span>
                  )}
                </div>

                <h1 className="text-3xl sm:text-4xl font-extrabold text-white mb-3 leading-tight">
                  {lesson.title}
                </h1>
                <p className="text-gray-400 text-lg leading-relaxed">
                  {lesson.description}
                </p>
              </div>

              {/* Markdown content */}
              <article className="prose-devops mb-10">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeHighlight, rehypeRaw]}
                  components={{
                    // Render code blocks with our custom component
                    code({ node, className, children, ...props }: any) {
                      const match = /language-(\w+)/.exec(className || "");
                      const isBlock = !props.inline;
                      if (isBlock && match) {
                        return (
                          <CodeBlock
                            code={String(children).replace(/\n$/, "")}
                            language={match[1]}
                          />
                        );
                      }
                      return (
                        <code className={className} {...props}>
                          {children}
                        </code>
                      );
                    },
                  }}
                >
                  {content}
                </ReactMarkdown>
              </article>

              {/* Mark complete button */}
              {!done && (
                <div className="mb-8 p-5 rounded-xl border border-dashed border-gray-600 bg-gray-800/30 text-center">
                  <p className="text-gray-400 text-sm mb-3">
                    Finished reading? Mark this lesson as complete.
                  </p>
                  <button
                    onClick={handleMarkComplete}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm transition-colors"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Mark as Complete
                  </button>
                </div>
              )}

              {done && (
                <div className="mb-8 p-4 rounded-xl border border-emerald-500/30 bg-emerald-950/20 flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                  <p className="text-emerald-300 text-sm font-medium">
                    You have completed this lesson.
                  </p>
                </div>
              )}

              {/* Quiz section */}
              {lesson.quiz.length > 0 && (
                <section className="mb-10">
                  <div className="flex items-center justify-between mb-5">
                    <h2 className="text-xl font-bold text-white">
                      Knowledge Check
                    </h2>
                    <span className="text-sm text-gray-400">
                      {lesson.quiz.length} questions
                    </span>
                  </div>

                  {!quizStarted ? (
                    <div className="rounded-2xl border border-gray-700 bg-gray-800/40 p-8 text-center">
                      <BookOpen className="w-12 h-12 text-blue-400 mx-auto mb-4" />
                      <h3 className="font-semibold text-white text-lg mb-2">
                        Ready to test your knowledge?
                      </h3>
                      <p className="text-gray-400 text-sm mb-5">
                        {lesson.quiz.length} multiple-choice questions about{" "}
                        {lesson.title}.
                      </p>
                      <button
                        onClick={() => setQuizStarted(true)}
                        className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm transition-colors"
                      >
                        Start Quiz
                      </button>
                    </div>
                  ) : (
                    <QuizComponent
                      questions={lesson.quiz}
                      onComplete={handleQuizComplete}
                    />
                  )}
                </section>
              )}

              {/* Prev/Next navigation */}
              <LessonNav
                prev={prevLesson}
                next={nextLesson}
                topic={lesson.topic}
              />
            </div>
          </main>
        </div>
      </div>
    </>
  );
}
