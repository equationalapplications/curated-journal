# Plan: background note save (transient — deleted in cleanup commit)

1. `src/machines/journalSaveQueueMachine.ts` replaces `journalSaveMachine.ts`.
   Context: entries[] {id,title,body,status queued|saving|failed,error}, warnings[] {id,failures},
   savedCount. Events: ENQUEUE, RETRY{id}, DISCARD{id}, ACK_WARNING{id}, SET_ENGINE.
   States: idle ⇄ saving (always-guarded on a queued entry). (R2, R4, R6, R10)
2. `src/contexts/JournalSaveQueueContext.tsx` holds the machine, mounted inside JournalProvider
   in `_layout.tsx`. (R7)
3. `journal.tsx`: enqueue + close the editor; pending rows go to JournalList; one dialog effect
   (warnings first, then the oldest failure: Try again / Discard, not dismissable); refetch on
   savedCount. Remove the editor's `saving` prop. (R1, R3, R4, R5, R6)
4. `llamaProvider.ts`: promise-chain mutex around generateText; token callback only when
   nightShiftActive. (R8, R9)
5. Tests: replace journalSaveMachine.test.ts; update the screen tests (wrap in provider); new
   queue-screen test; provider tests.
6. Version 8.1.0 (package.json, app.json, package-lock root); spec → Implemented; delete
   plan + LEDGER.
