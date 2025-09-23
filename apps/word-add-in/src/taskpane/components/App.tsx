import * as React from "react";
import { useState } from "react";
import { MessageCircle, PenSquare, ShieldCheck } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs";

import { insertText } from "../taskpane";
import { Chat } from "./Chat";
import Header from "./Header";
import HeroList from "./HeroList";
import TextInsertion from "./TextInsertion";

interface AppProps {
  title: string;
}

const App: React.FC<AppProps> = ({ title }) => {
  const [selectedTab, setSelectedTab] = useState("chat");

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      <Tabs value={selectedTab} onValueChange={(value) => setSelectedTab(value)} className="flex h-full flex-col">
        <TabsList className="mb-4 w-full justify-start gap-2 border border-border/60 bg-muted/40 p-1">
          <TabsTrigger value="chat" className="flex-1">
            Chat
          </TabsTrigger>
          <TabsTrigger value="overview" className="flex-1">
            Overview
          </TabsTrigger>
        </TabsList>

        <TabsContent value="chat" className="flex-1 overflow-hidden">
          <div className="h-full">
            <Chat />
          </div>
        </TabsContent>

        <TabsContent value="overview" className="flex-1 overflow-y-auto">
          <div className="flex flex-col gap-6 px-4 pb-6">
            <Header logo="assets/logo-filled.png" title={title} message="Welcome" />
            <HeroList
              message="Discover what this add-in can do for you today"
              items={[
                {
                  icon: <MessageCircle className="size-5" />,
                  primaryText: "Chat with the AI assistant without leaving Word",
                },
                {
                  icon: <PenSquare className="size-5" />,
                  primaryText: "Insert generated content directly into your document",
                },
                {
                  icon: <ShieldCheck className="size-5" />,
                  primaryText: "Stay signed in securely with your existing account",
                },
              ]}
            />
            <TextInsertion insertText={insertText} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default App;
