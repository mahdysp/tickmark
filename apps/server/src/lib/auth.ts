export const adminOnly = async (req: any, reply: any) => {
  if (req.headers["x-admin-token"] !== process.env.ADMIN_TOKEN) {
    return reply.code(401).send({ error: "unauthorized" });
  }
};
