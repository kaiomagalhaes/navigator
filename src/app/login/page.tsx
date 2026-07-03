import { redirect } from "next/navigation";
import { ALLOWED_EMAIL, auth, signIn } from "@/auth";

const ERROR_MESSAGES: Record<string, string> = {
  AccessDenied: `Only ${ALLOWED_EMAIL} can sign in to Navigator.`,
  Configuration: "Sign-in is misconfigured. Please try again later.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  // Already signed in → straight to the app.
  if (await auth()) redirect("/");

  const { error } = await searchParams;

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-8 py-16 text-center">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Navigator</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Sign in with Google to continue.
        </p>
      </div>

      {error && (
        <p className="w-full rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {ERROR_MESSAGES[error] ?? "Sign-in failed. Please try again."}
        </p>
      )}

      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: "/" });
        }}
        className="w-full"
      >
        <button
          type="submit"
          className="inline-flex w-full items-center justify-center rounded-lg bg-zinc-900 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Sign in with Google
        </button>
      </form>
    </div>
  );
}
