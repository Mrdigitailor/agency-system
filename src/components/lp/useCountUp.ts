"use client";

import { useEffect, useState } from "react";

/** מספר שרץ מ-0 עד היעד בכל פעם ש-run נדלק או שהיעד מתחלף */
export function useCountUp(target: number, run: boolean, ms = 900): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!run) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - start) / ms, 1);
      setValue(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, run, ms]);
  return run ? value : 0;
}
