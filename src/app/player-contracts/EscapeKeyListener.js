import { useEffect } from "react";

export default function EscapeKeyListener({ onEscape }) {
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape") {
        onEscape();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onEscape]);
  return null;
}
