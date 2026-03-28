import type { NextPage } from "next";
import Head from "next/head";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useState } from "react";

// Lazy-load heavy playground components
const YamlEditor = dynamic(() => import("../components/playground/YamlEditor"), {
  ssr: false,
  loading: () => <ComponentSkeleton label="Loading YAML Editor…" />,
});
const CommandTerminal = dynamic(() => import("../components/playground/CommandTerminal"), {
  ssr: false,
  loading: () => <ComponentSkeleton label="Loading Terminal…" />,
});
const ChallengeMode = dynamic(() => import("../components/playground/ChallengeMode"), {
  ssr: false,
  loading: () => <ComponentSkeleton label="Loading Challenges…" />,
});
const AiTutor = dynamic(() => import("../components/AiTutor"), {
  ssr: false,
  loading: () => <ComponentSkeleton label="Loading AI Tutor…" />,
});

function ComponentSkeleton({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center h-64 bg-gray-900 rounded-xl border border-gray-700">
      <div className="flex items-center gap-3 text-gray-400">
        <div className="w-4 h-4 border-2 border-gray-500 border-t-blue-400 rounded-full animate-spin" />
        <span className="text-sm">{label}</span>
      </div>
    </div>
  );
}

type Tab = "yaml" | "terminal" | "challenges" | "ai-tutor";

const TABS: { id: Tab; label: string; icon: string; description: string }[] = [
  {
    id: "yaml",
    label: "YAML Editor",
    icon: "📝",
    description: "Write & validate Kubernetes manifests with AI review",
  },
  {
    id: "terminal",
    label: "Command Terminal",
    icon: "💻",
    description: "Practice kubectl, helm & docker commands interactively",
  },
  {
    id: "challenges",
    label: "Challenges",
    icon: "🎯",
    description: "Fix broken configs, write policies, solve real scenarios",
  },
  {
    id: "ai-tutor",
    label: "AI Tutor",
    icon: "🤖",
    description: "Ask anything — powered by Google ADK + Gemini",
  },
];

const PlaygroundPage: NextPage = () => {
  const [activeTab, setActiveTab] = useState<Tab>("yaml");

  return (
    <>
      <Head>
        <title>Playground — DevOps Interactive Learning</title>
        <meta name="description" content="Interactive DevOps playground: YAML editor, command terminal, challenges, and AI tutor" />
      </Head>

      <div className="min-h-screen bg-gray-950 text-white">
        {/* Nav */}
        <nav className="border-b border-gray-800 bg-gray-900/80 backdrop-blur sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link href="/" className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors">
                <span className="text-lg">⚙️</span>
                <span className="font-semibold text-sm">DevOps Learn</span>
              </Link>
              <span className="text-gray-600">/</span>
              <span className="text-white font-semibold text-sm">Playground</span>
            </div>
            <Link
              href="/"
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              ← Back to lessons
            </Link>
          </div>
        </nav>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-white mb-1">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">
                Playground
              </span>
            </h1>
            <p className="text-gray-400 text-sm">
              Hands-on practice environment — write YAML, run commands, solve challenges, and ask your AI tutor
            </p>
          </div>

          {/* Tab bar */}
          <div className="flex gap-1 p-1 bg-gray-900 rounded-xl border border-gray-800 mb-6 overflow-x-auto">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap flex-1 justify-center ${
                  activeTab === tab.id
                    ? "bg-gray-800 text-white shadow-sm border border-gray-700"
                    : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/50"
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Tab description */}
          <p className="text-gray-500 text-sm mb-4">
            {TABS.find(t => t.id === activeTab)?.description}
          </p>

          {/* Tab content */}
          <div>
            {activeTab === "yaml" && <YamlEditor />}
            {activeTab === "terminal" && <CommandTerminal />}
            {activeTab === "challenges" && <ChallengeMode />}
            {activeTab === "ai-tutor" && (
              <div className="h-[700px]">
                <AiTutor />
              </div>
            )}
          </div>

          {/* Footer tip */}
          <div className="mt-6 p-4 bg-gray-900 rounded-xl border border-gray-800 flex items-start gap-3">
            <span className="text-lg">💡</span>
            <div className="text-sm text-gray-400">
              <strong className="text-gray-300">Pro tip:</strong> Use the{" "}
              <button onClick={() => setActiveTab("ai-tutor")} className="text-blue-400 hover:underline">
                AI Tutor
              </button>{" "}
              to explain any concept, review your YAML, or get a personalized learning path. Try asking:{" "}
              <em>"Why is my pod in CrashLoopBackOff?"</em> or{" "}
              <em>"Explain the difference between a NetworkPolicy and a Service Mesh."</em>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default PlaygroundPage;
