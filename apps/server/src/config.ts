export const rpID = process.env.RP_ID ?? "localhost";
export const rpName = "TickMark";
export const origins = (process.env.ORIGINS ?? "http://localhost:5173").split(",");
export const offlineQuota = Number(process.env.OFFLINE_QUOTA ?? 4);
export const reviewDelayMin = Number(process.env.REVIEW_DELAY_MIN ?? 45);
