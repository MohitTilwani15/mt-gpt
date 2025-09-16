import React, { FormEvent, useMemo, useState } from "react";
import {
  Button,
  Field,
  Input,
  MessageBar,
  MessageBarActions,
  MessageBarBody,
  MessageBarTitle,
  Spinner,
  Tab,
  TabList,
  Text,
  makeStyles,
  tokens,
} from "@fluentui/react-components";

import { authClient } from "../lib/auth-client";

const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    padding: "24px 16px",
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  description: {
    color: tokens.colorNeutralForeground2,
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  actionsColumn: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  buttonContent: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
  },
  externalButton: {
    width: "100%",
  },
  tabList: {
    marginBottom: "4px",
  },
  googleLogo: {
    width: "18px",
    height: "18px",
  },
});

const useErrorMessage = (error: unknown) => {
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

type AuthMode = "signin" | "signup";

const triggerSessionRefresh = () => {
  try {
    authClient.$store.notify("$sessionSignal");
  } catch (err) {
    console.warn("Unable to refresh session", err);
  }
};

const SignInForm: React.FC = () => {
  const styles = useStyles();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);
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

  const handleGoogleSignIn = async () => {
    setError(null);
    try {
      await authClient.signIn.social({
        provider: "google",
        callbackURL: typeof window !== "undefined" ? window.location.href : undefined,
      });
      triggerSessionRefresh();
    } catch (err) {
      console.error("Google sign-in failed", err);
      setError(err);
    }
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      {errorMessage && (
        <MessageBar intent="error" role="alert">
          <MessageBarBody>
            <MessageBarTitle>Sign-in failed</MessageBarTitle>
            {errorMessage}
          </MessageBarBody>
          <MessageBarActions>
            <Button appearance="outline" onClick={() => setError(null)}>
              Dismiss
            </Button>
          </MessageBarActions>
        </MessageBar>
      )}

      <Button
        appearance="secondary"
        onClick={handleGoogleSignIn}
        type="button"
        className={styles.externalButton}
      >
        <span className={styles.buttonContent}>
          <img alt="Google" src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className={styles.googleLogo} />
          Continue with Google
        </span>
      </Button>

      <Field label="Email address" required>
        <Input
          value={email}
          onChange={(_event, data) => setEmail(data.value)}
          type="email"
          placeholder="you@example.com"
          required
        />
      </Field>

      <Field label="Password" required>
        <Input
          value={password}
          onChange={(_event, data) => setPassword(data.value)}
          type="password"
          placeholder="At least 8 characters"
          required
        />
      </Field>

      <Button appearance="primary" type="submit" disabled={!canSubmit}>
        <span className={styles.buttonContent}>
          {isSubmitting && <Spinner size="tiny" />}
          {isSubmitting ? "Signing in" : "Sign in"}
        </span>
      </Button>
    </form>
  );
};

const SignUpForm: React.FC = () => {
  const styles = useStyles();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);
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

  const handleGoogleSignUp = async () => {
    setError(null);
    try {
      await authClient.signIn.social({
        provider: "google",
        requestSignUp: true,
        callbackURL: typeof window !== "undefined" ? window.location.href : undefined,
      });
      triggerSessionRefresh();
    } catch (err) {
      console.error("Google sign-up failed", err);
      setError(err);
    }
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      {errorMessage && (
        <MessageBar intent="error" role="alert">
          <MessageBarBody>
            <MessageBarTitle>Sign-up failed</MessageBarTitle>
            {errorMessage}
          </MessageBarBody>
          <MessageBarActions>
            <Button appearance="outline" onClick={() => setError(null)}>
              Dismiss
            </Button>
          </MessageBarActions>
        </MessageBar>
      )}

      <Button
        appearance="secondary"
        onClick={handleGoogleSignUp}
        type="button"
        className={styles.externalButton}
      >
        <span className={styles.buttonContent}>
          <img alt="Google" src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className={styles.googleLogo} />
          Continue with Google
        </span>
      </Button>

      <Field label="Full name" required>
        <Input
          value={name}
          onChange={(_event, data) => setName(data.value)}
          placeholder="Your name"
          required
        />
      </Field>

      <Field label="Email address" required>
        <Input
          value={email}
          onChange={(_event, data) => setEmail(data.value)}
          type="email"
          placeholder="you@example.com"
          required
        />
      </Field>

      <Field label="Password" required>
        <Input
          value={password}
          onChange={(_event, data) => setPassword(data.value)}
          type="password"
          placeholder="At least 8 characters"
          required
        />
      </Field>

      <Button appearance="primary" type="submit" disabled={!canSubmit}>
        <span className={styles.buttonContent}>
          {isSubmitting && <Spinner size="tiny" />}
          {isSubmitting ? "Signing up" : "Create account"}
        </span>
      </Button>
    </form>
  );
};

export const AuthPanel: React.FC = () => {
  const styles = useStyles();
  const [mode, setMode] = useState<AuthMode>("signin");

  return (
    <div className={styles.root}>
      <div>
        <Text className={styles.description}>
          Sign in to connect your account and start chatting.
        </Text>
      </div>

      <TabList
        selectedValue={mode}
        onTabSelect={(_event, data) => setMode(data.value as AuthMode)}
        className={styles.tabList}
      >
        <Tab value="signin">Sign in</Tab>
        <Tab value="signup">Sign up</Tab>
      </TabList>

      {mode === "signin" ? <SignInForm /> : <SignUpForm />}
    </div>
  );
};
