import React from "react";
import Link from "next/link";
import { Lesson, DIFFICULTY_COLORS } from "@/lib/lessons";
import { Clock, BookOpen, ChevronRight, CheckCircle2 } from "lucide-react";
import clsx from "clsx";

interface LessonCardProps {
  lesson: Lesson;
  isCompleted?: boolean;
  isLocked?: boolean;
  index: number;
}

export default function LessonCard({
  lesson,
  isCompleted = false,
  isLocked = false,
  index,
}: LessonCardProps) {
  const href = `/learn/${lesson.topic}/${lesson.slug}`;

  const cardContent = (
    <div
      className={clsx(
        "group relative flex items-start gap-4 p-5 rounded-xl border transition-all duration-200",
        "animate-fade-in-up",
        isCompleted
          ? "border-emerald-500/30 bg-emerald-950/20 hover:bg-emerald-950/30"
          : isLocked
          ? "border-gray-700/50 bg-gray-800/30 opacity-60 cursor-not-allowed"
          : "border-gray-700 bg-gray-800/50 hover:bg-gray-800 hover:border-gray-600 cursor-pointer"
      )}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      {/* Step number / completed indicator */}
      <div
        className={clsx(
          "flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-colors",
          isCompleted
            ? "border-emerald-500 bg-emerald-500/20 text-emerald-400"
            : isLocked
            ? "border-gray-600 bg-gray-700 text-gray-500"
            : "border-gray-600 bg-gray-700 text-gray-300 group-hover:border-blue-500 group-hover:text-blue-400"
        )}
      >
        {isCompleted ? (
          <CheckCircle2 className="w-5 h-5" />
        ) : (
          <span>{lesson.order}</span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3
            className={clsx(
              "font-semibold text-base leading-snug",
              isCompleted
                ? "text-emerald-300"
                : isLocked
                ? "text-gray-500"
                : "text-gray-100 group-hover:text-white"
            )}
          >
            {lesson.title}
          </h3>

          {!isLocked && (
            <ChevronRight
              className={clsx(
                "w-4 h-4 flex-shrink-0 mt-0.5 transition-transform group-hover:translate-x-0.5",
                isCompleted ? "text-emerald-500" : "text-gray-500"
              )}
            />
          )}
        </div>

        <p className="text-sm text-gray-400 mb-3 leading-relaxed line-clamp-2">
          {lesson.description}
        </p>

        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Duration */}
          <span className="flex items-center gap-1 text-xs text-gray-500">
            <Clock className="w-3.5 h-3.5" />
            {lesson.duration}
          </span>

          {/* Difficulty badge */}
          <span
            className={clsx(
              "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border",
              DIFFICULTY_COLORS[lesson.difficulty]
            )}
          >
            {lesson.difficulty}
          </span>

          {/* Quiz indicator */}
          {lesson.quiz.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <BookOpen className="w-3.5 h-3.5" />
              {lesson.quiz.length} quiz questions
            </span>
          )}

          {/* Tags */}
          {lesson.tags.slice(0, 2).map((tag) => (
            <span
              key={tag}
              className="hidden sm:inline px-1.5 py-0.5 rounded text-xs bg-gray-700/60 text-gray-400 font-mono"
            >
              #{tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );

  if (isLocked) {
    return cardContent;
  }

  return (
    <Link href={href} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-xl">
      {cardContent}
    </Link>
  );
}
