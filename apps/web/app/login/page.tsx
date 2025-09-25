"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { LoginForm, SignUpForm } from "@workspace/client/components";
import { useAuth } from "@workspace/client/providers";

export default function LoginPage() {
  const router = useRouter();
  const { session, isLoading } = useAuth();
  const isAuthenticated = Boolean(session?.user);
  const [activeForm, setActiveForm] = useState<"login" | "signup">("login");

  useEffect(() => {
    if (isAuthenticated) {
      router.replace("/");
    }
  }, [isAuthenticated, router]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-center mb-8">
        <div className="bg-gray-100 p-1 rounded-lg">
          <button
            onClick={() => setActiveForm("login")}
            className={`px-4 py-2 rounded-md ${
              activeForm === "login"
                ? "bg-black shadow-sm text-white"
                : "text-gray-600 hover:text-gray-800"
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => setActiveForm("signup")}
            className={`px-4 py-2 rounded-md ${
              activeForm === "signup"
                ? "bg-black shadow-sm text-white"
                : "text-gray-600 hover:text-gray-800"
            }`}
          >
            Sign Up
          </button>
        </div>
      </div>

      {activeForm === "login" ? <LoginForm /> : <SignUpForm />}
    </div>
  );
}
