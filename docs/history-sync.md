# Gmail History Sync Flow

This document explains how we track Gmail “historyIds” to fetch only the deltas we haven’t processed yet when a new message arrives via Google Pub/Sub.

---

## High-level overview

1. **Pub/Sub notification lands** in `EmailAssistantService.handlePubSubPush`.
2. **Notification payload** contains the mailbox owner (`emailAddress`) and a `historyId` representing the account state at the time Google generated the message.
3. We **normalize that notification into a Gmail context** (`GmailAuthService.createContext`) which carries:
   - the authenticated Gmail client (`users.*` APIs),
   - the mailbox owner’s email,
   - the decoded `historyId`.
4. Before fetching anything, we **consult our sync checkpoint** (`GmailSyncStateService.getLastHistoryId`). This tells us the most recent history state we’ve already processed for that mailbox.
5. We call the Gmail History API (`users.history.list`) starting from whichever value is newer: the stored checkpoint or the notification’s `historyId`. That gives us a batch of `messageAdded` events we haven’t seen yet.
6. For each `messageAdded` event we pull the full message, persist it, and enqueue downstream jobs (contract review, etc.).
7. Once all events are handled, we **update the sync checkpoint** with the latest history ID returned by Gmail so the next notification will resume from there.

This incremental flow ensures no emails are skipped and we never re-process the same message twice.

---

## Step-by-step details

### 1. Receiving the push event

`EmailAssistantService.handlePubSubPush` is invoked with the Pub/Sub payload. We decode the `message.data` field (base64) into a `GmailHistoryNotification`:

```ts
interface GmailHistoryNotification {
  emailAddress: string;
  historyId: string | number;
}
```

If either field is missing, the message is rejected. Otherwise we capture metadata (for logging) and move on.

### 2. Authenticating for the user

We create a Gmail API context using `GmailAuthService.createContext(email, historyId)`:

```ts
const authContext = this.gmailAuthService.createContext(
  decoded.emailAddress,
  decoded.historyId,
);
```

The context bundles:

- `userEmail` — mailbox owner (the Gmail account we’re syncing)
- `client` — an authenticated `gmail_v1.Gmail` instance
- `historyId` — the latest history marker Google told us about

### 3. Loading the last processed historyId

We persist checkpoints per-user in the `gmail_sync_state` table. To get the latest value:

```ts
const lastHistoryId =
  await this.gmailSyncStateService.getLastHistoryId(authContext.userEmail);
```

If the database returns `null`, we fall back to the notification’s `historyId`. Either way, the value we use is:

```ts
const startHistoryId = lastHistoryId ?? authContext.historyId;
```

This guarantees we resume from the exact point we left off if the Pub/Sub message arrives late or if multiple notifications hit back-to-back.

### 4. Fetching delta events

With the starting point in hand, we call the History API (`GmailHistoryService.fetchHistory`):

```ts
const historyRes = await gmailClient.users.history.list({
  userId: 'me',
  startHistoryId,
  historyTypes: ['messageAdded'],
  labelId: 'INBOX',
});
```

The response contains:

- `history`: an array of events (each event may represent one or more added messages)
- `historyId`: the “latest” marker Gmail wants us to store for the next sync

We return:

```ts
{
  historyEntries: historyRes.data.history ?? [],
  lastHistoryIdUsed: startHistoryId,
  responseHistoryId: historyRes.data.historyId ?? null,
}
```

### 5. Processing added messages

Back in `EmailAssistantService.processAddedMessages`, we iterate through the history entries. For each `messageAdded` record we:

1. Fetch the full message with `gmail.users.messages.get({ userId: 'me', id, format: 'full' })`.
2. Persist it via `EmailProcessorService.saveInboundMessage`. This de-duplicates automatically; if the insert conflicts, we skip downstream work.
3. Extract headers to confirm the sender isn’t our own mailbox (`isSameMailbox`) and ensure attachments exist (we care about contracts).
4. Enqueue contract review and follow-on workflows.

### 6. Updating the sync checkpoint

After processing every event, we pick the correct history ID to store:

```ts
const latestHistoryId =
  responseHistoryId ??
  this.gmailMessageParser.getLatestHistoryId(historyEntries) ??
  authContext.historyId;
```

Finally we persist this value:

```ts
await this.gmailSyncStateService.saveLastHistoryId(
  authContext.userEmail,
  latestHistoryId,
);
```

This ensures the next Pub/Sub notification (or a manual resync) will ask Gmail for only the events that occurred after this point.

### 7. Logging & error handling

Throughout the flow we log the envelope information (`subscription`, `publishTime`, etc.), the history IDs used, and any exceptions. If an error occurs mid-stream we bubble it up so Pub/Sub retries the notification; checkpoints are only updated after all messages are processed successfully.

---

## Failure scenarios

| Scenario | Behavior |
| --- | --- |
| Pub/Sub sends a historyId lower than our checkpoint | We use the stored value instead, avoiding re-processing. |
| Gmail returns no history entries | The code still updates the checkpoint with the latest history ID so we don’t re-fetch the same span. |
| Gmail call fails mid-loop | Error bubbles up; checkpoint isn’t saved, so the next delivery retries the same messages. |
| We’ve never synced this mailbox | `getLastHistoryId` returns `null`, so we start from the historyId provided by Pub/Sub. |

---

## Key files

- `apps/api/src/email-assistant/services/email-assistant.service.ts` – Orchestrates the Pub/Sub handling and overall flow.
- `apps/api/src/email-assistant/services/gmail/gmail-auth.service.ts` – Creates per-user Gmail contexts.
- `apps/api/src/email-assistant/services/gmail/gmail-history.service.ts` – Wraps Gmail’s History API.
- `apps/api/src/email-assistant/services/gmail/gmail-sync-state.service.ts` – Persists the per-user checkpoints.
- `apps/api/src/database/queries/email-assistant.query.ts` – Database access for sync state and message storage.

---

## Summary

Our history sync logic maintains a per-mailbox checkpoint. Each Pub/Sub notification fetches only the deltas since that checkpoint, processes the new messages, and then advances the checkpoint. This design:

- avoids double-processing existing emails,
- ensures resilience if multiple notifications arrive quickly,
- and keeps the system recoverable (we can re-drive from the last history ID).

If you need to reset a mailbox or recover from a failure, simply clear the stored `lastHistoryId` row; the next notification will replay from the latest Gmail-provided historyId.
