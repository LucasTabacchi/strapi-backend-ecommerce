import { isStoreAdmin } from "../../../utils/store-role";

export default async (policyContext: any) => {
  const user = policyContext?.state?.user;
  return !!user && !isStoreAdmin(user);
};
