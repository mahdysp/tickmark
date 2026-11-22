import { currentStaff } from "./guard.js";

export const adminOnly = async (req: any, reply: any) => {
  const expected = process.env.ADMIN_TOKEN;
  if (expected && req.headers["x-admin-token"] === expected) return;

  const user = await currentStaff(req);
  if (user?.role === "admin") {
    req.user = user;
    return;
  }
  return reply.code(401).send({ error: "unauthorized" });
};
