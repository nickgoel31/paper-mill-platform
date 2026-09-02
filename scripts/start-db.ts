import EmbeddedPostgres from "embedded-postgres";
import path from "path";

async function run() {
  const dbDir = path.resolve("./.pgdata");
  console.log("🐘 Initializing and Starting Local PostgreSQL Server on port 5432...");

  const pg = new EmbeddedPostgres({
    port: 5432,
    user: "postgres",
    password: "postgres",
    database: "papermill_erp",
    persistent: true,
    dataDir: dbDir,
  });

  try {
    await pg.initialise();
  } catch (e) {
    // Cluster already initialized, proceed to start
  }

  await pg.start();
  try {
    await pg.createDatabase("papermill_erp");
  } catch (e) {
    // Database might already exist
  }

  console.log("✅ PostgreSQL is live at postgresql://postgres:password@localhost:5432/papermill_erp");

  // Keep process alive indefinitely
  process.on("SIGINT", async () => {
    console.log("Stopping PostgreSQL...");
    await pg.stop();
    process.exit(0);
  });

  setInterval(() => {}, 60000);
}

run().catch((err) => {
  console.error("Failed to start PostgreSQL:", err);
});
