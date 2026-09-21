export const SHARE_LINK_HASH =
  /^#json=([a-zA-Z0-9_-]+),([a-zA-Z0-9_-]+)$/;

export const isReadonlyShareHash = (hash: string) =>
  SHARE_LINK_HASH.test(hash);

export const getReadonlyShareHash = (hash: string) =>
  isReadonlyShareHash(hash) ? hash : null;

export type ManagedShareLink = {
  id: string;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  lifecycleAvailable: boolean;
};

const parse = async <T>(response: Response): Promise<T> => {
  const data = (await response.json().catch(() => null)) as
    | (T & { error?: string })
    | null;
  if (!response.ok) {
    throw new Error(data?.error || "The share request failed.");
  }
  return data as T;
};

export const getManagedShareLinks = async () =>
  parse<ManagedShareLink[]>(await fetch("/api/share"));

export const setShareExpiration = async (
  share: Pick<ManagedShareLink, "id">,
  expiresAt: string | null,
) =>
  parse<Pick<ManagedShareLink, "id" | "expiresAt">>(
    await fetch(`/api/share/${encodeURIComponent(share.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expiresAt }),
    }),
  );

export const revokeShareLink = async (
  share: Pick<ManagedShareLink, "id">,
) =>
  parse<Pick<ManagedShareLink, "id" | "revokedAt">>(
    await fetch(`/api/share/${encodeURIComponent(share.id)}`, {
      method: "DELETE",
    }),
  );
