// Test-only page for the card 117 dialog. The Vite dev server serves it; builds never include it.
import { useState } from "react";
import ReactDOM from "react-dom/client";
import "../../src/app/global.css";
import { DeleteNoteDialog } from "../../src/shared/ui";

// Tests read the call count and choose how the mocked delete settles.
const mock = window as unknown as { deleteCalls: number; deleteMode: "resolve" | "pending" | "reject" };
mock.deleteCalls = 0;
mock.deleteMode = "resolve";

function Harness() {
  const [open, setOpen] = useState(false);
  const [deleted, setDeleted] = useState(false);
  return (
    <main>
      <button onClick={() => setOpen(true)}>Delete Calculus review</button>
      {deleted && <p role="status">Note deleted.</p>}
      {open && (
        <DeleteNoteDialog
          title="Calculus review"
          onClose={() => setOpen(false)}
          onDelete={async () => {
            mock.deleteCalls++;
            if (mock.deleteMode === "pending") await new Promise(() => {});
            if (mock.deleteMode === "reject") throw new Error("Mocked failure.");
            setOpen(false);
            setDeleted(true);
          }}
        />
      )}
    </main>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<Harness />);
