import { createContext, useContext, useState, ReactNode } from "react";

interface ProjectContextValue {
  project: string | undefined;
  setProject: (project: string | undefined) => void;
}

const ProjectContext = createContext<ProjectContextValue>({
  project: undefined,
  setProject: () => {},
});

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [project, setProject] = useState<string | undefined>(undefined);
  return (
    <ProjectContext.Provider value={{ project, setProject }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject(): ProjectContextValue {
  return useContext(ProjectContext);
}
