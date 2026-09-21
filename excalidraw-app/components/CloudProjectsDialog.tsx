import { useEffect, useMemo, useState } from "react";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import {
  createCloudProject,
  deleteCloudProject,
  getActiveCloudProject,
  getCurrentUser,
  getKnownCloudProjects,
  openCloudProject,
  renameCloudProject,
} from "../data/cloudProjects";
import {
  getManagedShareLinks,
  revokeShareLink,
  setShareExpiration,
} from "../data/shareLinks";

import type {
  CloudProjectAccess,
  CloudUser,
} from "../data/cloudProjects";
import type { ManagedShareLink } from "../data/shareLinks";

const formatDate = (value: string) =>
  new Date(value).toLocaleString();

const getShareStatus = (share: ManagedShareLink) => {
  if (share.revokedAt) {
    return `Revoked ${formatDate(share.revokedAt)}`;
  }
  if (!share.lifecycleAvailable) {
    return "Apply D1 migration 0003 to enable expiry and revoke";
  }
  if (share.expiresAt) {
    return `Expires ${formatDate(share.expiresAt)}`;
  }
  return "No expiration";
};

export const CloudProjectsDialog = ({
  excalidrawAPI,
  onClose,
}: {
  excalidrawAPI: ExcalidrawImperativeAPI;
  onClose: () => void;
}) => {
  const activeProject = useMemo(() => getActiveCloudProject(), []);
  const [projects, setProjects] = useState<CloudProjectAccess[]>([]);
  const [shares, setShares] = useState<ManagedShareLink[]>([]);
  const [user, setUser] = useState<CloudUser | null>(null);
  const [title, setTitle] = useState(
    excalidrawAPI.getName() || "Untitled project",
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const refreshProjects = async () => {
    setProjects(await getKnownCloudProjects());
  };

  const refreshShares = async () => {
    setShares(await getManagedShareLinks());
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    void (async () => {
      try {
        const currentUser = await getCurrentUser();
        setUser(currentUser);
        if (currentUser) {
          const [knownProjects, knownShares] = await Promise.all([
            getKnownCloudProjects(),
            getManagedShareLinks(),
          ]);
          setProjects(knownProjects);
          setShares(knownShares);
        }
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Could not load cloud data.",
        );
      }
    })();

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const createProject = async () => {
    setBusy(true);
    setMessage("");

    try {
      const project = await createCloudProject({
        elements: excalidrawAPI.getSceneElementsIncludingDeleted(),
        appState: excalidrawAPI.getAppState(),
        files: excalidrawAPI.getFiles(),
        title: title.trim() || "Untitled project",
      });
      onClose();
      void openCloudProject(project);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not save project.",
      );
      setBusy(false);
    }
  };

  const removeProject = async (project: CloudProjectAccess) => {
    if (!window.confirm(`Delete “${project.title}”?`)) {
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      await deleteCloudProject(project);
      await refreshProjects();
      if (activeProject?.id === project.id) {
        window.location.assign(window.location.pathname);
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not delete project.",
      );
    } finally {
      setBusy(false);
    }
  };

  const renameProject = async (project: CloudProjectAccess) => {
    const nextTitle = window.prompt("Project name", project.title)?.trim();
    if (!nextTitle || nextTitle === project.title) {
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const updated = await renameCloudProject(project, nextTitle);
      setProjects((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      if (activeProject?.id === updated.id) {
        setTitle(updated.title);
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not rename project.",
      );
      await refreshProjects().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  };

  const updateShareExpiry = async (
    share: ManagedShareLink,
    days: number | null,
  ) => {
    setBusy(true);
    setMessage("");

    try {
      const expiresAt =
        days == null
          ? null
          : new Date(
              Date.now() + days * 24 * 60 * 60 * 1000,
            ).toISOString();
      await setShareExpiration(share, expiresAt);
      await refreshShares();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not update the shared snapshot.",
      );
    } finally {
      setBusy(false);
    }
  };

  const revokeShare = async (share: ManagedShareLink) => {
    if (
      !window.confirm(
        "Revoke this shared snapshot? Existing copies already downloaded cannot be recalled.",
      )
    ) {
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      await revokeShareLink(share);
      await refreshShares();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not revoke the shared snapshot.",
      );
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/");
  };

  return (
    <div className="cloud-projects-backdrop" role="presentation">
      <section
        aria-labelledby="cloud-projects-title"
        aria-modal="true"
        className="cloud-projects-dialog"
        role="dialog"
      >
        <header>
          <div>
            <h2 id="cloud-projects-title">My Projects</h2>
            <p>
              {user
                ? `Signed in as ${user.email}`
                : "Sign in to access your projects on every device."}
            </p>
          </div>
          <button
            aria-label="Close"
            className="cloud-projects-close"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </header>

        {!user ? (
          <div className="cloud-projects-create">
            <a href="/api/auth/login">
              <button type="button">Sign in with Google</button>
            </a>
          </div>
        ) : (
          <>
            <div className="cloud-projects-create">
              <label htmlFor="cloud-project-title">Project name</label>
              <div>
                <input
                  id="cloud-project-title"
                  onChange={(event) => setTitle(event.target.value)}
                  value={title}
                />
                <button
                  disabled={busy}
                  onClick={() => void createProject()}
                  type="button"
                >
                  Save as new project
                </button>
              </div>
            </div>

            {message && (
              <p className="cloud-projects-message">{message}</p>
            )}

            <section className="cloud-projects-section">
              <div className="cloud-projects-section-heading">
                <div>
                  <h3>Saved projects</h3>
                  <p>Private to your signed-in Google account.</p>
                </div>
              </div>

              <div className="cloud-projects-list">
                {projects.length === 0 ? (
                  <p className="cloud-projects-empty">
                    No saved projects yet.
                  </p>
                ) : (
                  projects.map((project) => (
                    <article
                      className={
                        activeProject?.id === project.id
                          ? "is-active"
                          : undefined
                      }
                      key={project.id}
                    >
                      <div>
                        <strong>{project.title}</strong>
                        <small>
                          Updated {formatDate(project.updatedAt)}
                        </small>
                      </div>
                      <div className="cloud-projects-actions">
                        <button
                          disabled={busy}
                          onClick={() => void renameProject(project)}
                          type="button"
                        >
                          Rename
                        </button>
                        <button
                          disabled={busy}
                          onClick={() =>
                            void (async () => {
                              if (await openCloudProject(project)) {
                                onClose();
                              }
                            })()
                          }
                          type="button"
                        >
                          Open
                        </button>
                        <button
                          className="danger"
                          disabled={busy}
                          onClick={() => void removeProject(project)}
                          type="button"
                        >
                          Delete
                        </button>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </section>

            <section className="cloud-projects-section">
              <div className="cloud-projects-section-heading">
                <div>
                  <h3>Shared snapshots</h3>
                  <p>
                    Shared links are encrypted snapshots. The encryption key
                    stays in the link and is not stored here.
                  </p>
                </div>
              </div>

              <div className="cloud-projects-list">
                {shares.length === 0 ? (
                  <p className="cloud-projects-empty">
                    No shared snapshots yet.
                  </p>
                ) : (
                  shares.map((share) => (
                    <article key={share.id}>
                      <div>
                        <strong>
                          Share {share.id.slice(0, 8)}
                        </strong>
                        <small>
                          Created {formatDate(share.createdAt)}
                        </small>
                        <small>{getShareStatus(share)}</small>
                      </div>
                      <div className="cloud-projects-actions">
                        <button
                          disabled={
                            busy ||
                            !!share.revokedAt ||
                            !share.lifecycleAvailable
                          }
                          onClick={() =>
                            void updateShareExpiry(share, 7)
                          }
                          type="button"
                        >
                          7 days
                        </button>
                        <button
                          disabled={
                            busy ||
                            !!share.revokedAt ||
                            !share.lifecycleAvailable
                          }
                          onClick={() =>
                            void updateShareExpiry(share, 30)
                          }
                          type="button"
                        >
                          30 days
                        </button>
                        <button
                          disabled={
                            busy ||
                            !!share.revokedAt ||
                            !share.lifecycleAvailable
                          }
                          onClick={() =>
                            void updateShareExpiry(share, null)
                          }
                          type="button"
                        >
                          No expiry
                        </button>
                        <button
                          className="danger"
                          disabled={
                            busy ||
                            !!share.revokedAt ||
                            !share.lifecycleAvailable
                          }
                          onClick={() => void revokeShare(share)}
                          type="button"
                        >
                          Revoke
                        </button>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </section>

            <button onClick={() => void logout()} type="button">
              Sign out
            </button>
          </>
        )}
      </section>
    </div>
  );
};
