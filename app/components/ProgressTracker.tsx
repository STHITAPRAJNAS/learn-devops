"use client";

import React, { useEffect, useState } from "react";
import { LearningPath, Lesson } from "@/lib/lessons";
import { CheckCircle2, Circle, Lock } from "lucide-react";
import clsx from "clsx";

interface ProgressTrackerProps {
  learningPath: LearningPath;
  currentLessonSlug?: string;
  compact?: boolean;
}

const STORAGE_KEY = "devops-learn-progress";

export function useProgress() {
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        setCompleted(new Set(JSON.parse(raw)));
      }
    } catch {
      // ignore
    }
  }, []);

  function markComplete(lessonId: string) {
    setCompleted((prev) => {
      const next = new Set(prev);
      next.add(lessonId);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        // ignore
      }
      return next;
    });
  }

  function isCompleted(lessonId: string) {
    return completed.has(lessonId);
  }

  function resetProgress() {
    setCompleted(new Set());
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  return { completed, markComplete, isCompleted, resetProgress, mounted };
}

export default function ProgressTracker({
  learningPath,
  currentLessonSlug,
  compact = false,
}: ProgressTrackerProps) {
  const { isCompleted, mounted } = useProgress();

  const lessons = learningPath.lessons;
  const completedCount = mounted
    ? lessons.filter((l) => isCompleted(l.id)).length
    : 0;
  const percentage =
    lessons.length > 0 ? Math.round((completedCount / lessons.length) * 100) : 0;

  if (compact) {
    return (
      <div className="flex items-center gap-3">
        <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full transition-all duration-500"
            style={{ width: `${percentage}%` }}
          />
        </div>
        <span className="text-xs text-gray-400 tabular-nums whitespace-nowrap">
          {completedCount}/{lessons.length}
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-white">Your Progress</h3>
          <p className="text-sm text-gray-400">
            {completedCount} of {lessons.length} lessons completed
          </p>
        </div>
        <div className="text-right">
          <span className="text-3xl font-bold text-white">{percentage}%</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-gray-700 rounded-full overflow-hidden mb-5">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${percentage}%`,
            background:
              "linear-gradient(to right, #3b82f6, #10b981)",
          }}
        />
      </div>

      {/* Lesson steps */}
      <div className="space-y-2">
        {lessons.map((lesson, index) => {
          const done = mounted && isCompleted(lesson.id);
          const isCurrent = lesson.slug === currentLessonSlug;
          // A lesson is "locked" if the previous lesson isn't done
          // (relaxed: only lock if no previous is complete, allow free navigation)
          const isLocked = false;

          return (
            <LessonStep
              key={lesson.id}
              lesson={lesson}
              isCompleted={done}
              isCurrent={isCurrent}
              isLocked={isLocked}
              index={index}
            />
          );
        })}
      </div>
    </div>
  );
}

function LessonStep({
  lesson,
  isCompleted,
  isCurrent,
  isLocked,
  index,
}: {
  lesson: Lesson;
  isCompleted: boolean;
  isCurrent: boolean;
  isLocked: boolean;
  index: number;
}) {
  return (
    <div
      className={clsx(
        "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
        isCurrent
          ? "bg-blue-500/10 border border-blue-500/30"
          : isCompleted
          ? "bg-emerald-500/5"
          : "hover:bg-gray-700/30"
      )}
    >
      {isCompleted ? (
        <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
      ) : isLocked ? (
        <Lock className="w-4 h-4 text-gray-600 flex-shrink-0" />
      ) : (
        <Circle
          className={clsx(
            "w-4 h-4 flex-shrink-0",
            isCurrent ? "text-blue-400" : "text-gray-600"
          )}
        />
      )}

      <span className="flex-1 min-w-0">
        <span
          className={clsx(
            "truncate block",
            isCompleted
              ? "text-emerald-300"
              : isCurrent
              ? "text-blue-300 font-medium"
              : isLocked
              ? "text-gray-600"
              : "text-gray-300"
          )}
        >
          {index + 1}. {lesson.title}
        </span>
      </span>

      {isCurrent && (
        <span className="text-xs text-blue-400 font-medium flex-shrink-0">
          Current
        </span>
      )}
    </div>
  );
}
