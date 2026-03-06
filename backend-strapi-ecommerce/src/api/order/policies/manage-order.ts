import { isStoreAdmin } from "../../../utils/store-role";

export default async (policyContext: any) => {
  const user = policyContext?.state?.user;

  if (!user) {
    return true;
  }

  return isStoreAdmin(user);
};
