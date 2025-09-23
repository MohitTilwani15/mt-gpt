import React, { FormEvent, useMemo, useState } from "react";
import { Loader2, LogIn, UserPlus } from "lucide-react";

import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs";

import { authClient } from "../lib/auth-client";

type AuthMode = "signin" | "signup";

type UnknownError = unknown;

const useErrorMessage = (error: UnknownError) => {
  return useMemo(() => {
    if (!error) {
      return null;
    }

    if (typeof error === "string") {
      return error;
    }

    if (error instanceof Error) {
      return error.message;
    }

    if (typeof error === "object" && error !== null && "message" in error) {
      const message = (error as { message?: unknown }).message;
      if (typeof message === "string") {
        return message;
      }
    }

    return "Something went wrong. Please try again.";
  }, [error]);
};

const triggerSessionRefresh = () => {
  try {
    authClient.$store.notify("$sessionSignal");
  } catch (err) {
    console.warn("Unable to refresh session", err);
  }
};

const errorPanel = (title: string, message: string, onDismiss?: () => void) => (
  <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="font-semibold">{title}</p>
        <p>{message}</p>
      </div>
      {onDismiss && (
        <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={onDismiss}>
          Dismiss
        </Button>
      )}
    </div>
  </div>
);

const fieldWrapper = (
  id: string,
  label: string,
  children: React.ReactNode,
  helper?: React.ReactNode,
) => (
  <div className="space-y-2">
    <Label htmlFor={id} className="text-sm font-medium text-foreground">
      {label}
    </Label>
    {children}
    {helper}
  </div>
);

const SignInForm: React.FC = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<UnknownError>(null);
  const errorMessage = useErrorMessage(error);

  const canSubmit = email.trim().length > 0 && password.trim().length >= 8 && !isSubmitting;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await authClient.signIn.email({ email, password });
      triggerSessionRefresh();
    } catch (err) {
      console.error("Failed to sign in", err);
      setError(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      {errorMessage && errorPanel("Sign-in failed", errorMessage, () => setError(null))}

      {fieldWrapper(
        "signin-email",
        "Email address",
        <Input
          id="signin-email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />,
      )}

      {fieldWrapper(
        "signin-password",
        "Password",
        <Input
          id="signin-password"
          type="password"
          autoComplete="current-password"
          placeholder="At least 8 characters"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />,
      )}

      <Button type="submit" disabled={!canSubmit} className="w-full">
        <span className="flex items-center justify-center gap-2">
          {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <LogIn className="size-4" />}
          {isSubmitting ? "Signing in" : "Sign in"}
        </span>
      </Button>
    </form>
  );
};

const SignUpForm: React.FC = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<UnknownError>(null);
  const errorMessage = useErrorMessage(error);

  const canSubmit =
    name.trim().length >= 2 &&
    email.trim().length > 0 &&
    password.trim().length >= 8 &&
    !isSubmitting;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await authClient.signUp.email({
        name,
        email,
        password,
      });
      triggerSessionRefresh();
    } catch (err) {
      console.error("Failed to sign up", err);
      setError(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      {errorMessage && errorPanel("Sign-up failed", errorMessage, () => setError(null))}

      {fieldWrapper(
        "signup-name",
        "Full name",
        <Input
          id="signup-name"
          autoComplete="name"
          placeholder="Your name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />,
      )}

      {fieldWrapper(
        "signup-email",
        "Email address",
        <Input
          id="signup-email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />,
      )}

      {fieldWrapper(
        "signup-password",
        "Password",
        <Input
          id="signup-password"
          type="password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />,
      )}

      <Button type="submit" disabled={!canSubmit} className="w-full">
        <span className="flex items-center justify-center gap-2">
          {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
          {isSubmitting ? "Creating account" : "Create account"}
        </span>
      </Button>
    </form>
  );
};

export const AuthPanel: React.FC = () => {
  const [mode, setMode] = useState<AuthMode>("signin");

  return (
    <div className="flex flex-col gap-6 rounded-xl border border-border/60 bg-card p-6 text-card-foreground shadow-sm">
      <div>
        <h2 className="text-lg font-semibold">Connect your account</h2>
        <p className="text-sm text-muted-foreground">
          Sign in to chat with the assistant or create an account to get started.
        </p>
      </div>

      <Tabs value={mode} onValueChange={(value) => setMode(value as AuthMode)} className="space-y-4">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="signin" className="flex-1">
            Sign in
          </TabsTrigger>
          <TabsTrigger value="signup" className="flex-1">
            Sign up
          </TabsTrigger>
        </TabsList>

        <TabsContent value="signin">
          <SignInForm />
        </TabsContent>

        <TabsContent value="signup">
          <SignUpForm />
        </TabsContent>
      </Tabs>
    </div>
  );
};
