import {
  SHARE_LINK_HASH,
  getReadonlyShareHash,
  isReadonlyShareHash,
} from "../data/shareLinks";

describe("share link read-only detection", () => {
  it("recognizes valid encrypted share hashes", () => {
    expect(
      isReadonlyShareHash(
        "#json=6bcbf4b8-5d3d-4a5c-9e35-ff99b19ad288,abc_DEF-123",
      ),
    ).toBe(true);
  });

  it("keeps the same read-only decision after a refresh", () => {
    const hash = "#json=snapshot-id,key_123";
    expect(SHARE_LINK_HASH.test(hash)).toBe(true);
    expect(isReadonlyShareHash(hash)).toBe(true);
  });

  it("locks the original share hash but not project/collaboration hashes", () => {
    const hash = "#json=snapshot-id,key_123";
    expect(getReadonlyShareHash(hash)).toBe(hash);
    expect(getReadonlyShareHash("#room=room-id,room-key")).toBeNull();
    expect(getReadonlyShareHash("#project=project-id")).toBeNull();
  });

  it("does not classify project or collaboration hashes as read-only shares", () => {
    expect(isReadonlyShareHash("#project=project-id")).toBe(false);
    expect(isReadonlyShareHash("#room=room-id,room-key")).toBe(false);
    expect(isReadonlyShareHash("")).toBe(false);
  });

  it("rejects malformed share hashes", () => {
    expect(isReadonlyShareHash("#json=only-an-id")).toBe(false);
    expect(isReadonlyShareHash("#json=id,key,extra")).toBe(false);
    expect(isReadonlyShareHash("#json=id,key with spaces")).toBe(false);
  });
});
