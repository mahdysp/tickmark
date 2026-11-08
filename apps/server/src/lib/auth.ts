export const adminOnly = async (req: any, reply: any) => {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected || req.headers["x-admin-token"] !== expected) {
    return reply.code(401).send({ error: "unauthorized" });
  }
};
