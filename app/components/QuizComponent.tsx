"use client";

import React, { useState } from "react";
import { QuizQuestion } from "@/lib/lessons";
import { CheckCircle2, XCircle, RotateCcw, Trophy } from "lucide-react";
import clsx from "clsx";

interface QuizComponentProps {
  questions: QuizQuestion[];
  onComplete?: (score: number, total: number) => void;
}

type AnswerState = "unanswered" | "correct" | "incorrect";

export default function QuizComponent({
  questions,
  onComplete,
}: QuizComponentProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [answerState, setAnswerState] = useState<AnswerState>("unanswered");
  const [score, setScore] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [answers, setAnswers] = useState<(number | null)[]>(
    Array(questions.length).fill(null)
  );

  const currentQuestion = questions[currentIndex];
  const isAnswered = answerState !== "unanswered";

  function handleSelectOption(index: number) {
    if (isAnswered) return;

    setSelectedOption(index);
    const correct = index === currentQuestion.correctIndex;
    setAnswerState(correct ? "correct" : "incorrect");

    if (correct) {
      setScore((prev) => prev + 1);
    }

    const newAnswers = [...answers];
    newAnswers[currentIndex] = index;
    setAnswers(newAnswers);
  }

  function handleNext() {
    if (currentIndex + 1 < questions.length) {
      setCurrentIndex((prev) => prev + 1);
      setSelectedOption(null);
      setAnswerState("unanswered");
    } else {
      setIsComplete(true);
      const finalScore = answers.filter(
        (a, i) => a === questions[i].correctIndex
      ).length;
      // Count current answer too since state update may lag
      const actualScore =
        answers.filter((a, i) => a !== null && a === questions[i].correctIndex)
          .length + (answerState === "correct" ? 1 : 0);
      onComplete?.(actualScore, questions.length);
    }
  }

  function handleReset() {
    setCurrentIndex(0);
    setSelectedOption(null);
    setAnswerState("unanswered");
    setScore(0);
    setIsComplete(false);
    setAnswers(Array(questions.length).fill(null));
  }

  const percentage = Math.round((score / questions.length) * 100);

  if (isComplete) {
    return (
      <div className="rounded-2xl border border-gray-700 bg-gray-800/60 p-8 text-center animate-fade-in-up">
        <Trophy
          className={clsx(
            "w-16 h-16 mx-auto mb-4",
            percentage >= 80
              ? "text-yellow-400"
              : percentage >= 60
              ? "text-blue-400"
              : "text-gray-400"
          )}
        />
        <h3 className="text-2xl font-bold text-white mb-2">Quiz Complete!</h3>
        <p className="text-gray-400 mb-6">
          You scored{" "}
          <span className="text-white font-semibold">
            {score} / {questions.length}
          </span>{" "}
          ({percentage}%)
        </p>

        {/* Score breakdown */}
        <div className="mb-6 space-y-2 text-left max-w-sm mx-auto">
          {questions.map((q, i) => {
            const userAnswer = answers[i];
            const correct = userAnswer === q.correctIndex;
            return (
              <div
                key={q.id}
                className={clsx(
                  "flex items-center gap-3 p-3 rounded-lg border text-sm",
                  correct
                    ? "border-emerald-500/20 bg-emerald-950/20 text-emerald-300"
                    : "border-red-500/20 bg-red-950/20 text-red-300"
                )}
              >
                {correct ? (
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 flex-shrink-0" />
                )}
                <span className="line-clamp-1">{q.question}</span>
              </div>
            );
          })}
        </div>

        {/* Feedback message */}
        <p className="text-sm text-gray-400 mb-6">
          {percentage === 100
            ? "Perfect score! You have mastered this lesson."
            : percentage >= 80
            ? "Great job! Review the incorrect answers and try again."
            : percentage >= 60
            ? "Good effort. Re-read the lesson and try again."
            : "Keep studying! Review the lesson content before retrying."}
        </p>

        <button
          onClick={handleReset}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-700 bg-gray-800/60 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 bg-gray-800/80">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-400">
            Question {currentIndex + 1} of {questions.length}
          </span>
          <div className="flex gap-1">
            {questions.map((_, i) => (
              <div
                key={i}
                className={clsx(
                  "w-2 h-2 rounded-full transition-colors",
                  i < currentIndex
                    ? answers[i] === questions[i].correctIndex
                      ? "bg-emerald-500"
                      : "bg-red-500"
                    : i === currentIndex
                    ? "bg-blue-500"
                    : "bg-gray-600"
                )}
              />
            ))}
          </div>
        </div>
        <span className="text-sm font-medium text-gray-300">
          Score: {score}/{currentIndex}
        </span>
      </div>

      {/* Question */}
      <div className="px-6 py-5">
        <p className="text-base font-semibold text-white mb-5 leading-relaxed">
          {currentQuestion.question}
        </p>

        {/* Options */}
        <div className="space-y-3">
          {currentQuestion.options.map((option, i) => {
            const isSelected = selectedOption === i;
            const isCorrect = i === currentQuestion.correctIndex;
            const showCorrect = isAnswered && isCorrect;
            const showWrong = isAnswered && isSelected && !isCorrect;

            return (
              <button
                key={i}
                onClick={() => handleSelectOption(i)}
                disabled={isAnswered}
                className={clsx(
                  "w-full text-left px-4 py-3 rounded-xl border text-sm font-medium transition-all duration-150",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                  !isAnswered && "hover:border-gray-500 hover:bg-gray-700/50",
                  showCorrect
                    ? "border-emerald-500 bg-emerald-950/40 text-emerald-200"
                    : showWrong
                    ? "border-red-500 bg-red-950/40 text-red-200"
                    : isSelected
                    ? "border-blue-500 bg-blue-950/30 text-white"
                    : "border-gray-600 bg-gray-700/30 text-gray-300",
                  isAnswered && !isSelected && !isCorrect && "opacity-50"
                )}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={clsx(
                      "flex-shrink-0 w-6 h-6 rounded-full border flex items-center justify-center text-xs font-bold",
                      showCorrect
                        ? "border-emerald-400 bg-emerald-500 text-white"
                        : showWrong
                        ? "border-red-400 bg-red-500 text-white"
                        : "border-gray-500 text-gray-400"
                    )}
                  >
                    {showCorrect ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : showWrong ? (
                      <XCircle className="w-4 h-4" />
                    ) : (
                      String.fromCharCode(65 + i)
                    )}
                  </span>
                  {option}
                </div>
              </button>
            );
          })}
        </div>

        {/* Explanation */}
        {isAnswered && (
          <div
            className={clsx(
              "mt-5 p-4 rounded-xl border text-sm leading-relaxed animate-fade-in-up",
              answerState === "correct"
                ? "border-emerald-500/30 bg-emerald-950/20 text-emerald-200"
                : "border-red-500/30 bg-red-950/20 text-red-200"
            )}
          >
            <p className="font-semibold mb-1">
              {answerState === "correct" ? "Correct!" : "Not quite."}
            </p>
            <p className="text-gray-300">{currentQuestion.explanation}</p>
          </div>
        )}
      </div>

      {/* Footer */}
      {isAnswered && (
        <div className="px-6 pb-5">
          <button
            onClick={handleNext}
            className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm transition-colors"
          >
            {currentIndex + 1 < questions.length ? "Next Question →" : "See Results"}
          </button>
        </div>
      )}
    </div>
  );
}
