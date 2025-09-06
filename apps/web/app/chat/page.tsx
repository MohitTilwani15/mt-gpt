export default function ChatPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Chat</h1>
        <p className="text-muted-foreground">
          Start a new conversation or continue an existing one.
        </p>
      </div>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg border p-4">
          <h3 className="font-semibold">New Chat</h3>
          <p className="text-sm text-muted-foreground">
            Start a fresh conversation with AI
          </p>
        </div>
        
        <div className="rounded-lg border p-4">
          <h3 className="font-semibold">Recent Chats</h3>
          <p className="text-sm text-muted-foreground">
            Continue your previous conversations
          </p>
        </div>
        
        <div className="rounded-lg border p-4">
          <h3 className="font-semibold">Templates</h3>
          <p className="text-sm text-muted-foreground">
            Use pre-built conversation starters
          </p>
        </div>
      </div>
    </div>
  )
}
