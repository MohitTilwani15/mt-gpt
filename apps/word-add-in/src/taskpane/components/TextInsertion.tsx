import * as React from "react";
import { useState } from "react";
import { FilePlus, Type } from "lucide-react";

import { Button } from "@workspace/ui/components/button";
import { Label } from "@workspace/ui/components/label";
import { Textarea } from "@workspace/ui/components/textarea";

interface TextInsertionProps {
  insertText: (text: string) => void;
}

const TextInsertion: React.FC<TextInsertionProps> = ({ insertText }) => {
  const [text, setText] = useState<string>("Some text.");
  const [isInserting, setIsInserting] = useState(false);

  const handleTextInsertion = async () => {
    try {
      setIsInserting(true);
      await insertText(text);
    } finally {
      setIsInserting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border/50 bg-card p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Type className="size-5" />
        </div>
        <div>
          <h3 className="text-base font-semibold">Insert generated text</h3>
          <p className="text-sm text-muted-foreground">
            Draft your content below and insert it into the document in a single click.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="insertion-text">Content</Label>
        <Textarea
          id="insertion-text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={4}
          className="resize-none"
        />
      </div>

      <Button onClick={handleTextInsertion} disabled={isInserting} className="self-start">
        <span className="flex items-center gap-2">
          <FilePlus className="size-4" />
          {isInserting ? "Inserting..." : "Insert text"}
        </span>
      </Button>
    </div>
  );
};

export default TextInsertion;
