"use client";

import { ChangeEvent, FormEvent, use, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Switch } from "@workspace/ui/components/switch";
import { Textarea } from "@workspace/ui/components/textarea";
import { Separator } from "@workspace/ui/components/separator";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@workspace/ui/components/dialog";

import {
  AssistantKnowledgeItem,
  useAssistant,
  useAssistantShares,
  updateAssistant,
  deleteAssistant,
  uploadAssistantKnowledge,
  deleteAssistantKnowledge,
  shareAssistant,
  revokeAssistantShare,
} from "@/hooks/use-assistants";
import { authClient } from "@/lib/auth-client";

interface AssistantPageProps {
  params: Promise<{ id: string }>;
}

const AVAILABLE_MODELS = [
  { id: "gpt-4o", label: "GPT-4o" },
  { id: "gpt-5-nano", label: "GPT-5 Nano" },
  { id: "o4-mini", label: "O4 Mini" },
  { id: "o3-mini", label: "O3 Mini" },
];

export default function AssistantDetailPage({ params }: AssistantPageProps) {
  const resolvedParams = use(params);
  const assistantId = resolvedParams.id;
  const router = useRouter();
  const { data: assistant, isLoading, mutate } = useAssistant(assistantId);
  const { data: session } = authClient.useSession();
  const isOwner = assistant && session?.user?.id === assistant.ownerId;
  const { data: shares = [], mutate: mutateShares } = useAssistantShares(assistantId, Boolean(isOwner));

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [defaultModel, setDefaultModel] = useState("");
  const [webSearch, setWebSearch] = useState(true);
  const [imageGeneration, setImageGeneration] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const [shareEmail, setShareEmail] = useState("");
  const [shareCanManage, setShareCanManage] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  useEffect(() => {
    if (assistant) {
      setName(assistant.name);
      setDescription(assistant.description ?? "");
      setInstructions(assistant.instructions ?? "");
      setDefaultModel(assistant.defaultModel ?? "");
      const capabilities = assistant.capabilities ?? {};
      setWebSearch(capabilities.webSearch !== false);
      setImageGeneration(Boolean(capabilities.imageGeneration));
    }
  }, [assistant?.id]);

  const canSave = useMemo(() => name.trim().length > 0 && !isSaving, [name, isSaving]);

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!assistant || !canSave) return;

    setIsSaving(true);
    try {
      await updateAssistant(assistant.id, {
        name: name.trim(),
        description: description.trim() || undefined,
        instructions: instructions.trim() || undefined,
        defaultModel: defaultModel || undefined,
        capabilities: {
          webSearch,
          imageGeneration,
        },
      });

      await mutate();
      toast.success('Assistant updated');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update assistant';
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!assistant || isDeleting) return;

    setIsDeleting(true);
    try {
      await deleteAssistant(assistant.id);
      toast.success('Assistant deleted');
      setIsDeleteDialogOpen(false);
      router.push('/assistants');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete assistant';
      toast.error(message);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleKnowledgeUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!assistant) return;
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    try {
      await uploadAssistantKnowledge(assistant.id, files);
      await mutate();
      toast.success('Knowledge uploaded successfully');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to upload knowledge';
      toast.error(message);
    } finally {
      setIsUploading(false);
      event.target.value = '';
    }
  };

  const handleKnowledgeDelete = async (knowledge: AssistantKnowledgeItem) => {
    if (!assistant) return;
    if (!confirm(`Remove “${knowledge.fileName}” from this assistant?`)) {
      return;
    }

    try {
      await deleteAssistantKnowledge(assistant.id, knowledge.id);
      await mutate();
      toast.success('Knowledge removed');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete knowledge';
      toast.error(message);
    }
  };

  const handleShare = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!assistant || !shareEmail.trim()) return;

    setIsSharing(true);
    try {
      await shareAssistant(assistant.id, {
        email: shareEmail.trim(),
        canManage: shareCanManage,
      });
      setShareEmail("");
      setShareCanManage(false);
      await mutateShares();
      toast.success('Access granted');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to share assistant';
      toast.error(message);
    } finally {
      setIsSharing(false);
    }
  };

  const handleRevokeShare = async (userId: string) => {
    if (!assistant) return;
    try {
      await revokeAssistantShare(assistant.id, userId);
      await mutateShares();
      toast.success('Access revoked');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to revoke access';
      toast.error(message);
    }
  };

  if (isLoading || !assistant) {
    return <p className="text-sm text-muted-foreground">Loading assistant…</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{assistant.name}</h1>
          <p className="text-sm text-muted-foreground">
            Manage instructions, capabilities, knowledge, and sharing preferences.
          </p>
        </div>
        {isOwner ? (
          <Button
            variant="destructive"
            onClick={() => setIsDeleteDialogOpen(true)}
            disabled={isDeleting}
          >
            Delete assistant
          </Button>
        ) : null}
      </div>

      <Card>
        <form onSubmit={handleSave}>
          <CardHeader>
            <CardTitle>Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="assistant-name">Name</Label>
              <Input
                id="assistant-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="assistant-description">Description</Label>
              <Input
                id="assistant-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="assistant-instructions">Instructions</Label>
              <Textarea
                id="assistant-instructions"
                value={instructions}
                onChange={(event) => setInstructions(event.target.value)}
                rows={5}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="assistant-model">Default model</Label>
              <Input
                list="assistant-models"
                id="assistant-model"
                value={defaultModel}
                onChange={(event) => setDefaultModel(event.target.value)}
              />
              <datalist id="assistant-models">
                {AVAILABLE_MODELS.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label}
                  </option>
                ))}
              </datalist>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="font-medium">Web search</p>
                  <p className="text-sm text-muted-foreground">Allow usage of web search tool.</p>
                </div>
                <Switch checked={webSearch} onCheckedChange={setWebSearch} />
              </div>

              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="font-medium">Image generation</p>
                  <p className="text-sm text-muted-foreground">Enable image outputs when requested.</p>
                </div>
                <Switch checked={imageGeneration} onCheckedChange={setImageGeneration} />
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-end gap-2">
            <Button type="submit" disabled={!canSave}>
              {isSaving ? 'Saving…' : 'Save changes'}
            </Button>
          </CardFooter>
        </form>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="h-full">
          <CardHeader>
            <CardTitle>Knowledge</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="knowledge-upload">Upload files</Label>
              <Input
                id="knowledge-upload"
                type="file"
                multiple
                disabled={isUploading}
                onChange={handleKnowledgeUpload}
              />
              <p className="text-xs text-muted-foreground">
                Supported formats: PDF, DOCX. Up to 10 files at a time. Text is extracted automatically.
              </p>
            </div>

            <Separator />

            <div className="space-y-3">
              {assistant.knowledge.length === 0 ? (
                <p className="text-sm text-muted-foreground">No knowledge files uploaded yet.</p>
              ) : (
                assistant.knowledge.map((record: AssistantKnowledgeItem) => (
                  <div
                    key={record.id}
                    className="flex flex-col gap-2 rounded-lg border p-3 text-sm"
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-medium">{record.fileName}</div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" asChild>
                          <a href={record.downloadUrl} target="_blank" rel="noreferrer">
                            Download
                          </a>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleKnowledgeDelete(record)}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {record.mimeType}
                      {typeof record.fileSize === 'number'
                        ? ` · ${(record.fileSize / 1024).toFixed(1)} KB`
                        : null}
                    </p>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {isOwner ? (
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Sharing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <form className="space-y-3" onSubmit={handleShare}>
                <div className="grid gap-2">
                  <Label htmlFor="share-email">Invite by email</Label>
                  <Input
                    id="share-email"
                    type="email"
                    placeholder="teammate@example.com"
                    value={shareEmail}
                    onChange={(event) => setShareEmail(event.target.value)}
                    required
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="font-medium">Allow management</p>
                    <p className="text-xs text-muted-foreground">
                      Users with management rights can edit knowledge and capabilities.
                    </p>
                  </div>
                  <Switch checked={shareCanManage} onCheckedChange={setShareCanManage} />
                </div>

                <Button type="submit" disabled={isSharing}>
                  {isSharing ? 'Sharing…' : 'Share access'}
                </Button>
              </form>

              <Separator />

              <div className="space-y-3">
                <h3 className="text-sm font-medium">Current access</h3>
                {shares.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No collaborators yet.</p>
                ) : (
                  shares.map((share) => (
                    <div
                      key={share.share.userId}
                      className="flex items-center justify-between rounded-lg border p-3 text-sm"
                    >
                      <div>
                        <p className="font-medium">{share.user.email}</p>
                        <p className="text-xs text-muted-foreground">
                          {share.share.canManage ? 'Can manage' : 'Can view'}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRevokeShare(share.share.userId)}
                      >
                        Revoke
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
      <Dialog open={isDeleteDialogOpen} onOpenChange={(open) => !isDeleting && setIsDeleteDialogOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this assistant?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. It will remove the assistant and any associated knowledge for everyone with access.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? 'Deleting…' : 'Delete assistant'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
