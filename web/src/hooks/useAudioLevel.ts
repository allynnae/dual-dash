import { useEffect, useState } from "react";
import { useLevelSubscription } from "../input/useInputBus";

export const useAudioLevel = () => {
  const [level, setLevel] = useState(0);

  useLevelSubscription((val) => setLevel(val));

  useEffect(() => {
    return () => setLevel(0);
  }, []);

  return level;
};
