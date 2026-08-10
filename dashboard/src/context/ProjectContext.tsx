import { createContext, useContext, useState, ReactNode } from "react";

interface ProjectContextValue {
  project: string | undefined;
  setProject: (project: string | undefined) => void;
}

const ProjectContext = createContext<ProjectContextValue>({
  project: undefined,
  setProject: () => {},
});

/**
 * The project the app lands on.
 *
 * Pointed at the generated corpus at the user's request: it is the only corpus
 * dense enough (300 traces, 8 runs) to read the analytics design against,
 * where the measured project holds 31 traces and 4 runs.
 *
 * This is a development convenience and it cuts against `review-later.md` R5,
 * which says a generated corpus must never be read as evidence. It is safe
 * only because the disclosure is unmissable: the switcher badges it, the scope
 * bar badges it, and the Overview's trust band states in full sentences that
 * every figure on screen was authored by a script. **Flip this to the measured
 * project before any demo, screenshot, benchmark, or external use.**
 *
 * Landing on `undefined` ("all projects") is now a safe default too — the
 * server excludes generated corpora from an unscoped query — but it shows 31
 * traces, which reads as an empty product.
 */
export const DEFAULT_PROJECT = "synthetic-showcase";

export function ProjectProvider({
  children,
  initialProject,
}: {
  children: ReactNode;
  /**
   * Starting scope. Omit for the app's landing default; pass `null` to start
   * unscoped. `null` rather than `undefined` because a default parameter
   * cannot tell "not supplied" from "supplied as undefined", and tests need
   * to pin the unscoped state deliberately.
   */
  initialProject?: string | null;
}) {
  const [project, setProject] = useState<string | undefined>(
    initialProject === undefined ? DEFAULT_PROJECT : (initialProject ?? undefined),
  );
  return (
    <ProjectContext.Provider value={{ project, setProject }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject(): ProjectContextValue {
  return useContext(ProjectContext);
}
