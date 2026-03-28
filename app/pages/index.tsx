import React from "react";
import Head from "next/head";
import Link from "next/link";
import { learningPaths, getTotalLessons, LearningPath } from "@/lib/lessons";
import LessonCard from "@/components/LessonCard";
import ProgressTracker, { useProgress } from "@/components/ProgressTracker";
import {
  BookOpen,
  Zap,
  Terminal,
  Users,
  Github,
  ArrowRight,
  GraduationCap,
  Layers,
} from "lucide-react";
import clsx from "clsx";

// ─── Hero ──────────────────────────────────────────────────────────────────

function Hero() {
  const totalLessons = getTotalLessons();
  return (
    <section className="relative overflow-hidden py-20 px-4">
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-emerald-600/8 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-4xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-400 text-sm font-medium mb-6 animate-fade-in-up">
          <Zap className="w-3.5 h-3.5" />
          Free, self-hosted, open source
        </div>

        <h1 className="text-5xl sm:text-6xl font-extrabold text-white mb-6 leading-tight animate-fade-in-up delay-100">
          Master{" "}
          <span className="bg-gradient-to-r from-blue-400 via-cyan-400 to-emerald-400 bg-clip-text text-transparent">
            DevOps
          </span>{" "}
          from First Principles
        </h1>

        <p className="text-xl text-gray-400 mb-8 max-w-2xl mx-auto leading-relaxed animate-fade-in-up delay-200">
          A hands-on learning platform covering Docker, Kubernetes, and Helm.
          Structured lessons, interactive quizzes, and real-world labs — all in
          one place.
        </p>

        <div className="flex flex-wrap justify-center gap-4 mb-12 animate-fade-in-up delay-300">
          <Link
            href="#learning-paths"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-colors shadow-lg shadow-blue-600/20"
          >
            Start Learning
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href="/playground"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-semibold transition-all shadow-lg shadow-purple-600/20"
          >
            <Terminal className="w-4 h-4" />
            Open Playground
          </Link>
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-gray-600 hover:border-gray-500 text-gray-300 hover:text-white font-semibold transition-colors"
          >
            <Github className="w-4 h-4" />
            View on GitHub
          </a>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-6 max-w-md mx-auto animate-fade-in-up delay-400">
          {[
            { value: learningPaths.length, label: "Learning Paths" },
            { value: totalLessons, label: "Lessons" },
            { value: "100%", label: "Free" },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="text-3xl font-bold text-white">{stat.value}</div>
              <div className="text-sm text-gray-500">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Features ─────────────────────────────────────────────────────────────

function Features() {
  const features = [
    {
      icon: BookOpen,
      title: "Structured Lessons",
      desc: "Carefully ordered curriculum that builds knowledge from the ground up — no gaps, no hand-waving.",
    },
    {
      icon: Terminal,
      title: "Hands-on Labs",
      desc: "Real Dockerfiles, YAML manifests, and Helm charts in the labs/ directory. Learn by doing.",
    },
    {
      icon: GraduationCap,
      title: "Interactive Quizzes",
      desc: "Test your understanding after each lesson with targeted multiple-choice questions and explanations.",
    },
    {
      icon: Layers,
      title: "Progress Tracking",
      desc: "Your progress is saved locally. Pick up exactly where you left off, any time.",
    },
    {
      icon: Zap,
      title: "Fast & Offline",
      desc: "Static Next.js app. Run it locally or on any server. No accounts, no tracking.",
    },
    {
      icon: Users,
      title: "Open Source",
      desc: "MIT licensed. Contribute new lessons, fix typos, or add entire topic paths.",
    },
  ];

  return (
    <section className="py-16 px-4 border-t border-gray-800">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-white mb-3">
            Everything you need to learn DevOps
          </h2>
          <p className="text-gray-400 max-w-xl mx-auto">
            No fluff, no paywalls — just solid content and practical exercises.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((f, i) => (
            <div
              key={f.title}
              className="p-5 rounded-xl border border-gray-700/60 bg-gray-800/30 animate-fade-in-up"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <f.icon className="w-8 h-8 text-blue-400 mb-3" />
              <h3 className="font-semibold text-white mb-1">{f.title}</h3>
              <p className="text-sm text-gray-400 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Path Card ─────────────────────────────────────────────────────────────

function PathCard({ path }: { path: LearningPath }) {
  const { isCompleted, mounted } = useProgress();
  const completedCount = mounted
    ? path.lessons.filter((l) => isCompleted(l.id)).length
    : 0;
  const pct =
    path.lessons.length > 0
      ? Math.round((completedCount / path.lessons.length) * 100)
      : 0;

  return (
    <div className="rounded-2xl border border-gray-700 bg-gray-800/40 overflow-hidden">
      {/* Path header */}
      <div
        className={clsx(
          "px-6 py-5 bg-gradient-to-r",
          path.color
        )}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-4xl">{path.icon}</span>
            <div>
              <h3 className="text-xl font-bold text-white">{path.title}</h3>
              <p className="text-sm text-white/70">
                {path.lessons.length} lessons
              </p>
            </div>
          </div>
          {mounted && pct > 0 && (
            <div className="text-right">
              <span className="text-2xl font-bold text-white">{pct}%</span>
              <p className="text-xs text-white/60">complete</p>
            </div>
          )}
        </div>
      </div>

      {/* Description */}
      <div className="px-6 py-4 border-b border-gray-700">
        <p className="text-sm text-gray-400 leading-relaxed">
          {path.description}
        </p>
        {/* Mini progress bar */}
        {mounted && (
          <div className="mt-3 h-1 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-white/30 rounded-full transition-all duration-700"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </div>

      {/* First 3 lesson cards */}
      <div className="px-6 py-4 space-y-2">
        {path.lessons.slice(0, 3).map((lesson, index) => (
          <LessonCard
            key={lesson.id}
            lesson={lesson}
            isCompleted={mounted && isCompleted(lesson.id)}
            index={index}
          />
        ))}
        {path.lessons.length > 3 && (
          <p className="text-sm text-gray-500 text-center py-1">
            + {path.lessons.length - 3} more lessons
          </p>
        )}
      </div>

      {/* CTA */}
      <div className="px-6 pb-5">
        <Link
          href={`/learn/${path.topic}/${path.lessons[0].slug}`}
          className={clsx(
            "block w-full text-center py-2.5 rounded-xl font-semibold text-white text-sm transition-all",
            "bg-gradient-to-r hover:opacity-90",
            path.color
          )}
        >
          {completedCount > 0 ? "Continue Learning" : "Start Path"} →
        </Link>
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function HomePage() {
  return (
    <>
      <Head>
        <title>DevOps Learning Platform — Docker, Kubernetes, Helm</title>
        <meta
          name="description"
          content="Free, interactive, self-hosted DevOps learning platform. Learn Docker, Kubernetes, and Helm with structured lessons, quizzes, and hands-on labs."
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="min-h-screen bg-gray-950">
        {/* Nav */}
        <nav className="sticky top-0 z-50 border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm">
          <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2 font-bold text-white">
              <span className="text-2xl">🚀</span>
              <span>DevOps Learn</span>
            </Link>
            <div className="flex items-center gap-6 text-sm">
              <Link href="#learning-paths" className="text-gray-400 hover:text-white transition-colors">
                Courses
              </Link>
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-white transition-colors"
              >
                GitHub
              </a>
            </div>
          </div>
        </nav>

        <Hero />
        <Features />

        {/* Learning paths */}
        <section id="learning-paths" className="py-16 px-4 border-t border-gray-800">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-white mb-3">
                Learning Paths
              </h2>
              <p className="text-gray-400 max-w-xl mx-auto">
                Each path is self-contained. Start with Docker if you are new to
                containers, or jump straight into Kubernetes if you already know
                the basics.
              </p>
            </div>

            <div className="grid lg:grid-cols-3 gap-6">
              {learningPaths.map((path) => (
                <PathCard key={path.topic} path={path} />
              ))}
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-gray-800 py-8 px-4 text-center text-sm text-gray-500">
          <p>
            Built for learners by learners. MIT License.{" "}
            <a
              href="https://github.com"
              className="text-gray-400 hover:text-white transition-colors underline"
            >
              Contribute on GitHub
            </a>
            .
          </p>
        </footer>
      </div>
    </>
  );
}
