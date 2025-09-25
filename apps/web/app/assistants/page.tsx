"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Switch } from "@workspace/ui/components/switch";
import { Textarea } from "@workspace/ui/components/textarea";
import { Separator } from "@workspace/ui/components/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs";
import { Badge } from "@workspace/ui/components/badge";

import { useSelectedModel } from "@workspace/client";
import { authClient } from "@/auth/auth-client";

import {
  useAssistants,
  createAssistant,
  AssistantSummary,
  uploadAssistantKnowledge,
} from "@workspace/client";

export default function AssistantsPage() {
  const router = useRouter();
  const { data: assistants = [], mutate, isLoading } = useAssistants();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [defaultModel, setDefaultModel] = useState<string>("");
  const [webSearch, setWebSearch] = useState(true);
  const [imageGeneration, setImageGeneration] = useState(false);
  const [knowledgeFiles, setKnowledgeFiles] = useState<File[]>([]);
  const knowledgeInputRef = useRef<HTMLInputElement | null>(null);
  const { availableModels } = useSelectedModel();
  const { data: session } = authClient.useSession();
  const currentUserId = session?.user?.id ?? null;

  const canSubmit = useMemo(() => name.trim().length > 0 && !isSubmitting, [name, isSubmitting]);
  const ownedAssistants = useMemo(
    () => (currentUserId ? assistants.filter((assistant) => assistant.ownerId === currentUserId) : assistants),
    [assistants, currentUserId],
  );
  const sharedAssistants = useMemo(
    () => (currentUserId ? assistants.filter((assistant) => assistant.ownerId !== currentUserId) : []),
    [assistants, currentUserId],
  );
  const totalAssistants = assistants.length;
  const hasOwnedAssistants = ownedAssistants.length > 0;
  const hasSharedAssistants = sharedAssistants.length > 0;

  const renderAssistantGrid = (list: AssistantSummary[]) => (
    <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
      {list.map((assistant: AssistantSummary) => (
        <Card key={assistant.id} className="rounded-2xl border border-border/70 bg-card/60 shadow-sm transition hover:shadow-md">
          <CardHeader className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-2">
                <CardTitle className="text-lg font-semibold">{assistant.name}</CardTitle>
                {assistant.description ? (
                  <p className="text-sm text-muted-foreground line-clamp-3">{assistant.description}</p>
                ) : (
                  <p className="text-sm text-muted-foreground italic">No description provided.</p>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`/assistants/${assistant.id}`)}
              >
                Manage
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary">
                {assistant.defaultModel ? `Model: ${assistant.defaultModel}` : 'Model: inherit from chat'}
              </Badge>
              <span>Created {new Date(assistant.createdAt).toLocaleDateString()}</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Last updated {new Date(assistant.updatedAt).toLocaleDateString()}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );

  const handleCreateAssistant = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;

    setIsSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || undefined,
        instructions: instructions.trim() || undefined,
        defaultModel: defaultModel || undefined,
        capabilities: {
          webSearch,
          imageGeneration,
        },
      };

      const assistant = await createAssistant(payload);
      await mutate();

      if (knowledgeFiles.length > 0) {
        try {
          await uploadAssistantKnowledge(assistant.id, knowledgeFiles);
          toast.success(`Assistant "${assistant.name}" created and knowledge uploaded`);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to upload knowledge';
          toast.error(message);
        }
      } else {
        toast.success(`Assistant "${assistant.name}" created`);
      }

      setName("");
      setDescription("");
      setInstructions("");
      setDefaultModel("");
      setWebSearch(true);
      setImageGeneration(false);
      setKnowledgeFiles([]);
      if (knowledgeInputRef.current) {
        knowledgeInputRef.current.value = '';
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create assistant';
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Tabs defaultValue="list" className="space-y-8">
      <div className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-card/70 p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">My Assistants</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create specialised assistants, attach knowledge and share them with your team.
          </p>
        </div>
        <TabsList className="bg-muted/70 p-2">
          <TabsTrigger value="list" className="rounded-xl">All assistants</TabsTrigger>
          <TabsTrigger value="create" className="rounded-xl">Create new</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="create" className="space-y-6">
        <div className="grid gap-8 xl:grid-cols-[2fr_1fr]">
          <Card>
            <form onSubmit={handleCreateAssistant}>
              <CardHeader className="space-y-2 border-b pb-6">
                <CardTitle className="text-xl font-semibold">Create a new assistant</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Define the assistant’s style, guardrails and capabilities in a few quick steps.
                </p>
              </CardHeader>
              <CardContent className="space-y-10 my-8">
                <section className="space-y-4">
                  <div>
                    <Label htmlFor="assistant-name" className="text-sm font-medium">Name</Label>
                    <Input
                      id="assistant-name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="Research Copilot"
                      className="mt-2"
                      required
                    />
                    <p className="mt-2 text-xs text-muted-foreground">
                      Pick a short, memorable title that makes the assistant easy to recognise.
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="assistant-description" className="text-sm font-medium">Description</Label>
                    <Input
                      id="assistant-description"
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      placeholder="Summarises reports and plans next steps"
                      className="mt-2"
                    />
                    <p className="mt-2 text-xs text-muted-foreground">
                      Help teammates understand when they should reach for this assistant.
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="assistant-instructions" className="text-sm font-medium">System instructions</Label>
                    <Textarea
                      id="assistant-instructions"
                      value={instructions}
                      onChange={(event) => setInstructions(event.target.value)}
                      placeholder="Always provide a concise summary followed by action items."
                      rows={5}
                      className="mt-2"
                    />
                    <p className="mt-2 text-xs text-muted-foreground">
                      Provide clear guidance so responses stay on brand and on target.
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="assistant-model" className="text-sm font-medium">Default model (optional)</Label>
                    <Input
                      list="available-models"
                      id="assistant-model"
                      value={defaultModel}
                      onChange={(event) => setDefaultModel(event.target.value)}
                      placeholder="Select default model"
                      className="mt-2"
                    />
                    <datalist id="available-models">
                      {availableModels.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.name ?? model.id}
                        </option>
                      ))}
                    </datalist>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Users can swap models within the chat if they need extra capabilities.
                    </p>
                  </div>
                </section>

                <Separator />

                <section className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-xl border border-border/70 bg-muted/30 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">Web search</p>
                        <p className="text-sm text-muted-foreground">
                          Allow the assistant to pull in fresh context when needed.
                        </p>
                      </div>
                      <Switch checked={webSearch} onCheckedChange={setWebSearch} />
                    </div>
                  </div>

                  <div className="rounded-xl border border-border/70 bg-muted/30 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">Image generation</p>
                        <p className="text-sm text-muted-foreground">
                          Enable illustrative responses when users request visuals.
                        </p>
                      </div>
                      <Switch checked={imageGeneration} onCheckedChange={setImageGeneration} />
                    </div>
                  </div>
                </section>
              </CardContent>
              <CardFooter className="flex justify-end">
                <Button type="submit" disabled={!canSubmit}>
                  {isSubmitting ? 'Creating…' : 'Create assistant'}
                </Button>
              </CardFooter>
            </form>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader className="space-y-1 border-b pb-4">
                <CardTitle className="text-base font-semibold">Knowledge upload</CardTitle>
                <p className="text-xs text-muted-foreground">Attach files so the assistant can cite trusted sources during chats.</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Attach PDFs or DOCX files you trust. We automatically extract and index the text so the assistant can cite it during conversations.
                </p>
                <Input
                  id="assistant-knowledge"
                  type="file"
                  multiple
                  ref={knowledgeInputRef}
                  onChange={(event) => {
                    const files = event.target.files ? Array.from(event.target.files) : [];
                    setKnowledgeFiles(files);
                  }}
                />
                {knowledgeFiles.length > 0 ? (
                  <div className="rounded-xl border border-border/70 bg-muted/50 p-3">
                    <p className="text-xs font-medium text-muted-foreground">Files queued for upload</p>
                    <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                      {knowledgeFiles.map((file) => (
                        <li key={file.name}>{file.name}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No files selected yet.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="border-b pb-4">
                <CardTitle className="text-base font-semibold">Tips for great assistants</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>• Keep instructions specific and action-oriented.</p>
                <p>• Upload concise, high-quality references instead of large manuals.</p>
                <p>• Share assistants with teammates to streamline recurring workflows.</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="list" className="space-y-6">
        {isLoading && totalAssistants === 0 ? (
          <p className="text-sm text-muted-foreground">Loading assistants…</p>
        ) : totalAssistants === 0 ? (
          <Card className="border-dashed border-border/60 bg-card/60">
            <CardHeader>
              <CardTitle>No assistants yet</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Create your first assistant from the “Create new” tab.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Showing {totalAssistants} assistant{totalAssistants === 1 ? '' : 's'} you can access.
            </p>
            {currentUserId ? (
              <div className="space-y-10">
                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Created by you</h3>
                    <span className="text-xs text-muted-foreground">{ownedAssistants.length}</span>
                  </div>
                  {hasOwnedAssistants ? (
                    renderAssistantGrid(ownedAssistants)
                  ) : (
                    <Card className="border-dashed border-border/60 bg-card/60">
                      <CardContent className="py-6 text-sm text-muted-foreground">
                        You haven’t created any assistants yet.
                      </CardContent>
                    </Card>
                  )}
                </section>

                {hasSharedAssistants ? <Separator /> : null}

                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Shared with you</h3>
                    <span className="text-xs text-muted-foreground">{sharedAssistants.length}</span>
                  </div>
                  {hasSharedAssistants ? (
                    renderAssistantGrid(sharedAssistants)
                  ) : (
                    <Card className="border border-dashed border-border/60 bg-card/60">
                      <CardContent className="py-6 text-sm text-muted-foreground">
                        No one has shared an assistant with you yet.
                      </CardContent>
                    </Card>
                  )}
                </section>
              </div>
            ) : (
              renderAssistantGrid(assistants)
            )}
          </>
        )}
      </TabsContent>
    </Tabs>
  );
}
