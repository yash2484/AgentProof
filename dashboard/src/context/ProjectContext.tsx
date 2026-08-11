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
 * The **measured** corpus. Every figure it holds was produced by a real run:
 * 222 measurements computed by code from recorded spans, 50 returned by a
 * live judge, and 12 that failed with `AuthenticationError: 401` and are
 * shown as broken rather than counted as failures.
 *
 * It landed on `synthetic-showcase` throughout the analytics and theme work,
 * because at 300 traces and 8 runs it was the only corpus dense enough to
 * read a design against. That was a development convenience and it cut
 * against `review-later.md` R5 and R16: every one of its 2400 rows has
 * `raw_judge_output IS NULL`, so no judge was ever called for any of it.
 *
 * **Do not point this back at a generated corpus.** The disclosure is good —
 * the switcher badges it, the scope bar badges it, and the trust band says
 * in full sentences that a script authored every figure — but a screenshot
 * outlives its caption, and this is the one line that decides what a first
 * screen shows.
 */
export const DEFAULT_PROJECT = "demo-research-agent";

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
