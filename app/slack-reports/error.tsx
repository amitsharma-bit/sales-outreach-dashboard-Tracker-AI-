"use client";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto max-w-[1500px] px-4 py-7 sm:px-6">
      <div className="rounded-card border border-danger/30 bg-danger-weak p-5 text-sm text-danger">
        <p className="font-semibold">Slack Reports failed to load.</p>
        <p className="mt-1 text-danger/80">{error.message}</p>
        <button onClick={reset} className="mt-3 rounded-lg border border-danger/30 px-3 py-1.5 text-xs font-semibold hover:bg-danger/10">
          Try again
        </button>
      </div>
    </main>
  );
}
