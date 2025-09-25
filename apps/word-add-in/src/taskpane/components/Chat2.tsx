import { useEffect, useRef, useState } from "react";
import { PaperclipIcon } from 'lucide-react';

import {
  PromptInput,
  PromptInputButton,
  PromptInputModelSelect,
  PromptInputModelSelectContent,
  PromptInputModelSelectItem,
  PromptInputModelSelectTrigger,
  PromptInputModelSelectValue,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
} from '@workspace/ui/components/ui/shadcn-io/ai/prompt-input';
import { useSelectedModel } from '@workspace/client';

export default function Chat2() {
  const [text, setText] = useState<string>("");
  const {
    selectedModel,
    setSelectedModel,
    availableModels: supportedModels,
    isLoading: isLoadingModels
  } = useSelectedModel();

  const selectedModelRef = useRef<string>(selectedModel);
  useEffect(() => {
    selectedModelRef.current = selectedModel;
  }, [selectedModel]);

  return (
    <div className="p-4 bg-background">
      <PromptInput>
        <PromptInputTextarea
          onChange={(e) => setText(e.target.value)}
          value={text}
          placeholder="Type your message..."
        />
        <PromptInputToolbar>
          <PromptInputTools>
            <PromptInputButton>
              <PaperclipIcon size={16} />
            </PromptInputButton>
            <PromptInputModelSelect
              onValueChange={setSelectedModel}
              value={selectedModel}
            >
              <PromptInputModelSelectTrigger>
                <PromptInputModelSelectValue />
              </PromptInputModelSelectTrigger>
              <PromptInputModelSelectContent>
                {supportedModels.map((model) => (
                  <PromptInputModelSelectItem
                    key={model.id}
                    value={model.id}
                  >
                    {model.name}
                  </PromptInputModelSelectItem>
                ))}
              </PromptInputModelSelectContent>
            </PromptInputModelSelect>
          </PromptInputTools>
          {/* {status === 'streaming' ? (
            <StopButton stop={stop} setMessages={setMessages} />
          ) : (
            <PromptInputSubmit />
          )} */}
          
        </PromptInputToolbar>
      </PromptInput>

      {/* <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileSelect}
        className="hidden"
        accept={SUPPORTED_FILE_TYPES.join(',')}
      /> */}
    </div>
  )
}
