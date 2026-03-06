export function isStoreAdmin(user: any): boolean {
  return (
    user?.isStoreAdmin === true ||
    user?.isStoreAdmin === 1 ||
    user?.isStoreAdmin === "true"
  );
}
