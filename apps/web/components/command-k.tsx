"use client";

import { useRouter } from "next/navigation";

import { CommandK as SharedCommandK } from "@workspace/client/components";

export default function CommandK() {
  const router = useRouter();

  return <SharedCommandK onNavigate={(path) => router.push(path)} />;
}
