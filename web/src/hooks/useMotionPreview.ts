import { useEffect, useRef } from "react";
import { setMotionPreviewTargets } from "../input/useInputBus";

export const useMotionPreviewRefs = () => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    setMotionPreviewTargets(videoRef.current, canvasRef.current);
    return () => setMotionPreviewTargets(null, null);
  }, []);

  return { videoRef, canvasRef };
};
