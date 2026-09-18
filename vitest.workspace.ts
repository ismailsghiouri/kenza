import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  {
    extends: "./vitest.config.ts",
    test: {
      name: "unit",
      environment: "node",
      include: ["tests/unit/**/*.test.ts"],
    },
  },
  {
    extends: "./vitest.config.ts",
    test: {
      name: "integration",
      environment: "node",
      include: ["tests/integration/**/*.test.ts"],
      // Plusieurs fichiers (db.test.ts, api.test.ts) gèrent indépendamment le
      // cycle de vie de `docker compose` (postgres) dans leurs propres
      // beforeAll/afterAll : en parallèle, ils se marchent dessus sur le port
      // 5433 ("ports are not available", connexions coupées). `fileParallelism`
      // n'existe pas au niveau d'un projet de workspace (TS: ProjectConfig) ;
      // singleThread/singleFork ci-dessous suffisent à sérialiser les fichiers.
      poolOptions: {
        threads: { singleThread: true },
        forks: { singleFork: true },
      },
    },
  },
  {
    extends: "./vitest.config.ts",
    test: {
      name: "e2e",
      environment: "node",
      include: ["tests/e2e/**/*.test.ts"],
    },
  },
]);
