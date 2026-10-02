import { spawn } from "child_process";
import { rds_signer } from "../loaders/rdsSignerLoader.js";

const token = await rds_signer.getAuthToken();

const child = spawn("drizzle-kit", process.argv.slice(2), {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, POSTGRES_IAM_TOKEN: token },
});

child.on("exit", (code) => process.exit(code ?? 1));
