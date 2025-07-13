import { useEffect, useRef } from "react";

export default function SwipeDownListener({ onSwipeDown }) {
  const touchStartY = useRef(null);
  const touchEndY = useRef(null);

  useEffect(() => {
    function handleTouchStart(e) {
      if (e.touches && e.touches.length === 1) {
        touchStartY.current = e.touches[0].clientY;
      }
    }
    function handleTouchMove(e) {
      if (e.touches && e.touches.length === 1) {
        touchEndY.current = e.touches[0].clientY;
      }
    }
    function handleTouchEnd() {
      if (
        touchStartY.current !== null &&
        touchEndY.current !== null &&
        touchEndY.current - touchStartY.current > 60 // threshold in px
      ) {
        onSwipeDown();
      }
      touchStartY.current = null;
      touchEndY.current = null;
    }
    window.addEventListener("touchstart", handleTouchStart);
    window.addEventListener("touchmove", handleTouchMove);
    window.addEventListener("touchend", handleTouchEnd);
    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [onSwipeDown]);
  return null;
}
