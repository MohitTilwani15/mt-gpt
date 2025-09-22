"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { Loader2Icon } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";

interface LoginFormData {
  email: string;
  password: string;
}

interface SignUpFormData {
  name: string;
  email: string;
  password: string;
}

export function LoginForm() {
  const { register, handleSubmit } = useForm<LoginFormData>();
  const [isLoading, setIsLoading] = useState(false);

  const handleEmailSignIn = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      await authClient.signIn.email({
        email,
        password,
        callbackURL: '/'
      });
    } catch (error) {
      console.error("Login failed:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4 max-w-md mx-auto">
      <h2 className="text-2xl font-bold">Sign In</h2>

      <form onSubmit={handleSubmit((data) => handleEmailSignIn(data.email, data.password))} className="space-y-4">
        <div>
          <Label htmlFor="email">
            Email
          </Label>
          <Input
            {...register("email", { required: true, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ })}
            id="email"
            type="email"
            placeholder="Enter your email"
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="password">
            Password
          </Label>
          <Input
            {...register("password", { required: true, minLength: 8 })}
            id="password"
            type="password"
            placeholder="Enter your password"
            className="mt-1"
          />
        </div>
        <Button
          type="submit"
          disabled={isLoading}
          className="w-full"
        >
          {isLoading ? (
            <>
              <Loader2Icon className="animate-spin" />
              Signing in...
            </>
          ) : (
            "Sign In"
          )}
        </Button>
      </form>
    </div>
  );
}

export function SignUpForm() {
  const { register, handleSubmit } = useForm<SignUpFormData>();
  const [isLoading, setIsLoading] = useState(false);

  const handleEmailSignUp = async (email: string, password: string, name: string) => {
    setIsLoading(true);
    try {
      await authClient.signUp.email({
        email,
        password,
        name,
        callbackURL: '/'
      });
    } catch (error) {
      console.error("Sign up failed:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4 max-w-md mx-auto">
      <h2 className="text-2xl font-bold">Sign Up</h2>

      <form onSubmit={handleSubmit((data) => handleEmailSignUp(data.email, data.password, data.name))} className="space-y-4">
        <div>
          <Label htmlFor="name">
            Name
          </Label>
          <Input
            {...register("name", { required: true, minLength: 3 })}
            id="name"
            type="text"
            placeholder="Enter your full name"
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="email">
            Email
          </Label>
          <Input
            {...register("email", { required: true, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ })}
            id="email"
            type="email"
            placeholder="Enter your email"
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="password">
            Password
          </Label>
          <Input
            {...register("password", { required: true, minLength: 8 })}
            id="password"
            type="password"
            placeholder="Enter your password"
            className="mt-1"
          />
        </div>
        <Button
          type="submit"
          disabled={isLoading}
          className="w-full"
        >
          {isLoading ? (
            <>
              <Loader2Icon className="animate-spin" />
              Signing up...
            </>
          ) : (
            "Sign Up"
          )}
        </Button>
      </form>
    </div>
  );
}
