"use client";

import { Suspense } from "react";
import { useAuth } from "@clerk/nextjs";
import { MyAssistant } from "@/components/assistant-ui/my-assistant";
import { AuthPage } from "@/components/auth/AuthPage";

function HomeContent() {
  const { isSignedIn, isLoaded } = useAuth();

  if (!isLoaded) return null;

  return (
    <main className="h-dvh">
      {isSignedIn ? <MyAssistant /> : <AuthPage />}
    </main>
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="h-dvh flex items-center justify-center">Loading...</div>
      }
    >
      <HomeContent />
    </Suspense>
  );
}