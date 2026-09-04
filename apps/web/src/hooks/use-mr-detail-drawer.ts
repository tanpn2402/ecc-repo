import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "mr-detail-drawer-width";

const MIN_WIDTH = 500;
const MAX_WIDTH = 1400;
const DEFAULT_WIDTH = 800;

function clampWidth(width: number) {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width));
}

function getStoredWidth() {
  if (typeof window === "undefined") {
    return DEFAULT_WIDTH;
  }

  const value = localStorage.getItem(STORAGE_KEY);

  return value && Number.isFinite(Number(value))
    ? clampWidth(Number(value))
    : DEFAULT_WIDTH;
}

export function useMrDetailDrawer() {
  const [width, setWidthState] = useState(getStoredWidth);

  const widthRef = useRef(width);
  const resizingRef = useRef(false);

  const setWidth = useCallback((value: number) => {
    const nextWidth = clampWidth(value);

    widthRef.current = nextWidth;
    setWidthState(nextWidth);
  }, []);

  const startResize = useCallback((event: React.PointerEvent) => {
    event.preventDefault();

    resizingRef.current = true;

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (!resizingRef.current) {
        return;
      }

      const nextWidth = window.innerWidth - event.clientX;

      setWidth(nextWidth);
    };

    const handlePointerUp = () => {
      if (!resizingRef.current) {
        return;
      }

      resizingRef.current = false;

      localStorage.setItem(STORAGE_KEY, String(widthRef.current));

      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [setWidth]);

  console.log("🚀 Line: 78 👈 🆚 👉 ==== n-console: width", width);

  return {
    width,
    startResize,
  };
}
